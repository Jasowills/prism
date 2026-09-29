import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/**
 * HTTP load budget: 200 intents + 400 webhook deliveries (50% duplicates)
 * against an in-memory API must complete within budget with zero false acks.
 * Run via `pnpm test:load` (not part of the default suites).
 */
describe('webhook throughput', () => {
  let app: INestApplication | null = null;

  beforeAll(async () => {
    process.env.PRISM_FORCE_MEMORY = '1';
    process.env.PRISM_API_KEY = '';
    process.env.FLW_WEBHOOK_SECRET = 'load-secret';
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../../apps/api/src/app.module.js');
    const { json } = await import('express');
    const { PrismService } = await import('../../apps/api/src/prism.service.js');
    const application = await NestFactory.create(AppModule, { logger: false });
    application.use(
      json({
        verify: (req: unknown, _res: unknown, buf: Buffer) => {
          const r = req as { url?: string; rawBody?: Buffer };
          if (r.url?.includes('/v1/webhooks/')) r.rawBody = Buffer.from(buf);
        },
      }),
    );
    await application.get(PrismService).init();
    await application.init();
    app = application;
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('handles 600 requests within budget', async () => {
    const server = app!.getHttpServer();
    const N = 200;
    const refs = Array.from({ length: N }, (_, i) => `load-${Date.now().toString(36)}-${i}`);
    const t0 = Date.now();
    await Promise.all(
      refs.map((ref) =>
        request(server).post('/v1/payment-intents').send({ merchantReference: ref, expectedAmount: '10.00', currency: 'NGN' }).expect(201),
      ),
    );
    const payloads = refs.flatMap((ref, i) => [
      { event: 'charge.completed', data: { id: 100000 + i, tx_ref: ref, amount: 10, currency: 'NGN', status: 'successful' } },
      { event: 'charge.completed', data: { id: 100000 + i, tx_ref: ref, amount: 10, currency: 'NGN', status: 'successful' } },
    ]);
    let accepted = 0;
    let dups = 0;
    await Promise.all(
      payloads.map((p) =>
        request(server)
          .post('/v1/webhooks/flutterwave')
          .set('verif-hash', 'load-secret')
          .send(p)
          .expect(201)
          .then((r) => {
            accepted++;
            if (r.body.duplicate) dups++;
          }),
      ),
    );
    const ms = Date.now() - t0;
    console.log(`600 requests in ${ms}ms (${(600000 / ms).toFixed(0)} req/s), duplicates=${dups}`);
    expect(accepted).toBe(2 * N);
    expect(dups).toBe(N);
    expect(ms).toBeLessThan(60000);
  }, 120000);
});
