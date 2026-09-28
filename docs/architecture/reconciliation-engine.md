# Reconciliation engine (`@prism/core`, rules `prism-rules-v1.0.0`)

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
10. Persist typed findings with evidence refs + rule version; return five
    dimensions plus human-readable `explain` lines.

Orphan rules: no intent + provider evidence → `orphaned_provider_transaction`;
intent + provider success + no ledger → `orphaned_local_transaction` watch.
