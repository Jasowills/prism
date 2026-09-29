import pino from 'pino';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadConfig } from '@prism/config';
import { MemoryStore, PostgresStore, type EvidenceStore } from '@prism/database';
import { reconcile } from '@prism/core';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function openStore(url: string): Promise<{ store: EvidenceStore; close: () => Promise<void> }> {
  if (process.env.PRISM_FORCE_MEMORY === '1') {
    return { store: new MemoryStore(), close: async () => {} };
  }
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 1500 });
    await pool.query('SELECT 1');
    const pg = new PostgresStore(pool);
    await pg.migrate();
    return { store: pg, close: async () => pg.close() };
  } catch (e) {
    logger.warn({ err: String(e) }, 'postgres unavailable in worker; using memory (no shared state with API)');
    return { store: new MemoryStore(), close: async () => {} };
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { store } = await openStore(cfg.DATABASE_URL);
  const redisUrl = process.env.REDIS_URL;

  async function handleWebhookProcess(data: Record<string, unknown>): Promise<void> {
    const tenant = String(data.tenantId ?? cfg.PRISM_TENANT_ID);
    const reference = data.reference ? String(data.reference) : null;
    if (!reference) return;
    const intent = await store.getIntentByReference(tenant, 'flutterwave', reference);
    const webhooks = await store.listWebhooksByReference(tenant, reference);
    const apiObs = await store.listApiObservationsByReference(tenant, reference);
    const ledger = await store.listLedgerByReference(tenant, reference);
    const result = reconcile({
      intent: intent
        ? { merchantReference: intent.merchantReference, expectedAmount: intent.expectedAmount, currency: intent.currency, createdAt: intent.createdAt }
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
      providerObservations: apiObs
        .filter((o) => o.queryType !== 'settlement')
        .map((o) => ({
          providerTxId: o.providerTxId,
          providerReference: o.queryReference,
          providerStatus: o.providerStatus,
          amount: o.amount,
          currency: o.currency,
          observedAt: o.responseReceivedAt ?? o.requestStartedAt,
          outcome: o.outcome as 'success',
        })),
      settlements: apiObs
        .filter((o) => o.queryType === 'settlement')
        .map((o) => ({
          settlementId: o.providerTxId,
          reference: o.queryReference,
          grossAmount: o.amount,
          netAmount: ((o.responseRedacted ?? {}) as { netAmount?: string | null }).netAmount ?? null,
          currency: o.currency,
          state: (o.providerStatus ?? 'unknown') as 'settled' | 'pending' | 'flagged' | 'unknown',
          observedAt: o.responseReceivedAt ?? o.requestStartedAt,
        })),
      ledger: ledger.map((l) => ({
        recordedStatus: l.recordedStatus,
        recordedAmount: l.recordedAmount,
        currency: l.currency,
        fulfillmentStatus: l.fulfillmentStatus,
        observedAt: l.observedAt,
      })),
      nowIso: new Date().toISOString(),
      graceMinutes: cfg.PRISM_WEBHOOK_GRACE_MINUTES,
      discoveryComplete: true,
    });
    for (const f of result.findings) {
      await store.upsertDiscrepancy({
        tenantId: tenant,
        paymentIntentId: intent?.id ?? null,
        merchantReference: reference,
        type: f.type,
        severity: f.severity,
        evidenceRefs: f.evidenceRefs,
        ruleVersion: result.ruleVersion,
      });
    }
    logger.info({ reference, verification: result.verificationStatus, findings: result.findings.length }, 'webhook job processed');
  }

  if (!redisUrl) {
    logger.info('REDIS_URL not set; worker idle (API processes inline).');
    // Keep process alive briefly in dev? No — exit cleanly so docker doesn't restart-loop.
    return;
  }

  try {
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    await connection.ping();
    const worker = new Worker(
      'prism',
      async (job) => {
        if (job.name === 'webhook-process') await handleWebhookProcess(job.data as Record<string, unknown>);
        else logger.info({ job: job.name }, 'ignoring unknown job');
      },
      { connection, concurrency: 5 },
    );
    worker.on('failed', (job, err) => logger.error({ job: job?.name, err: String(err) }, 'job failed (will retry per policy)'));
    logger.info('PRISM worker listening on queue "prism"');

    const shutdown = async (): Promise<void> => {
      logger.info('shutting down worker');
      await worker.close();
      connection.disconnect();
      process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());
  } catch (e) {
    logger.warn({ err: String(e) }, 'redis unavailable; worker idle');
  }
}

main().catch((e) => {
  logger.error({ err: String(e) }, 'worker failed');
  process.exit(1);
});
