# ADR 0005 — Reconciliation state machine with separated dimensions

Status: accepted (2026-09-28)

## Context

A single status cannot express "money verified but webhook missing".

## Decision

Five exposed dimensions: `payment_status`, `verification_status`,
`delivery_status`, `ledger_status`, `evidence_completeness`. Payment lifecycle
(CREATED→PENDING→SUCCESSFUL/FAILED/CANCELLED, post-success REVERSED/
PARTIALLY_REFUNDED/REFUNDED) is tracked separately from verification
(UNVERIFIED/VERIFYING/VERIFIED/DISCREPANCY/INSUFFICIENT_EVIDENCE/
RECONCILIATION_INCOMPLETE). Observation selection uses provider/observation
timestamps, never "latest HTTP response wins". Missing webhooks require a grace
window. Rule version (`prism-rules-v1.0.0`) is stored with every finding.

## Alternatives

- Single status enum: rejected — loses the verified-but-undelivered state.
- Latest-response-wins: rejected — out-of-order delivery corrupts state.

## Consequences

- Consumers must read all five dimensions (documented in API + merchant guide).
- Findings are reproducible: same evidence + same rule version → same result.

## Risks / revisit

- If Flutterwave publishes authoritative event ordering (sequence numbers),
  adopt it in observation selection.
