import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiTokens } from '../db/schema.js';

type ApiTokenRow = typeof apiTokens.$inferSelect;

/** Recognizable prefix so leaked tokens are easy to grep for (and for secret scanners). */
const TOKEN_PREFIX = 'gbt_';
/** lastUsedAt is bookkeeping, not an audit log — don't write it on every MCP request. */
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateApiToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function apiTokenToApi(row: ApiTokenRow) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

/** Creates a token for `userId`. The plaintext is only ever returned here — the DB keeps a hash. */
export async function createApiToken(userId: string, name: string, expiresAt: Date | null) {
  const token = generateApiToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      id: crypto.randomUUID(),
      userId,
      name,
      tokenHash: hashApiToken(token),
      tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6),
      expiresAt,
    })
    .returning();
  return { token, apiToken: apiTokenToApi(row) };
}

/** Resolves a bearer token to its user id, or null if unknown/expired. Touches lastUsedAt. */
export async function resolveApiToken(token: string): Promise<string | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hashApiToken(token))).limit(1);
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt && row.expiresAt.getTime() <= now) return null;
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    db.update(apiTokens)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(apiTokens.id, row.id))
      .catch((err) => console.error('Failed to update API token lastUsedAt:', err));
  }
  return row.userId;
}
