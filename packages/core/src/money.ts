/** Decimal-safe money utilities. Amounts are decimal strings with up to 6 places. */

const SCALE = 6;
const FACTOR = 10n ** BigInt(SCALE);

export function parseMoneyToMinor(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error(`invalid money: ${value}`);
  const [whole, fracRaw = ''] = value.split('.');
  const frac = (fracRaw + '000000').slice(0, SCALE);
  return BigInt(whole) * FACTOR + BigInt(frac);
}

export function formatMinorToMoney(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${frac ? `.${frac}` : '.00'}`;
}

export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const x = parseMoneyToMinor(a);
  const y = parseMoneyToMinor(b);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

export function moneyEquals(a: string, b: string): boolean {
  return compareMoney(a, b) === 0;
}

export function isPositiveMoney(value: string): boolean {
  try {
    return parseMoneyToMinor(value) > 0n;
  } catch {
    return false;
  }
}

export function normalizeMoney(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('invalid money number');
    // Round to 6dp via string to avoid float drift beyond 6dp
    return parseMoneyToMinor(value.toFixed(6)).toString() === '0'
      ? '0.00'
      : formatMinorToMoney(parseMoneyToMinor(value.toFixed(6)));
  }
  const minor = parseMoneyToMinor(value);
  const s = formatMinorToMoney(minor);
  return s;
}
