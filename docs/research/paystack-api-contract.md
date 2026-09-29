# Paystack API contract (researched 2026-09-29)

Sources (official, retrieved 2026-09-29):

- API basics / keys: https://paystack.com/docs/api/
- Transactions: https://paystack.com/docs/api/transaction/
- Verify payments: https://paystack.com/docs/payments/verify-payments/
- Webhooks: https://paystack.com/docs/payments/webhooks/
- Pagination: https://paystack.com/docs/api/pagination/

## Findings

1. Base URL `https://api.paystack.co` for both test and live; the key selects
   the environment (`sk_test_…` / `sk_live_…`). Auth: `Authorization: Bearer
   SECRET_KEY`. Dashboard: Settings → API Keys & Webhooks.
2. Verify: `GET /transaction/verify/:reference` (by merchant reference).
   Envelope `{status, message, data}` — `status` is the API call outcome, NOT
   the payment outcome; payment state is `data.status`
   (`success`/`failed`/`abandoned`/`pending`/`ongoing`/`reversed`).
3. **Amounts are integers in the subunit** (kobo for NGN, pesewa for GHS,
   cents for ZAR/USD). PRISM converts to decimal major units on ingest
   (`fromSubunit`, e.g. 10000 → `"100.00"`). Never compare raw subunit values
   with decimal intent amounts.
4. Initialize: `POST /transaction/initialize` (`email`, `amount` in subunit,
   optional `reference`) → `data.authorization_url` for hosted checkout.
5. Webhooks: `x-paystack-signature` = HMAC-**SHA512**(rawBody, secretKey), hex.
   Single documented mechanism (unlike Flutterwave's two). Events of interest:
   `charge.success` (`data.reference`, `data.id`, `data.amount`, `data.status`).
   Optional IP allowlisting is documented as defense-in-depth.
6. Listing: `GET /transaction?page&perPage&from&to&status` (offset pagination;
   `meta {total, page, pageCount, perPage}`); cursor pagination also available
   via `use_cursor` but not used in v1 (offset suffices for windowed discovery).
   Status filter values: `failed`, `success`, `abandoned`.
7. Test mode: free account, `sk_test_` keys, documented test cards; webhooks go
   to the test webhook URL configured on the dashboard.

## Mapping decisions

- `abandoned` → CANCELLED; `ongoing`/`queued` → PENDING (core state machine).
- Verify-by-reference is primary (Paystack IDs are uint64; references are the
  merchant key). HTTP-200 + `status:false` envelopes are recorded as
  `not_found` observations, never success.
