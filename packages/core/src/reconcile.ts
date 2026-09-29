import { createHash } from 'node:crypto';
import { moneyEquals } from './money.js';
import {
  DISCREPANCY_SEVERITY,
  RULE_VERSION,
  type DiscrepancyFinding,
} from './discrepancies.js';
import { mapProviderStatus, type PaymentState, type VerificationState } from './state-machine.js';

export interface ExpectedIntent {
  merchantReference: string;
  expectedAmount: string;
  currency: string;
  createdAt: string; // ISO
}

export interface WebhookEvidence {
  id: string;
  eventType: string;
  providerReference?: string | null;
  providerTxId?: string | null;
  receivedAt: string; // ISO
  providerEventAt?: string | null;
  duplicateOf?: string | null;
  payloadSummary?: Record<string, unknown>;
}

export interface ProviderObservation {
  providerTxId?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  amount?: string | null;
  currency?: string | null;
  observedAt: string; // ISO (response_received_at or provider timestamp)
  outcome: 'success' | 'not_found' | 'timeout' | 'rate_limited' | 'auth_error' | 'malformed';
}

export interface LedgerObservation {
  recordedStatus: string;
  recordedAmount?: string | null;
  currency?: string | null;
  fulfillmentStatus?: string | null;
  observedAt: string;
}

export type SettlementState = 'settled' | 'pending' | 'flagged' | 'unknown';

export interface SettlementObservation {
  settlementId?: string | null;
  reference?: string | null;
  grossAmount?: string | null;
  netAmount?: string | null;
  currency?: string | null;
  state: SettlementState;
  observedAt: string;
}

export type SettlementStatus = 'SETTLED' | 'PENDING' | 'FLAGGED' | 'UNKNOWN';

export interface ReconciliationInput {
  intent: ExpectedIntent | null;
  webhooks: WebhookEvidence[];
  providerObservations: ProviderObservation[];
  ledger: LedgerObservation[];
  settlements?: SettlementObservation[];
  nowIso: string;
  graceMinutes: number;
  discoveryComplete: boolean;
}

export interface ReconciliationResult {
  paymentStatus: PaymentState | 'UNKNOWN';
  verificationStatus: VerificationState;
  deliveryStatus: 'DELIVERED' | 'MISSING' | 'DELAYED' | 'DUPLICATE' | 'UNKNOWN';
  ledgerStatus: 'MATCHING' | 'MISMATCH' | 'MISSING' | 'UNKNOWN';
  settlementStatus: SettlementStatus;
  evidenceCompleteness: 'COMPLETE' | 'PARTIAL' | 'MISSING';
  findings: DiscrepancyFinding[];
  ruleVersion: string;
  explain: string[];
}

/** Select valid provider observation using documented ordering: latest observedAt wins only among successful outcomes; failures never overwrite success semantics — they are preserved as separate evidence. Returns null when no successful observation exists. */
export function selectProviderObservation(obs: ProviderObservation[]): ProviderObservation | null {
  const ok = obs.filter((o) => o.outcome === 'success' && o.providerStatus);
  if (ok.length === 0) return null;
  return [...ok].sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))[0]!;
}

function minutesBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000;
}

export function reconcile(input: ReconciliationInput): ReconciliationResult {
  const explain: string[] = [];
  const findings: DiscrepancyFinding[] = [];
  const ref = (id: string) => id;

  // --- Orphan checks
  if (!input.intent) {
    findings.push({
      type: 'orphaned_provider_transaction',
      severity: DISCREPANCY_SEVERITY.orphaned_provider_transaction,
      detail: 'Provider evidence exists without a local payment intent.',
      evidenceRefs: input.webhooks.map((w) => ref(`webhook:${w.id}`)),
    });
    for (const o of input.settlements ?? []) {
      findings.push({
        type: 'orphaned_settlement',
        severity: DISCREPANCY_SEVERITY.orphaned_settlement,
        detail: `Settlement line ${o.settlementId ?? '(unknown id)'} has no local intent.`,
        evidenceRefs: ['settlement'],
      });
    }
    return {
      paymentStatus: 'UNKNOWN',
      verificationStatus: input.discoveryComplete ? 'DISCREPANCY' : 'RECONCILIATION_INCOMPLETE',
      deliveryStatus: input.webhooks.length ? 'DELIVERED' : 'UNKNOWN',
      ledgerStatus: input.ledger.length ? 'MISMATCH' : 'MISSING',
      settlementStatus: 'UNKNOWN',
      evidenceCompleteness: 'PARTIAL',
      findings,
      ruleVersion: RULE_VERSION,
      explain: ['No local intent found; provider evidence is orphaned.'],
    };
  }

  const intent = input.intent;
  const selected = selectProviderObservation(input.providerObservations);
  const mapped: PaymentState | null = selected ? mapProviderStatus(selected.providerStatus) : null;

  // paymentStatus
  let paymentStatus: PaymentState | 'UNKNOWN' = 'UNKNOWN';
  if (mapped) paymentStatus = mapped;
  else if (input.providerObservations.some((o) => o.outcome !== 'success')) {
    paymentStatus = 'UNKNOWN';
    explain.push('Provider observations contain only failures; state is unresolved.');
  } else {
    explain.push('No successful provider observation; payment state unknown.');
  }
  if (selected) explain.push(`Selected provider observation @${selected.observedAt} status=${selected.providerStatus} outcome=${selected.outcome}.`);

  // amount / currency checks
  if (selected?.amount && !moneyEquals(selected.amount, intent.expectedAmount)) {
    findings.push({
      type: 'amount_mismatch',
      severity: DISCREPANCY_SEVERITY.amount_mismatch,
      detail: `Expected ${intent.expectedAmount} ${intent.currency}, observed ${selected.amount} ${selected.currency ?? ''}`.trim(),
      evidenceRefs: ['intent', 'provider-api'],
    });
    explain.push('Amount mismatch between intent and provider observation.');
  }
  if (selected?.currency && intent.currency && selected.currency.toUpperCase() !== intent.currency.toUpperCase()) {
    findings.push({
      type: 'currency_mismatch',
      severity: DISCREPANCY_SEVERITY.currency_mismatch,
      detail: `Expected currency ${intent.currency}, observed ${selected.currency}.`,
      evidenceRefs: ['intent', 'provider-api'],
    });
    explain.push('Currency mismatch.');
  }

  // unresolved provider state
  if (selected && !mapped) {
    findings.push({
      type: 'unresolved_provider_state',
      severity: DISCREPANCY_SEVERITY.unresolved_provider_state,
      detail: `Provider returned unrecognized status: ${selected.providerStatus}`,
      evidenceRefs: ['provider-api'],
    });
  }
  if (!selected && input.providerObservations.length > 0) {
    findings.push({
      type: 'unresolved_provider_state',
      severity: DISCREPANCY_SEVERITY.unresolved_provider_state,
      detail: 'No successful provider observation available (timeouts/errors only).',
      evidenceRefs: input.providerObservations.map((_, i) => `provider-api:${i}`),
    });
  }

  // ledger comparison
  let ledgerStatus: ReconciliationResult['ledgerStatus'] = 'MISSING';
  const latestLedger = input.ledger.length
    ? [...input.ledger].sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))[0]!
    : null;
  if (latestLedger && mapped) {
    const ledgerMapped = mapProviderStatus(latestLedger.recordedStatus);
    // Compare canonical states loosely: SUCCESSFUL vs successful etc.
    if (ledgerMapped !== mapped) {
      // Special-case: ledger PENDING while provider SUCCESSFUL → mismatch (fulfillment risk)
      ledgerStatus = 'MISMATCH';
      findings.push({
        type: 'provider_local_status_mismatch',
        severity: DISCREPANCY_SEVERITY.provider_local_status_mismatch,
        detail: `Provider=${mapped} ledger=${latestLedger.recordedStatus}`,
        evidenceRefs: ['provider-api', 'ledger'],
      });
    } else {
      ledgerStatus = 'MATCHING';
    }
    if (latestLedger.recordedAmount && !moneyEquals(latestLedger.recordedAmount, intent.expectedAmount)) {
      ledgerStatus = 'MISMATCH';
      findings.push({
        type: 'amount_mismatch',
        severity: DISCREPANCY_SEVERITY.amount_mismatch,
        detail: `Ledger amount ${latestLedger.recordedAmount} differs from intent ${intent.expectedAmount}.`,
        evidenceRefs: ['intent', 'ledger'],
      });
    }
  } else if (latestLedger && !mapped) {
    ledgerStatus = 'UNKNOWN';
  } else if (!latestLedger && mapped === 'SUCCESSFUL') {
    findings.push({
      type: 'orphaned_local_transaction',
      severity: DISCREPANCY_SEVERITY.orphaned_local_transaction,
      detail: 'Intent exists but merchant ledger has no observation.',
      evidenceRefs: ['intent'],
    });
  }

  // duplicate fulfillment risk: multiple fulfillment markers
  const fulfilledCount = input.ledger.filter(
    (l) => (l.fulfillmentStatus ?? '').toLowerCase() === 'fulfilled',
  ).length;
  if (fulfilledCount > 1) {
    findings.push({
      type: 'duplicate_fulfillment_risk',
      severity: DISCREPANCY_SEVERITY.duplicate_fulfillment_risk,
      detail: `${fulfilledCount} fulfillment markers recorded; exactly-once at risk.`,
      evidenceRefs: ['ledger'],
    });
  }

  // webhook delivery
  let deliveryStatus: ReconciliationResult['deliveryStatus'] = 'UNKNOWN';
  const dups = input.webhooks.filter((w) => w.duplicateOf);
  if (dups.length > 0) {
    findings.push({
      type: 'duplicate_webhook',
      severity: DISCREPANCY_SEVERITY.duplicate_webhook,
      detail: `${dups.length} duplicate deliverie(s) recorded; single logical processing preserved.`,
      evidenceRefs: dups.map((d) => ref(`webhook:${d.id}`)),
    });
  }
  if (input.webhooks.length === 0) {
    // missing requires grace window + provider success
    if (mapped === 'SUCCESSFUL') {
      const ageMin = minutesBetween(intent.createdAt, input.nowIso);
      if (ageMin >= input.graceMinutes) {
        deliveryStatus = 'MISSING';
        findings.push({
          type: 'missing_webhook',
          severity: DISCREPANCY_SEVERITY.missing_webhook,
          detail: `No webhook ${input.graceMinutes}min after intent creation; provider reports success.`,
          evidenceRefs: ['intent', 'provider-api'],
        });
      } else {
        deliveryStatus = 'MISSING';
        explain.push(`Within grace window (${ageMin.toFixed(1)}/${input.graceMinutes}min); missing not yet flagged.`);
      }
    } else {
      deliveryStatus = 'UNKNOWN';
    }
  } else {
    // delayed: first webhook arrived after grace
    const first = [...input.webhooks].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))[0]!;
    const delayMin = minutesBetween(intent.createdAt, first.receivedAt);
    if (delayMin > input.graceMinutes) {
      deliveryStatus = dups.length ? 'DUPLICATE' : 'DELAYED';
      findings.push({
        type: 'delayed_webhook',
        severity: DISCREPANCY_SEVERITY.delayed_webhook,
        detail: `First webhook arrived ${delayMin.toFixed(1)}min after intent (grace ${input.graceMinutes}min).`,
        evidenceRefs: [ref(`webhook:${first.id}`)],
      });
    } else {
      deliveryStatus = dups.length ? 'DUPLICATE' : 'DELIVERED';
    }
  }

  // reversal detection
  if (paymentStatus === 'REVERSED' || paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIALLY_REFUNDED') {
    findings.push({
      type: 'unexpected_reversal',
      severity: DISCREPANCY_SEVERITY.unexpected_reversal,
      detail: `Post-success lifecycle event observed: ${paymentStatus}. Original success preserved.`,
      evidenceRefs: ['provider-api'],
    });
  }

  // settlement evidence (v1.1.0): matched by reference; absence is never a
  // finding (payout lags authorization by design and timelines vary by method).
  const settlements = input.settlements ?? [];
  let settlementStatus: SettlementStatus = 'UNKNOWN';
  const matched = intent
    ? settlements.filter((s) => s.reference !== null && s.reference !== undefined && s.reference === intent.merchantReference)
    : [];
  const orphans = settlements.filter(
    (s) => s.reference === null || s.reference === undefined || (intent !== null && s.reference !== intent.merchantReference),
  );
  if (matched.length > 0) {
    const states = new Set(matched.map((m) => m.state));
    if (states.has('flagged')) {
      settlementStatus = 'FLAGGED';
      findings.push({
        type: 'orphaned_settlement',
        severity: DISCREPANCY_SEVERITY.orphaned_settlement,
        detail: 'Settlement line(s) flagged/failed by provider; payout withheld.',
        evidenceRefs: matched.map((_, i) => `settlement:${i}`),
      });
    } else if (states.has('settled')) {
      settlementStatus = 'SETTLED';
      const settled = matched.find((m) => m.state === 'settled')!;
      if (settled.grossAmount && !moneyEquals(settled.grossAmount, intent!.expectedAmount)) {
        findings.push({
          type: 'settlement_amount_mismatch',
          severity: DISCREPANCY_SEVERITY.settlement_amount_mismatch,
          detail: `Expected ${intent!.expectedAmount} ${intent!.currency}, settled gross ${settled.grossAmount} ${settled.currency ?? ''}`.trim(),
          evidenceRefs: ['intent', 'settlement'],
        });
        explain.push('Settlement gross differs from expected intent amount.');
      }
    } else if (states.has('pending') || states.has('unknown')) {
      settlementStatus = 'PENDING';
      findings.push({
        type: 'settlement_pending',
        severity: DISCREPANCY_SEVERITY.settlement_pending,
        detail: 'Payout recorded but not yet settled by provider.',
        evidenceRefs: matched.map((_, i) => `settlement:${i}`),
      });
    }
  }
  if (orphans.length > 0 && settlements.length > 0 && matched.length === 0) {
    explain.push(`${orphans.length} settlement line(s) reference other transactions; ignored for this reference.`);
  }

  // discovery completeness
  if (!input.discoveryComplete) {
    findings.push({
      type: 'reconciliation_incomplete',
      severity: DISCREPANCY_SEVERITY.reconciliation_incomplete,
      detail: 'Provider discovery/pagination incomplete; result is provisional.',
      evidenceRefs: [],
    });
  }

  // evidence completeness
  const evidenceCompleteness =
    input.intent && selected && input.webhooks.length > 0 && input.ledger.length > 0
      ? 'COMPLETE'
      : input.intent || selected || input.webhooks.length > 0
        ? 'PARTIAL'
        : 'MISSING';

  // verification status
  let verificationStatus: VerificationState = 'VERIFIED';
  if (!input.discoveryComplete) verificationStatus = 'RECONCILIATION_INCOMPLETE';
  else if (findings.some((f) => f.severity === 'critical' || f.type === 'provider_local_status_mismatch' || f.type === 'unresolved_provider_state')) {
    verificationStatus = findings.some((f) => f.type === 'unresolved_provider_state' && !selected)
      ? 'INSUFFICIENT_EVIDENCE'
      : 'DISCREPANCY';
    if (!selected && input.providerObservations.length === 0 && input.webhooks.length === 0) verificationStatus = 'UNVERIFIED';
  } else if (findings.length > 0) verificationStatus = 'DISCREPANCY';
  else if (!selected) verificationStatus = input.providerObservations.length ? 'INSUFFICIENT_EVIDENCE' : 'UNVERIFIED';
  if (!input.intent) verificationStatus = 'DISCREPANCY';

  explain.push(
    `payment=${paymentStatus} verification=${verificationStatus} delivery=${deliveryStatus} ledger=${ledgerStatus} settlement=${settlementStatus} completeness=${evidenceCompleteness} findings=${findings.length} rules=${RULE_VERSION}`,
  );

  return {
    paymentStatus,
    verificationStatus,
    deliveryStatus,
    ledgerStatus,
    settlementStatus,
    evidenceCompleteness,
    findings,
    ruleVersion: RULE_VERSION,
    explain,
  };
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Deterministic delivery fingerprint: hash of canonical provider event id + type + reference. */
export function deliveryFingerprint(parts: { providerEventId?: string | null; eventType: string; providerReference?: string | null; payloadHash: string }): string {
  const basis = [parts.providerEventId ?? '', parts.eventType, parts.providerReference ?? '', parts.payloadHash].join('|');
  return sha256Hex(basis);
}
