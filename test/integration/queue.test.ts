import { describe, expect, it } from 'vitest';

/** BullMQ round-trip on real Redis when reachable; SKIP (not fail) otherwise. */
describe('queue (bullmq on redis)', () => {
  it('enqueues and processes a job', async () => {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6380';
    let RedisCtor: typeof import('ioredis').Redis;
    try {
      ({ Redis: RedisCtor } = await import('ioredis'));
    } catch {
      console.log('SKIP queue test: ioredis unavailable');
      return;
    }
    const probe = new RedisCtor(url, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
    try {
      await probe.ping();
    } catch {
      console.log('SKIP queue test: redis unreachable');
      probe.disconnect();
      return;
    }
    probe.disconnect();

    const { Queue, Worker } = await import('bullmq');
    const connection = new RedisCtor(url, { maxRetriesPerRequest: null });
    const workerConn = new RedisCtor(url, { maxRetriesPerRequest: null });
    const name = `prism-test-${Date.now().toString(36)}`;
    const queue = new Queue(name, { connection });
    let worker: import('bullmq').Worker | null = null;
    const done = new Promise<string>((resolve, reject) => {
      worker = new Worker(
        name,
        async (job) => {
          resolve(String((job.data as Record<string, unknown>).reference ?? ''));
        },
        { connection: workerConn },
      );
      worker.on('failed', (job, err) => reject(new Error(`job ${job?.id} failed: ${String(err)}`)));
      setTimeout(() => reject(new Error('queue round-trip timeout')), 20000);
    });
    await queue.add('webhook-process', { reference: 'q-ref-1' }, { attempts: 2 });
    expect(await done).toBe('q-ref-1');
    await worker?.close();
    await queue.close();
    connection.disconnect();
    workerConn.disconnect();
  }, 30000);
});
