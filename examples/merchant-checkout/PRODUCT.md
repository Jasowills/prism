# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo developer running payment-scenario demos of PRISM (the payment
reconciliation system) against Flutterwave test mode: creating orders, paying,
simulating webhooks, fulfilling, and inspecting reconciliation.

## Product Purpose

A working example merchant that exercises the full
intent → checkout → return → webhook → verify → fulfill → reconcile loop
against a live PRISM API, so every reconciliation behavior can be demonstrated
with real test-mode payments. Success = any demo scenario runs end to end and
PRISM state per order is visible without leaving the store.

## Positioning

Unlike a mock checkout demo, every payment here is a real test-mode provider
transaction independently verified by PRISM; the store UI surfaces that
verification state per order instead of hiding it.

## Operating Context

Local development: merchant on :4200, PRISM API on :4100, Cloudflare tunnel
for provider webhooks. Operator runs Express via tsx (dev) or dist (prod);
orders persist in Postgres when reachable, memory otherwise. Test-mode keys
only; buyer email is demo PII.

## Capabilities and Constraints

Confirmed functionality (must preserve): create order (amount/currency/email),
Flutterwave hosted-checkout redirect, return handling with transaction id,
merchant webhook endpoint with delivery dedupe, test webhook simulator,
exactly-once fulfillment, per-order JSON view, per-order reconciliation view
(via PRISM verify). Single-file Express server (`src/server.ts`) + order store
(`src/store.ts`); no frontend build step — server-rendered HTML only.
PRISM verification state must be visible per order (badges/panels, not just a
link). No invented products, prices, testimonials, or brands.

## Brand Commitments

Name "Prism Demo Store". No logo, palette, or typeface commitments. Existing
dark theme is evidence/anti-reference for the redesign, not a constraint.

## Evidence on Hand

Live routes in `src/server.ts`; order lifecycle states
(created/returned/webhook-received/fulfilled); PRISM verify payload
(payment/verification/delivery/ledger/settlement statuses + findings) available
at `/orders/:ref/reconciliation`.

## Product Principles

1. Demo truth over polish: every control must work against the real stack.
2. PRISM state is first-class content, not a debug appendix.
3. One screen per job: create, track, inspect, fulfill without navigation maze.
4. Server-rendered and dependency-free: no build step may gate a demo.

## Accessibility & Inclusion

Reasonable contrast, keyboard-operable controls and forms, semantic table for
orders. No product-specific standard established.
