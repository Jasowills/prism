import { MemoryStore, PostgresStore, type EvidenceStore } from '../packages/database/src/index.js';

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function ensureDb(adminUrl: string, db: string): Promise<void> {
  const { Pool } = await import('../packages/database/node_modules/pg/lib/index.js');
  const pool = new Pool({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  try {
    // Quote identifier safely (suffix is sanitized by callers).
    await pool.query(`DROP DATABASE IF EXISTS "${db}"`);
    await pool.query(`CREATE DATABASE "${db}"`);
  } finally {
    await pool.end();
  }
}

/**
 * Shared test helper: open an evidence store backed by a dedicated,
 * freshly-created Postgres database when reachable (one per test file, so
 * parallel files never interfere), otherwise fall back to memory.
 */
export async function openTestStore(suffix = 'shared'): Promise<{
  store: EvidenceStore;
  kind: 'postgres' | 'memory';
  close: () => Promise<void>;
}> {
  if (process.env.PRISM_FORCE_MEMORY === '1') {
    const s = new MemoryStore();
    return { store: s, kind: 'memory', close: async () => {} };
  }
  const base = process.env.DATABASE_URL ?? 'postgresql://prism:prism@localhost:5433/prism';
  const safe = suffix.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'shared';
  const dbName = `prism_test_${safe}`;
  try {
    const admin = withDb(base, 'postgres');
    await Promise.race([
      ensureDb(admin, dbName),
      new Promise((_, reject) => setTimeout(() => reject(new Error('pg-connect-timeout')), 10000)),
    ]);
    const pg = PostgresStore.fromUrl(withDb(base, dbName));
    await pg.migrate();
    console.log(`test store: postgres (${dbName})`);
    return { store: pg, kind: 'postgres', close: async () => pg.close() };
  } catch (e) {
    console.log('test store: postgres unavailable, using memory:', String(e).slice(0, 200));
    const s = new MemoryStore();
    return { store: s, kind: 'memory', close: async () => {} };
  }
}
