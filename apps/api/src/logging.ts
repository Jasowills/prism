import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      '*.secret',
      '*.secret_key',
      '*.card_number',
      '*.cvv',
      'FLW_SECRET_KEY',
      'FLW_WEBHOOK_SECRET',
    ],
    censor: '[REDACTED]',
  },
});

// Simple Prometheus-style counters (no extra dep).
export const metrics = {
  webhookReceived: 0,
  webhookRejected: 0,
  webhookDuplicates: 0,
  verifications: 0,
  reconciliationRuns: 0,
  httpRequests: 0,
  httpErrors: 0,
};

export function renderMetrics(): string {
  const lines = [
    '# HELP prism_webhooks_received Total accepted webhook deliveries',
    '# TYPE prism_webhooks_received counter',
    `prism_webhooks_received ${metrics.webhookReceived}`,
    '# HELP prism_webhooks_rejected Total rejected webhook deliveries',
    '# TYPE prism_webhooks_rejected counter',
    `prism_webhooks_rejected ${metrics.webhookRejected}`,
    '# HELP prism_webhook_duplicates Total duplicate deliveries observed',
    '# TYPE prism_webhook_duplicates counter',
    `prism_webhook_duplicates ${metrics.webhookDuplicates}`,
    '# HELP prism_verifications_total Total verification requests',
    '# TYPE prism_verifications_total counter',
    `prism_verifications_total ${metrics.verifications}`,
    '# HELP prism_reconciliation_runs_total Total reconciliation runs',
    '# TYPE prism_reconciliation_runs_total counter',
    `prism_reconciliation_runs_total ${metrics.reconciliationRuns}`,
  ];
  return lines.join('\n') + '\n';
}
