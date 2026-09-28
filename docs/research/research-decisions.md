# Research decisions

Date: 2026-09-28. All URLs retrieved 2026-09-28.

## D1 — Webhook verification must support both documented schemes

Context: v3.0 docs describe static `verif-hash`; current docs describe
HMAC `flutterwave-signature`. The account under test is unknown until the
operator provides credentials.
Decision: implement both, record the mechanism per delivery, never accept
unsigned payloads. Test: `test/integration/webhook-security.test.ts`.

## D2 — Reference (tx_ref) is the merchant key, provider ID is the provider key

Both are preserved on every observation. Verification prefers
`verify_by_reference`; ID-based verify is used when webhook evidence supplies it.

## D3 — Discovery windows use calendar dates; runs are fixed at creation

`from`/`to` are required YYYY-MM-DD by the provider. PRISM slices ISO windows
to dates for listing but keeps the exact ISO window for intent scoping.

## D4 — Settlement reconciliation is out of scope for v0.1.0

The settlements endpoint is documented and wrapped (`listSettlements`), but no
settlement-matching rules ship in v0.1.0. Revisit when payout-join keys are
confirmed against live data.

## D5 — No numeric rate limit assumed

Backoff + jitter + bounded attempts everywhere; 429 recorded as evidence.
