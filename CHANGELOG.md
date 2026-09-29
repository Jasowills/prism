# Changelog

## v0.3.0 (2026-09-29)

- Second provider: Paystack adapter (kobo normalization, HMAC-SHA512
  webhooks), provider-aware intents/verification/discovery, mocked tests.
- Hardening: encrypted backup + restore scripts (drilled), Postgres-backed
  merchant orders, webhook-secret rotation drill + runbook, HTTP load test
  (667 req/s, duplicates all caught).
- Merchant redesign: night-console world with per-order PRISM readout,
  lifecycle timeline, PRODUCT.md + DESIGN.md.
- Fix: no-intent + no-evidence verifies as UNVERIFIED (was false DISCREPANCY).

## v0.2.0 (2026-09-29)

- Settlement reconciliation (issue #3): typed settlement records, refresh
  endpoint + CLI, sixth `settlementStatus` dimension, three new finding types.
- Issue #2: suites run against real Postgres/Redis when reachable (per-file
  test databases, BullMQ round-trip test); `truncateForTests` refuses
  non-test databases.
- Dependencies: vitest 4, drizzle-orm 0.45, audit 10 → 1 (residual dev-only).

## v0.1.0 (2026-09-28)

- Flutterwave reconciliation MVP: intents, dual-scheme webhook verification with
  persist-first ack, independent verification, windowed discovery, 12-type
  discrepancy taxonomy with resolutions, worker + inline fallback, CLI, SDK,
  example merchant with exactly-once fulfillment.
- Evidence store: Postgres (triggers, hash chains) + memory fallback; decimal-safe money.
- Tests: 37 passed across unit/integration/e2e/faults/provider(mocked); live
  provider E2E documented as blocked pending test credentials.
- Docs: research (official sources 2026-09-28), 6 ADRs, architecture, guides,
  operations, security, testing.
