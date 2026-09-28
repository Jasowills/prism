# Flutterwave test setup

1. Create an account at https://app.flutterwave.com, open **Settings → API Keys**,
   toggle **Test Mode**, copy `FLW_PUBLIC_KEY` / `FLW_SECRET_KEY`.
2. Open **Settings → Webhooks**, set your public URL (see tunnel notes below) and
   a random secret hash → `FLW_WEBHOOK_SECRET`.
3. Configure `.env`:

```dotenv
FLW_SECRET_KEY=FLWSECK_TEST-...
FLW_PUBLIC_KEY=FLWPUBK_TEST-...
FLW_WEBHOOK_SECRET=<your-secret-hash>
PRISM_TEST_MODE=true
```

4. Test-mode payments: create a payment via the merchant app
   (`POST /orders`), open the returned Flutterwave checkout link, and pay using
   the current test cards/bank procedures in the official docs
   (https://developer.flutterwave.com/docs/testing — procedures change; always
   follow the live page, never hardcode card numbers here).
5. Webhook delivery to localhost requires a public tunnel (e.g. ngrok, Cloudflare
   Tunnel, or `stripe listen`-style forwarding) **or** the provider's resend API
   (`POST /transactions/:id/resend-webhook`). Configure the dashboard
   webhook URL to the tunnel endpoint
   `https://<tunnel>/v1/webhooks/flutterwave`.
6. Verify: `GET /v1/transactions/<tx_ref>/verification?live=true`.

Test data is archived after 30 days. Live keys must never enter `.env` or docs.
