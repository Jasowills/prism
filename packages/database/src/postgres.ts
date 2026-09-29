import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sha256Hex, canonicalJson } from './redact.js';
import type {
  ApiObsRow,
  DiscrepancyRow,
  EvidenceStore,
  IntentRow,
  LedgerRow,
  RunRow,
  WebhookRow,
} from './store.js';

function rowToIntent(r: Record<string, string>): IntentRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    provider: r.provider,
    merchantReference: r.merchant_reference,
    expectedAmount: String(r.expected_amount),
    currency: r.currency.trim(),
    expectedCustomer: r.expected_customer as unknown as Record<string, unknown> | null,
    expectedMetadata: r.expected_metadata as unknown as Record<string, unknown> | null,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  };
}

/** Postgres evidence store using explicit SQL for immutable evidence writes (spec §3). */
export class PostgresStore implements EvidenceStore {
  constructor(private pool: Pool) {}

  static fromUrl(url: string): PostgresStore {
    return new PostgresStore(new Pool({ connectionString: url }));
  }

  async migrate(): Promise<void> {
    const here = dirname(fileURLToPath(import.meta.url));
    // NOTE: under vitest/vite transforms import.meta.url may not map to the
    // source tree, so prefer the cwd-anchored path first.
    const candidates = [
      join(process.cwd(), 'packages/database/migrations/001_init.sql'),
      join(here, '../../migrations/001_init.sql'),
      join(here, '../migrations/001_init.sql'),
    ];
    let sql = '';
    for (const c of candidates) {
      try {
        sql = readFileSync(c, 'utf8');
        break;
      } catch {
        /* try next */
      }
    }
    if (!sql) throw new Error('migration SQL not found');
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /** Test-only reset. TRUNCATE bypasses the row-level append-only triggers. */
  async truncateForTests(): Promise<void> {
    await this.pool.query(
      `TRUNCATE discrepancy_events, discrepancies, reconciliation_runs, merchant_ledger_observations, provider_api_observations, provider_webhook_events, intent_amendments, payment_intents CASCADE`,
    );
  }

  /** Test-only raw query (e.g. asserting trigger rejection). */
  async rawForTests<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(sql, params as unknown[]);
    return res.rows as T[];
  }

  async createIntent(row: Omit<IntentRow, 'id' | 'createdAt'>): Promise<IntentRow> {
    try {
      const res = await this.pool.query(
        `INSERT INTO payment_intents (tenant_id, provider, merchant_reference, expected_amount, currency, expected_customer, expected_metadata, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING *`,
        [
          row.tenantId,
          row.provider,
          row.merchantReference,
          row.expectedAmount,
          row.currency,
          JSON.stringify(row.expectedCustomer ?? null),
          JSON.stringify(row.expectedMetadata ?? null),
          row.expiresAt ?? null,
        ],
      );
      return rowToIntent(res.rows[0]);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
        throw Object.assign(new Error('duplicate intent'), { code: 'DUPLICATE_INTENT' });
      }
      throw e;
    }
  }

  async getIntentById(id: string): Promise<IntentRow | null> {
    const res = await this.pool.query(`SELECT * FROM payment_intents WHERE id=$1`, [id]);
    return res.rows[0] ? rowToIntent(res.rows[0]) : null;
  }

  async getIntentByReference(tenantId: string, provider: string, merchantReference: string): Promise<IntentRow | null> {
    const res = await this.pool.query(
      `SELECT * FROM payment_intents WHERE tenant_id=$1 AND provider=$2 AND merchant_reference=$3`,
      [tenantId, provider, merchantReference],
    );
    return res.rows[0] ? rowToIntent(res.rows[0]) : null;
  }

  async listIntentsInWindow(tenantId: string, fromIso: string, toIso: string): Promise<IntentRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM payment_intents WHERE tenant_id=$1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at`,
      [tenantId, fromIso, toIso],
    );
    return res.rows.map(rowToIntent);
  }

  async addLedgerObservation(row: Omit<LedgerRow, 'id' | 'observedAt'> & { observedAt?: string }): Promise<LedgerRow> {
    const res = await this.pool.query(
      `INSERT INTO merchant_ledger_observations (tenant_id, payment_intent_id, merchant_reference, recorded_status, recorded_amount, currency, fulfillment_status, source, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, now())) RETURNING *`,
      [
        row.tenantId,
        row.paymentIntentId ?? null,
        row.merchantReference,
        row.recordedStatus,
        row.recordedAmount ?? null,
        row.currency ?? null,
        row.fulfillmentStatus ?? null,
        row.source,
        row.observedAt ?? null,
      ],
    );
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      paymentIntentId: r.payment_intent_id,
      merchantReference: r.merchant_reference,
      recordedStatus: r.recorded_status,
      recordedAmount: r.recorded_amount ? String(r.recorded_amount) : null,
      currency: r.currency,
      fulfillmentStatus: r.fulfillment_status,
      source: r.source,
      observedAt: new Date(r.observed_at).toISOString(),
    };
  }

  private async lastHash(table: 'provider_webhook_events' | 'provider_api_observations'): Promise<string | null> {
    const tsCol = table === 'provider_webhook_events' ? 'received_at' : 'request_started_at';
    const res = await this.pool.query(`SELECT entry_hash FROM ${table} ORDER BY ${tsCol} DESC LIMIT 1`);
    return res.rows[0]?.entry_hash ?? null;
  }

  async addWebhookEvent(
    row: Omit<WebhookRow, 'id' | 'receivedAt' | 'prevHash' | 'entryHash'> & { receivedAt?: string },
  ): Promise<WebhookRow> {
    const prev = await this.lastHash('provider_webhook_events');
    const body = canonicalJson({ fp: row.deliveryFingerprint, hash: row.payloadHash, ref: row.providerReference });
    const entry = sha256Hex(`${prev ?? 'GENESIS'}|${body}`);
    const res = await this.pool.query(
      `INSERT INTO provider_webhook_events (tenant_id, provider, provider_event_id, event_type, provider_reference, provider_tx_id, received_at, provider_event_at, signature_valid, payload_hash, payload_redacted, delivery_fingerprint, duplicate_of, prev_hash, entry_hash)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, now()),$8,$9,$10,$11::jsonb,$12,$13,$14,$15) RETURNING *`,
      [
        row.tenantId,
        row.provider,
        row.providerEventId ?? null,
        row.eventType,
        row.providerReference ?? null,
        row.providerTxId ?? null,
        row.receivedAt ?? null,
        row.providerEventAt ?? null,
        row.signatureValid,
        row.payloadHash,
        JSON.stringify(row.payloadRedacted),
        row.deliveryFingerprint,
        row.duplicateOf ?? null,
        prev,
        entry,
      ],
    );
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      providerEventId: r.provider_event_id,
      eventType: r.event_type,
      providerReference: r.provider_reference,
      providerTxId: r.provider_tx_id,
      receivedAt: new Date(r.received_at).toISOString(),
      providerEventAt: r.provider_event_at ? new Date(r.provider_event_at).toISOString() : null,
      signatureValid: r.signature_valid,
      payloadHash: r.payload_hash,
      payloadRedacted: r.payload_redacted,
      deliveryFingerprint: r.delivery_fingerprint,
      duplicateOf: r.duplicate_of,
      prevHash: r.prev_hash,
      entryHash: r.entry_hash,
    };
  }

  async findWebhookByFingerprint(fingerprint: string): Promise<WebhookRow | null> {
    const res = await this.pool.query(`SELECT * FROM provider_webhook_events WHERE delivery_fingerprint=$1 LIMIT 1`, [
      fingerprint,
    ]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      providerEventId: r.provider_event_id,
      eventType: r.event_type,
      providerReference: r.provider_reference,
      providerTxId: r.provider_tx_id,
      receivedAt: new Date(r.received_at).toISOString(),
      providerEventAt: r.provider_event_at ? new Date(r.provider_event_at).toISOString() : null,
      signatureValid: r.signature_valid,
      payloadHash: r.payload_hash,
      payloadRedacted: r.payload_redacted,
      deliveryFingerprint: r.delivery_fingerprint,
      duplicateOf: r.duplicate_of,
      prevHash: r.prev_hash,
      entryHash: r.entry_hash,
    };
  }

  async listWebhooksByReference(tenantId: string, reference: string): Promise<WebhookRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM provider_webhook_events WHERE tenant_id=$1 AND provider_reference=$2 ORDER BY received_at`,
      [tenantId, reference],
    );
    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      providerEventId: r.provider_event_id,
      eventType: r.event_type,
      providerReference: r.provider_reference,
      providerTxId: r.provider_tx_id,
      receivedAt: new Date(r.received_at).toISOString(),
      providerEventAt: r.provider_event_at ? new Date(r.provider_event_at).toISOString() : null,
      signatureValid: r.signature_valid,
      payloadHash: r.payload_hash,
      payloadRedacted: r.payload_redacted,
      deliveryFingerprint: r.delivery_fingerprint,
      duplicateOf: r.duplicate_of,
      prevHash: r.prev_hash,
      entryHash: r.entry_hash,
    }));
  }

  async addApiObservation(
    row: Omit<ApiObsRow, 'id' | 'requestStartedAt' | 'prevHash' | 'entryHash'> & { requestStartedAt?: string },
  ): Promise<ApiObsRow> {
    const prev = await this.lastHash('provider_api_observations');
    const body = canonicalJson({ q: row.queryReference, s: row.providerStatus, o: row.outcome });
    const entry = sha256Hex(`${prev ?? 'GENESIS'}|${body}`);
    const res = await this.pool.query(
      `INSERT INTO provider_api_observations (tenant_id, provider, query_type, query_reference, provider_tx_id, request_started_at, response_received_at, http_status, provider_status, amount, currency, response_hash, response_redacted, outcome, error_code, prev_hash, entry_hash)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6, now()),$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17) RETURNING *`,
      [
        row.tenantId,
        row.provider,
        row.queryType,
        row.queryReference ?? null,
        row.providerTxId ?? null,
        row.requestStartedAt ?? null,
        row.responseReceivedAt ?? null,
        row.httpStatus ?? null,
        row.providerStatus ?? null,
        row.amount ?? null,
        row.currency ?? null,
        row.responseHash ?? null,
        JSON.stringify(row.responseRedacted ?? null),
        row.outcome,
        row.errorCode ?? null,
        prev,
        entry,
      ],
    );
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      queryType: r.query_type,
      queryReference: r.query_reference,
      providerTxId: r.provider_tx_id,
      requestStartedAt: new Date(r.request_started_at).toISOString(),
      responseReceivedAt: r.response_received_at ? new Date(r.response_received_at).toISOString() : null,
      httpStatus: r.http_status,
      providerStatus: r.provider_status,
      amount: r.amount ? String(r.amount) : null,
      currency: r.currency,
      responseHash: r.response_hash,
      responseRedacted: r.response_redacted,
      outcome: r.outcome,
      errorCode: r.error_code,
      prevHash: r.prev_hash,
      entryHash: r.entry_hash,
    };
  }

  async listApiObservationsByReference(tenantId: string, reference: string): Promise<ApiObsRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM provider_api_observations WHERE tenant_id=$1 AND query_reference=$2 ORDER BY request_started_at`,
      [tenantId, reference],
    );
    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      queryType: r.query_type,
      queryReference: r.query_reference,
      providerTxId: r.provider_tx_id,
      requestStartedAt: new Date(r.request_started_at).toISOString(),
      responseReceivedAt: r.response_received_at ? new Date(r.response_received_at).toISOString() : null,
      httpStatus: r.http_status,
      providerStatus: r.provider_status,
      amount: r.amount ? String(r.amount) : null,
      currency: r.currency,
      responseHash: r.response_hash,
      responseRedacted: r.response_redacted,
      outcome: r.outcome,
      errorCode: r.error_code,
      prevHash: r.prev_hash,
      entryHash: r.entry_hash,
    }));
  }

  async listLedgerByReference(tenantId: string, reference: string): Promise<LedgerRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM merchant_ledger_observations WHERE tenant_id=$1 AND merchant_reference=$2 ORDER BY observed_at`,
      [tenantId, reference],
    );
    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      paymentIntentId: r.payment_intent_id,
      merchantReference: r.merchant_reference,
      recordedStatus: r.recorded_status,
      recordedAmount: r.recorded_amount ? String(r.recorded_amount) : null,
      currency: r.currency,
      fulfillmentStatus: r.fulfillment_status,
      source: r.source,
      observedAt: new Date(r.observed_at).toISOString(),
    }));
  }

  async createRun(
    row: Omit<RunRow, 'id' | 'startedAt' | 'pagesScanned' | 'recordsScanned' | 'status'> & { status?: string },
  ): Promise<RunRow> {
    const res = await this.pool.query(
      `INSERT INTO reconciliation_runs (tenant_id, provider, run_type, window_from, window_to, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [row.tenantId, row.provider, row.runType, row.windowFrom, row.windowTo, row.status ?? 'running'],
    );
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      runType: r.run_type,
      windowFrom: new Date(r.window_from).toISOString(),
      windowTo: new Date(r.window_to).toISOString(),
      status: r.status,
      startedAt: new Date(r.startedAt ?? r.started_at).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      pagesScanned: r.pages_scanned,
      recordsScanned: r.records_scanned,
      cursor: r.cursor,
      errorSummary: r.error_summary,
    };
  }

  async getRun(id: string): Promise<RunRow | null> {
    const res = await this.pool.query(`SELECT * FROM reconciliation_runs WHERE id=$1`, [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      runType: r.run_type,
      windowFrom: new Date(r.window_from).toISOString(),
      windowTo: new Date(r.window_to).toISOString(),
      status: r.status,
      startedAt: new Date(r.started_at).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      pagesScanned: r.pages_scanned,
      recordsScanned: r.records_scanned,
      cursor: r.cursor,
      errorSummary: r.error_summary,
    };
  }

  async updateRun(id: string, patch: Partial<RunRow>): Promise<RunRow> {
    const cur = await this.getRun(id);
    if (!cur) throw new Error('run not found');
    const res = await this.pool.query(
      `UPDATE reconciliation_runs SET status=COALESCE($2,status), completed_at=$3, pages_scanned=COALESCE($4,pages_scanned), records_scanned=COALESCE($5,records_scanned), cursor=COALESCE($6,cursor), error_summary=COALESCE($7,error_summary) WHERE id=$1 RETURNING *`,
      [
        id,
        patch.status ?? null,
        patch.completedAt ?? null,
        patch.pagesScanned ?? null,
        patch.recordsScanned ?? null,
        patch.cursor ?? null,
        patch.errorSummary ? JSON.stringify(patch.errorSummary) : null,
      ],
    );
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      provider: r.provider,
      runType: r.run_type,
      windowFrom: new Date(r.window_from).toISOString(),
      windowTo: new Date(r.window_to).toISOString(),
      status: r.status,
      startedAt: new Date(r.started_at).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      pagesScanned: r.pages_scanned,
      recordsScanned: r.records_scanned,
      cursor: r.cursor,
      errorSummary: r.error_summary,
    };
  }

  async upsertDiscrepancy(
    row: Omit<DiscrepancyRow, 'id' | 'firstDetectedAt' | 'lastDetectedAt' | 'status'> & { status?: string },
  ): Promise<DiscrepancyRow> {
    const existing = await this.pool.query(
      `SELECT * FROM discrepancies WHERE tenant_id=$1 AND merchant_reference=$2 AND type=$3 AND status != 'resolved' LIMIT 1`,
      [row.tenantId, row.merchantReference, row.type],
    );
    if (existing.rows[0]) {
      const d = existing.rows[0];
      const merged = [...new Set([...(d.evidence_refs ?? []), ...row.evidenceRefs])];
      const res = await this.pool.query(
        `UPDATE discrepancies SET last_detected_at=now(), evidence_refs=$2::jsonb, severity=$3 WHERE id=$1 RETURNING *`,
        [d.id, JSON.stringify(merged), row.severity],
      );
      const r = res.rows[0];
      await this.pool.query(`INSERT INTO discrepancy_events (discrepancy_id, event_type, actor) VALUES ($1,'redetected','system')`, [r.id]);
      return this.mapDiscrepancy(r);
    }
    const res = await this.pool.query(
      `INSERT INTO discrepancies (tenant_id, payment_intent_id, merchant_reference, type, severity, status, evidence_refs, rule_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
      [
        row.tenantId,
        row.paymentIntentId ?? null,
        row.merchantReference,
        row.type,
        row.severity,
        row.status ?? 'open',
        JSON.stringify(row.evidenceRefs),
        row.ruleVersion,
      ],
    );
    const r = res.rows[0];
    await this.pool.query(`INSERT INTO discrepancy_events (discrepancy_id, event_type, actor) VALUES ($1,'detected','system')`, [r.id]);
    return this.mapDiscrepancy(r);
  }

  private mapDiscrepancy(r: Record<string, string & string[]>): DiscrepancyRow {
    return {
      id: String(r.id),
      tenantId: String(r.tenant_id),
      paymentIntentId: (r.payment_intent_id as unknown as string) ?? null,
      merchantReference: String(r.merchant_reference),
      type: String(r.type),
      severity: String(r.severity),
      status: String(r.status),
      firstDetectedAt: new Date(r.first_detected_at as unknown as string).toISOString(),
      lastDetectedAt: new Date(r.last_detected_at as unknown as string).toISOString(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at as unknown as string).toISOString() : null,
      resolutionReason: (r.resolution_reason as unknown as string) ?? null,
      evidenceRefs: (r.evidence_refs as unknown as string[]) ?? [],
      ruleVersion: String(r.rule_version),
    };
  }

  async listDiscrepancies(tenantId: string, status?: string): Promise<DiscrepancyRow[]> {
    const res = status
      ? await this.pool.query(`SELECT * FROM discrepancies WHERE tenant_id=$1 AND status=$2 ORDER BY last_detected_at DESC`, [tenantId, status])
      : await this.pool.query(`SELECT * FROM discrepancies WHERE tenant_id=$1 ORDER BY last_detected_at DESC`, [tenantId]);
    return res.rows.map((r) => this.mapDiscrepancy(r));
  }

  async getDiscrepancy(id: string): Promise<DiscrepancyRow | null> {
    const res = await this.pool.query(`SELECT * FROM discrepancies WHERE id=$1`, [id]);
    return res.rows[0] ? this.mapDiscrepancy(res.rows[0]) : null;
  }

  async resolveDiscrepancy(id: string, reason: string, actor = 'operator'): Promise<DiscrepancyRow> {
    const res = await this.pool.query(
      `UPDATE discrepancies SET status='resolved', resolved_at=now(), resolution_reason=$2 WHERE id=$1 RETURNING *`,
      [id, reason],
    );
    if (!res.rows[0]) throw new Error('discrepancy not found');
    await this.pool.query(`INSERT INTO discrepancy_events (discrepancy_id, event_type, actor, reason) VALUES ($1,'resolved',$2,$3)`, [id, actor, reason]);
    return this.mapDiscrepancy(res.rows[0]);
  }

  async verifyIntegrity(_tenantId: string): Promise<{ ok: boolean; checked: number; failures: string[] }> {
    const failures: string[] = [];
    let checked = 0;
    const wh = await this.pool.query(`SELECT id, delivery_fingerprint, payload_hash, provider_reference, prev_hash, entry_hash FROM provider_webhook_events ORDER BY received_at`);
    let prev: string | null = null;
    for (const r of wh.rows) {
      checked++;
      const body = canonicalJson({ fp: r.delivery_fingerprint, hash: r.payload_hash, ref: r.provider_reference });
      const expected = sha256Hex(`${prev ?? 'GENESIS'}|${body}`);
      if (r.entry_hash !== expected) failures.push(`webhook:${r.id}`);
      prev = r.entry_hash;
    }
    return { ok: failures.length === 0, checked, failures };
  }
}
