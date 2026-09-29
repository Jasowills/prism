#!/usr/bin/env bash
# PRISM encrypted backup: pg_dump -> openssl AES-256 -> retention pruning.
# Required env: DATABASE_URL, PRISM_BACKUP_PASSPHRASE
# Optional: BACKUP_DIR (default ./backups), RETENTION_DAYS (default 30),
#           PGBIN (dir containing pg_dump when not on PATH).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${PRISM_BACKUP_PASSPHRASE:?set PRISM_BACKUP_PASSPHRASE (never commit it)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PG_DUMP="${PGBIN:+$PGBIN/}pg_dump"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/prism-$STAMP.dump.enc"

"$PG_DUMP" --format=custom --compress=9 --no-owner "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -pass "env:PRISM_BACKUP_PASSPHRASE" -out "$OUT"

# Prune files older than retention.
find "$BACKUP_DIR" -name 'prism-*.dump.enc' -mtime "+$RETENTION_DAYS" -delete

echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"
echo "verify with: ./infra/scripts/restore.sh $OUT <target-database-url>"
