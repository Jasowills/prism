import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ProviderObservation {
  providerTxId?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
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
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  page?: number;
  txRef?: string;
  status?: string;
  currency?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  mechanism: 'verif-hash' | 'hmac-sha256' | 'none';
  eventType?: string;
  providerReference?: string | null;
  providerTxId?: string | null;
  payload?: unknown;
}

/** Normalize header names to lowercase. */
function getHeader(headers: Record<string, string>, ...names: string[]): string | undefined {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  for (const n of names) {
    if (lower[n.toLowerCase()] !== undefined) return lower[n.toLowerCase()];
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Verify a Flutterwave webhook.
 *
 * Flutterwave docs describe two mechanisms depending on dashboard/API version:
 *  1. `verif-hash`: static secret echoed back (v3.0 docs).
 *  2. `flutterwave-signature`: HMAC-SHA256(rawBody, secretHash), base64 (current docs + v4 SDK).
 *
 * We accept either when configured, require at least one, and never accept unsigned payloads.
 */
export async function verifyWebhook(
  rawBody: Buffer,
  headers: Record<string, string>,
  secret: string,
): Promise<WebhookVerificationResult> {
  if (!secret) return { valid: false, mechanism: 'none' };
  const verifHash = getHeader(headers, 'verif-hash');
  const sig = getHeader(headers, 'flutterwave-signature', 'flutterwave_signature');

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    parsed = null;
  }
  const eventType =
    parsed && typeof parsed === 'object' && 'event' in (parsed as Record<string, unknown>)
      ? String((parsed as Record<string, unknown>).event)
      : undefined;
  const data =
    parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)
      ? ((parsed as Record<string, unknown>).data as Record<string, unknown>)
      : (parsed as Record<string, unknown> | null);

  const providerReference =
    (data?.tx_ref as string | undefined) ??
    (data?.txRef as string | undefined) ??
    (data?.reference as string | undefined) ??
    null;
  const providerTxId =
    data?.id !== undefined && data?.id !== null
      ? String(data.id)
      : ((data?.transaction_id as string | undefined) ?? null);

  // Mechanism 1: static verif-hash comparison (constant-time)
  if (verifHash && safeEqual(verifHash, secret)) {
    return { valid: true, mechanism: 'verif-hash', eventType, providerReference, providerTxId, payload: parsed };
  }
  // Mechanism 2: HMAC-SHA256, accept base64 or hex encodings
  if (sig) {
    for (const encoding of ['base64', 'hex'] as const) {
      const expected = createHmac('sha256', secret).update(rawBody).digest(encoding);
      if (safeEqual(sig, expected)) {
        return { valid: true, mechanism: 'hmac-sha256', eventType, providerReference, providerTxId, payload: parsed };
      }
    }
  }
  return { valid: false, mechanism: 'none', eventType, providerReference, providerTxId, payload: parsed };
}

export function normalizeTransaction(response: unknown): ProviderObservation {
  const data =
    response && typeof response === 'object' && 'data' in (response as Record<string, unknown>)
      ? ((response as Record<string, unknown>).data as Record<string, unknown>)
      : ((response ?? {}) as Record<string, unknown>);
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) if (data[k] !== undefined && data[k] !== null) return data[k];
    return null;
  };
  const amountRaw = pick('amount', 'charged_amount');
  return {
    providerTxId: data.id !== undefined && data.id !== null ? String(data.id) : ((pick('transaction_id', 'flw_ref') as string | null) ?? null),
    providerReference: (pick('tx_ref', 'txRef', 'reference', 'flw_ref') as string | null) ?? null,
    providerStatus: (pick('status', 'processor_response') as string | null) ?? null,
    amount: amountRaw === null ? null : String(amountRaw),
    currency: (pick('currency') as string | null) ?? null,
    raw: response,
  };
}

export interface FlutterwaveClientOptions {
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

export class FlutterwaveClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private maxRetries: number;
  constructor(private opts: FlutterwaveClientOptions) {
    this.baseUrl = (opts.baseUrl ?? 'https://api.flutterwave.com/v3').replace(/\/$/, '');
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
    throw lastErr instanceof Error ? lastErr : new Error('flutterwave request failed');
  }

  /** GET /transactions/:id/verify */
  async verifyTransaction(id: string | number): Promise<{ httpStatus: number; observation: ProviderObservation }> {
    const { status, body } = await this.request(`/transactions/${encodeURIComponent(String(id))}/verify`);
    if (status === 404) {
      return {
        httpStatus: status,
        observation: { providerTxId: String(id), raw: body },
      };
    }
    if (status >= 400) throw Object.assign(new Error(`verify failed: ${status}`), { status, body });
    return { httpStatus: status, observation: normalizeTransaction(body) };
  }

  /** GET /transactions/verify_by_reference?tx_ref= */
  async verifyByReference(txRef: string): Promise<{ httpStatus: number; observation: ProviderObservation }> {
    const { status, body } = await this.request(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
    if (status === 404) return { httpStatus: status, observation: { providerReference: txRef, raw: body } };
    if (status >= 400) throw Object.assign(new Error(`verify_by_reference failed: ${status}`), { status, body });
    return { httpStatus: status, observation: normalizeTransaction(body) };
  }

  /** GET /transactions?from&to&page — paginated discovery. */
  async listTransactions(query: TransactionListQuery): Promise<PaginatedProviderTransactions> {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      page: String(query.page ?? 1),
    });
    if (query.txRef) params.set('tx_ref', query.txRef);
    if (query.status) params.set('status', query.status);
    const { status, body } = await this.request(`/transactions?${params.toString()}`);
    if (status >= 400) throw Object.assign(new Error(`list failed: ${status}`), { status, body });
    const b = body as { data?: unknown[]; meta?: { page_info?: { total?: number; current_page?: number; total_pages?: number } } };
    const data = Array.isArray(b.data) ? b.data.map(normalizeTransaction) : [];
    const pageInfo = b.meta?.page_info;
    const page = pageInfo?.current_page ?? query.page ?? 1;
    const totalPages = pageInfo?.total_pages ?? null;
    const total = pageInfo?.total ?? null;
    return {
      data,
      page,
      totalPages,
      total,
      hasMore: totalPages !== null ? page < totalPages : data.length > 0,
    };
  }

  /** POST /payments — create hosted checkout link. */
  async createPayment(payload: {
    tx_ref: string;
    amount: number | string;
    currency: string;
    redirect_url: string;
    customer: { email: string; name?: string; phone_number?: string };
    customizations?: { title?: string; description?: string; logo?: string };
  }): Promise<{ link: string; raw: unknown }> {
    const { status, body } = await this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (status >= 400) throw Object.assign(new Error(`create payment failed: ${status}`), { status, body });
    const link = (body as { data?: { link?: string } })?.data?.link;
    if (!link) throw new Error('no checkout link in response');
    return { link, raw: body };
  }

  /** GET /settlements */
  async listSettlements(params: { page?: number; from?: string; to?: string } = {}): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const { status, body } = await this.request(`/settlements?${qs.toString()}`);
    if (status >= 400) throw Object.assign(new Error(`settlements failed: ${status}`), { status, body });
    return body;
  }
}
