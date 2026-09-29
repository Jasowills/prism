import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OrderRecord {
  id: string;
  reference: string;
  amount: string;
  currency: string;
  email: string;
  status: string;
  fulfillmentCount: number;
  prismIntentId?: string;
  checkoutLink?: string;
  processedWebhooks: string[];
}

/** Order persistence: Postgres when reachable, otherwise in-memory. */
export class OrderStore {
  private memory = new Map<string, OrderRecord>();
  private pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ data: OrderRecord }> }> } | null = null;

  async init(): Promise<'postgres' | 'memory'> {
    const url = process.env.MERCHANT_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) return 'memory';
    try {
      const { Pool } = (await import('pg')) as typeof import('pg');
      const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
      await pool.query('SELECT 1');
      const here = dirname(fileURLToPath(import.meta.url));
      const sql = readFileSync(join(here, '../migrations/001_orders.sql'), 'utf8');
      await pool.query(sql);
      const rows = await pool.query('SELECT data FROM merchant_orders');
      for (const r of rows.rows) this.memory.set(r.data.reference, r.data);
      this.pool = pool as unknown as typeof this.pool;
      console.log(`merchant orders: postgres (${this.memory.size} loaded)`);
      return 'postgres';
    } catch (e) {
      console.log('merchant orders: memory fallback', String(e).slice(0, 120));
      return 'memory';
    }
  }

  all(): OrderRecord[] {
    return [...this.memory.values()];
  }

  get(ref: string): OrderRecord | undefined {
    return this.memory.get(ref);
  }

  async save(order: OrderRecord): Promise<void> {
    this.memory.set(order.reference, order);
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO merchant_orders (reference, data, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (reference) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [order.reference, JSON.stringify(order)],
      );
    }
  }
}
