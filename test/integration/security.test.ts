import { describe, expect, it } from 'vitest';
import { redactDeep } from '../../packages/database/src/redact.js';
import { MemoryStore } from '../../packages/database/src/memory.js';

describe('security', () => {
  it('redacts PANs and secrets from payloads and logs', () => {
    const out = redactDeep({ card_number: '4111111111111111', nested: { cvv: '123' }, note: 'card 4111 1111 1111 1111 here' }) as Record<string, unknown>;
    expect(out.card_number).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).cvv).toBe('[REDACTED]');
    expect(out.note).toBe('[REDACTED_PAN]');
  });

  it('tenant isolation: no cross-tenant reads', async () => {
    const s = new MemoryStore();
    await s.createIntent({ tenantId: 'tenant-a', provider: 'flutterwave', merchantReference: 'shared-ref', expectedAmount: '10.00', currency: 'NGN' });
    expect(await s.getIntentByReference('tenant-b', 'flutterwave', 'shared-ref')).toBeNull();
  });

  it('evidence is append-only (no update/delete API)', async () => {
    const s = new MemoryStore();
    const w = await s.addWebhookEvent({ tenantId: 't', provider: 'flutterwave', eventType: 'e', signatureValid: true, payloadHash: 'h', payloadRedacted: {}, deliveryFingerprint: 'f' });
    expect(typeof (s as unknown as Record<string, unknown>).updateWebhookEvent).toBe('undefined');
    expect(w.id).toBeTruthy();
  });
});
