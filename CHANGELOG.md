# Changelog

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
