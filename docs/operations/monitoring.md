# Monitoring

- `GET /metrics` exposes Prometheus counters: webhooks received/rejected/
  duplicates, verifications, reconciliation runs.
- Alert on: `ready=false`, rising `webhookRejected`, `reconciliation_incomplete`
  runs, worker failed-job growth, Postgres/Redis unreachability.
- Structured JSON logs (pino) with correlation via webhook/delivery IDs;
  secrets and PANs redacted at the logger and storage layers.
- Trace a payment: intent → webhook rows (`delivery_fingerprint`,
  `duplicate_of`) → API observations → ledger rows → discrepancies
  (`rule_version`, `evidence_refs`) → resolution events.
