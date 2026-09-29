# PRISM — Payment Reconciliation, Integrity & Settlement Monitor

Independent payment evidence and reconciliation infrastructure. PRISM compares
**provider webhooks**, **provider API observations**, **merchant ledger
observations**, and **expected payment intent** to detect missing notifications,
duplicates, amount/currency mismatches, orphans, reversals, and incomplete runs.

Providers: **Flutterwave** + **Paystack** (test mode; Paystack live-verified paths are mocked-only until keys exist). Stack: TypeScript strict, NestJS,
PostgreSQL (Drizzle + explicit SQL), Redis + BullMQ, Zod, Pino, Commander,
Vitest, Docker Compose, pnpm.

## Why webhooks alone don't establish payment correctness

Webhooks can be lost, delayed, duplicated, or forged — they prove notification,
not truth. PRISM adds independent provider verification (including recorded
failures), preserves merchant intent separately, and reconciles all four streams
with versioned deterministic rules into typed, explainable discrepancies.

## Quickstart (no Docker)

```bash
cp .env.example .env
pnpm install && pnpm build
pnpm test && pnpm test:integration && pnpm test:e2e && pnpm test:faults
PRISM_FORCE_MEMORY=1 FLW_WEBHOOK_SECRET=test-secret pnpm --filter @prism/api dev
# new shell:
pnpm --filter @prism/merchant-checkout dev
```

## Quickstart (Docker)

```bash
docker compose up --build -d
curl localhost:4100/health/ready
```

## Core flows

```bash
# Register intent
curl -XPOST localhost:4100/v1/payment-intents \
  -H 'Content-Type: application/json' \
  -d '{"merchantReference":"order-1","expectedAmount":"100.00","currency":"NGN"}'
# Verify + reconcile
curl 'localhost:4100/v1/transactions/order-1/verification'
# Discovery run
curl -XPOST localhost:4100/v1/reconciliation-runs \
  -H 'Content-Type: application/json' \
  -d '{"windowFrom":"2026-09-01T00:00:00.000Z","windowTo":"2026-09-28T00:00:00.000Z"}'
```

## API reference

Base `/v1`: `POST /payment-intents`, `POST /payment-intents/{id}/ledger-observations`,
`POST /webhooks/flutterwave`, `GET /transactions/{reference}/verification[?live=true]`,
`POST /reconciliation-runs`, `GET /reconciliation-runs/{id}`, `GET /discrepancies`,
`POST /discrepancies/{id}/resolutions`. Ops: `/health/live`, `/health/ready`,
`/health/dependencies`, `/metrics`, `/v1/openapi.json`. CLI: `pnpm cli -- --help`.

## Guarantees and limitations

Guarantees: persist-before-ack, duplicate-safe processing, no silent overwrites,
intent/observation separation, reproducible versioned rules, no false-complete
runs, inspectable resolutions, no auto-refund/fulfillment. Limitations: hashes
are tamper-evident (not proof vs DB admin); settlement matching is roadmap;
real provider E2E needs test credentials (see `docs/guides/flutterwave-setup.md`).

## Docs

`docs/architecture/`, `docs/guides/`, `docs/operations/`, `docs/security/`,
`docs/testing/`, `docs/research/`, `docs/decisions/`. License: MIT.
