import { describe, expect, it } from 'vitest';
import { reconcile } from '../src/reconcile.js';

function settledBase(settlements: Parameters<typeof reconcile>[0]['settlements']) {
  return {
    intent: {
      merchantReference: 'ref-s',
      expectedAmount: '100.00',
      currency: 'NGN',
      createdAt: '2026-01-01T10:00:00.000Z',
    },
    webhooks: [
      { id: 'w1', eventType: 'charge.completed', providerReference: 'ref-s', receivedAt: '2026-01-01T10:05:00.000Z' },
    ],
    providerObservations: [
      { providerStatus: 'successful', amount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:06:00.000Z', outcome: 'success' as const },
    ],
    ledger: [
      { recordedStatus: 'successful', recordedAmount: '100.00', currency: 'NGN', observedAt: '2026-01-01T10:07:00.000Z' },
    ],
    settlements,
    nowIso: '2026-02-01T10:00:00.000Z',
    graceMinutes: 15,
    discoveryComplete: true,
  };
}

describe('settlements (rules v1.1.0)', () => {
  it('settled payout matching intent stays verified with settlement=SETTLED', () => {
    const r = reconcile(
      settledBase([
        { settlementId: 'st-1', reference: 'ref-s', grossAmount: '100.00', netAmount: '98.60', currency: 'NGN', state: 'settled', observedAt: '2026-01-05T00:00:00.000Z' },
      ]),
    );
    expect(r.settlementStatus).toBe('SETTLED');
    expect(r.verificationStatus).toBe('VERIFIED');
    expect(r.findings).toHaveLength(0);
  });

  it('pending payout raises settlement_pending without touching payment state', () => {
    const r = reconcile(
      settledBase([
        { settlementId: 'st-2', reference: 'ref-s', grossAmount: '100.00', netAmount: null, currency: 'NGN', state: 'pending', observedAt: '2026-01-05T00:00:00.000Z' },
      ]),
    );
    expect(r.settlementStatus).toBe('PENDING');
    expect(r.paymentStatus).toBe('SUCCESSFUL');
    expect(r.findings.some((f) => f.type === 'settlement_pending' && f.severity === 'low')).toBe(true);
  });

  it('settled gross differing from intent raises settlement_amount_mismatch', () => {
    const r = reconcile(
      settledBase([
        { settlementId: 'st-3', reference: 'ref-s', grossAmount: '90.00', netAmount: '88.60', currency: 'NGN', state: 'settled', observedAt: '2026-01-05T00:00:00.000Z' },
      ]),
    );
    expect(r.settlementStatus).toBe('SETTLED');
    expect(r.findings.some((f) => f.type === 'settlement_amount_mismatch' && f.severity === 'high')).toBe(true);
  });

  it('no settlement evidence means UNKNOWN, never a missing-settlement finding', () => {
    const r = reconcile(settledBase([]));
    expect(r.settlementStatus).toBe('UNKNOWN');
    expect(r.verificationStatus).toBe('VERIFIED');
    expect(r.findings.some((f) => f.type.startsWith('settlement'))).toBe(false);
  });

  it('settlement lines for other references are ignored, not flagged', () => {
    const r = reconcile(
      settledBase([
        { settlementId: 'st-9', reference: 'other-ref', grossAmount: '50.00', netAmount: '49.00', currency: 'NGN', state: 'settled', observedAt: '2026-01-05T00:00:00.000Z' },
      ]),
    );
    expect(r.settlementStatus).toBe('UNKNOWN');
    expect(r.findings).toHaveLength(0);
  });

  it('orphaned settlement (no intent) is flagged', () => {
    const r = reconcile({
      intent: null,
      webhooks: [],
      providerObservations: [],
      ledger: [],
      settlements: [
        { settlementId: 'st-x', reference: 'ghost', grossAmount: '10.00', netAmount: '9.80', currency: 'NGN', state: 'settled', observedAt: '2026-01-05T00:00:00.000Z' },
      ],
      nowIso: '2026-02-01T10:00:00.000Z',
      graceMinutes: 15,
      discoveryComplete: true,
    });
    expect(r.findings.some((f) => f.type === 'orphaned_settlement')).toBe(true);
  });
});
