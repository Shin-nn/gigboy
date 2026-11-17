/**
 * Which database backend DATABASE_URL points at. Kept dependency-free so schema.ts, client.ts,
 * migrate.ts and drizzle.config.ts can all share it.
 *
 *   postgres://… / postgresql://…        → PostgreSQL (node-postgres)
 *   file:./data/gigboy.db, sqlite:…, *.db → SQLite (libsql, local file)
 *   libsql://… (+ DATABASE_AUTH_TOKEN)    → SQLite (remote libsql / Turso)
 *
 * An unset DATABASE_URL resolves to PostgreSQL so tooling that never connects (tests that mock
 * the client, type-checks) keeps the historical default; the server itself still requires it.
 */
export type DbDialect = 'postgresql' | 'sqlite';

const SQLITE_SCHEMES = /^(file|sqlite|libsql):/i;
const SQLITE_EXTENSIONS = /\.(db|sqlite|sqlite3)$/i;

export function resolveDialect(url: string | undefined = process.env.DATABASE_URL): DbDialect {
  if (!url) return 'postgresql';
  if (SQLITE_SCHEMES.test(url) || SQLITE_EXTENSIONS.test(url) || url === ':memory:') return 'sqlite';
  return 'postgresql';
}

/** Normalizes a SQLite DATABASE_URL into the form @libsql/client accepts (`file:…` or `libsql://…`). */
export function toLibsqlUrl(url: string): string {
  if (/^libsql:/i.test(url) || /^file:/i.test(url)) return url;
  if (url === ':memory:') return 'file::memory:';
  if (/^sqlite:/i.test(url)) return `file:${url.replace(/^sqlite:(\/\/)?/i, '')}`;
  return `file:${url}`;
}
