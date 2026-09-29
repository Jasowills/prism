import { Injectable } from '@nestjs/common';
import { loadConfig, type PrismConfig } from '@prism/config';
import { MemoryStore, PostgresStore, redactDeep, sha256Hex, canonicalJson, type EvidenceStore } from '@prism/database';
import { reconcile, deliveryFingerprint, type ProviderObservation as CoreObs, type SettlementObservation } from '@prism/core';
import { FlutterwaveClient, normalizeTransaction, verifyWebhook as verifyFlwWebhook } from '@prism/provider-flutterwave';
import { PaystackClient, verifyWebhook as verifyPaystackWebhook } from '@prism/provider-paystack';
import { logger } from './logging.js';

export const SUPPORTED_PROVIDERS = ['flutterwave', 'paystack'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function isProvider(value: string): value is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

@Injectable()
export class PrismService {
  readonly config: PrismConfig;
  readonly store: EvidenceStore;
  private pgStore: PostgresStore | null = null;
  readonly flw: FlutterwaveClient | null;
  readonly paystack: PaystackClient | null;
  readonly storeKind: 'postgres' | 'memory';

  constructor() {
    this.config = loadConfig();
    const url = this.config.DATABASE_URL;
    // Use Postgres only when explicitly reachable; otherwise memory (documented fallback).
    if (process.env.PRISM_FORCE_MEMORY === '1' || !url) {
      this.store = new MemoryStore();
      this.storeKind = 'memory';
    } else {
      // Lazy: default to memory unless PG connects. Connection test happens in onModuleInit.
      this.store = new MemoryStore();
      this.storeKind = 'memory';
    }
    this.flw = this.config.FLW_SECRET_KEY
      ? new FlutterwaveClient({ secretKey: this.config.FLW_SECRET_KEY, baseUrl: this.config.FLW_BASE_URL })
      : null;
    this.paystack = this.config.PAYSTACK_SECRET_KEY
      ? new PaystackClient({ secretKey: this.config.PAYSTACK_SECRET_KEY, baseUrl: this.config.PAYSTACK_BASE_URL })
      : null;
  }

  async init(): Promise<void> {
    // Try Postgres upgrade when DATABASE_URL looks real and PRISM_FORCE_MEMORY is not set.
    if (process.env.PRISM_FORCE_MEMORY !== '1') {
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: this.config.DATABASE_URL, connectionTimeoutMillis: 1500 });
        await pool.query('SELECT 1');
        const pg = new PostgresStore(pool);
        await pg.migrate();
        (this as { store: EvidenceStore }).store = pg;
        (this as { storeKind: string }).storeKind = 'postgres';
        this.pgStore = pg;
        logger.info({ store: 'postgres' }, 'evidence store ready');
        return;
      } catch (e) {
        logger.warn({ err: String(e) }, 'postgres unavailable, using in-memory evidence store');
      }
    }
    logger.info({ store: 'memory' }, 'evidence store ready');
  }

  defaultTenant(): string {
    return this.config.PRISM_TENANT_ID;
  }

  // ---- Intents ----
  async createIntent(input: {
    tenantId?: string;
    provider?: string;
    merchantReference: string;
    expectedAmount: string;
    currency: string;
    expectedCustomer?: Record<string, unknown>;
    expectedMetadata?: Record<string, unknown>;
    expiresAt?: string;
  }) {
    return this.store.createIntent({
      tenantId: input.tenantId ?? this.defaultTenant(),
      provider: input.provider ?? 'flutterwave',
      merchantReference: input.merchantReference,
      expectedAmount: input.expectedAmount,
      currency: input.currency,
      expectedCustomer: input.expectedCustomer ?? null,
      expectedMetadata: input.expectedMetadata ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  }

  /** Find a local intent across supported providers (flutterwave first). */
  async findIntent(tenantId: string, reference: string) {
    for (const provider of SUPPORTED_PROVIDERS) {
      const intent = await this.store.getIntentByReference(tenantId, provider, reference);
      if (intent) return intent;
    }
    return null;
  }

  private webhookSecretFor(provider: SupportedProvider): string {
    return provider === 'paystack' ? this.config.PAYSTACK_WEBHOOK_SECRET : this.config.FLW_WEBHOOK_SECRET;
  }

  // ---- Webhook ingestion: persist-first, then ack (spec §9) ----
  async ingestWebhook(tenantId: string, provider: SupportedProvider, rawBody: Buffer, headers: Record<string, string>) {
    const secret = this.webhookSecretFor(provider);
    if (!secret) {
      // Never accept unsigned webhooks merely to simplify testing (spec §2).
      // In test mode with explicit opt-in, allow unsigned ONLY when marked as test fixture.
      if (this.config.PRISM_ALLOW_TEST_WEBHOOKS && headers['x-prism-test'] === 'true') {
        return this.persistWebhook(tenantId, provider, rawBody, headers, false, 'test-bypass');
      }
      throw Object.assign(new Error('webhook secret not configured; refusing unsigned webhook'), { status: 503 });
    }
    const result =
      provider === 'paystack'
        ? await verifyPaystackWebhook(rawBody, headers, secret)
        : await verifyFlwWebhook(rawBody, headers, secret);
    if (!result.valid) {
      throw Object.assign(new Error('invalid webhook signature'), { status: 401 });
    }
    const mechanism = provider === 'paystack' ? 'hmac-sha512' : ((result as { mechanism?: string }).mechanism ?? 'unknown');
    return this.persistWebhook(tenantId, provider, rawBody, headers, true, mechanism, result);
  }

  private async persistWebhook(
    tenantId: string,
    provider: SupportedProvider,
    rawBody: Buffer,
    _headers: Record<string, string>,
    signatureValid: boolean,
    mechanism: string,
    verified?: { eventType?: string; providerReference?: string | null; providerTxId?: string | null; payload?: unknown },
  ) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw Object.assign(new Error('invalid JSON payload'), { status: 400 });
    }
    const data =
      payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
        ? ((payload as Record<string, unknown>).data as Record<string, unknown>)
        : null;
    const eventType =
      verified?.eventType ??
      ((payload as Record<string, unknown>).event as string | undefined) ??
      'unknown';
    const providerReference =
      verified?.providerReference ??
      ((data?.tx_ref as string | undefined) ?? (data?.reference as string | undefined) ?? null);
    const providerTxId =
      verified?.providerTxId ?? (data?.id !== undefined && data?.id !== null ? String(data.id) : null);
    const payloadHash = sha256Hex(rawBody);
    const fp = deliveryFingerprint({
      providerEventId: (data?.id !== undefined && data?.id !== null ? String(data.id) : (payload as Record<string, unknown>).id as string | undefined) ?? null,
      eventType,
      providerReference,
      payloadHash,
    });
    const existing = await this.store.findWebhookByFingerprint(fp);
    const redacted = redactDeep(payload) as Record<string, unknown>;
    const row = await this.store.addWebhookEvent({
      tenantId,
      provider,
      providerEventId: providerTxId,
      eventType,
      providerReference,
      providerTxId,
      providerEventAt:
      ((data?.created_at as string | undefined) ?? (data?.paid_at as string | undefined) ?? (data?.transaction_date as string | undefined) ?? null),
      signatureValid,
      payloadHash,
      payloadRedacted: { ...redacted, _mechanism: mechanism },
      deliveryFingerprint: fp,
      duplicateOf: existing ? existing.id : null,
    });
    return { row, duplicate: !!existing, duplicateOf: existing?.id ?? null };
  }

  // ---- Verification: reconcile a single reference ----
  async verifyReference(
    tenantId: string,
    reference: string,
    opts: { liveVerify?: boolean; provider?: string } = {},
  ) {
    const requested = opts.provider && isProvider(opts.provider) ? opts.provider : null;
    const intent =
      requested != null
        ? await this.store.getIntentByReference(tenantId, requested, reference)
        : await this.findIntent(tenantId, reference);
    const provider: SupportedProvider = (intent?.provider && isProvider(intent.provider) ? intent.provider : 'flutterwave');
    const webhooks = await this.store.listWebhooksByReference(tenantId, reference);
    let apiObs = await this.store.listApiObservationsByReference(tenantId, reference);

    // Optionally hit live provider (only when credentials present and explicitly requested).
    const liveClient = provider === 'paystack' ? this.paystack : this.flw;
    if (opts.liveVerify && liveClient && intent) {
      const started = new Date().toISOString();
      try {
        const { httpStatus, observation } = await liveClient.verifyByReference(reference);
        await this.store.addApiObservation({
          tenantId,
          provider,
          queryType: 'verify_by_reference',
          queryReference: reference,
          providerTxId: observation.providerTxId ?? null,
          requestStartedAt: started,
          responseReceivedAt: new Date().toISOString(),
          httpStatus,
          providerStatus: observation.providerStatus ?? null,
          amount: observation.amount ?? null,
          currency: observation.currency ?? null,
          responseHash: sha256Hex(canonicalJson(redactDeep(observation.raw))),
          responseRedacted: redactDeep(observation.raw),
          outcome: httpStatus === 404 || observation.providerStatus == null ? 'not_found' : 'success',
        });
        apiObs = await this.store.listApiObservationsByReference(tenantId, reference);
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        const outcome = err?.status === 429 ? 'rate_limited' : err?.status === 401 ? 'auth_error' : 'timeout';
        await this.store.addApiObservation({
          tenantId,
          provider,
          queryType: 'verify_by_reference',
          queryReference: reference,
          requestStartedAt: started,
          responseReceivedAt: new Date().toISOString(),
          httpStatus: err?.status ?? null,
          outcome,
          errorCode: err?.message ?? 'request_failed',
          responseRedacted: null,
        });
        apiObs = await this.store.listApiObservationsByReference(tenantId, reference);
      }
    }

    const ledger = await this.store.listLedgerByReference(tenantId, reference);
    const settlementRows = apiObs.filter((o) => o.queryType === 'settlement');
    const paymentObs = apiObs.filter((o) => o.queryType !== 'settlement');
    const settlements: SettlementObservation[] = settlementRows.map((o) => {
      const rec = (o.responseRedacted ?? {}) as { netAmount?: string | null };
      return {
        settlementId: o.providerTxId,
        reference: o.queryReference,
        grossAmount: o.amount,
        netAmount: rec.netAmount ?? null,
        currency: o.currency,
        state: (o.providerStatus ?? 'unknown') as SettlementObservation['state'],
        observedAt: o.responseReceivedAt ?? o.requestStartedAt,
      };
    });
    const result = reconcile({
      intent: intent
        ? {
            merchantReference: intent.merchantReference,
            expectedAmount: intent.expectedAmount,
            currency: intent.currency,
            createdAt: intent.createdAt,
          }
        : null,
      webhooks: webhooks.map((w) => ({
        id: w.id,
        eventType: w.eventType,
        providerReference: w.providerReference,
        providerTxId: w.providerTxId,
        receivedAt: w.receivedAt,
        providerEventAt: w.providerEventAt,
        duplicateOf: w.duplicateOf,
      })),
      providerObservations: paymentObs.map(
        (o): CoreObs => ({
          providerTxId: o.providerTxId,
          providerReference: o.queryReference,
          providerStatus: o.providerStatus,
          amount: o.amount,
          currency: o.currency,
          observedAt: o.responseReceivedAt ?? o.requestStartedAt,
          outcome: o.outcome as CoreObs['outcome'],
        }),
      ),
      settlements,
      ledger: ledger.map((l) => ({
        recordedStatus: l.recordedStatus,
        recordedAmount: l.recordedAmount,
        currency: l.currency,
        fulfillmentStatus: l.fulfillmentStatus,
        observedAt: l.observedAt,
      })),
      nowIso: new Date().toISOString(),
      graceMinutes: this.config.PRISM_WEBHOOK_GRACE_MINUTES,
      discoveryComplete: true,
    });

    // Persist findings as discrepancies (idempotent upsert).
    for (const f of result.findings) {
      await this.store.upsertDiscrepancy({
        tenantId,
        paymentIntentId: intent?.id ?? null,
        merchantReference: reference,
        type: f.type,
        severity: f.severity,
        evidenceRefs: f.evidenceRefs,
        ruleVersion: result.ruleVersion,
      });
    }
    return { intent, verification: result };
  }

  // ---- Discovery reconciliation over a UTC window ----
  async runDiscovery(tenantId: string, provider: SupportedProvider, windowFrom: string, windowTo: string) {
    const run = await this.store.createRun({
      tenantId,
      provider,
      runType: 'window',
      windowFrom,
      windowTo,
    });
    try {
      let pagesScanned = 0;
      let recordsScanned = 0;
      let complete = true;
      const errors: unknown[] = [];
      const client = provider === 'paystack' ? this.paystack : this.flw;
      if (client) {
        // Paginate provider listing; any page failure → run incomplete (never falsely complete).
        let page = 1;
        const from = windowFrom.slice(0, 10);
        const to = windowTo.slice(0, 10);
        for (;;) {
          try {
            const res = await client.listTransactions({ from, to, page });
            pagesScanned++;
            recordsScanned += res.data.length;
            for (const tx of res.data) {
              await this.store.addApiObservation({
                tenantId,
                provider,
                queryType: 'discovery',
                queryReference: tx.providerReference ?? null,
                providerTxId: tx.providerTxId ?? null,
                providerStatus: tx.providerStatus ?? null,
                amount: tx.amount ?? null,
                currency: tx.currency ?? null,
                responseHash: sha256Hex(canonicalJson(redactDeep(tx.raw))),
                responseRedacted: redactDeep(tx.raw),
                outcome: 'success',
                responseReceivedAt: new Date().toISOString(),
              });
            }
            if (!res.hasMore) break;
            page++;
            if (page > 50) break; // safety bound
          } catch (e) {
            complete = false;
            errors.push(String(e));
            break;
          }
        }
      } else {
        // No provider credentials: reconcile local intents in window against stored evidence.
        const intents = await this.store.listIntentsInWindow(tenantId, windowFrom, windowTo);
        recordsScanned = intents.length;
        pagesScanned = 1;
        for (const intent of intents) {
          await this.verifyReference(tenantId, intent.merchantReference);
        }
      }
      const status = complete ? 'complete' : 'incomplete';
      return this.store.updateRun(run.id, {
        status,
        completedAt: new Date().toISOString(),
        pagesScanned,
        recordsScanned,
        errorSummary: errors.length ? errors : undefined,
      });
    } catch (e) {
      return this.store.updateRun(run.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorSummary: [String(e)],
      });
    }
  }

  normalize(raw: unknown) {
    return normalizeTransaction(raw);
  }

  /**
   * Pull settlement lines for a date window and store each as a
   * `provider_api_observations` row (query_type='settlement'). Gross amount
   * goes in `amount`, payout state in `providerStatus`, full normalized line
   * (incl. net) in `responseRedacted`.
   */
  async refreshSettlements(tenantId: string, from: string, to: string): Promise<{ stored: number; pages: number }> {
    if (!this.flw) {
      throw Object.assign(new Error('provider credentials not configured'), { status: 503 });
    }
    let page = 1;
    let stored = 0;
    let pages = 0;
    for (;;) {
      const res = await this.flw.listSettlements({ page, from, to });
      pages++;
      for (const line of res.data) {
        await this.store.addApiObservation({
          tenantId,
          provider: 'flutterwave',
          queryType: 'settlement',
          queryReference: line.reference,
          providerTxId: line.id,
          providerStatus: line.state,
          amount: line.grossAmount,
          currency: line.currency,
          responseHash: sha256Hex(canonicalJson(redactDeep(line.raw))),
          responseRedacted: redactDeep({ ...line, raw: undefined }),
          outcome: 'success',
          responseReceivedAt: new Date().toISOString(),
        });
        stored++;
      }
      if (!res.hasMore || page >= 50) break;
      page++;
    }
    return { stored, pages };
  }
}
