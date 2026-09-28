import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/**
 * Discovery against an unreachable provider must mark the run incomplete —
 * never falsely complete. Uses a dead-loopback base URL so no network or
 * credentials are needed.
 */
describe('discovery failure handling', () => {
  let app: INestApplication | null = null;

  beforeAll(async () => {
    process.env.PRISM_FORCE_MEMORY = '1';
    process.env.PRISM_API_KEY = '';
    process.env.FLW_WEBHOOK_SECRET = 'test-secret';
    process.env.FLW_SECRET_KEY = 'sk-test-unreachable';
    process.env.FLW_BASE_URL = 'http://127.0.0.1:9';
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../../apps/api/src/app.module.js');
    const { json } = await import('express');
    const { PrismService } = await import('../../apps/api/src/prism.service.js');
    const application = await NestFactory.create(AppModule, { logger: false });
    application.use(json());
    const prism = application.get(PrismService);
    await prism.init();
    expect(prism.flw).not.toBeNull();
    await application.init();
    app = application;
  }, 30000);

  afterAll(async () => {
    delete process.env.FLW_SECRET_KEY;
    delete process.env.FLW_BASE_URL;
    await app?.close();
  });

  it('marks the run incomplete when provider paging fails', async () => {
    const server = app!.getHttpServer();
    const res = await request(server)
      .post('/v1/reconciliation-runs')
      .send({ windowFrom: '2026-09-01T00:00:00.000Z', windowTo: '2026-09-02T00:00:00.000Z' })
      .expect(201);
    expect(res.body.status).toBe('incomplete');
    expect(res.body.errorSummary).toBeDefined();
  }, 60000);
});
