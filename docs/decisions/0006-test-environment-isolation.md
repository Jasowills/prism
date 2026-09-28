# ADR 0006 — Test environment isolation

Status: accepted (2026-09-28)

## Context

CI and local machines may lack Docker, Postgres, Redis, or provider credentials.
Tests must still run deterministically without false passes.

## Decision

- `MemoryStore` implements the full `EvidenceStore` interface with identical
  append-only/hash-chain semantics for unit, API E2E, and fault-injection tests.
- `PostgresStore` is selected automatically when `DATABASE_URL` connects;
  `PRISM_FORCE_MEMORY=1` pins memory mode.
- Queue falls back from BullMQ/Redis to inline async processing with the same
  handler functions.
- Provider live tests run only when `FLW_SECRET_KEY` is present (mocked adapter
  tests always run); otherwise they log SKIP, never pass silently.

## Alternatives

- Docker-mandatory tests: rejected — blocks contributors without Docker (this
  environment has no Docker daemon).
- Skipping integration tests entirely without infra: rejected — hides regressions.

## Consequences

- Docker Compose remains the production/dev path; memory mode is explicitly a
  development/test fallback, documented as such.
- Test reports must distinguish infra-backed vs memory-backed execution.

## Risks / revisit

- Memory/Postgres semantic drift: mitigated by the shared interface plus a
  Postgres-backed CI job (`integration` workflow) that runs when Docker exists.
