# ADR 0004 — Webhook acknowledgement only after durable persistence

Status: accepted (2026-09-28)

## Context

Providers retry webhooks until 200. Acknowledging before persistence loses
evidence on crash; acknowledging failures causes retry storms.

## Decision

Pipeline: raw-body capture → signature verification → payload validation →
durable insert → enqueue background job → HTTP 200. Any failure before the
insert returns non-2xx (401 invalid signature, 400 malformed, 503 secret
unconfigured). Duplicates are durably recorded with `duplicate_of` and acked
200 so retries terminate.

## Alternatives

- Ack-first then persist: rejected — violates guarantee 1.
- Reject duplicates with 409: rejected — provider would keep retrying.

## Consequences

- Webhook handler needs DB on the request path; readiness reflects DB health.
- `database unavailable → no false durable-acceptance ack` is a tested scenario.

## Risks / revisit

- Under extreme webhook load, consider a write-ahead outbox + 200 with
  synchronous fsync; current design is sufficient for v0.1.0 volumes.
