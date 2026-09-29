export type DiscrepancyType =
  | 'missing_webhook'
  | 'duplicate_webhook'
  | 'delayed_webhook'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'provider_local_status_mismatch'
  | 'orphaned_provider_transaction'
  | 'orphaned_local_transaction'
  | 'unresolved_provider_state'
  | 'reconciliation_incomplete'
  | 'duplicate_fulfillment_risk'
  | 'unexpected_reversal'
  | 'settlement_pending'
  | 'settlement_amount_mismatch'
  | 'orphaned_settlement';

export type DiscrepancySeverity = 'low' | 'medium' | 'high' | 'critical';
export type DiscrepancyStatus = 'open' | 'acknowledged' | 'resolved';

export const DISCREPANCY_SEVERITY: Record<DiscrepancyType, DiscrepancySeverity> = {
  missing_webhook: 'medium',
  duplicate_webhook: 'low',
  delayed_webhook: 'low',
  amount_mismatch: 'critical',
  currency_mismatch: 'critical',
  provider_local_status_mismatch: 'high',
  orphaned_provider_transaction: 'high',
  orphaned_local_transaction: 'medium',
  unresolved_provider_state: 'medium',
  reconciliation_incomplete: 'high',
  duplicate_fulfillment_risk: 'critical',
  unexpected_reversal: 'high',
  settlement_pending: 'low',
  settlement_amount_mismatch: 'high',
  orphaned_settlement: 'medium',
};

export interface DiscrepancyFinding {
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  detail: string;
  evidenceRefs: string[];
}

export const RULE_VERSION = 'prism-rules-v1.1.0';
