import { PostgresStore } from './postgres.js';

const url = process.env.DATABASE_URL ?? 'postgresql://prism:prism@localhost:5433/prism';
const store = PostgresStore.fromUrl(url);
await store.migrate();
console.log('migrations applied');
await store.close();
