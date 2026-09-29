-- Merchant example-app table (NOT PRISM evidence: mutable order state).
CREATE TABLE IF NOT EXISTS merchant_orders (
  reference TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
