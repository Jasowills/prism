# Competitor / adjacent-tooling analysis (researched 2026-09-28)

All statements below are functional descriptions from public documentation; no
feature-absence claims are made.

## Delivery infrastructure

- **Svix** (svix.com/docs): hosted webhook delivery with per-endpoint retries,
  HMAC signing (`svix-signature`), replay, and consumer portals. Solves
  *delivery*; does not verify provider-side transaction truth.
- **Hookdeck** (hookdeck.com/docs): webhook ingestion, fan-out, retry, and
  inspection. Solves *routing/observability*; not financial reconciliation.
- **Stripe webhook tooling** (docs.stripe.com/webhooks): timestamped HMAC
  signatures (`Stripe-Signature`), idempotency keys, event replay. Reference
  design for signature hygiene; Stripe is not a Flutterwave adapter.

## Inspection / debugging

- Open-source webhook inspectors (e.g. Hookdeck open-source CLI, RequestBin
  clones, `stripe listen --forward-to`): capture and forward events for local
  development. No persistence guarantees, no reconciliation semantics.

## Reconciliation products

- Finance reconciliation platforms (e.g. Modern Treasury, Aurum, bank
  reconciliation modules): match ledger entries against bank/processor reports.
  Typically batch-oriented (CSV/API imports) rather than webhook+API+ledger
  triple-evidence with per-reference explainability.

## PRISM's distinct scope

PRISM combines, per payment reference: (1) durable webhook evidence with
duplicate preservation, (2) independent provider API observations including
failures, (3) merchant ledger observations, (4) expected intent — reconciled by
versioned deterministic rules into typed, explainable discrepancies. Delivery
tools (Svix/Hookdeck) complement PRISM; they do not replace verification.
