import { describe, expect, it } from 'vitest';
import { reconcile } from '../src/reconcile.js';

describe('delayed webhook lifecycle', () => {
  it('flags delayed arrival after the grace window', () => {
    const r = reconcile({
      intent: {
        merchantReference: 'ref-d',
        expectedAmount: '10.00',
        currency: 'NGN',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      webhooks: [
        {
          id: 'w1',
          eventType: 'charge.completed',
          providerReference: 'ref-d',
          receivedAt: '2026-01-01T10:45:00.000Z', // 45min > 15min grace
        },
      ],
      providerObservations: [
        { providerStatus: 'successful', amount: '10.00', currency: 'NGN', observedAt: '2026-01-01T10:46:00.000Z', outcome: 'success' },
      ],
      ledger: [{ recordedStatus: 'successful', recordedAmount: '10.00', currency: 'NGN', observedAt: '2026-01-01T10:47:00.000Z' }],
      nowIso: '2026-01-01T11:00:00.000Z',
      graceMinutes: 15,
      discoveryComplete: true,
    });
    expect(r.deliveryStatus).toBe('DELAYED');
    expect(r.findings.some((f) => f.type === 'delayed_webhook')).toBe(true);
  });

  it('does not flag delivery inside the grace window', () => {
    const r = reconcile({
      intent: {
        merchantReference: 'ref-e',
        expectedAmount: '10.00',
        currency: 'NGN',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      webhooks: [
        { id: 'w1', eventType: 'charge.completed', providerReference: 'ref-e', receivedAt: '2026-01-01T10:05:00.000Z' },
      ],
      providerObservations: [
        { providerStatus: 'successful', amount: '10.00', currency: 'NGN', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' },
      ],
      ledger: [{ recordedStatus: 'successful', recordedAmount: '10.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' }],
      nowIso: '2026-01-01T10:30:00.000Z',
      graceMinutes: 15,
      discoveryComplete: true,
    });
    expect(r.deliveryStatus).toBe('DELIVERED');
    expect(r.findings.some((f) => f.type === 'delayed_webhook')).toBe(false);
  });
});
