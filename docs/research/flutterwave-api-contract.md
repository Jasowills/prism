# Flutterwave API contract (researched 2026-09-28)

Sources (official, retrieved 2026-09-28):

- Auth / test vs live keys: https://developer.flutterwave.com/docs/authentication
- Verify transaction: https://developer.flutterwave.com/v3.0/reference/verify-transaction
- Verify by reference: https://developer.flutterwave.com/v3.0.0/reference/verify-transaction-with-tx_ref
- Transaction verification guide: https://developer.flutterwave.com/v3.0/docs/transaction-verification
- List transactions: https://developer.flutterwave.com/v3.0/reference/get-all-transactions
- Standard checkout (POST /v3/payments): https://developer.flutterwave.com/v3.0/reference/checkout
- Refunds: https://developer.flutterwave.com/v3.0.0/docs/refunds
- Settlements list: https://developer.flutterwave.com/v3.0.0/reference/get-all-settlements
- Rate limits: https://developer.flutterwave.com/v3.0.0/docs/rate-limit
- Webhooks (current): https://developer.flutterwave.com/docs/webhooks
- Webhooks (v3.0): https://developer.flutterwave.com/v3.0/docs/webhooks

## Findings

1. Base URL: `https://api.flutterwave.com/v3`. Auth: `Authorization: Bearer <SECRET_KEY>`.
   Test keys carry a `_TEST` infix (e.g. `FLWSECK_TEST-...`). 401 when missing/invalid.
2. Verify by ID: `GET /transactions/{id}/verify` — `{id}` is `data.id` from
   charge/initiate responses and webhooks. Response `data.status === "successful"`
   plus amount/currency/tx_ref checks constitute verification.
3. Verify by reference: `GET /transactions/verify_by_reference?tx_ref=<ref>`.
4. List: `GET /transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&page=N` with optional
   `tx_ref`, `status`, `customer_email`, `currency`. Response carries
   `meta.page_info { total, current_page, total_pages }`. `from`/`to` required.
5. Checkout: `POST /payments` with `{ tx_ref, amount, currency, redirect_url,
   customer: { email, ... } }` returns `data.link` for hosted redirect. After
   payment the customer returns to `redirect_url` with `transaction_id`,
   `tx_ref`, `status` query params — the backend must still verify via API.
6. Refunds: `POST /transactions/{id}/refund` with `{ amount?, comments? }`;
   statuses include `completed`, `completed-bank-transfer`, `completed-momo`,
   `completed-mpgs`, `completed-offline`, `completed-preauth`, `pending-momo`,
   `processing`. Minimums: NGN 100, KES 10.
7. Settlements: `GET /settlements?page&from&to` (+ `subaccount_id`,
   `disburse_ref` filters). Settlement is a post-payment payout process, not
   the payment authorization itself.
8. Rate limits: HTTP 429 when exceeded; docs recommend webhook-driven updates
   over perpetual polling and exponential-backoff retries. No numeric quota is
   published — treat as dynamic.

## Test mode

- Toggle Test/Live in dashboard Settings; test data archived after 30 days.
- Sandbox charges accept `X-Scenario-Key` (e.g. `scenario:auth_3ds&issuer:approved`)
  on `developersandbox-api.flutterwave.com/charges`. Default card flow is noauth.
- Never use live keys in development. Only test mode is supported by PRISM.

## Open questions (resolved in implementation)

- Webhook signature has two documented variants (see `webhook-security.md`).
  PRISM supports both and records which mechanism validated each delivery.
- No public numeric rate-limit quota; PRISM uses bounded retries + jitter and
  never retry-storms on 429.
