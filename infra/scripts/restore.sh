#!/usr/bin/env bash
# PRISM restore drill: decrypt a backup and pg_restore into a TARGET database.
# Usage: ./infra/scripts/restore.sh <backup-file> <target-database-url>
# The target should be an EMPTY database (created upfront) — never production
# unless during a declared incident with dual approval (see incident-response.md).
set -euo pipefail

BACKUP="${1:?usage: restore.sh <backup-file> <target-database-url>}"
TARGET="${2:?usage: restore.sh <backup-file> <target-database-url>}"
: "${PRISM_BACKUP_PASSPHRASE:?set PRISM_BACKUP_PASSPHRASE}"
PG_RESTORE="${PGBIN:+$PGBIN/}pg_restore"

TMP="$(mktemp -t prism-restore-XXXXXX.dump)"
trap 'rm -f "$TMP"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:PRISM_BACKUP_PASSPHRASE" -in "$BACKUP" -out "$TMP"
"$PG_RESTORE" --clean --if-exists --no-owner -d "$TARGET" "$TMP"
echo "restore complete into $TARGET"
echo "next: run migrations (pnpm db:migrate) if schema is older, then verify-integrity"
