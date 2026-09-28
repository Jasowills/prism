/** Deterministic fault-injection scenario config (spec §12). */
export interface FaultScenario {
  scenario: string;
  seed: number;
  webhook?: {
    dropFirst?: number;
    duplicateNext?: number;
    delayMs?: number;
    reorder?: boolean;
  };
  providerApi?: {
    timeoutFirst?: number;
    rateLimitFirst?: number;
    malformedFirst?: number;
  };
  worker?: {
    restartAfterCommit?: boolean;
    crashBeforeAck?: boolean;
  };
  infra?: {
    redisRestart?: boolean;
    postgresOutageMs?: number;
  };
}

export const PAYMENT_COMMITTED_ACK_LOST: FaultScenario = {
  scenario: 'payment-committed-ack-lost',
  seed: 42,
  webhook: { dropFirst: 1, duplicateNext: 2 },
  providerApi: { timeoutFirst: 1 },
  worker: { restartAfterCommit: true },
};

/** Seeded PRNG (mulberry32) for deterministic fault decisions. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function testReference(tag: string, seed = 42): string {
  return `prism-test-${tag}-${seed}-${Date.now().toString(36)}`;
}
