# Test strategy

Layers (all executed in CI/local; see results in `provider-test-results.md`):

1. **Unit** (`packages/core/test`): money math, state machine, 9 reconciliation
   scenarios. Fast, no I/O.
2. **Integration** (`test/integration`): evidence store semantics (uniqueness,
   hash-chain tamper detection, tenant isolation), webhook signature variants,
   redaction.
3. **API E2E** (`test/e2e/api.test.ts`): real HTTP against NestJS + memory store —
   intent, invalid-signature rejection, persist-first ack, duplicate preservation,
   ledger, verification, discrepancy listing.
4. **Docker E2E**: same suite against Compose stack (runs in CI `integration`
   job with Postgres/Redis services; blocked locally — no Docker daemon here).
5. **Provider** (`test/provider`): mocked adapter (verify, pagination,
   normalization) + live test skipped without `FLW_SECRET_KEY`.
6. **Fault injection** (`test/faults`): ack-lost + duplicates + timeout +
   worker restart with exactly-once assertion; crash recovery; rate-limit
   recording. Deterministic seeds.
7. **Load** (`test/e2e/load.test.ts`): 500 reconciliations < 5s (observed ~5ms).
8. **Security** (`test/integration/security.test.ts`): redaction, isolation,
   append-only surface.

Mandatory 20 scenarios (spec §12) map to these files — see `e2e-scenarios.md`.
