# Webhook security (researched 2026-09-28)

Sources:

- https://developer.flutterwave.com/docs/webhooks (current)
- https://developer.flutterwave.com/v3.0/docs/webhooks (v3.0)
- https://developer.flutterwave.com/v2.0/docs/events-webhooks (v2.0)
- Community implementation notes (DEV, SDK docs) corroborating both variants.

## Two documented mechanisms

Flutterwave documentation describes different webhook signature mechanisms in
different versions:

1. **Static secret (`verif-hash`)** — v3.0 and v2.0 docs: the dashboard-configured
   secret hash is echoed in the `verif-hash` request header. The receiver compares
   it (constant-time) with the stored secret. NOTE: this value is identical on
   every delivery — it authenticates the sender but does not bind the body.
2. **HMAC-SHA256 (`flutterwave-signature`)** — current docs + Node v4 SDK
   (`WebhookValidator`): `HMAC-SHA256(rawBody, secretHash)` rendered as base64
   (some community examples use hex). The receiver must capture the **raw body**
   before JSON parsing and compare in constant time.

## PRISM policy

- Require a configured `FLW_WEBHOOK_SECRET`. Refuse unsigned webhooks with 401/503.
- Accept **either** mechanism; record which one validated the delivery
  (`payload_redacted._mechanism`) for auditability.
- Constant-time comparison for both; accept base64 and hex HMAC encodings.
- Capture the raw body via `express.json({ verify })` on the webhook route only.
- Persist evidence **before** acknowledging (HTTP 200 only after durable write).
- Acknowledge with 200 only on success; duplicates are accepted (recorded with
  `duplicate_of`) so provider retries terminate.
- Never log or store full secrets; payloads are redacted (PANs, CVV, keys).

## Caveats

- The static `verif-hash` scheme is bearer-token-equivalent: anyone observing one
  valid header value can forge deliveries until the secret is rotated. PRISM
  additionally recommends IP allowlisting at the edge and regular secret rotation.
  Body integrity under `verif-hash` relies on TLS.
