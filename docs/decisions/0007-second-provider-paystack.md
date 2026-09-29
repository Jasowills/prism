# ADR 0007 — Second provider (Paystack) without core changes

Status: accepted (2026-09-29)

## Context

The adapter contract (ADR 0003) claimed provider-neutrality with only
Flutterwave implemented. A second provider tests that claim.

## Decision

Add `packages/provider-paystack` (verify-by-reference, offset-paginated list,
HMAC-SHA512 webhook verification, kobo→decimal normalization, initialize
helper) and wire it through explicit per-provider routes and a provider-aware
service layer. `@prism/core` is untouched except additive status mappings
(`ongoing`/`queued` → PENDING; `abandoned` was already CANCELLED).

## Alternatives

- Generic `/webhooks/:provider` route: rejected — explicit routes are clearer
  in audit logs and OpenAPI.
- Sharing one webhook secret across providers: rejected — per-provider
  `*_WEBHOOK_SECRET` config; missing secret refuses with 503 as before.

## Consequences

- Intent lookup tries providers in order (flutterwave, paystack); references
  must still be unique per (tenant, provider).
- No live Paystack test yet (no keys) — mocked coverage only, documented.
- Kobo conversion is a new bug class; guarded by unit tests and by comparing
  only normalized decimals in core.

## Risks / revisit

- Paystack cursor pagination for very large windows; revisit if offset proves
  lossy under concurrent writes.
