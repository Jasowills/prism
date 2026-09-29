import { describe, expect, it } from 'vitest';
import { reconcile, type ReconciliationInput } from '../src/reconcile.js';

const TENANT = '00000000-0000-0000-0000-000000000001';

function base(input: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    intent: {
      merchantReference: 'ref-1',
      expectedAmount: '100.00',
      currency: 'NGN',
      createdAt: '2026-01-01T10:00:00.000Z',
    },
    webhooks: [],
    providerObservations: [],
    ledger: [],
    nowIso: '2026-01-01T10:30:00.000Z',
    graceMinutes: 15,
    discoveryComplete: true,
    ...input,
  };
}

describe('reconciliation', () => {
  it('1. successful payment verifies', () => {
    const r = reconcile(
      base({
        webhooks: [{ id: 'w1', eventType: 'charge.completed', providerReference: 'ref-1', providerTxId: '1', receivedAt: '2026-01-01T10:05:00.000Z' }],
        providerObservations: [{ providerStatus: 'successful', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', fulfillmentStatus: 'fulfilled', observedAt: '2026-01-01T10:07:00.000Z' }],
      }),
    );
    expect(r.verificationStatus).toBe('VERIFIED');
    expect(r.paymentStatus).toBe('SUCCESSFUL');
    expect(r.findings).toHaveLength(0);
  });

  it('2. missing webhook is flagged after grace', () => {
    const r = reconcile(
      base({
        providerObservations: [{ providerStatus: 'successful', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:20:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:21:00.000Z' }],
      }),
    );
    expect(r.deliveryStatus).toBe('MISSING');
    expect(r.findings.some((f) => f.type === 'missing_webhook')).toBe(true);
  });

  it('3. duplicate webhooks preserved, single logical result', () => {
    const r = reconcile(
      base({
        webhooks: [
          { id: 'w1', eventType: 'charge.completed', providerReference: 'ref-1', receivedAt: '2026-01-01T10:05:00.000Z' },
          { id: 'w2', eventType: 'charge.completed', providerReference: 'ref-1', receivedAt: '2026-01-01T10:05:01.000Z', duplicateOf: 'w1' },
        ],
        providerObservations: [{ providerStatus: 'successful', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' }],
      }),
    );
    expect(r.deliveryStatus).toBe('DUPLICATE');
    expect(r.findings.some((f) => f.type === 'duplicate_webhook')).toBe(true);
    expect(r.verificationStatus).toBe('DISCREPANCY'); // duplicates are inspectable findings
  });

  it('8/9. amount and currency mismatches are critical', () => {
    const amt = reconcile(
      base({
        webhooks: [{ id: 'w1', eventType: 'charge.completed', providerReference: 'ref-1', receivedAt: '2026-01-01T10:05:00.000Z' }],
        providerObservations: [{ providerStatus: 'successful', amount: '99.00', currency: 'NGN', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' }],
      }),
    );
    expect(amt.findings.some((f) => f.type === 'amount_mismatch' && f.severity === 'critical')).toBe(true);

    const cur = reconcile(
      base({
        webhooks: [{ id: 'w1', eventType: 'charge.completed', providerReference: 'ref-1', receivedAt: '2026-01-01T10:05:00.000Z' }],
        providerObservations: [{ providerStatus: 'successful', amount: '100.00', currency: 'USD', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' }],
      }),
    );
    expect(cur.findings.some((f) => f.type === 'currency_mismatch')).toBe(true);
  });

  it('10/11. orphans detected', () => {
    const orphanProvider = reconcile(base({ intent: null, webhooks: [{ id: 'w1', eventType: 'charge.completed', providerReference: 'ghost', receivedAt: '2026-01-01T10:05:00.000Z' }] }));
    expect(orphanProvider.findings.some((f) => f.type === 'orphaned_provider_transaction')).toBe(true);
    void TENANT;
  });

  it('no intent and no evidence is UNVERIFIED, never an orphan finding', () => {
    const r = reconcile(base({ intent: null }));
    expect(r.verificationStatus).toBe('UNVERIFIED');
    expect(r.findings).toHaveLength(0);
  });

  it('14. out-of-order observations use latest observedAt, not arrival order', () => {
    const r = reconcile(
      base({
        webhooks: [{ id: 'w1', eventType: 'charge.completed', providerReference: 'ref-1', receivedAt: '2026-01-01T10:05:00.000Z' }],
        providerObservations: [
          { providerStatus: 'successful', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:10:00.000Z', outcome: 'success' },
          { providerStatus: 'pending', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:02:00.000Z', outcome: 'success' },
        ],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:11:00.000Z' }],
      }),
    );
    expect(r.paymentStatus).toBe('SUCCESSFUL');
  });

  it('15. reversal preserved with finding', () => {
    const r = reconcile(
      base({
        webhooks: [{ id: 'w1', eventType: 'charge.completed', providerReference: 'ref-1', receivedAt: '2026-01-01T10:05:00.000Z' }],
        providerObservations: [{ providerStatus: 'refunded', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T11:00:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' }],
      }),
    );
    expect(r.findings.some((f) => f.type === 'unexpected_reversal')).toBe(true);
  });

  it('16. incomplete discovery never reports complete', () => {
    const r = reconcile(
      base({
        discoveryComplete: false,
        webhooks: [{ id: 'w1', eventType: 'charge.completed', providerReference: 'ref-1', receivedAt: '2026-01-01T10:05:00.000Z' }],
        providerObservations: [{ providerStatus: 'successful', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' }],
        ledger: [{ recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' }],
      }),
    );
    expect(r.verificationStatus).toBe('RECONCILIATION_INCOMPLETE');
    expect(r.findings.some((f) => f.type === 'reconciliation_incomplete')).toBe(true);
  });

  it('6/7. provider failures are unresolved, not negative proof', () => {
    const r = reconcile(
      base({
        providerObservations: [{ observedAt: '2026-01-01T10:06:00.000Z', outcome: 'timeout' }],
      }),
    );
    expect(r.verificationStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.findings.some((f) => f.type === 'unresolved_provider_state')).toBe(true);
  });
});
