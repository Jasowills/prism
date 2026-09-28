import { describe, expect, it } from 'vitest';
import { compareMoney, isPositiveMoney, moneyEquals, normalizeMoney, parseMoneyToMinor } from '../src/money.js';

describe('money', () => {
  it('compares decimal strings without float error', () => {
    expect(moneyEquals('0.1', '0.10')).toBe(true);
    expect(compareMoney('0.1', '0.2')).toBe(-1);
    expect(compareMoney('100.00', '99.999999')).toBe(1);
  });
  it('rejects floats-style pitfalls', () => {
    // 0.1 + 0.2 !== 0.3 in float; decimal-safe must hold
    expect(moneyEquals('0.30', '0.3')).toBe(true);
    expect(parseMoneyToMinor('100.00')).toBe(100_000_000n);
  });
  it('validates positive amounts', () => {
    expect(isPositiveMoney('0.00')).toBe(false);
    expect(isPositiveMoney('10.50')).toBe(true);
    expect(isPositiveMoney('abc')).toBe(false);
  });
  it('normalizes numbers safely', () => {
    expect(normalizeMoney('100')).toBe('100.00');
    expect(normalizeMoney(100)).toBe('100.00');
  });
});
