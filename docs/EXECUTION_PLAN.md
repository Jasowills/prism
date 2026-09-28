# Execution plan

Spec: `PRISM_Full_Project_Execution_Specification.md` (970 lines). Target:
`Jasowills/prism`, MIT, pnpm monorepo, NestJS + Postgres + Redis/BullMQ.

## Checklist (acceptance criteria → evidence)

- [x] Research docs (`docs/research/*`, 2026-09-28, official URLs)
- [x] ADRs (`docs/decisions/0001–0006`)
- [x] Monorepo scaffold, Docker Compose, CI (PR + integration + provider-live + release)
- [x] Domain: money (decimal-safe), state machine, 12-type discrepancy taxonomy,
      deterministic `reconcile()` with 5 dimensions + rule version
- [x] Database: Drizzle schema + `001_init.sql` (triggers, hash chains) +
      Memory/Postgres stores
- [x] Flutterwave adapter: verify, verify-by-ref, paginated list, dual webhook
      verification, normalize, retries/backoff, settlements wrapper
- [x] API: all 11 spec endpoints + OpenAPI JSON; persist-first webhooks; Zod;
      API-key guard; rate limiting; Pino redaction; Prometheus-style metrics
- [x] Worker: BullMQ consumer + graceful shutdown + inline fallback
- [x] CLI: register-intent, verify, run-reconciliation, inspect, discrepancies,
      verify-integrity
- [x] SDK + contracts + testing (fault harness, seeded)
- [x] Example merchant: checkout, orders, Flutterwave redirect, return verify,
      webhook dedupe, exactly-once fulfill, status + reconciliation views
- [x] Tests: 37 passed (unit 17, integration 9, e2e 4, faults 3, provider 4
      incl. 1 live SKIP); load smoke (~5ms/500)
- [x] Docs: architecture, guides, operations, security, testing
- [ ] Real Flutterwave test-mode transaction — BLOCKED (no creds, no Docker);
      code paths verified locally, manual steps documented
- [ ] GitHub publish + release — pending (Phase 10)

## Risks / unknowns (resolved or accepted)

- Dual webhook schemes → support both, record mechanism. Resolved.
- No Docker daemon locally → memory/inline fallback + CI Docker job. Accepted.
- No provider credentials → live E2E blocked, mocked coverage complete. Accepted.
- esbuild drops Nest decorator metadata under vitest → explicit `@Inject()`. Resolved.
