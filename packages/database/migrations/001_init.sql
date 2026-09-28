-- PRISM initial schema (mirrors packages/database/src/schema.ts)
-- All evidence tables are append-only by convention; triggers block UPDATE/DELETE.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  merchant_reference TEXT NOT NULL,
  expected_amount NUMERIC(20,6) NOT NULL CHECK (expected_amount > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  expected_customer JSONB,
  expected_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (tenant_id, provider, merchant_reference)
);
CREATE INDEX IF NOT EXISTS ix_intent_tenant ON payment_intents (tenant_id);

CREATE TABLE IF NOT EXISTS intent_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  provider_reference TEXT,
  provider_tx_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_event_at TIMESTAMPTZ,
  signature_valid BOOLEAN NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_redacted JSONB NOT NULL,
  delivery_fingerprint TEXT NOT NULL,
  duplicate_of UUID REFERENCES provider_webhook_events(id),
  prev_hash TEXT,
  entry_hash TEXT
);
CREATE INDEX IF NOT EXISTS ix_webhook_tenant_ref ON provider_webhook_events (tenant_id, provider_reference);
CREATE INDEX IF NOT EXISTS ix_webhook_fingerprint ON provider_webhook_events (delivery_fingerprint);

CREATE TABLE IF NOT EXISTS provider_api_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  query_type TEXT NOT NULL,
  query_reference TEXT,
  provider_tx_id TEXT,
  request_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_received_at TIMESTAMPTZ,
  http_status INTEGER,
  provider_status TEXT,
  amount NUMERIC(20,6),
  currency CHAR(3),
  response_hash TEXT,
  response_redacted JSONB,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','not_found','timeout','rate_limited','auth_error','malformed')),
  error_code TEXT,
  prev_hash TEXT,
  entry_hash TEXT
);
CREATE INDEX IF NOT EXISTS ix_apiobs_tenant_ref ON provider_api_observations (tenant_id, query_reference);

CREATE TABLE IF NOT EXISTS merchant_ledger_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  payment_intent_id UUID REFERENCES payment_intents(id),
  merchant_reference TEXT NOT NULL,
  recorded_status TEXT NOT NULL,
  recorded_amount NUMERIC(20,6),
  currency CHAR(3),
  fulfillment_status TEXT,
  source TEXT NOT NULL DEFAULT 'merchant-api',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ledger_tenant_ref ON merchant_ledger_observations (tenant_id, merchant_reference);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  run_type TEXT NOT NULL DEFAULT 'window',
  window_from TIMESTAMPTZ NOT NULL,
  window_to TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  records_scanned INTEGER NOT NULL DEFAULT 0,
  cursor TEXT,
  error_summary JSONB
);

CREATE TABLE IF NOT EXISTS discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  payment_intent_id UUID REFERENCES payment_intents(id),
  merchant_reference TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_reason TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  rule_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_disc_tenant_status ON discrepancies (tenant_id, status);

CREATE TABLE IF NOT EXISTS discrepancy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discrepancy_id UUID NOT NULL REFERENCES discrepancies(id),
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only enforcement: evidence tables reject UPDATE/DELETE.
CREATE OR REPLACE FUNCTION prism_reject_evidence_write() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PRISM evidence table % is append-only; % not allowed', TG_TABLE_NAME, TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_update_webhook ON provider_webhook_events;
CREATE TRIGGER trg_no_update_webhook BEFORE UPDATE OR DELETE ON provider_webhook_events
  FOR EACH ROW EXECUTE FUNCTION prism_reject_evidence_write();

DROP TRIGGER IF EXISTS trg_no_update_apiobs ON provider_api_observations;
CREATE TRIGGER trg_no_update_apiobs BEFORE UPDATE OR DELETE ON provider_api_observations
  FOR EACH ROW EXECUTE FUNCTION prism_reject_evidence_write();

DROP TRIGGER IF EXISTS trg_no_update_ledger ON merchant_ledger_observations;
CREATE TRIGGER trg_no_update_ledger BEFORE UPDATE OR DELETE ON merchant_ledger_observations
  FOR EACH ROW EXECUTE FUNCTION prism_reject_evidence_write();
