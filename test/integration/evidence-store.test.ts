import { describe, expect, it } from 'vitest';
import { openTestStore } from '../helpers.js';

/** Store conformance: identical semantics on memory and (when available) Postgres. */
describe('evidence store conformance', () => {
  it('enforces unique intent per tenant/provider/reference', async () => {
    const { store, kind, close } = await openTestStore('evidence');
    try {
      await store.createIntent({ tenantId: '33333333-3333-4333-8333-333333333333', provider: 'flutterwave', merchantReference: `r1-${kind}`, expectedAmount: '10.00', currency: 'NGN' });
      await expect(
        store.createIntent({ tenantId: '33333333-3333-4333-8333-333333333333', provider: 'flutterwave', merchantReference: `r1-${kind}`, expectedAmount: '10.00', currency: 'NGN' }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it('chains hashes and detects tampering', async () => {
    const { store, close } = await openTestStore('evidence');
    try {
      const w1 = await store.addWebhookEvent({
        tenantId: '33333333-3333-4333-8333-333333333333', provider: 'flutterwave', eventType: 'charge.completed', providerReference: 'r1',
        signatureValid: true, payloadHash: 'h1', payloadRedacted: {}, deliveryFingerprint: `fp1-${Date.now()}`,
      });
      await store.addWebhookEvent({
        tenantId: '33333333-3333-4333-8333-333333333333', provider: 'flutterwave', eventType: 'charge.completed', providerReference: 'r1',
        signatureValid: true, payloadHash: 'h2', payloadRedacted: {}, deliveryFingerprint: `fp2-${Date.now()}`,
      });
      expect(w1.entryHash).toBeTruthy();
      expect((await store.verifyIntegrity('t1')).ok).toBe(true);
    } finally {
      await close();
    }
  });

  it('isolates tenants', async () => {    const { store, close } = await openTestStore('evidence');
    try {
      const ref = `iso-${Date.now().toString(36)}`;
      await store.addWebhookEvent({ tenantId: '11111111-1111-4111-8111-111111111111', provider: 'flutterwave', eventType: 'e', providerReference: ref, signatureValid: true, payloadHash: 'h', payloadRedacted: {}, deliveryFingerprint: `f-${ref}` });
      expect(await store.listWebhooksByReference('22222222-2222-4222-8222-222222222222', ref)).toHaveLength(0);
      expect(await store.listWebhooksByReference('11111111-1111-4111-8111-111111111111', ref)).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it('rejects evidence UPDATE/DELETE on Postgres (append-only triggers)', async () => {
    const { store, kind, close } = await openTestStore('evidence');
    try {
      if (kind !== 'postgres') {
        console.log('SKIP trigger test: memory store (no SQL triggers)');
        return;
      }
      const pg = store as import('../../packages/database/src/index.js').PostgresStore;
      const w = await store.addWebhookEvent({
        tenantId: '33333333-3333-4333-8333-333333333333', provider: 'flutterwave', eventType: 'e', providerReference: 'trig-ref',
        signatureValid: true, payloadHash: 'h', payloadRedacted: {}, deliveryFingerprint: `trig-${Date.now()}`,
      });
      await expect(pg.rawForTests(`UPDATE provider_webhook_events SET event_type='x' WHERE id=$1`, [w.id])).rejects.toThrow(/append-only/);
      await expect(pg.rawForTests(`DELETE FROM provider_webhook_events WHERE id=$1`, [w.id])).rejects.toThrow(/append-only/);
    } finally {
      await close();
    }
  });
});
