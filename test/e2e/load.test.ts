import { describe, expect, it } from 'vitest';
import { reconcile } from '../../packages/core/src/reconcile.js';

describe('load / throughput smoke', () => {
  it('reconciles 500 references within budget', () => {
    const start = Date.now();
    for (let i = 0; i < 500; i++) {
      reconcile({
        intent: { merchantReference: `r-${i}`, expectedAmount: '10.00', currency: 'NGN', createdAt: '2026-01-01T10:00:00.000Z' },
        webhooks: [{ id: `w-${i}`, eventType: 'charge.completed', providerReference: `r-${i}`, receivedAt: '2026-01-01T10:05:00.000Z' }],
        providerObservations: [{ providerStatus: 'successful', amount: '10.00', currency: 'NGN', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '10.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' }],
        nowIso: '2026-01-01T10:30:00.000Z',
        graceMinutes: 15,
        discoveryComplete: true,
      });
    }
    const ms = Date.now() - start;
    console.log(`500 reconciliations in ${ms}ms`);
    expect(ms).toBeLessThan(5000);
  });
});
