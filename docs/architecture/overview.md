# Architecture overview

PRISM is a modular monolith: NestJS API + BullMQ worker sharing domain packages.

```
               ┌──────────────┐      webhooks       ┌────────────┐
               │ Flutterwave  ├────────────────────►│  apps/api  │
               │  (provider)  │◄─── verify/list ────┤  (NestJS)  │
               └──────────────┘                     └─────┬──────┘
                                                        │ persist-first, enqueue
                        ┌────────────┐            ┌──────▼──────┐
                        │ PostgreSQL │◄───────────┤ Redis/BullMQ│
                        │  evidence  │  reads     │   queue     │
                        └────────────┘            └──────┬──────┘
                                                        │ jobs
                                                  ┌─────▼───────┐
                                                  │ apps/worker │
                                                  └─────────────┘

  examples/merchant-checkout ──registers intents, records ledger, fulfills once──► API
  apps/cli ──operator commands──► API
```

## Packages

- `@prism/core` — pure reconciliation rules, money math, state machine. No I/O.
- `@prism/database` — Drizzle schema, SQL migrations, `MemoryStore`/`PostgresStore`,
  redaction + hashing utilities.
- `@prism/provider-flutterwave` — verify/list/webhook/normalize + retry/backoff.
- `@prism/contracts` — Zod schemas at API boundaries.
- `@prism/config` — validated environment configuration.
- `@prism/sdk` — merchant-facing HTTP client.
- `@prism/testing` — fault scenarios + deterministic helpers.

## Guarantees (spec §1)

Enforced by persist-first webhooks, fingerprint dedupe, append-only tables with
triggers + hash chains, intent/observation separation, versioned rules,
incomplete-run marking, resolution-as-event, and no auto-refund/fulfillment.
