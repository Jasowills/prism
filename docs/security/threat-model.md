# Threat model

## Assets

Payment evidence, provider credentials, webhook secret, API keys, PII in payloads.

## Actors

External attackers (forged webhooks, replay), malicious/compromised merchants
(tenant escape), insider DB admin, leaked-log readers.

## Controls

- Webhook signatures (dual mechanism, constant-time) + per-IP rate limiting;
  unsigned payloads always rejected.
- Tenant scoping on every query; API-key guard on admin endpoints; tests assert
  cross-tenant reads return nothing.
- Secrets only via environment; `.env` git-ignored; CI live-tests need manual
  workflow + environment secrets; `gh` secret scanning recommended.
- Payload redaction (PAN/CVV/keys) at ingestion; pino log redaction.
- Append-only evidence (triggers) + hash chains: tamper-*evident*. A DB
  superuser controlling data + hashes could rewrite history — accepted residual
  risk, mitigated by backups + off-site log shipping (roadmap: detached
  transparency log).
- No auto-refund/fulfillment: PRISM never moves money.

## Out of scope

Provider-side record correctness, TLS termination security, host hardening.
