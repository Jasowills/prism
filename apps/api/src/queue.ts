import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from './logging.js';

export interface JobEnvelope {
  name: string;
  data: Record<string, unknown>;
}

export interface PrismQueue {
  mode: 'bullmq' | 'inline';
  enqueue(name: string, data: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

let connection: Redis | null = null;
let queue: Queue | null = null;
const inlineHandlers = new Map<string, (data: Record<string, unknown>) => Promise<void>>();

export function registerInlineHandler(name: string, fn: (data: Record<string, unknown>) => Promise<void>): void {
  inlineHandlers.set(name, fn);
}

export async function getQueue(redisUrl?: string): Promise<PrismQueue> {
  if (queue && connection) {
    return {
      mode: 'bullmq',
      enqueue: async (name, data) => {
        await queue!.add(name, data, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        });
      },
      close: async () => {},
    };
  }
  if (redisUrl) {
    try {
      connection = new Redis(redisUrl, { maxRetriesPerRequest: 2, enableReadyCheck: true });
      await connection.ping();
      queue = new Queue('prism', { connection });
      logger.info({ mode: 'bullmq' }, 'queue connected');
      return {
        mode: 'bullmq',
        enqueue: async (name, data) => {
          await queue!.add(name, data, {
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          });
        },
        close: async () => {
          await queue?.close();
          connection?.disconnect();
        },
      };
    } catch (e) {
      logger.warn({ err: String(e) }, 'redis unavailable, falling back to inline queue');
      try {
        connection?.disconnect();
      } catch {
        /* ignore */
      }
      connection = null;
      queue = null;
    }
  }
  return {
    mode: 'inline',
    enqueue: async (name, data) => {
      const fn = inlineHandlers.get(name);
      if (fn) {
        // inline: process asynchronously but without Redis
        setImmediate(() => {
          fn(data).catch((e) => logger.error({ err: String(e), job: name }, 'inline job failed'));
        });
      } else {
        logger.debug({ job: name }, 'no inline handler; job acknowledged without processing');
      }
    },
    close: async () => {},
  };
}
