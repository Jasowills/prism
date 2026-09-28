# ADR 0001 — Modular monolith with separate API and worker processes

Status: accepted (2026-09-28)

## Context

PRISM needs HTTP ingestion, background verification, and scheduled discovery,
with PostgreSQL durability and Redis queuing. Team size is one; operational
simplicity matters.

## Decision

Ship a modular monolith: `apps/api` (NestJS HTTP) + `apps/worker` (BullMQ
consumer) sharing `packages/*` domain libraries, deployed via Docker Compose.
No Kafka, Kubernetes, or service mesh in v1.

## Alternatives

- Microservices per bounded context: rejected — deployment/observability cost
  without a scaling need.
- Single process with in-memory queue: rejected — webhook acknowledgement must
  survive worker restarts; Redis durability is required in production.

## Consequences

- Shared library changes require coordinated builds (pnpm workspaces mitigate).
- API can run with an inline queue fallback when Redis is absent (development
  only); production Compose always wires Redis.

## Risks / revisit

- If sustained throughput exceeds single-worker capacity, add worker replicas
  (BullMQ supports concurrency) before considering service splits.
