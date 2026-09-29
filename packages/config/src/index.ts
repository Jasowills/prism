import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://prism:prism@localhost:5433/prism'),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  PRISM_API_PORT: z.coerce.number().default(4100),
  PRISM_WEBHOOK_PORT: z.coerce.number().default(4101),
  FLW_SECRET_KEY: z.string().default(''),
  FLW_PUBLIC_KEY: z.string().default(''),
  FLW_WEBHOOK_SECRET: z.string().default(''),
  FLW_API_VERSION: z.string().default('v3'),
  FLW_BASE_URL: z.string().default('https://api.flutterwave.com/v3'),
  PAYSTACK_SECRET_KEY: z.string().default(''),
  PAYSTACK_WEBHOOK_SECRET: z.string().default(''),
  PAYSTACK_BASE_URL: z.string().default('https://api.paystack.co'),
  PRISM_ENCRYPTION_KEY: z.string().default(''),
  PRISM_API_KEY: z.string().default(''),
  PRISM_TEST_MODE: z.coerce.boolean().default(true),
  PRISM_ALLOW_TEST_WEBHOOKS: z.coerce.boolean().default(true),
  PRISM_WEBHOOK_GRACE_MINUTES: z.coerce.number().default(15),
  PRISM_TENANT_ID: z.string().default('00000000-0000-0000-0000-000000000001'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type PrismConfig = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): PrismConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid PRISM configuration: ${details}`);
  }
  return parsed.data;
}

export function hasProviderCredentials(cfg: PrismConfig): boolean {
  return cfg.FLW_SECRET_KEY.length > 0;
}
