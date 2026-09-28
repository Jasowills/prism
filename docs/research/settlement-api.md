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

## PRISM position (v0.1.0)

- PRISM records settlement observations via `FlutterwaveClient.listSettlements`
  but does **not** claim settlement reconciliation in v0.1.0: settlement records
  are provider-payout evidence, distinct from payment authorization evidence.
- Roadmap: join settlement lines to intents on `tx_ref`/destination references
  and add `settlement_status` as a sixth evidence dimension.
