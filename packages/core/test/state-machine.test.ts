import { describe, expect, it } from 'vitest';
import { canTransition, mapProviderStatus } from '../src/state-machine.js';

describe('state machine', () => {
  it('allows valid lifecycle transitions', () => {
    expect(canTransition('CREATED', 'PENDING')).toBe(true);
    expect(canTransition('PENDING', 'SUCCESSFUL')).toBe(true);
    expect(canTransition('SUCCESSFUL', 'REFUNDED')).toBe(true);
    expect(canTransition('SUCCESSFUL', 'REVERSED')).toBe(true);
  });
  it('rejects invalid regressions', () => {
    expect(canTransition('SUCCESSFUL', 'PENDING')).toBe(false);
    expect(canTransition('REFUNDED', 'SUCCESSFUL')).toBe(false);
    expect(canTransition('FAILED', 'SUCCESSFUL')).toBe(false);
  });
  it('treats repeat events as idempotent', () => {
    expect(canTransition('SUCCESSFUL', 'SUCCESSFUL')).toBe(true);
  });
  it('maps provider statuses', () => {
    expect(mapProviderStatus('successful')).toBe('SUCCESSFUL');
    expect(mapProviderStatus('SUCCESSFUL')).toBe('SUCCESSFUL');
    expect(mapProviderStatus('pending')).toBe('PENDING');
    expect(mapProviderStatus('failed')).toBe('FAILED');
    expect(mapProviderStatus('cancelled')).toBe('CANCELLED');
    expect(mapProviderStatus('weird-unknown-xyz')).toBeNull();
  });
});
