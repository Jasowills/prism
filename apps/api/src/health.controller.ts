import { Controller, Get, Inject } from '@nestjs/common';
import { PrismService } from './prism.service.js';
import { renderMetrics } from './logging.js';

@Controller()
export class HealthController {
  constructor(@Inject(PrismService) private prism: PrismService) {}

  @Get('health/live')
  live() {
    return { status: 'ok', service: 'prism-api' };
  }

  @Get('health/ready')
  async ready() {
    // Readiness reflects required dependencies (DB). Liveness must not fail on provider outage.
    let store: string = this.prism.storeKind;
    let ready = true;
    try {
      await this.prism.store.listDiscrepancies(this.prism.defaultTenant());
    } catch {
      ready = false;
      store = `${store}-unreachable`;
    }
    return { ready, store, queue: process.env.REDIS_URL ? 'configured' : 'inline' };
  }

  @Get('health/dependencies')
  async deps() {
    const out: Record<string, unknown> = { store: this.prism.storeKind, redis: null, provider: null };
    if (process.env.REDIS_URL) {
      try {
        const { Redis } = await import('ioredis');
        const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
        await r.ping();
        out.redis = 'ok';
        r.disconnect();
      } catch (e) {
        out.redis = `unreachable: ${String(e).slice(0, 120)}`;
      }
    } else {
      out.redis = 'not-configured (inline queue)';
    }
    out.provider = this.prism.flw ? 'configured' : 'not-configured (local evidence only)';
    return out;
  }

  @Get('metrics')
  metrics() {
    return renderMetrics();
  }

  @Get('v1/openapi.json')
  openapi() {
    return {
      openapi: '3.0.0',
      info: { title: 'PRISM API', version: '0.1.0' },
      paths: {
        '/v1/payment-intents': { post: { summary: 'Register expected payment intent' } },
        '/v1/payment-intents/{id}/ledger-observations': { post: { summary: 'Record merchant ledger observation' } },
        '/v1/webhooks/flutterwave': { post: { summary: 'Flutterwave webhook receiver' } },
        '/v1/transactions/{reference}/verification': { get: { summary: 'Verify + reconcile a reference' } },
        '/v1/reconciliation-runs': { post: { summary: 'Start discovery reconciliation' } },
        '/v1/reconciliation-runs/{id}': { get: { summary: 'Get run status' } },
        '/v1/discrepancies': { get: { summary: 'List discrepancies' } },
        '/v1/discrepancies/{id}/resolutions': { post: { summary: 'Resolve discrepancy (append-only)' } },
      },
    };
  }
}
