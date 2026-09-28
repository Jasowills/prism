# E2E scenario coverage (spec §12, scenarios 1–20)

| # | Scenario | Where | Status |
|---|---|---|---|
| 1 | Successful payment verified | core test + api E2E | pass |
| 2 | Missing webhook flagged after grace | core test | pass |
| 3 | Duplicate webhook preserved/idempotent | core + api E2E | pass |
| 4 | Delayed webhook resolves w/ history | core (delayed finding) | pass |
| 5 | Invalid signature rejected, no state change | api E2E | pass |
| 6 | Provider timeout recorded, unresolved | core test | pass |
| 7 | Rate limit backoff, no storm | faults + adapter | pass |
| 8 | Amount mismatch shown | core test | pass |
| 9 | Currency mismatch, no fulfillment | core test | pass |
| 10 | Orphan provider transaction | core test | pass |
| 11 | Orphan local transaction | core + discovery | pass |
| 12 | Worker crash recovers, no double processing | faults harness | pass |
| 13 | DB unavailable → no false ack | code path (persist-first) + ready gate | pass (logic) + trigger rejection verified on PG16 |
| 14 | Out-of-order observations | core test | pass |
| 15 | Reversal/refund lifecycle preserved | core test | pass |
| 16 | Pagination failure → incomplete run | discovery-failure E2E (dead-loopback provider) | pass |
| 17 | Tenant isolation | integration security | pass |
| 18 | Evidence integrity tamper detection | integration store + PG16 trigger/hash verification | pass |
| 19 | Idempotent merchant processing | faults harness + merchant app | pass |
| 20 | Real Flutterwave test-mode checkout | provider live test | **blocked** (no creds; documented) |

Plus: delayed-webhook rule tests (`packages/core/test/delayed-webhook.test.ts`),
discrepancy lifecycle incl. resolution history (`test/integration/
discrepancy-lifecycle.test.ts`), discovery-failure → incomplete run
(`test/e2e/discovery-failure.test.ts`), CLI smoke (`test/e2e/cli.test.ts`).

"Pass (logic)" = deterministic test against the real code path with memory
store; Postgres-backed confirmation runs in CI where Docker exists.
