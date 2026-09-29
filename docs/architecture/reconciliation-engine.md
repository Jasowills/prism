# Reconciliation engine (`@prism/core`, rules `prism-rules-v1.1.0`)

For each reference (spec §7):

1. Load intent; load webhooks; load API observations; load ledger.
2. Select provider observation: newest `observedAt` among `outcome='success'` —
   failures never overwrite.
3. Map status canonically; unknown strings → `unresolved_provider_state`.
4. Compare amount/currency with decimal-safe math → critical findings.
5. Compare provider state vs latest ledger → `provider_local_status_mismatch`.
6. Evaluate delivery vs grace window → `missing_webhook` / `delayed_webhook`;
   duplicates → `duplicate_webhook` (informational, preserved).
7. Check fulfillment markers → `duplicate_fulfillment_risk` on repeats.
8. Detect post-success reversal/refund → `unexpected_reversal` (history kept).
9. Check discovery completeness → `reconciliation_incomplete` when partial.
10. Evaluate settlement lines matched by reference → `settlementStatus`
    (`SETTLED/PENDING/FLAGGED/UNKNOWN`); `settlement_pending`,
    `settlement_amount_mismatch`, `orphaned_settlement` as specified. Absence
    of settlement evidence is never a finding.
11. Persist typed findings with evidence refs + rule version; return six
    dimensions plus human-readable `explain` lines.

Orphan rules: no intent + provider evidence → `orphaned_provider_transaction`;
intent + provider success + no ledger → `orphaned_local_transaction` watch.
