import { z } from 'zod';

/** Decimal money as string, e.g. "100.00". Never float. */
export const moneyString = z.string().regex(/^\d+(\.\d{1,6})?$/, 'must be decimal string');
export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'must be ISO 4217 code');

export const createIntentSchema = z.object({
  tenantId: z.string().uuid().optional(),
  provider: z.string().default('flutterwave'),
  merchantReference: z.string().min(1).max(128),
  expectedAmount: moneyString,
  currency: currencyCode,
  expectedCustomer: z.record(z.unknown()).optional(),
  expectedMetadata: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const ledgerObservationSchema = z.object({
  merchantReference: z.string().min(1),
  recordedStatus: z.string().min(1),
  recordedAmount: moneyString.optional(),
  currency: currencyCode.optional(),
  fulfillmentStatus: z.string().optional(),
  source: z.string().default('merchant-api'),
});

export const reconciliationRunSchema = z.object({
  tenantId: z.string().uuid().optional(),
  provider: z.string().default('flutterwave'),
  windowFrom: z.string().datetime(),
  windowTo: z.string().datetime(),
  graceMinutes: z.number().int().min(0).max(1440).default(15),
});

export type CreateIntentInput = z.infer<typeof createIntentSchema>;
export type LedgerObservationInput = z.infer<typeof ledgerObservationSchema>;
export type ReconciliationRunInput = z.infer<typeof reconciliationRunSchema>;
