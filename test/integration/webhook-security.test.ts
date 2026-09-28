import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhook } from '../../packages/provider-flutterwave/src/index.js';

describe('webhook verification', () => {
  const secret = 'test-secret-hash';
  const payload = { event: 'charge.completed', data: { id: 123, tx_ref: 'ref-1', amount: 100, currency: 'NGN', status: 'successful' } };
  const raw = Buffer.from(JSON.stringify(payload));

  it('accepts static verif-hash', async () => {
    const r = await verifyWebhook(raw, { 'verif-hash': secret }, secret);
    expect(r.valid).toBe(true);
    expect(r.mechanism).toBe('verif-hash');
    expect(r.providerReference).toBe('ref-1');
  });

  it('accepts HMAC flutterwave-signature (base64)', async () => {
    const sig = createHmac('sha256', secret).update(raw).digest('base64');
    const r = await verifyWebhook(raw, { 'flutterwave-signature': sig }, secret);
    expect(r.valid).toBe(true);
    expect(r.mechanism).toBe('hmac-sha256');
  });

  it('rejects invalid signature and unsigned', async () => {
    expect((await verifyWebhook(raw, { 'verif-hash': 'wrong' }, secret)).valid).toBe(false);
    expect((await verifyWebhook(raw, {}, secret)).valid).toBe(false);
  });
});
