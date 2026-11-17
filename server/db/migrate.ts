import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDialect, toLibsqlUrl } from './dialect.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required.');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runPostgres(url: string) {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, 'migrations') });
  await pool.end();
}

async function runSqlite(url: string) {
  const fs = await import('node:fs');
  const { drizzle } = await import('drizzle-orm/libsql');
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const { createClient } = await import('@libsql/client');
  const libsqlUrl = toLibsqlUrl(url);
  // Create the database file's directory on first run (e.g. ./data/ in a fresh checkout).
  const filePath = libsqlUrl.startsWith('file:') ? libsqlUrl.slice('file:'.length).split('?')[0] : '';
  if (filePath && filePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const client = createClient({ url: libsqlUrl, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  await migrate(drizzle(client), { migrationsFolder: path.join(__dirname, 'migrations-sqlite') });
  client.close();
}

async function run() {
  if (resolveDialect(connectionString) === 'sqlite') await runSqlite(connectionString!);
  else await runPostgres(connectionString!);
  console.log('Migrations applied.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
