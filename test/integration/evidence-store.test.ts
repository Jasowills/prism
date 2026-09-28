import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../packages/database/src/memory.js';

describe('evidence store (memory)', () => {
  it('enforces unique intent per tenant/provider/reference', async () => {
    const s = new MemoryStore();
    await s.createIntent({ tenantId: 't1', provider: 'flutterwave', merchantReference: 'r1', expectedAmount: '10.00', currency: 'NGN' });
    await expect(
      s.createIntent({ tenantId: 't1', provider: 'flutterwave', merchantReference: 'r1', expectedAmount: '10.00', currency: 'NGN' }),
    ).rejects.toThrow();
  });

  it('chains webhook hashes and detects tampering', async () => {
    const s = new MemoryStore();
    const w1 = await s.addWebhookEvent({
      tenantId: 't1', provider: 'flutterwave', eventType: 'charge.completed', providerReference: 'r1',
      signatureValid: true, payloadHash: 'h1', payloadRedacted: {}, deliveryFingerprint: 'fp1',
    });
    await s.addWebhookEvent({
      tenantId: 't1', provider: 'flutterwave', eventType: 'charge.completed', providerReference: 'r1',
      signatureValid: true, payloadHash: 'h2', payloadRedacted: {}, deliveryFingerprint: 'fp2',
    });
    expect(w1.entryHash).toBeTruthy();
    expect((await s.verifyIntegrity('t1')).ok).toBe(true);
    // tamper
    s.webhooks[1]!.payloadHash = 'tampered';
    expect((await s.verifyIntegrity('t1')).ok).toBe(false);
  });

  it('isolates tenants', async () => {
    const s = new MemoryStore();
    await s.addWebhookEvent({ tenantId: 'a', provider: 'flutterwave', eventType: 'e', providerReference: 'r', signatureValid: true, payloadHash: 'h', payloadRedacted: {}, deliveryFingerprint: 'f1' });
    expect(await s.listWebhooksByReference('b', 'r')).toHaveLength(0);
    expect(await s.listWebhooksByReference('a', 'r')).toHaveLength(1);
  });
});
