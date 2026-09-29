import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ProviderObservation {
  providerTxId?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  /** Decimal major-unit string (kobo converted), e.g. "100.00". */
  amount?: string | null;
  currency?: string | null;
  raw: unknown;
}

export interface PaginatedProviderTransactions {
  data: ProviderObservation[];
  page: number;
  totalPages: number | null;
  total: number | null;
  hasMore: boolean;
}

export interface TransactionListQuery {
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
  status?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  eventType?: string;
  providerReference?: string | null;
  providerTxId?: string | null;
  payload?: unknown;
}

/** Paystack amounts are integers in the subunit (kobo/pesewa/cents). */
export function fromSubunit(amount: unknown): string | null {
  if (amount === null || amount === undefined) return null;
  const n = typeof amount === 'string' ? Number(amount) : (amount as number);
  if (!Number.isFinite(n) || n < 0) return null;
  const kobo = Math.round(n);
  return `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, '0')}`;
}

function getHeader(headers: Record<string, string>, ...names: string[]): string | undefined {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  for (const n of names) {
    if (lower[n.toLowerCase()] !== undefined) return lower[n.toLowerCase()];
  }
  return undefined;
}

/**
 * Verify a Paystack webhook: `x-paystack-signature` must equal
 * HMAC-SHA512(rawBody, secretKey) in hex, compared in constant time.
 * Never accepts unsigned payloads.
 */
export async function verifyWebhook(
  rawBody: Buffer,
  headers: Record<string, string>,
  secret: string,
): Promise<WebhookVerificationResult> {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    parsed = null;
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const data = (obj.data ?? {}) as Record<string, unknown>;
  const eventType = typeof obj.event === 'string' ? obj.event : undefined;
  const providerReference = typeof data.reference === 'string' ? data.reference : null;
  const providerTxId = data.id !== undefined && data.id !== null ? String(data.id) : null;

  if (!secret) return { valid: false, eventType, providerReference, providerTxId, payload: parsed };
  const sig = getHeader(headers, 'x-paystack-signature');
  if (!sig) return { valid: false, eventType, providerReference, providerTxId, payload: parsed };
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  return { valid, eventType, providerReference, providerTxId, payload: parsed };
}

export function normalizeTransaction(response: unknown): ProviderObservation {
  const data =
    response && typeof response === 'object' && 'data' in (response as Record<string, unknown>)
      ? ((response as Record<string, unknown>).data as Record<string, unknown>)
      : ((response ?? {}) as Record<string, unknown>);
  const status =
    (data.status as string | undefined) ??
    (data.gateway_response as string | undefined) ??
    null;
  return {
    providerTxId: data.id !== undefined && data.id !== null ? String(data.id) : null,
    providerReference: (data.reference as string | undefined) ?? null,
    providerStatus: status,
    amount: fromSubunit(data.amount),
    currency: (data.currency as string | undefined) ?? null,
    raw: response,
  };
}

export interface PaystackClientOptions {
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

export class PaystackClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private maxRetries: number;
  constructor(private opts: PaystackClientOptions) {
    this.baseUrl = (opts.baseUrl ?? 'https://api.paystack.co').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private async request(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt <= this.maxRetries) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.opts.secretKey}`,
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
          },
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { _raw: text };
        }
        if (res.status === 429 && attempt < this.maxRetries) {
          const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
          await new Promise((r) => setTimeout(r, backoff));
          attempt++;
          continue;
        }
        return { status: res.status, body };
      } catch (e) {
        lastErr = e;
        if (attempt >= this.maxRetries) break;
        const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, backoff));
        attempt++;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('paystack request failed');
  }

  /** GET /transaction/verify/:reference */
  async verifyByReference(reference: string): Promise<{ httpStatus: number; observation: ProviderObservation }> {
    const { status, body } = await this.request(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (status === 404 || (body as { status?: boolean })?.status === false) {
      return { httpStatus: status, observation: { providerReference: reference, providerStatus: null, raw: body } };
    }
    if (status >= 400) throw Object.assign(new Error(`verify failed: ${status}`), { status, body });
    return { httpStatus: status, observation: normalizeTransaction(body) };
  }

  /** GET /transaction?page&perPage&from&to (offset pagination). */
  async listTransactions(query: TransactionListQuery): Promise<PaginatedProviderTransactions> {
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      perPage: String(query.perPage ?? 50),
    });
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.status) params.set('status', query.status);
    const { status, body } = await this.request(`/transaction?${params.toString()}`);
    if (status >= 400) throw Object.assign(new Error(`list failed: ${status}`), { status, body });
    const b = body as { data?: unknown[]; meta?: { total?: number; page?: number; pageCount?: number; perPage?: number } };
    const data = Array.isArray(b.data) ? b.data.map(normalizeTransaction) : [];
    const page = b.meta?.page ?? query.page ?? 1;
    const pageCount = b.meta?.pageCount ?? null;
    return {
      data,
      page,
      totalPages: pageCount,
      total: b.meta?.total ?? null,
      hasMore: pageCount !== null ? page < pageCount : data.length > 0,
    };
  }

  /** POST /transaction/initialize — returns authorization URL + reference. */
  async initializePayment(payload: { email: string; amountKobo: number; reference: string; currency?: string }): Promise<{ authorizationUrl: string; reference: string; raw: unknown }> {
    const { status, body } = await this.request('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({ email: payload.email, amount: payload.amountKobo, reference: payload.reference, currency: payload.currency }),
    });
    if (status >= 400) throw Object.assign(new Error(`initialize failed: ${status}`), { status, body });
    const data = (body as { data?: { authorization_url?: string; reference?: string } }).data ?? {};
    if (!data.authorization_url) throw new Error('no authorization_url in response');
    return { authorizationUrl: data.authorization_url, reference: data.reference ?? payload.reference, raw: body };
  }
}
