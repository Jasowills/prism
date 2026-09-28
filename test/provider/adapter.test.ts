import { describe, expect, it } from 'vitest';
import { FlutterwaveClient, normalizeTransaction } from '../../packages/provider-flutterwave/src/index.js';

function mockFetch(routes: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    for (const [k, v] of Object.entries(routes)) {
      if (u.includes(k)) {
        return new Response(JSON.stringify(v.body), { status: v.status, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ status: 'error', message: 'not found' }), { status: 404 });
  }) as unknown as typeof fetch;
}

describe('provider adapter (mocked)', () => {
  it('verifies transaction by id', async () => {
    const c = new FlutterwaveClient({
      secretKey: 'sk-test',
      fetchImpl: mockFetch({
        '/transactions/123/verify': { status: 200, body: { status: 'success', data: { id: 123, tx_ref: 'ref-1', amount: 100, currency: 'NGN', status: 'successful' } } },
      }),
    });
    const { observation } = await c.verifyTransaction(123);
    expect(observation.providerStatus).toBe('successful');
    expect(observation.providerReference).toBe('ref-1');
  });

  it('paginates discovery and stops correctly', async () => {
    const c = new FlutterwaveClient({
      secretKey: 'sk-test',
      fetchImpl: mockFetch({
        '/transactions?': {
          status: 200,
          body: { status: 'success', meta: { page_info: { total: 1, current_page: 1, total_pages: 1 } }, data: [{ id: 1, tx_ref: 'a', amount: 10, currency: 'NGN', status: 'successful' }] },
        },
      }),
    });
    const page = await c.listTransactions({ from: '2026-01-01', to: '2026-01-02' });
    expect(page.hasMore).toBe(false);
    expect(page.data).toHaveLength(1);
  });

  it('normalizes unknown shapes without throwing', () => {
    expect(normalizeTransaction(null).providerStatus).toBeNull();
    expect(normalizeTransaction({ data: { status: 'pending' } }).providerStatus).toBe('pending');
  });

  it('live provider E2E (requires FLW_SECRET_KEY; skipped otherwise)', async () => {
    const key = process.env.FLW_SECRET_KEY;
    if (!key) {
      console.log('SKIP live provider test: FLW_SECRET_KEY not set');
      return;
    }
    const c = new FlutterwaveClient({ secretKey: key });
    // Read-only discovery over a narrow window — never initiates payments.
    const page = await c.listTransactions({ from: '2026-01-01', to: '2026-01-02', page: 1 });
    expect(Array.isArray(page.data)).toBe(true);
  });
});
