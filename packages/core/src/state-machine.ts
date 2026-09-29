/** Payment lifecycle state machine (spec §7). */

export type PaymentState =
  | 'CREATED'
  | 'PENDING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'CANCELLED'
  | 'REVERSED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type VerificationState =
  | 'UNVERIFIED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'DISCREPANCY'
  | 'INSUFFICIENT_EVIDENCE'
  | 'RECONCILIATION_INCOMPLETE';

const TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  CREATED: ['PENDING', 'FAILED', 'CANCELLED'],
  PENDING: ['SUCCESSFUL', 'FAILED', 'CANCELLED'],
  SUCCESSFUL: ['REVERSED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REVERSED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: PaymentState, to: PaymentState): boolean {
  if (from === to) return true; // idempotent re-application
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransition(from, to)) {
    throw new Error(`invalid payment transition ${from} -> ${to}`);
  }
}

/** Map provider status strings to canonical PaymentState. Unknown → null (unresolved). */
export function mapProviderStatus(raw: string | null | undefined): PaymentState | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (['successful', 'success', 'completed', 'paid', 'approved'].includes(s)) return 'SUCCESSFUL';
  if (['pending', 'processing', 'ongoing', 'queued', 'initiated', 'created', 'new'].includes(s)) return 'PENDING';
  if (['failed', 'error', 'declined', 'cancelled_failed'].includes(s)) return 'FAILED';
  if (['cancelled', 'canceled', 'abandoned', 'expired'].includes(s)) return 'CANCELLED';
  if (['reversed', 'reversal'].includes(s)) return 'REVERSED';
  if (['refunded', 'refund_completed', 'completed-bank-transfer', 'completed-momo', 'completed-mpgs', 'completed-offline', 'completed-preauth'].includes(s))
    return 'REFUNDED';
  if (['partially_refunded', 'partial_refund'].includes(s)) return 'PARTIALLY_REFUNDED';
  return null;
}
