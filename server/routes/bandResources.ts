import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import type { PgTableWithColumns, PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { insertTrashItem, type TrashItemType } from '../lib/trash.js';

interface BandCrudConfig<Row extends Record<string, unknown>, Api> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>;
  idColumn: PgColumn;
  bandIdColumn: PgColumn;
  resourceKey: string;
  pluralKey: string;
  /** Trash item type recorded when a row is soft-deleted (see Phase 5 trash_items). */
  itemType: TrashItemType;
  toApi: (row: Row) => Api;
  fromBody: (body: Record<string, unknown>, id: string, bandId: string) => Record<string, unknown>;
  /**
   * Optional side effect run after a successful create or update (e.g. record a revision
   * snapshot). Failures here are logged but never fail the write.
   */
  afterWrite?: (ctx: {
    kind: 'create' | 'update';
    row: Row;
    prevRow: Row | null;
    userId: string | null;
  }) => Promise<void>;
  /**
   * Optional side effect run before a row is deleted (e.g. clean up child files that a DB-level
   * cascade would otherwise strand on disk). Runs after the row is snapshotted to trash but
   * before the delete itself; a failure is logged but never blocks the delete.
   */
  beforeDelete?: (ctx: { row: Row; userId: string | null }) => Promise<void>;
}

export type SaveResult<Api> =
  | { ok: true; kind: 'create' | 'update'; value: Api }
  | { ok: false; reason: 'conflict' };

/**
 * Transport-independent CRUD over one band-scoped table. Callers are responsible for checking
 * the caller's band role first (the REST router does it with requireBandMember/Editor; the MCP
 * server with its own access check) — these functions only enforce that rows stay in `bandId`.
 */
export interface BandCrudService<Api> {
  resourceKey: string;
  pluralKey: string;
  list(bandId: string): Promise<Api[]>;
  get(bandId: string, id: string): Promise<Api | null>;
  /** Create-or-replace keyed on `id` (POST semantics). Refuses ids that belong to another band. */
  save(bandId: string, id: string, body: Record<string, unknown>, userId: string | null): Promise<SaveResult<Api>>;
  /** Full replace of an existing row (PUT semantics); null when it doesn't exist in this band. */
  update(bandId: string, id: string, body: Record<string, unknown>, userId: string | null): Promise<Api | null>;
  /** Snapshots to trash then deletes; false when it doesn't exist in this band. */
  remove(bandId: string, id: string, userId: string | null): Promise<boolean>;
}

export function createBandCrudService<Row extends { bandId: string | null }, Api>(
  config: BandCrudConfig<Row, Api>,
): BandCrudService<Api> {
  const { table, idColumn, bandIdColumn, resourceKey, pluralKey, itemType, toApi, fromBody, afterWrite, beforeDelete } =
    config;

  async function loadRow(bandId: string, id: string): Promise<Row | null> {
    const rows = (await db
      .select()
      .from(table)
      .where(and(eq(idColumn, id), eq(bandIdColumn, bandId)))
      .limit(1)) as Row[];
    return rows[0] ?? null;
  }

  async function runAfterWrite(ctx: Parameters<NonNullable<typeof afterWrite>>[0]): Promise<void> {
    if (!afterWrite) return;
    try {
      await afterWrite(ctx);
    } catch (err) {
      console.error('afterWrite hook failed:', err);
    }
  }

  return {
    resourceKey,
    pluralKey,

    async list(bandId) {
      const rows = (await db.select().from(table).where(eq(bandIdColumn, bandId))) as Row[];
      return rows.map(toApi);
    },

    async get(bandId, id) {
      const row = await loadRow(bandId, id);
      return row ? toApi(row) : null;
    },

    async save(bandId, id, body, userId) {
      // The upsert below keys on the primary `id` alone, so a caller supplying an id that
      // already belongs to another band would otherwise clobber (and reassign) that row.
      // Reject that here — editor role only authorizes writes within the caller's own band.
      const conflicting = (await db
        .select({ existingBandId: bandIdColumn })
        .from(table)
        .where(eq(idColumn, id))
        .limit(1)) as { existingBandId: string | null }[];
      if (conflicting[0] && conflicting[0].existingBandId !== bandId) {
        return { ok: false, reason: 'conflict' };
      }
      const prior = await loadRow(bandId, id);
      const values = fromBody(body, id, bandId);
      const [row] = (await db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({ target: idColumn, set: values })
        .returning()) as Row[];
      const kind = prior ? 'update' : 'create';
      await runAfterWrite({ kind, row, prevRow: prior, userId });
      return { ok: true, kind, value: toApi(row) };
    },

    async update(bandId, id, body, userId) {
      const existing = await loadRow(bandId, id);
      if (!existing) return null;
      const values = fromBody(body, id, bandId);
      const [row] = (await db.update(table).set(values).where(eq(idColumn, id)).returning()) as Row[];
      await runAfterWrite({ kind: 'update', row, prevRow: existing, userId });
      return toApi(row);
    },

    async remove(bandId, id, userId) {
      const existing = await loadRow(bandId, id);
      if (!existing) return false;
      await insertTrashItem({ bandId }, itemType, toApi(existing));
      if (beforeDelete) {
        try {
          await beforeDelete({ row: existing, userId });
        } catch (err) {
          console.error(`beforeDelete hook failed for band ${resourceKey}:`, err);
        }
      }
      await db.delete(table).where(eq(idColumn, id));
      return true;
    },
  };
}

/**
 * Builds a band-scoped CRUD router (list/create/update/delete) mounted at
 * `/api/bands/:bandId/<resource>`. Structurally mirrors `buildCrudRouter` in `crud.ts`
 * but checks band membership/editor role instead of personal ownership.
 */
export function buildBandCrudRouter<Api>(service: BandCrudService<Api>) {
  const { resourceKey, pluralKey } = service;
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  router.get('/', requireBandMember, async (req, res) => {
    try {
      res.json({ [pluralKey]: await service.list(req.params.bandId) });
    } catch (err) {
      console.error(`Failed to list band ${pluralKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.post('/', requireBandEditor, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = typeof body.id === 'string' && body.id ? body.id : null;
      if (!id) {
        res.status(400).json({ error: 'id is required.' });
        return;
      }
      const result = await service.save(req.params.bandId, id, body, req.userId ?? null);
      if (!result.ok) {
        res.status(409).json({ error: `That ${resourceKey} id is already in use.` });
        return;
      }
      res.json({ [resourceKey]: result.value });
    } catch (err) {
      console.error(`Failed to save band ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.put('/:id', requireBandEditor, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const value = await service.update(req.params.bandId, req.params.id, body, req.userId ?? null);
      if (!value) {
        res.status(404).json({ error: `${resourceKey} not found.` });
        return;
      }
      res.json({ [resourceKey]: value });
    } catch (err) {
      console.error(`Failed to update band ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.delete('/:id', requireBandEditor, async (req, res) => {
    try {
      const removed = await service.remove(req.params.bandId, req.params.id, req.userId ?? null);
      if (!removed) {
        res.status(404).json({ error: `${resourceKey} not found.` });
        return;
      }
      res.json({});
    } catch (err) {
      console.error(`Failed to delete band ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}
