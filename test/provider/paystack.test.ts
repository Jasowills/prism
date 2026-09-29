import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { PaystackClient, fromSubunit, normalizeTransaction, verifyWebhook } from '../../packages/provider-paystack/src/index.js';

function mockFetch(routes: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    for (const [k, v] of Object.entries(routes)) {
      if (u.includes(k)) {
        return new Response(JSON.stringify(v.body), { status: v.status, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ status: false, message: 'not found' }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('paystack adapter', () => {
  it('converts kobo subunit to decimal major units', () => {
    expect(fromSubunit(10000)).toBe('100.00');
    expect(fromSubunit(1050)).toBe('10.50');
    expect(fromSubunit(5)).toBe('0.05');
    expect(fromSubunit(null)).toBeNull();
  });

  it('verifies by reference with kobo conversion', async () => {
    const c = new PaystackClient({
      secretKey: 'sk_test_x',
      fetchImpl: mockFetch({
        '/transaction/verify/ref-9': {
          status: 200,
          body: { status: true, data: { id: 4099260516, reference: 'ref-9', amount: 10000, currency: 'NGN', status: 'success' } },
        },
      }),
    });
    const { observation } = await c.verifyByReference('ref-9');
    expect(observation.providerStatus).toBe('success');
    expect(observation.amount).toBe('100.00');
    expect(observation.providerTxId).toBe('4099260516');
  });

  it('treats status:false as not-found observation, not success', async () => {
    const c = new PaystackClient({ secretKey: 'sk_test_x', fetchImpl: mockFetch({}) });
    const { httpStatus, observation } = await c.verifyByReference('ghost');
    expect(httpStatus).toBe(200);
    expect(observation.providerStatus).toBeNull();
  });

  it('paginates with offset meta', async () => {
    const c = new PaystackClient({
      secretKey: 'sk_test_x',
      fetchImpl: mockFetch({
        '/transaction?': {
          status: 200,
          body: { status: true, data: [{ id: 1, reference: 'a', amount: 5000, currency: 'NGN', status: 'success' }], meta: { total: 2, page: 1, pageCount: 2, perPage: 1 } },
        },
      }),
    });
    const page = await c.listTransactions({ page: 1, perPage: 1 });
    expect(page.hasMore).toBe(true);
    expect(page.data[0]!.amount).toBe('50.00');
  });

  it('verifies HMAC-SHA512 webhook signatures on raw body', async () => {
    const secret = 'sk_test_x';
    const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 1, reference: 'ref-9', amount: 10000, currency: 'NGN', status: 'success' } }));
    const sig = createHmac('sha512', secret).update(raw).digest('hex');
    const ok = await verifyWebhook(raw, { 'x-paystack-signature': sig }, secret);
    expect(ok.valid).toBe(true);
    expect(ok.providerReference).toBe('ref-9');
    expect((await verifyWebhook(raw, { 'x-paystack-signature': 'bad' }, secret)).valid).toBe(false);
    expect((await verifyWebhook(raw, {}, secret)).valid).toBe(false);
  });

  it('normalizes unknown shapes without throwing', () => {
    expect(normalizeTransaction(null).providerStatus).toBeNull();
  });
});
