import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiTokens } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { apiTokenToApi, createApiToken } from '../lib/apiTokens.js';

const MAX_TOKENS_PER_USER = 20;
const MAX_EXPIRY_DAYS = 3650;

/**
 * Personal API tokens (used to connect MCP clients to /mcp). Managed with the session cookie
 * only — a token can't mint or list other tokens, since /mcp is the only place tokens are accepted.
 */
export const apiTokensRouter = Router();
apiTokensRouter.use(requireAuth);

apiTokensRouter.get('/', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, req.userId!))
      .orderBy(desc(apiTokens.createdAt));
    res.json({ apiTokens: rows.map(apiTokenToApi) });
  } catch (err) {
    console.error('Failed to list API tokens:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

apiTokensRouter.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name) {
      res.status(400).json({ error: 'name is required.' });
      return;
    }
    let expiresAt: Date | null = null;
    if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
      const days = Number(body.expiresInDays);
      if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
        res.status(400).json({ error: `expiresInDays must be a whole number between 1 and ${MAX_EXPIRY_DAYS}.` });
        return;
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }
    const existing = await db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.userId, req.userId!));
    if (existing.length >= MAX_TOKENS_PER_USER) {
      res.status(400).json({ error: `You can have at most ${MAX_TOKENS_PER_USER} API tokens. Revoke one first.` });
      return;
    }
    res.json(await createApiToken(req.userId!, name, expiresAt));
  } catch (err) {
    console.error('Failed to create API token:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

apiTokensRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, req.params.id), eq(apiTokens.userId, req.userId!)))
      .returning({ id: apiTokens.id });
    if (!deleted[0]) {
      res.status(404).json({ error: 'API token not found.' });
      return;
    }
    res.json({});
  } catch (err) {
    console.error('Failed to revoke API token:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
