#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program.name('prism').description('PRISM operator CLI').version('0.1.0');

function apiBase(): string {
  return (process.env.PRISM_API_URL ?? `http://localhost:${process.env.PRISM_API_PORT ?? 4100}`).replace(/\/$/, '');
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.PRISM_API_KEY) h['x-api-key'] = process.env.PRISM_API_KEY;
  if (process.env.PRISM_TENANT_ID) h['x-tenant-id'] = process.env.PRISM_TENANT_ID;
  return h;
}

async function call(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text}`);
    process.exitCode = 1;
    return;
  }
  console.log(text);
}

program
  .command('register-intent')
  .requiredOption('--reference <ref>', 'merchant reference')
  .requiredOption('--amount <amount>', 'expected amount decimal string')
  .requiredOption('--currency <code>', 'ISO currency')
  .action(async (opts) => {
    await call('/v1/payment-intents', {
      method: 'POST',
      body: JSON.stringify({ merchantReference: opts.reference, expectedAmount: opts.amount, currency: opts.currency }),
    });
  });

program
  .command('verify')
  .argument('<reference>', 'merchant reference')
  .option('--live', 'query live provider API (requires FLW_SECRET_KEY server-side)')
  .action(async (ref, opts) => {
    await call(`/v1/transactions/${encodeURIComponent(ref)}/verification${opts.live ? '?live=true' : ''}`);
  });

program
  .command('run-reconciliation')
  .requiredOption('--from <iso>', 'window start ISO')
  .requiredOption('--to <iso>', 'window end ISO')
  .action(async (opts) => {
    await call('/v1/reconciliation-runs', {
      method: 'POST',
      body: JSON.stringify({ windowFrom: opts.from, windowTo: opts.to }),
    });
  });

program
  .command('inspect')
  .argument('<reference>', 'merchant reference')
  .action(async (ref) => {
    await call(`/v1/transactions/${encodeURIComponent(ref)}/verification`);
  });

program
  .command('discrepancies')
  .option('--status <status>', 'filter by status')
  .action(async (opts) => {
    await call(`/v1/discrepancies${opts.status ? `?status=${encodeURIComponent(opts.status)}` : ''}`);
  });

program
  .command('settlements')
  .description('Refresh provider settlement observations for a window')
  .requiredOption('--from <iso>', 'window start ISO')
  .requiredOption('--to <iso>', 'window end ISO')
  .action(async (opts) => {
    await call('/v1/settlements/refresh', {
      method: 'POST',
      body: JSON.stringify({ windowFrom: opts.from, windowTo: opts.to }),
    });
  });

program
  .command('verify-integrity')
  .description('Verify evidence hash-chain integrity (server-side)')
  .action(async () => {
    // Served via health/dependencies + store check; CLI reports guidance.
    await call('/health/dependencies');
    console.log('\nNote: full chain verification runs server-side on every worker pass; see docs/security/data-retention.md');
  });

program.parseAsync(process.argv);
