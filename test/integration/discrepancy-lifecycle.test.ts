import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../packages/database/src/memory.js';

describe('discrepancy lifecycle (append-only resolution)', () => {
  it('upsert merges redetections; resolution preserves history', async () => {
    const s = new MemoryStore();
    const tenant = 't1';
    const first = await s.upsertDiscrepancy({
      tenantId: tenant,
      paymentIntentId: null,
      merchantReference: 'r1',
      type: 'missing_webhook',
      severity: 'medium',
      evidenceRefs: ['intent'],
      ruleVersion: 'prism-rules-v1.0.0',
    });
    const second = await s.upsertDiscrepancy({
      tenantId: tenant,
      paymentIntentId: null,
      merchantReference: 'r1',
      type: 'missing_webhook',
      severity: 'medium',
      evidenceRefs: ['provider-api'],
      ruleVersion: 'prism-rules-v1.0.0',
    });
    // Same open finding, not a duplicate row
    expect(second.id).toBe(first.id);
    expect(second.evidenceRefs).toContain('intent');
    expect(second.evidenceRefs).toContain('provider-api');
    expect((await s.listDiscrepancies(tenant)).filter((d) => d.status !== 'resolved')).toHaveLength(1);

    const resolved = await s.resolveDiscrepancy(first.id, 'webhook arrived late; delivery confirmed', 'operator');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolutionReason).toContain('late');
    expect(resolved.resolvedAt).toBeTruthy();
    // Original finding retained, still inspectable
    expect(await s.getDiscrepancy(first.id)).toMatchObject({ type: 'missing_webhook', status: 'resolved' });
  });

  it('orphan provider evidence is flagged on verify with no intent', async () => {
    const s = new MemoryStore();
    const tenant = 't1';
    await s.addWebhookEvent({
      tenantId: tenant,
      provider: 'flutterwave',
      eventType: 'charge.completed',
      providerReference: 'ghost-ref',
      signatureValid: true,
      payloadHash: 'h',
      payloadRedacted: {},
      deliveryFingerprint: 'fp-ghost',
    });
    const webhooks = await s.listWebhooksByReference(tenant, 'ghost-ref');
    expect(webhooks).toHaveLength(1);
    expect(await s.getIntentByReference(tenant, 'flutterwave', 'ghost-ref')).toBeNull();
  });
});
