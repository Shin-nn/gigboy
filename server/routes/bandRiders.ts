import { Router } from 'express';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandRiders } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { removeNullish } from '../lib/serialize.js';
import { insertTrashItem } from '../lib/trash.js';

type RiderRow = typeof bandRiders.$inferSelect;

export function toApi(row: RiderRow) {
  return removeNullish({
    id: row.id,
    name: row.name,
    icon: row.icon,
    hospitalityNotes: row.hospitalityNotes,
    logisticsNotes: row.logisticsNotes,
    items: row.items,
    drawingLayers: row.drawingLayers,
    publicShareEnabled: row.publicShareEnabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
}

export async function listRiders(bandId: string) {
  const rows = await db.select().from(bandRiders).where(eq(bandRiders.bandId, bandId)).orderBy(bandRiders.sortOrder);
  return rows.map(toApi);
}

export async function getRider(bandId: string, id: string) {
  const rows = await db
    .select()
    .from(bandRiders)
    .where(and(eq(bandRiders.id, id), eq(bandRiders.bandId, bandId)))
    .limit(1);
  return rows[0] ? toApi(rows[0]) : null;
}

/** Creates an empty rider at the end of the band's sort order. */
export async function createRider(bandId: string, name: string) {
  const [{ value: riderCount }] = await db
    .select({ value: count() })
    .from(bandRiders)
    .where(eq(bandRiders.bandId, bandId));
  const [row] = await db
    .insert(bandRiders)
    .values({
      id: crypto.randomUUID(),
      bandId,
      name,
      items: [],
      drawingLayers: [],
      publicShareEnabled: false,
      sortOrder: riderCount,
    })
    .returning();
  return toApi(row);
}

/** Partial update — only keys present in `body` change. Null when the rider isn't in this band. */
export async function updateRider(bandId: string, id: string, body: Record<string, unknown>) {
  if (!(await getRider(bandId, id))) return null;
  const updates: Partial<typeof bandRiders.$inferInsert> = {};
  if (typeof body.name === 'string') updates.name = body.name;
  if ('icon' in body) updates.icon = (body.icon as string | null) ?? null;
  if ('hospitalityNotes' in body) updates.hospitalityNotes = (body.hospitalityNotes as string | null) ?? null;
  if ('logisticsNotes' in body) updates.logisticsNotes = (body.logisticsNotes as string | null) ?? null;
  if (Array.isArray(body.items)) updates.items = body.items as unknown[];
  if (Array.isArray(body.drawingLayers)) updates.drawingLayers = body.drawingLayers as unknown[];
  if (typeof body.publicShareEnabled === 'boolean') updates.publicShareEnabled = body.publicShareEnabled;
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;
  updates.updatedAt = new Date();
  const [row] = await db.update(bandRiders).set(updates).where(eq(bandRiders.id, id)).returning();
  return toApi(row);
}

/** Snapshots to trash and deletes. False when the rider isn't in this band. */
export async function deleteRider(bandId: string, id: string) {
  const existing = await getRider(bandId, id);
  if (!existing) return false;
  await insertTrashItem({ bandId }, 'technicalRider', existing);
  await db.delete(bandRiders).where(eq(bandRiders.id, id));
  return true;
}

export const bandRidersRouter = Router({ mergeParams: true });
bandRidersRouter.use(requireAuth);

bandRidersRouter.get('/', requireBandMember, async (req, res) => {
  try {
    res.json({ riders: await listRiders(req.params.bandId) });
  } catch (err) {
    console.error('Failed to list band riders:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandRidersRouter.post('/', requireBandEditor, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    res.json({ rider: await createRider(req.params.bandId, name) });
  } catch (err) {
    console.error('Failed to create band rider:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandRidersRouter.put('/:id', requireBandEditor, async (req, res) => {
  try {
    const rider = await updateRider(req.params.bandId, req.params.id, (req.body ?? {}) as Record<string, unknown>);
    if (!rider) {
      res.status(404).json({ error: 'Rider not found.' });
      return;
    }
    res.json({ rider });
  } catch (err) {
    console.error('Failed to update band rider:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandRidersRouter.delete('/:id', requireBandEditor, async (req, res) => {
  try {
    if (!(await deleteRider(req.params.bandId, req.params.id))) {
      res.status(404).json({ error: 'Rider not found.' });
      return;
    }
    res.json({});
  } catch (err) {
    console.error('Failed to delete band rider:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
