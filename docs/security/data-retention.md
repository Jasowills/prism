# Data retention

- Redacted payloads only: full card numbers, CVV, PINs, and secrets are replaced
  before storage (`[REDACTED]` / `[REDACTED_PAN]`). Raw bodies are never stored —
  only `payload_hash` + redacted JSON.
- Configurable retention (operator policy): default keeps webhook/API evidence
  13 months for audit; implement via scheduled `DELETE` exemption windows…
  NOTE: evidence tables are append-only by trigger; retention purges require a
  privileged role + recorded operator decision, never silent expiry.
- Test-mode PII: minimized in fixtures; never commit card data, emails of real
  users, or secrets. `git diff --check` + secret scan before every commit.
- Right-to-erasure requests: export-then-purge via privileged procedure with
  dual approval; discrepancy resolutions referencing purged rows keep their
  metadata (type/severity/rule version) for audit continuity.
