import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { Pool } from 'pg';
import * as schema from './schema.js';
import * as sqliteSchema from './schema.sqlite.js';
import { resolveDialect, toLibsqlUrl } from './dialect.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required.');
}

export const dialect = resolveDialect(connectionString);

/**
 * Typed as the Postgres database so route code has one set of types; at runtime it's whichever
 * backend DATABASE_URL selects. Only use query-builder features both dialects support (select /
 * insert / update / delete, returning, onConflictDo*, async transactions) — no raw dialect SQL.
 */
export const db: NodePgDatabase<typeof schema> =
  dialect === 'sqlite' ? await openSqlite(connectionString) : drizzlePg(new Pool({ connectionString }), { schema });

async function openSqlite(url: string): Promise<NodePgDatabase<typeof schema>> {
  const client = createClient({
    url: toLibsqlUrl(url),
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    // Wait for a concurrent writer instead of failing immediately with SQLITE_BUSY.
    timeout: 5000,
  });
  if (!/^libsql:/i.test(url)) {
    // WAL lets readers proceed while a write is in progress; it's persistent per database file.
    // (foreign_keys is already on by default in libsql's SQLite build, on every pooled connection.)
    await client.execute('PRAGMA journal_mode = WAL').catch(() => undefined);
  }
  return drizzleLibsql(client, { schema: sqliteSchema }) as unknown as NodePgDatabase<typeof schema>;
}
