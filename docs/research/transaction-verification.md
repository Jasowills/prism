# Transaction verification (researched 2026-09-28)

Source: https://developer.flutterwave.com/v3.0/docs/transaction-verification

## Procedure (official)

After a charge completes, verify server-side before giving value:

1. Call `GET /transactions/{id}/verify` with the `transaction_id` (from the
   redirect query params, `data.id` from initiate, or the webhook payload).
2. Check:
   - `data.tx_ref` matches the merchant-generated reference,
   - `data.status === "successful"`,
   - `data.currency` matches expectation,
   - `data.amount >= expectedAmount` (overpayment: fulfill + refund remainder).
3. Alternatively verify by merchant reference:
   `GET /transactions/verify_by_reference?tx_ref=<ref>`.

## PRISM mapping

- `verifyTransaction(reference)` → verify-by-reference first (reference is the
  merchant key), falling back to verify-by-ID when a provider transaction ID is
  known from webhook evidence.
- Every attempt — success, 404, 401, 429, timeout, malformed — is recorded as a
  `provider_api_observations` row. Failures are observations, not proof of
  non-existence.
- Canonical states: `successful/success/completed/paid/approved` → SUCCESSFUL;
  `pending/processing/initiated/created/new` → PENDING; `failed/error/declined` →
  FAILED; `cancelled/canceled/abandoned/expired` → CANCELLED; refund/reversal
  markers → REFUNDED/REVERSED/PARTIALLY_REFUNDED. Unknown strings →
  `unresolved_provider_state` (reported as uncertainty, never silently mapped).
