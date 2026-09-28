# Transaction discovery / listing (researched 2026-09-28)

Source: https://developer.flutterwave.com/v3.0/reference/get-all-transactions

## Contract

- `GET /transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&page=N`
- `from` and `to` are required; `page` defaults to 1.
- Optional filters: `tx_ref`, `status` (`successful`/`failed`), `customer_email`,
  `customer_fullname`, `currency`, and others per OpenAPI.
- Response: `{ status, message, meta: { page_info: { total, current_page,
  total_pages } }, data: [...] }`.
- Each record carries `id` (provider transaction ID), `tx_ref` (merchant
  reference), `flw_ref`, `amount`, `currency`, `status`, `payment_type`,
  `created_at`, customer fields.

## PRISM discovery reconciliation

1. Runs fix a UTC window (`windowFrom`, `windowTo`) at creation.
2. Pages are fetched sequentially and each page response persisted as a
   `provider_api_observations` row (`query_type='discovery'`).
3. Records are processed idempotently (fingerprint on tx_ref + id).
4. The run is `complete` only after every page succeeds; any page failure marks
   the run `incomplete` with an error summary — never falsely complete.
5. Provider records without local intents → `orphaned_provider_transaction`;
   local intents without provider records → `orphaned_local_transaction`.
