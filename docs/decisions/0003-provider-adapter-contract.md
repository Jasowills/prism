# ADR 0003 — Provider adapter contract

Status: accepted (2026-09-28)

## Context

PRISM must support Flutterwave first without letting provider types leak into
the reconciliation domain.

## Decision

`PaymentProviderAdapter` surface (`verifyTransaction`, `listTransactions`,
`verifyWebhook`, `normalizeTransaction`) with provider-neutral
`NormalizedProviderTransaction` outputs. `@prism/core` never imports
`@prism/provider-flutterwave`. Failed API attempts are first-class observations.

## Alternatives

- Direct SDK calls in controllers: rejected — untestable, leaks provider shape.
- One generic HTTP client for all providers: rejected — signature schemes and
  pagination differ too much.

## Consequences

- Adding a provider means a new package implementing the interface + mappings.
- Core rules stay stable across providers; only mappings change.

## Risks / revisit

- If a provider lacks reference-based verification, the contract's query-type
  taxonomy must extend.
