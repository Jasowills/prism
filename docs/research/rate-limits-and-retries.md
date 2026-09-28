# Rate limits and retries (researched 2026-09-28)

Source: https://developer.flutterwave.com/v3.0.0/docs/rate-limit

## Official guidance

- Over-limit responses use HTTP 429 (per merchant account).
- Prefer webhooks over perpetual polling; poll in a structured, sparse manner or
  in response to events.
- On 429, retry gracefully with backoff. Intentional bypass strategies face
  stiffer restrictions.
- No numeric quota is published.

## PRISM policy

- Verification and discovery use bounded retries (max 3, exponential backoff
  with jitter, 500ms base, 8s cap).
- 429s are recorded as `rate_limited` observations and surfaced as
  `reconciliation_incomplete` when they prevent a complete result — never as
  success.
- Webhook ingestion is rate-limited per IP (120 req/min) with 429 responses.
- BullMQ jobs use 5 attempts with exponential backoff; exhausted jobs land in
  the failed set for operator inspection (dead-letter semantics).
