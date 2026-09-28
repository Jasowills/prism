import { createHash } from 'node:crypto';

const SENSITIVE_KEYS = new Set([
  'card',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'pin',
  'otp',
  'account_number',
  'authorization',
  'secret',
  'secret_key',
  'flw_secret',
]);

export function redactDeep(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // mask long digit runs (potential PAN)
    if (/\d{12,19}/.test(value.replace(/[\s-]/g, ''))) return '[REDACTED_PAN]';
    return value;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) out[k] = '[REDACTED]';
    else out[k] = redactDeep(v, seen);
  }
  return out;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
