# Provider test results

## Live test-mode run — 2026-09-29 (PASSED)

Environment: macOS, Node 24, local Postgres 16 + Redis (no Docker daemon),
real `FLW_SECRET_KEY`/`FLW_PUBLIC_KEY`/`FLW_WEBHOOK_SECRET` from operator `.env`
(git-ignored, values never recorded). Cloudflare tunnel exposed local API.

- **Intent**: `demo-mumlrc59-8624`, 100.00 NGN, id `a442abf6-…` (merchant app).
- **Payment**: Flutterwave hosted checkout, test card → redirect
  `?transaction_id=10520620`, merchant status `returned(tx=10520620)`.
- **Webhook**: delivered through tunnel, signature verified (`verif-hash`
  mechanism), persisted before ack (`accepted:true duplicate:false`), worker
  consumed BullMQ job.
- **Live verification** (`?live=true`, `verify_by_reference`): provider
  `status=successful`, amount/currency match →
  `payment=SUCCESSFUL delivery=DELIVERED`; only finding
  `orphaned_local_transaction` (merchant had not fulfilled yet — correct).
- **Fulfillment**: merchant fulfill → exactly once; re-verify →
  `SUCCESSFUL / VERIFIED / DELIVERED / MATCHING`, zero findings.
- **Resolution**: orphan finding resolved with reason; history preserved.
- **Resend**: `POST /v3/transactions/resend-hook {"txref"}` → provider
  `"hook sent successfully"`, but no redelivery observed within ~5 min
  (test-mode best-effort). Duplicate handling remains covered by local
  E2E + fault harness (proven, not re-proven live).
- **Discovery**: first window run (right after payment) saw 0 records while
  verify-by-reference already succeeded — provider listing is eventually
  consistent; re-run minutes later → `complete, pages=1, records=1` with a
  stored `discovery` observation. Runs report exactly what they observed.

## Earlier runs (2026-09-28, no credentials)

- Mocked adapter tests: verify-by-ID, pagination stop, normalization — passed.
- Dual-mechanism webhook tests — passed.
- Live discovery test SKIPPED by design (no key). Now superseded by the live
  run above.
