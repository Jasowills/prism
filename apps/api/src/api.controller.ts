import { Body, Controller, Get, HttpException, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createIntentSchema, ledgerObservationSchema, reconciliationRunSchema } from '@prism/contracts';
import { PrismService } from './prism.service.js';
import { ApiKeyGuard } from './auth.guard.js';
import { getQueue } from './queue.js';
import { metrics } from './logging.js';

function tenantOf(req: Request, body?: { tenantId?: string }): string {
  const q = req.query.tenant_id as string | undefined;
  const h = req.headers['x-tenant-id'] as string | undefined;
  return body?.tenantId ?? q ?? h ?? '00000000-0000-0000-0000-000000000001';
}

@Controller('v1')
export class ApiController {
  constructor(@Inject(PrismService) private prism: PrismService) {}

  @Post('payment-intents')
  @UseGuards(ApiKeyGuard)
  async createIntent(@Body() body: unknown, @Req() req: Request) {
    const parsed = createIntentSchema.safeParse(body);
    if (!parsed.success) throw new HttpException({ error: 'invalid input', details: parsed.error.issues }, 400);
    const p = parsed.data;
    try {
      const row = await this.prism.createIntent({
        tenantId: p.tenantId ?? tenantOf(req),
        provider: p.provider,
        merchantReference: p.merchantReference,
        expectedAmount: p.expectedAmount,
        currency: p.currency,
        expectedCustomer: p.expectedCustomer,
        expectedMetadata: p.expectedMetadata,
        expiresAt: p.expiresAt,
      });
      return { id: row.id, merchantReference: row.merchantReference, expectedAmount: row.expectedAmount, currency: row.currency };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'DUPLICATE_INTENT') {
        throw new HttpException({ error: 'duplicate intent', code: 'DUPLICATE_INTENT' }, 409);
      }
      throw e;
    }
  }

  @Post('payment-intents/:id/ledger-observations')
  @UseGuards(ApiKeyGuard)
  async addLedger(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = ledgerObservationSchema.safeParse(body);
    if (!parsed.success) throw new HttpException({ error: 'invalid input', details: parsed.error.issues }, 400);
    const intent = await this.prism.store.getIntentById(id);
    if (!intent) throw new HttpException({ error: 'intent not found' }, 404);
    const p = parsed.data;
    const row = await this.prism.store.addLedgerObservation({
      tenantId: intent.tenantId,
      paymentIntentId: intent.id,
      merchantReference: p.merchantReference,
      recordedStatus: p.recordedStatus,
      recordedAmount: p.recordedAmount ?? null,
      currency: p.currency ?? null,
      fulfillmentStatus: p.fulfillmentStatus ?? null,
      source: p.source,
    });
    void req;
    return { id: row.id, observedAt: row.observedAt };
  }

  @Get('transactions/:reference/verification')
  @UseGuards(ApiKeyGuard)
  async verify(@Param('reference') reference: string, @Req() req: Request, @Query('live') live?: string) {
    metrics.verifications++;
    const tenantId = tenantOf(req);
    const { intent, verification } = await this.prism.verifyReference(tenantId, reference, {
      liveVerify: live === 'true',
    });
    return {
      reference,
      intent: intent
        ? { id: intent.id, expectedAmount: intent.expectedAmount, currency: intent.currency }
        : null,
      ...verification,
    };
  }

  @Post('reconciliation-runs')
  @UseGuards(ApiKeyGuard)
  async createRun(@Body() body: unknown, @Req() req: Request) {
    const parsed = reconciliationRunSchema.safeParse(body);
    if (!parsed.success) throw new HttpException({ error: 'invalid input', details: parsed.error.issues }, 400);
    metrics.reconciliationRuns++;
    const tenantId = parsed.data.tenantId ?? tenantOf(req);
    const run = await this.prism.runDiscovery(tenantId, parsed.data.windowFrom, parsed.data.windowTo);
    // enqueue background follow-up (idempotent; safe to re-run)
    try {
      const q = await getQueue(process.env.REDIS_URL);
      await q.enqueue('reconciliation-run', { runId: run.id, tenantId });
    } catch {
      /* non-fatal */
    }
    return run;
  }

  @Get('reconciliation-runs/:id')
  @UseGuards(ApiKeyGuard)
  async getRun(@Param('id') id: string) {
    const run = await this.prism.store.getRun(id);
    if (!run) throw new HttpException({ error: 'run not found' }, 404);
    return run;
  }

  @Get('discrepancies')
  @UseGuards(ApiKeyGuard)
  async listDiscrepancies(@Req() req: Request, @Query('status') status?: string) {
    return this.prism.store.listDiscrepancies(tenantOf(req), status);
  }

  @Post('discrepancies/:id/resolutions')
  @UseGuards(ApiKeyGuard)
  async resolve(@Param('id') id: string, @Body() body: { reason?: string; actor?: string }) {
    if (!body?.reason) throw new HttpException({ error: 'reason required' }, 400);
    try {
      return await this.prism.store.resolveDiscrepancy(id, body.reason, body.actor ?? 'operator');
    } catch {
      throw new HttpException({ error: 'discrepancy not found' }, 404);
    }
  }
}
