import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module.js';
import { PrismService } from './prism.service.js';
import { logger, metrics } from './logging.js';
import { registerInlineHandler } from './queue.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  // Raw-body capture for webhook signature verification (spec §2/§9).
  // JSON parser preserves raw buffer on req.rawBody for the webhook route only.
  app.use(
    json({
      limit: '1mb',
      verify: (req: unknown, _res: unknown, buf: Buffer) => {
        const r = req as { url?: string; rawBody?: Buffer };
        if (r.url?.includes('/v1/webhooks/')) r.rawBody = Buffer.from(buf);
      },
    }),
  );

  app.enableCors();
  // Basic rate limiting (in-memory, per-IP sliding window) for abuse protection.
  const hits = new Map<string, number[]>();
  app.use((req: { ip?: string; path: string }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    metrics.httpRequests++;
    if (req.path.startsWith('/v1/webhooks/')) {
      const ip = req.ip ?? 'unknown';
      const now = Date.now();
      const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
      arr.push(now);
      hits.set(ip, arr);
      if (arr.length > 120) {
        metrics.httpErrors++;
        res.status(429).json({ error: 'rate limited' });
        return;
      }
    }
    next();
  });

  const prism = app.get(PrismService);
  await prism.init();

  // Inline job handlers (used when Redis is unavailable).
  registerInlineHandler('webhook-process', async (data) => {
    const ref = data.reference as string | undefined;
    const tenant = (data.tenantId as string | undefined) ?? prism.defaultTenant();
    if (ref) await prism.verifyReference(tenant, ref);
  });
  registerInlineHandler('reconciliation-run', async () => {
    /* discovery already executed inline in service; nothing extra */
  });

  const port = Number(process.env.PRISM_API_PORT ?? 4100);
  await app.listen(port);
  logger.info({ port, store: prism.storeKind }, 'PRISM API listening');
}

bootstrap().catch((e) => {
  logger.error({ err: String(e) }, 'bootstrap failed');
  process.exit(1);
});
