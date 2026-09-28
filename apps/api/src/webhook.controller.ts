import { Controller, Headers, HttpException, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PrismService } from './prism.service.js';
import { getQueue } from './queue.js';
import { metrics, logger } from './logging.js';

/**
 * Flutterwave webhook endpoint.
 * Reads the RAW body (wired in main.ts), verifies signature, durably persists
 * evidence, enqueues background processing, and only then returns 200.
 * Never ack when persistence fails.
 */
@Controller('v1/webhooks')
export class WebhookController {
  constructor(@Inject(PrismService) private prism: PrismService) {}

  @Post('flutterwave')
  async handle(@Req() req: Request, @Headers() headers: Record<string, string>) {
    metrics.httpRequests++;
    const raw: Buffer = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const tenantId =
      (req.headers['x-tenant-id'] as string | undefined) ??
      (req.query.tenant_id as string | undefined) ??
      '00000000-0000-0000-0000-000000000001';
    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0]! : (v as string);
    // Express lowercases incoming headers already; also forward test header.
    if (req.headers['x-prism-test']) lowerHeaders['x-prism-test'] = String(req.headers['x-prism-test']);

    try {
      const { row, duplicate } = await this.prism.ingestWebhook(tenantId, raw, lowerHeaders);
      metrics.webhookReceived++;
      if (duplicate) metrics.webhookDuplicates++;
      try {
        const q = await getQueue(process.env.REDIS_URL);
        await q.enqueue('webhook-process', {
          webhookId: row.id,
          tenantId,
          reference: row.providerReference,
        });
      } catch (e) {
        logger.warn({ err: String(e) }, 'enqueue failed (non-fatal; evidence already durable)');
      }
      return { accepted: true, id: row.id, duplicate };
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      metrics.webhookRejected++;
      metrics.httpErrors++;
      const status = err?.status ?? 400;
      throw new HttpException({ error: err?.message ?? 'webhook rejected', code: 'WEBHOOK_REJECTED' }, status);
    }
  }
}
