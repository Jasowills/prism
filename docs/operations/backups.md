# Backups

- Nightly `pg_dump` of the `prism` database; retain 30 days, encrypt at rest,
  test restores monthly on an isolated host.
- Redis holds transient jobs only — no backup needed; unprocessed jobs on total
  loss are recreated by re-running discovery windows (idempotent).
- Retain `provider_webhook_events.payload_redacted` per `docs/security/data-retention.md`.
- Document restore procedure: create empty DB, apply `migrations/*.sql` in order,
  load latest dump, run `verify-integrity`, then start API + worker.
