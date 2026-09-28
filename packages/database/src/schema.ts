import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull().default('flutterwave'),
    merchantReference: text('merchant_reference').notNull(),
    expectedAmount: numeric('expected_amount', { precision: 20, scale: 6 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    expectedCustomer: jsonb('expected_customer'),
    expectedMetadata: jsonb('expected_metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_intent_tenant_provider_ref').on(t.tenantId, t.provider, t.merchantReference),
    index('ix_intent_tenant').on(t.tenantId),
  ],
);

export const intentAmendments = pgTable('intent_amendments', {
  id: uuid('id').primaryKey().defaultRandom(),
  intentId: uuid('payment_intent_id').notNull(),
  actor: text('actor').notNull(),
  reason: text('reason').notNull(),
  previousValues: jsonb('previous_values').notNull(),
  newValues: jsonb('new_values').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const providerWebhookEvents = pgTable(
  'provider_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull().default('flutterwave'),
    providerEventId: text('provider_event_id'),
    eventType: text('event_type').notNull(),
    providerReference: text('provider_reference'),
    providerTxId: text('provider_tx_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    providerEventAt: timestamp('provider_event_at', { withTimezone: true }),
    signatureValid: boolean('signature_valid').notNull(),
    payloadHash: text('payload_hash').notNull(),
    payloadRedacted: jsonb('payload_redacted').notNull(),
    deliveryFingerprint: text('delivery_fingerprint').notNull(),
    duplicateOf: uuid('duplicate_of'),
    prevHash: text('prev_hash'),
    entryHash: text('entry_hash'),
  },
  (t) => [
    index('ix_webhook_tenant_ref').on(t.tenantId, t.providerReference),
    index('ix_webhook_fingerprint').on(t.deliveryFingerprint),
  ],
);

export const providerApiObservations = pgTable(
  'provider_api_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull().default('flutterwave'),
    queryType: text('query_type').notNull(),
    queryReference: text('query_reference'),
    providerTxId: text('provider_tx_id'),
    requestStartedAt: timestamp('request_started_at', { withTimezone: true }).notNull().defaultNow(),
    responseReceivedAt: timestamp('response_received_at', { withTimezone: true }),
    httpStatus: integer('http_status'),
    providerStatus: text('provider_status'),
    amount: numeric('amount', { precision: 20, scale: 6 }),
    currency: char('currency', { length: 3 }),
    responseHash: text('response_hash'),
    responseRedacted: jsonb('response_redacted'),
    outcome: text('outcome').notNull(),
    errorCode: text('error_code'),
    prevHash: text('prev_hash'),
    entryHash: text('entry_hash'),
  },
  (t) => [index('ix_apiobs_tenant_ref').on(t.tenantId, t.queryReference)],
);

export const merchantLedgerObservations = pgTable(
  'merchant_ledger_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    paymentIntentId: uuid('payment_intent_id'),
    merchantReference: text('merchant_reference').notNull(),
    recordedStatus: text('recorded_status').notNull(),
    recordedAmount: numeric('recorded_amount', { precision: 20, scale: 6 }),
    currency: char('currency', { length: 3 }),
    fulfillmentStatus: text('fulfillment_status'),
    source: text('source').notNull().default('merchant-api'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ix_ledger_tenant_ref').on(t.tenantId, t.merchantReference)],
);

export const reconciliationRuns = pgTable('reconciliation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  provider: text('provider').notNull().default('flutterwave'),
  runType: text('run_type').notNull().default('window'),
  windowFrom: timestamp('window_from', { withTimezone: true }).notNull(),
  windowTo: timestamp('window_to', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  pagesScanned: integer('pages_scanned').notNull().default(0),
  recordsScanned: integer('records_scanned').notNull().default(0),
  cursor: text('cursor'),
  errorSummary: jsonb('error_summary'),
});

export const discrepancies = pgTable(
  'discrepancies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    paymentIntentId: uuid('payment_intent_id'),
    merchantReference: text('merchant_reference').notNull(),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull().default('open'),
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }).notNull().defaultNow(),
    lastDetectedAt: timestamp('last_detected_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionReason: text('resolution_reason'),
    evidenceRefs: jsonb('evidence_refs').notNull().default([]),
    ruleVersion: text('rule_version').notNull(),
  },
  (t) => [index('ix_disc_tenant_status').on(t.tenantId, t.status)],
);

export const discrepancyEvents = pgTable('discrepancy_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  discrepancyId: uuid('discrepancy_id').notNull(),
  eventType: text('event_type').notNull(),
  actor: text('actor').notNull().default('system'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
