# Webhook secret rotation

## Why rotate

The static `verif-hash` scheme is bearer-token-equivalent: anyone who observes
one valid header can forge deliveries until rotation. Rotate after any suspected
leak, team change, or at least every 90 days. HMAC deliveries also benefit —
rotation bounds the blast radius of a leaked secret.

## Procedure (test mode)

1. Generate a new random secret (32+ bytes hex):
   `openssl rand -hex 32`.
2. In the Flutterwave dashboard (**Settings → Webhooks**), replace the secret
   hash with the new value and save. Note: deliveries in flight during the
   swap may 401 — they will be retried by the provider after the server update.
3. Update `.env` (`FLW_WEBHOOK_SECRET=<new>`) on every PRISM instance and
   restart the API + worker.
4. Verify: send a test delivery or wait for the next webhook; check
   `/metrics` (`prism_webhooks_received` rising, `prism_webhooks_rejected`
   flat) and confirm the finding-free verification of a fresh payment.
5. Keep the old secret nowhere. If it may have leaked (logs, chat, screenshots),
   treat delivery IDs from the exposure window as untrusted and re-verify those
   references with `?live=true`.

## Drill (mechanics, no dashboard needed)

`./infra/scripts/rotate-drill.sh` boots a scratch API with a fresh secret and
asserts old-signed → 401, new-signed → 200. Exercised 2026-09-29: PASSED.
Run it after any change to webhook verification code.
