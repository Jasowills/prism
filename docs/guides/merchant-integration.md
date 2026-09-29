# Merchant integration (SDK + example)

## Purpose and scope

`examples/merchant-checkout` is a working example merchant for developers
running PRISM payment-scenario demos: create order, pay via hosted checkout,
handle return, receive webhooks, fulfill exactly once, inspect reconciliation.
Its UI (`DESIGN.md` alongside the app) is a night-service console that surfaces
PRISM verification state per order. Test-mode keys only; demo PII only.

## Pattern

1. Create order in your DB.
2. `sdk.registerIntent({ merchantReference, expectedAmount, currency })`.
3. Initialize Flutterwave checkout (`POST https://api.flutterwave.com/v3/payments`
   or Inline/HTML) with the same `tx_ref`; redirect the buyer.
4. On return (`?transaction_id&tx_ref&status`), call
   `GET /v1/transactions/:ref/verification?live=true` — fulfill only on
   `paymentStatus=SUCCESSFUL` with no `amount_mismatch`/`currency_mismatch`.
5. Record fulfillment: `POST /v1/payment-intents/:id/ledger-observations` with
   `fulfillmentStatus=fulfilled`. Retries are idempotent server-side, but your
   fulfill handler must also guard (check-then-act on your order row).
6. Subscribe to PRISM discrepancies for `missing_webhook`, `amount_mismatch`,
   `duplicate_fulfillment_risk`.

## Example app

`examples/merchant-checkout` implements this end to end for Flutterwave (Paystack checkout differs only in initialization: `POST /transaction/initialize` with kobo amounts → `authorization_url`): checkout page, order
DB (in-memory), Flutterwave redirect, return handling, webhook endpoint with
delivery dedupe, one-shot fulfillment, order status page, and a
`simulate-webhook` test helper. The critical demo: drop the first webhook,
duplicate the next, restart the worker — the order fulfills exactly once with
every delivery inspectable in PRISM.

## Why webhooks alone are insufficient

Webhooks can be lost, delayed, duplicated, or forged; they assert notification,
not settlement truth. PRISM adds independent API observation and intent
comparison so a missing/delayed/forged webhook becomes a typed, explainable
finding instead of a silent mispayment.
