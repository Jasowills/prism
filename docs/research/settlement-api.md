# Settlements API (researched 2026-09-28)

Sources:

- https://developer.flutterwave.com/v3.0.0/reference/get-all-settlements
- https://developer.flutterwave.com/v3.0/docs/settlements

## Contract

- `GET /settlements?page&from&to&subaccount_id&disburse_ref`
- Response: `{ status, message, meta: { page_info }, data: [{ id, account_id,
  merchant_name, ... }] }`.
- A transaction is not financially complete until settled: funds move from the
  collection balance to the settlement account / F4B wallet on a per-method
  timeline. Flagged settlements are withheld — see the dashboard for reasons.

## PRISM position (v0.1.0 → v1.1.0)

- v0.1.0: endpoint wrapped (`listSettlements`) but no matching rules.
- v1.1.0 (implemented): typed `SettlementRecord` + `normalizeSettlement`;
  `POST /v1/settlements/refresh` stores each line as a `provider_api_observations`
  row (`query_type='settlement'`); reconciliation exposes a sixth dimension,
  `settlementStatus` (`SETTLED/PENDING/FLAGGED/UNKNOWN`), with findings
  `settlement_pending` (low), `settlement_amount_mismatch` (high),
  `orphaned_settlement` (medium). Absence of settlement evidence is never a
  finding — payout lags authorization by design. Rules version
  `prism-rules-v1.1.0`.
