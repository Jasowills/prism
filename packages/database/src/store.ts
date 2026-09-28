export interface IntentRow {
  id: string;
  tenantId: string;
  provider: string;
  merchantReference: string;
  expectedAmount: string;
  currency: string;
  expectedCustomer?: Record<string, unknown> | null;
  expectedMetadata?: Record<string, unknown> | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface WebhookRow {
  id: string;
  tenantId: string;
  provider: string;
  providerEventId?: string | null;
  eventType: string;
  providerReference?: string | null;
  providerTxId?: string | null;
  receivedAt: string;
  providerEventAt?: string | null;
  signatureValid: boolean;
  payloadHash: string;
  payloadRedacted: Record<string, unknown>;
  deliveryFingerprint: string;
  duplicateOf?: string | null;
  prevHash?: string | null;
  entryHash?: string | null;
}

export interface ApiObsRow {
  id: string;
  tenantId: string;
  provider: string;
  queryType: string;
  queryReference?: string | null;
  providerTxId?: string | null;
  requestStartedAt: string;
  responseReceivedAt?: string | null;
  httpStatus?: number | null;
  providerStatus?: string | null;
  amount?: string | null;
  currency?: string | null;
  responseHash?: string | null;
  responseRedacted?: unknown;
  outcome: string;
  errorCode?: string | null;
  prevHash?: string | null;
  entryHash?: string | null;
}

export interface LedgerRow {
  id: string;
  tenantId: string;
  paymentIntentId?: string | null;
  merchantReference: string;
  recordedStatus: string;
  recordedAmount?: string | null;
  currency?: string | null;
  fulfillmentStatus?: string | null;
  source: string;
  observedAt: string;
}

export interface RunRow {
  id: string;
  tenantId: string;
  provider: string;
  runType: string;
  windowFrom: string;
  windowTo: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  pagesScanned: number;
  recordsScanned: number;
  cursor?: string | null;
  errorSummary?: unknown;
}

export interface DiscrepancyRow {
  id: string;
  tenantId: string;
  paymentIntentId?: string | null;
  merchantReference: string;
  type: string;
  severity: string;
  status: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt?: string | null;
  resolutionReason?: string | null;
  evidenceRefs: string[];
  ruleVersion: string;
}

export interface EvidenceStore {
  createIntent(row: Omit<IntentRow, 'id' | 'createdAt'>): Promise<IntentRow>;
  getIntentById(id: string): Promise<IntentRow | null>;
  getIntentByReference(tenantId: string, provider: string, merchantReference: string): Promise<IntentRow | null>;
  listIntentsInWindow(tenantId: string, fromIso: string, toIso: string): Promise<IntentRow[]>;
  addLedgerObservation(row: Omit<LedgerRow, 'id' | 'observedAt'> & { observedAt?: string }): Promise<LedgerRow>;
  addWebhookEvent(row: Omit<WebhookRow, 'id' | 'receivedAt' | 'prevHash' | 'entryHash'> & { receivedAt?: string }): Promise<WebhookRow>;
  findWebhookByFingerprint(fingerprint: string): Promise<WebhookRow | null>;
  listWebhooksByReference(tenantId: string, reference: string): Promise<WebhookRow[]>;
  addApiObservation(row: Omit<ApiObsRow, 'id' | 'requestStartedAt' | 'prevHash' | 'entryHash'> & { requestStartedAt?: string }): Promise<ApiObsRow>;
  listApiObservationsByReference(tenantId: string, reference: string): Promise<ApiObsRow[]>;
  listLedgerByReference(tenantId: string, reference: string): Promise<LedgerRow[]>;
  createRun(row: Omit<RunRow, 'id' | 'startedAt' | 'pagesScanned' | 'recordsScanned' | 'status'> & { status?: string }): Promise<RunRow>;
  getRun(id: string): Promise<RunRow | null>;
  updateRun(id: string, patch: Partial<RunRow>): Promise<RunRow>;
  upsertDiscrepancy(row: Omit<DiscrepancyRow, 'id' | 'firstDetectedAt' | 'lastDetectedAt' | 'status'> & { status?: string }): Promise<DiscrepancyRow>;
  listDiscrepancies(tenantId: string, status?: string): Promise<DiscrepancyRow[]>;
  getDiscrepancy(id: string): Promise<DiscrepancyRow | null>;
  resolveDiscrepancy(id: string, reason: string, actor?: string): Promise<DiscrepancyRow>;
  verifyIntegrity(tenantId: string): Promise<{ ok: boolean; checked: number; failures: string[] }>;
}
