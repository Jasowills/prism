# ADR 0002 — PostgreSQL evidence store with append-only enforcement

Status: accepted (2026-09-28)

## Context

Reconciliation must be reproducible from stored evidence. Mutable status columns
destroy auditability.

## Decision

PostgreSQL with five evidence tables (`payment_intents`, `provider_webhook_events`,
`provider_api_observations`, `merchant_ledger_observations`, `reconciliation_runs`,
`discrepancies` + event tables). Drizzle ORM for schema definition; **explicit
SQL** for immutable evidence writes. Database triggers reject UPDATE/DELETE on
evidence tables. Each webhook/API row carries a per-table hash chain
(`prev_hash`/`entry_hash`) for tamper-evidence.

## Alternatives

- Event store (EventStoreDB): rejected — operational unfamiliarity, weaker
  ad-hoc query story for operators.
- Single `transactions.status` column: rejected — collapses evidence streams.

## Consequences

- Migrations must be append-only and tested from empty + previous schema.
- Hash chains are tamper-*evident*, not tamper-proof against a DB administrator
  controlling data and hashes (documented in threat model).

## Risks / revisit

- If hash-chain verification cost grows, move to periodic checkpointing.
