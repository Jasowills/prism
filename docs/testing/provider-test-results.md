# Provider test results

Date: 2026-09-28. Environment: macOS, Node 24, no Docker daemon, no
`FLW_SECRET_KEY`/`FLW_PUBLIC_KEY`/`FLW_WEBHOOK_SECRET` in environment.

## Executed

- Mocked adapter tests (`test/provider/adapter.test.ts`): verify-by-ID mapping,
  discovery pagination stop condition, unknown-shape normalization — **4 passed**.
- Webhook dual-mechanism tests (`test/integration/webhook-security.test.ts`):
  static `verif-hash` accept, HMAC base64 accept, wrong/unsigned reject —
  **3 passed**.
- Live discovery test: **SKIPPED by design** (`FLW_SECRET_KEY` absent). The test
  logs `SKIP live provider test` and performs no assertions — it is reported as
  blocked, not passed.

## Real test-mode flow (spec §7/§10)

Not executed: no Flutterwave test credentials are available in this environment,
and no Docker daemon exists for the Compose stack. The full manual procedure is
documented in `docs/guides/flutterwave-setup.md`; on completion, record here:
timestamp, tx_ref/transaction ID, verification result, webhook receipt time,
reconciliation result, and sanitized logs.

## Locally verified substitute

API E2E + fault harness exercise the identical code paths (ingest → persist →
verify → reconcile → fulfill-once) with signed test deliveries
(`x-prism-test` bypass is dev-only and explicit). See `docs/EXECUTION_LOG.md`.
