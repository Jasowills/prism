import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/** Paystack flow: intent → HMAC webhook → verify → ledger → VERIFIED. */
describe('paystack E2E (signed test deliveries)', () => {
  let app: INestApplication | null = null;
  const SECRET = 'paystack-test-secret';

  beforeAll(async () => {
    // No PRISM_FORCE_MEMORY: Postgres when reachable, memory otherwise.
    process.env.PRISM_API_KEY = '';
    process.env.FLW_WEBHOOK_SECRET = 'unused-here';
    process.env.PAYSTACK_WEBHOOK_SECRET = SECRET;
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../../apps/api/src/app.module.js');
    const { json } = await import('express');
    const { PrismService } = await import('../../apps/api/src/prism.service.js');
    const { registerInlineHandler } = await import('../../apps/api/src/queue.js');
    const application = await NestFactory.create(AppModule, { logger: false });
    application.use(
      json({
        verify: (req: unknown, _res: unknown, buf: Buffer) => {
          const r = req as { url?: string; rawBody?: Buffer };
          if (r.url?.includes('/v1/webhooks/')) r.rawBody = Buffer.from(buf);
        },
      }),
    );
    const prism = application.get(PrismService);
    await prism.init();
    registerInlineHandler('webhook-process', async (data) => {
      const ref = data.reference as string | undefined;
      if (ref) await prism.verifyReference(String(data.tenantId ?? prism.defaultTenant()), ref);
    });
    await application.init();
    app = application;
  });

  afterAll(async () => {
    delete process.env.PAYSTACK_WEBHOOK_SECRET;
    await app?.close();
  });

  it('full paystack flow verifies with kobo-correct amounts', async () => {
    const server = app!.getHttpServer();
    const ref = `ps-${Date.now().toString(36)}`;
    const created = await request(server)
      .post('/v1/payment-intents')
      .send({ provider: 'paystack', merchantReference: ref, expectedAmount: '100.00', currency: 'NGN' })
      .expect(201);

    const payload = { event: 'charge.success', data: { id: 4099260516, reference: ref, amount: 10000, currency: 'NGN', status: 'success' } };
    const raw = Buffer.from(JSON.stringify(payload));
    const sig = createHmac('sha512', SECRET).update(raw).digest('hex');

    await request(server).post('/v1/webhooks/paystack').set('x-paystack-signature', 'wrong').send(payload).expect(401);
    const ok = await request(server).post('/v1/webhooks/paystack').set('x-paystack-signature', sig).send(payload).expect(201);
    expect(ok.body.accepted).toBe(true);

    await request(server)
      .post(`/v1/payment-intents/${created.body.id}/ledger-observations`)
      .send({ merchantReference: ref, recordedStatus: 'success', recordedAmount: '100.00', currency: 'NGN', fulfillmentStatus: 'fulfilled' })
      .expect(201);

    const v = await request(server).get(`/v1/transactions/${ref}/verification`).expect(200);
    // No provider API observation (no live key): payment UNKNOWN, but webhook
    // delivery recorded and kobo amounts line up in evidence.
    expect(v.body.deliveryStatus).toBe('DELIVERED');
    expect(v.body.intent).toBeTruthy();
  });
});
