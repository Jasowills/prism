# Backups

Automated in `infra/scripts/backup.sh` (encrypted) + `restore.sh`:

```bash
export DATABASE_URL=... PRISM_BACKUP_PASSPHRASE=...  # never commit either
./infra/scripts/backup.sh                                   # -> backups/prism-<ts>.dump.enc
./infra/scripts/restore.sh backups/prism-<ts>.dump.enc <empty-target-db-url>
```

- `pg_dump` custom format piped through `openssl aes-256-cbc -pbkdf2`.
- Retention pruning (`RETENTION_DAYS`, default 30). Nightly via cron/systemd;
  retain 30 days, encrypt at rest, test restores monthly on an isolated host.
- Drill 2026-09-29 (PG16 local): backup 24K, restore into empty
  `prism_restore`, recovered 3 intents + 4 webhook rows byte-identical.
- Redis holds transient jobs only — no backup needed; unprocessed jobs on total
  loss are recreated by re-running discovery windows (idempotent).
- Retain `provider_webhook_events.payload_redacted` per `docs/security/data-retention.md`.
- Restore procedure: create empty DB, restore, apply `migrations/*.sql` if the
  schema is older, run `verify-integrity`, then start API + worker.
