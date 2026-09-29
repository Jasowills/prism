import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { INestApplication } from '@nestjs/common';

const execFileAsync = promisify(execFile);
const PORT = 4109;
const CLI = new URL('../../apps/cli/dist/cli.js', import.meta.url).pathname;

async function cli(args: string[], env: Record<string, string>): Promise<string> {
  const { stdout } = await execFileAsync('node', [CLI, ...args], { env: { ...process.env, ...env } });
  return stdout;
}

/** CLI exercises only documented commands against a live (memory-store) API. */
describe('CLI smoke', () => {
  let app: INestApplication | null = null;

  beforeAll(async () => {
    // No PRISM_FORCE_MEMORY: Postgres when reachable, memory otherwise.
    process.env.PRISM_API_KEY = '';
    process.env.FLW_WEBHOOK_SECRET = 'test-secret';
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../../apps/api/src/app.module.js');
    const { json } = await import('express');
    const { PrismService } = await import('../../apps/api/src/prism.service.js');
    const application = await NestFactory.create(AppModule, { logger: false });
    application.use(json());
    await application.get(PrismService).init();
    await application.listen(PORT);
    app = application;
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('register-intent → verify → discrepancies', async () => {
    // Dedicated tenant: e2e files share one database and run in parallel.
    const env = { PRISM_API_URL: `http://localhost:${PORT}`, PRISM_TENANT_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const ref = `cli-${Date.now().toString(36)}`;
    const created = await cli(['register-intent', '--reference', ref, '--amount', '42.50', '--currency', 'NGN'], env);
    expect(created).toContain(ref);
    const verified = await cli(['verify', ref], env);
    expect(verified).toContain(ref);
    // Intent only, no provider/ledger evidence → UNVERIFIED, no findings yet.
    expect(verified).toContain('UNVERIFIED');
    const discs = await cli(['discrepancies'], env);
    expect(discs).toContain('[]');
  }, 60000);
});
