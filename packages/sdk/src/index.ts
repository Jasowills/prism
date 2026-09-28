export interface PrismSdkOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class PrismSdk {
  constructor(private opts: PrismSdkOptions) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.opts.apiKey) h['x-api-key'] = this.opts.apiKey;
    return h;
  }

  private async req(path: string, init?: RequestInit): Promise<unknown> {
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`${this.opts.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`PRISM ${res.status}: ${JSON.stringify(body)}`);
    return body;
  }

  registerIntent(input: {
    merchantReference: string;
    expectedAmount: string;
    currency: string;
    provider?: string;
  }): Promise<unknown> {
    return this.req('/v1/payment-intents', { method: 'POST', body: JSON.stringify(input) });
  }

  recordLedger(intentId: string, input: { merchantReference: string; recordedStatus: string; recordedAmount?: string; currency?: string; fulfillmentStatus?: string }): Promise<unknown> {
    return this.req(`/v1/payment-intents/${intentId}/ledger-observations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  verify(reference: string): Promise<unknown> {
    return this.req(`/v1/transactions/${encodeURIComponent(reference)}/verification`);
  }

  runReconciliation(windowFrom: string, windowTo: string): Promise<unknown> {
    return this.req('/v1/reconciliation-runs', {
      method: 'POST',
      body: JSON.stringify({ windowFrom, windowTo }),
    });
  }
}
