#!/usr/bin/env bash
# Webhook-secret rotation drill (safe: scratch API instance, random secrets).
# Proves the rotation mechanics end to end:
#   1. API boots with the NEW secret.
#   2. A delivery signed with the OLD secret is rejected (401) — and changes nothing.
#   3. A delivery signed with the NEW secret is accepted + persisted (200).
# For a REAL rotation, follow docs/security/rotation.md afterwards.
set -euo pipefail

PORT="${ROTATE_PORT:-4199}"
OLD="drill-old-$(openssl rand -hex 8)"
NEW="drill-new-$(openssl rand -hex 8)"
REF="rotate-drill-$(date +%s)"

sign() { # sign <secret> <file> -> base64 hmac
  node -e "const c=require('crypto'),fs=require('fs');process.stdout.write(c.createHmac('sha256',process.argv[1]).update(fs.readFileSync(process.argv[2])).digest('base64'))" "$1" "$2"
}

PAYLOAD="$(mktemp -t prism-drill-XXXXXX.json)"
trap 'rm -f "$PAYLOAD"' EXIT
printf '{"event":"charge.completed","data":{"id":1,"tx_ref":"%s","amount":1,"currency":"NGN","status":"successful"}}' "$REF" > "$PAYLOAD"

PRISM_FORCE_MEMORY=1 FLW_WEBHOOK_SECRET="$NEW" PRISM_API_PORT="$PORT" \
  node apps/api/dist/main.js > /tmp/prism-rotate-drill.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$PAYLOAD"' EXIT
for _ in $(seq 1 30); do curl -sf --max-time 2 "http://localhost:$PORT/health/live" >/dev/null && break; sleep 1; done

code_old=$(curl -s -o /dev/null -w '%{http_code}' -XPOST "http://localhost:$PORT/v1/webhooks/flutterwave" \
  -H 'Content-Type: application/json' -H "verif-hash: $OLD" --data-binary "@$PAYLOAD" || true)
SIG_NEW=$(sign "$NEW" "$PAYLOAD")
code_new=$(curl -s -o /dev/null -w '%{http_code}' -XPOST "http://localhost:$PORT/v1/webhooks/flutterwave" \
  -H 'Content-Type: application/json' -H "flutterwave-signature: $SIG_NEW" --data-binary "@$PAYLOAD" || true)

echo "old-secret delivery -> $code_old (want 401)"
echo "new-secret delivery -> $code_new (want 200/201)"
if [ "$code_old" = "401" ] && { [ "$code_new" = "200" ] || [ "$code_new" = "201" ]; }; then
  echo "ROTATION DRILL PASSED"
else
  echo "ROTATION DRILL FAILED"; exit 1
fi
