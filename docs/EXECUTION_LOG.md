# Execution log

## 2026-09-28 — Phase 0: inspection + research

- Located `PRISM_Full_Project_Execution_Specification.md` (only file in dir).
- Env: git 2.50.1, gh 2.97.0 (authed Jasowills), node v24.16.0, pnpm 11.12.0,
  **no Docker**, repo `Jasowills/prism` not existing, no FLW/PRISM secrets.
- Researched official Flutterwave docs (auth, verify, verify-by-ref, listing,
  payments, refunds, settlements, rate limits, both webhook schemes); recorded
  URLs + date in `docs/research/`.

## 2026-09-28 — Phase 1: scaffold

- `git init`, `main` branch; pnpm workspace (apps/api, apps/worker, apps/cli,
  packages/*, examples/merchant-checkout); `.env.example`, `.gitignore`, MIT
  license; `docker-compose.yml` + `.test.yml`; Dockerfiles; CI workflows
  (ci, provider-live, release).
- `pnpm install` ok (324 packages).

## 2026-09-28 — Phases 2–7: implementation

- Built config/contracts/core/database/provider/sdk/testing/api/worker/cli/merchant.
- Fixes: zod dep for config; core tsconfig rootDir; worker pg dep + ioredis
  named import; api pg dep; explicit `@Inject()` for vitest/esbuild DI limit.
- `pnpm -r build` clean; `pnpm typecheck` clean; `pnpm lint` clean (flat config).

## 2026-09-28 — Phase 8: tests

- unit 17 pass; integration 9 pass; e2e 4 pass (incl. full intent→webhook→
  duplicate→ledger→verify flow + 500-rec load smoke); faults 3 pass;
  provider 4 pass (live SKIP, no creds). Total 37 pass, 0 fail.
- DI failure diagnosed via ExceptionsHandler log (`storeKind` of undefined);
  fixed with explicit `@Inject(PrismService)`.

## Next

- Phase 9 docs (in progress) → Phase 10: live local demo, secret scan, publish.

## 2026-09-28 — Phase 10: live local demo (memory store, signed test deliveries)

API on :4100 (`PRISM_FORCE_MEMORY=1 FLW_WEBHOOK_SECRET=test-secret`), merchant on
:4200. All outputs sanitized (no secrets).

1. Intent registered: `demo-1790622696`, 250.00 NGN → id `184cb19a…`.
2. Webhook with wrong secret → 401 (no state change). Valid `verif-hash`
   delivery → `accepted:true duplicate:false`; repost → `duplicate:true` with
   `duplicate_of` link preserved.
3. Ledger observation recorded; verification returned
   `payment=UNKNOWN verification=DISCREPANCY delivery=DUPLICATE` with a single
   `duplicate_webhook` finding (no provider API observation without creds —
   correctly reported as uncertainty, not success).
4. Discovery run over September window → `complete`, pages=1, records=1.
5. Merchant order `demo-mulmj6ly-2553` created (intent `079034a5…`, simulated
   checkout link since no `FLW_SECRET_KEY`); simulated webhook forwarded;
   fulfill → `fulfilled:true`; retry → `already-fulfilled (idempotent), count=1`.
   Follow-up verification raised `duplicate_fulfillment_risk` (two `fulfilled`
   markers); resolved with reason → `status:resolved`, history preserved.
   Merchant retry semantics then fixed to record `duplicate-suppressed`.
6. Metrics observed: received=2, rejected=1, duplicates=1, verifications=2, runs=1.
7. Real Flutterwave test-mode payment NOT executed (no `FLW_SECRET_KEY`, no
   Docker). Manual steps in `docs/guides/flutterwave-setup.md`; results to be
   appended to `docs/testing/provider-test-results.md` when credentials exist.
