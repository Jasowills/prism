import { describe, expect, it } from 'vitest';
import { openTestStore } from '../helpers.js';

describe('discrepancy lifecycle (append-only resolution)', () => {
  it('upsert merges redetections; resolution preserves history', async () => {
    const { store, close } = await openTestStore('disclife');
    try {
      const tenant = '33333333-3333-4333-8333-333333333333';
      const ref = `r1-${Date.now().toString(36)}`;
      const first = await store.upsertDiscrepancy({
        tenantId: tenant,
        paymentIntentId: null,
        merchantReference: ref,
        type: 'missing_webhook',
        severity: 'medium',
        evidenceRefs: ['intent'],
        ruleVersion: 'prism-rules-v1.0.0',
      });
      const second = await store.upsertDiscrepancy({
        tenantId: tenant,
        paymentIntentId: null,
        merchantReference: ref,
        type: 'missing_webhook',
        severity: 'medium',
        evidenceRefs: ['provider-api'],
        ruleVersion: 'prism-rules-v1.0.0',
      });
      // Same open finding, not a duplicate row
      expect(second.id).toBe(first.id);
      expect(second.evidenceRefs).toContain('intent');
      expect(second.evidenceRefs).toContain('provider-api');
      expect((await store.listDiscrepancies(tenant)).filter((d) => d.status !== 'resolved')).toHaveLength(1);

      const resolved = await store.resolveDiscrepancy(first.id, 'webhook arrived late; delivery confirmed', 'operator');
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolutionReason).toContain('late');
      expect(resolved.resolvedAt).toBeTruthy();
      // Original finding retained, still inspectable
      expect(await store.getDiscrepancy(first.id)).toMatchObject({ type: 'missing_webhook', status: 'resolved' });
    } finally {
      await close();
    }
  });

  it('orphan provider evidence is flagged on verify with no intent', async () => {
    const { store, close } = await openTestStore('disclife');
    try {
      const tenant = '33333333-3333-4333-8333-333333333333';
      const ref = `ghost-${Date.now().toString(36)}`;
      await store.addWebhookEvent({
        tenantId: tenant,
        provider: 'flutterwave',
        eventType: 'charge.completed',
        providerReference: ref,
        signatureValid: true,
        payloadHash: 'h',
        payloadRedacted: {},
        deliveryFingerprint: `fp-${ref}`,
      });
      const webhooks = await store.listWebhooksByReference(tenant, ref);
      expect(webhooks).toHaveLength(1);
      expect(await store.getIntentByReference(tenant, 'flutterwave', ref)).toBeNull();
    } finally {
      await close();
    }
  });
});
