# Incident response

1. **Suspected forged webhooks**: rotate `FLW_WEBHOOK_SECRET` in the dashboard
   + `.env`, inspect `provider_webhook_events` for `_mechanism` anomalies and
   401 spikes, verify affected refs with `?live=true`.
2. **Database outage**: API returns non-2xx on webhooks (provider retries);
   readiness fails; no false acks. Restore per `backups.md`, re-run discovery
   windows, confirm `verify-integrity` passes.
3. **Provider outage**: liveness stays green; verifications return
   `INSUFFICIENT_EVIDENCE` with recorded `timeout` observations. Do not fulfill
   on uncertain state.
4. **Duplicate fulfillment alert**: freeze fulfillment, inspect
   `duplicate_fulfillment_risk` evidence refs, reconcile ledger vs provider,
   resolve with reason (append-only; history preserved).
5. **Secret leak**: rotate keys immediately, audit Git history (`git log -S`),
   purge logs, file a postmortem.

Do not delete evidence during an incident — resolve discrepancies with reasons.
