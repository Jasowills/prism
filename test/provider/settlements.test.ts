import { describe, expect, it } from 'vitest';
import { FlutterwaveClient, normalizeSettlement } from '../../packages/provider-flutterwave/src/index.js';

describe('settlement normalization', () => {
  it('maps settled/pending/flagged states', () => {
    expect(normalizeSettlement({ id: 1, gross_amount: 1000, net_amount: 986, currency: 'NGN', status: 'completed', disburse_ref: 'D-1' }))
      .toMatchObject({ id: '1', reference: 'D-1', grossAmount: '1000', netAmount: '986', currency: 'NGN', state: 'settled' });
    expect(normalizeSettlement({ status: 'pending' }).state).toBe('pending');
    expect(normalizeSettlement({ status: 'flagged' }).state).toBe('flagged');
    expect(normalizeSettlement(null).state).toBe('unknown');
  });

  it('paginates settlement listing', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          status: 'success',
          meta: { page_info: { total: 2, current_page: 1, total_pages: 2 } },
          data: [{ id: 7, gross_amount: 5000, net_amount: 4930, currency: 'NGN', status: 'completed', disburse_ref: 'D-7' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch;
    const c = new FlutterwaveClient({ secretKey: 'sk-test', fetchImpl });
    const page = await c.listSettlements({ page: 1 });
    expect(page.hasMore).toBe(true);
    expect(page.data[0]).toMatchObject({ reference: 'D-7', state: 'settled' });
  });
});
