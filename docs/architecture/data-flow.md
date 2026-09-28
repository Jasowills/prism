# Data flow

## Webhook ingestion (persist-first)

1. Express `json({ verify })` captures `req.rawBody` for `/v1/webhooks/*`.
2. `verifyWebhook` checks `verif-hash` (static) or `flutterwave-signature`
   (HMAC-SHA256, base64/hex) in constant time.
3. Payload parsed + validated; reference/tx-id extracted.
4. `deliveryFingerprint(eventId, eventType, reference, payloadHash)` looked up;
   duplicates keep a `duplicate_of` link.
5. Row inserted with `prev_hash`/`entry_hash` chain; payload stored redacted.
6. BullMQ job `webhook-process` enqueued (or inline fallback).
7. HTTP 200 returned only now.

## Verification

`GET /v1/transactions/:ref/verification[?live=true]` loads intent, webhooks,
API observations, ledger; optionally live-verifies via provider; runs
`reconcile()`; upserts typed discrepancies; returns five dimensions + findings.

## Discovery runs

`POST /v1/reconciliation-runs` fixes a UTC window, pages provider listing
(persisting each page), processes records idempotently, and marks
complete/incomplete/failed. Local fallback reconciles intents in-window when no
provider credentials exist.

## Merchant fulfillment

The example merchant fulfills exactly once: first `fulfill` writes a ledger
observation with `fulfillmentStatus=fulfilled`; retries detect the existing
marker and skip business action while still recording the observation.
