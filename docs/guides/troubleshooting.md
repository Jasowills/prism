# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 invalid webhook signature` | Wrong `FLW_WEBHOOK_SECRET` or body parsed before verify | Check dashboard secret; keep raw-body middleware first |
| `503 webhook secret not configured` | `FLW_WEBHOOK_SECRET` empty | Set it; test deliveries need `x-prism-test: true` only in dev |
| `409 DUPLICATE_INTENT` | Same tenant/provider/reference reused | Use unique `tx_ref` per order |
| `ready: false` | Postgres unreachable | Check `DATABASE_URL`, `docker compose ps`; memory fallback logs a warning |
| Queue stuck | Redis down | `/health/dependencies`; worker falls back to inline (dev) |
| `INSUFFICIENT_EVIDENCE` | Only failed API observations | Inspect `errorCode` (timeout/429/auth); retry or check keys |
| `RECONCILIATION_INCOMPLETE` | Page failure during discovery | Re-run window; inspect run `errorSummary` |
| Vitest DI `undefined` | esbuild drops decorator metadata | Controllers use explicit `@Inject()` — keep that pattern |
| `docker: command not found` | No Docker daemon here | Use memory/inline mode; run Compose where Docker exists |
