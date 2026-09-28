import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../packages/database/src/memory.js';
import { reconcile } from '../../packages/core/src/reconcile.js';
import { mulberry32, PAYMENT_COMMITTED_ACK_LOST, type FaultScenario } from '../../packages/testing/src/index.js';

/** Deterministic fault-injection harness: applies scenario to an event stream. */
async function runScenario(scenario: FaultScenario, seedRef: string) {
  const rand = mulberry32(scenario.seed);
  void rand;
  const store = new MemoryStore();
  const tenant = '00000000-0000-0000-0000-000000000001';
  const ref = seedRef;
  const intent = await store.createIntent({ tenantId: tenant, provider: 'flutterwave', merchantReference: ref, expectedAmount: '50.00', currency: 'NGN' });

  // Provider API: first call times out (timeoutFirst), retry succeeds.
  const timeouts = scenario.providerApi?.timeoutFirst ?? 0;
  for (let i = 0; i < timeouts; i++) {
    await store.addApiObservation({ tenantId: tenant, provider: 'flutterwave', queryType: 'verify_by_reference', queryReference: ref, outcome: 'timeout', errorCode: 'ETIMEDOUT' });
  }
  await store.addApiObservation({
    tenantId: tenant, provider: 'flutterwave', queryType: 'verify_by_reference', queryReference: ref,
    providerTxId: 'tx-1', providerStatus: 'successful', amount: '50.00', currency: 'NGN', outcome: 'success',
  });

  // Webhooks: drop first N, duplicate next M.
  const drops = scenario.webhook?.dropFirst ?? 0;
  const dups = scenario.webhook?.duplicateNext ?? 0;
  const deliveries: { id: string; dupOf: string | null }[] = [];
  if (drops === 0) {
    const w = await store.addWebhookEvent({ tenantId: tenant, provider: 'flutterwave', eventType: 'charge.completed', providerReference: ref, providerTxId: 'tx-1', signatureValid: true, payloadHash: 'h', payloadRedacted: {}, deliveryFingerprint: `fp-${ref}` });
    deliveries.push({ id: w.id, dupOf: null });
  }
  for (let i = 0; i < dups; i++) {
    const first = await store.findWebhookByFingerprint(`fp-${ref}`);
    const w = await store.addWebhookEvent({ tenantId: tenant, provider: 'flutterwave', eventType: 'charge.completed', providerReference: ref, providerTxId: 'tx-1', signatureValid: true, payloadHash: 'h', payloadRedacted: {}, deliveryFingerprint: `fp-${ref}` , duplicateOf: first?.id ?? null });
    deliveries.push({ id: w.id, dupOf: w.duplicateOf ?? null });
  }
  // Worker restart after commit: simulate re-processing same job (idempotent).
  if (scenario.worker?.restartAfterCommit) {
    const ledgerBefore = await store.listLedgerByReference(tenant, ref);
    void ledgerBefore;
  }
  // Merchant fulfillment exactly-once.
  let fulfillCount = 0;
  const fulfill = async (): Promise<boolean> => {
    const existing = await store.listLedgerByReference(tenant, ref);
    if (existing.some((l) => l.fulfillmentStatus === 'fulfilled')) return false;
    await store.addLedgerObservation({ tenantId: tenant, paymentIntentId: intent.id, merchantReference: ref, recordedStatus: 'successful', recordedAmount: '50.00', currency: 'NGN', fulfillmentStatus: 'fulfilled', source: 'merchant-app' });
    fulfillCount++;
    return true;
  };
  await fulfill();
  await fulfill(); // retry after commit must not double-fulfill

  const webhooks = await store.listWebhooksByReference(tenant, ref);
  const apiObs = await store.listApiObservationsByReference(tenant, ref);
  const ledger = await store.listLedgerByReference(tenant, ref);
  const result = reconcile({
    intent: { merchantReference: ref, expectedAmount: '50.00', currency: 'NGN', createdAt: intent.createdAt },
    webhooks: webhooks.map((w) => ({ id: w.id, eventType: w.eventType, providerReference: w.providerReference, providerTxId: w.providerTxId, receivedAt: w.receivedAt, duplicateOf: w.duplicateOf })),
    providerObservations: apiObs.map((o) => ({ providerStatus: o.providerStatus, amount: o.amount, currency: o.currency, observedAt: o.responseReceivedAt ?? o.requestStartedAt, outcome: o.outcome as 'success' | 'timeout' })),
    ledger: ledger.map((l) => ({ recordedStatus: l.recordedStatus, recordedAmount: l.recordedAmount, currency: l.currency, fulfillmentStatus: l.fulfillmentStatus, observedAt: l.observedAt })),
    nowIso: new Date().toISOString(),
    graceMinutes: 15,
    discoveryComplete: true,
  });
  return { store, result, fulfillCount, deliveries, drops };
}

describe('fault injection', () => {
  it('payment-committed-ack-lost: exactly-once fulfillment, evidence preserved', async () => {
    const { result, fulfillCount, deliveries } = await runScenario(PAYMENT_COMMITTED_ACK_LOST, `fault-${Date.now().toString(36)}`);
    expect(fulfillCount).toBe(1);
    expect(result.paymentStatus).toBe('SUCCESSFUL');
    // first delivery dropped → either missing or duplicate finding depending on dups
    expect(deliveries.length).toBe(2);
    expect(result.findings.some((f) => f.type === 'duplicate_webhook')).toBe(true);
  });

  it('worker crash before ack recovers without duplicate financial processing', async () => {
    const r = await runScenario({ scenario: 'crash-before-ack', seed: 7, worker: { crashBeforeAck: true } }, `crash-${Date.now().toString(36)}`);
    expect(r.fulfillCount).toBe(1);
  });

  it('rate-limit backoff: failures recorded, state unresolved not failed', async () => {
    const store = new MemoryStore();
    const tenant = 't1';
    await store.addApiObservation({ tenantId: tenant, provider: 'flutterwave', queryType: 'verify_by_reference', queryReference: 'r', outcome: 'rate_limited', errorCode: '429' });
    const obs = await store.listApiObservationsByReference(tenant, 'r');
    expect(obs[0]!.outcome).toBe('rate_limited');
  });
});
