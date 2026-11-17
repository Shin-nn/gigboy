import { and, eq } from 'drizzle-orm';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { db } from '../db/client.js';
import { bandMembers } from '../db/schema.js';
import type { BandCrudService } from '../routes/bandResources.js';

/** An error whose message is safe to show the MCP client (validation, not found, forbidden). */
export class ToolError extends Error {}

/** Per-request context: the user the API token belongs to. Every tool acts as that user. */
export interface McpContext {
  userId: string;
}

export type BandRole = 'editor' | 'viewer';

export async function bandRoleOf(userId: string, bandId: string): Promise<BandRole | null> {
  const rows = await db
    .select({ role: bandMembers.role })
    .from(bandMembers)
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)))
    .limit(1);
  const role = rows[0]?.role;
  return role === 'editor' || role === 'viewer' ? role : null;
}

/** Same rules as requireBandMember / requireBandEditor on the REST API. */
export async function assertBandAccess(ctx: McpContext, bandId: string, need: 'read' | 'write'): Promise<void> {
  const role = await bandRoleOf(ctx.userId, bandId);
  // Deliberately the same message for "no such band" and "not a member" — no probing band ids.
  if (!role) throw new ToolError(`Band ${bandId} not found, or you are not a member of it. Use list_bands to see your bands.`);
  if (need === 'write' && role !== 'editor') throw new ToolError('This needs the editor role in the band; you are a viewer.');
}

/**
 * Wraps a tool body: runs it, renders the return value as JSON text, and turns thrown errors into
 * MCP tool errors (ToolError messages verbatim; anything else logged and reported generically).
 */
export function run<A>(fn: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      const result = await fn(args);
      return { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }, null, 2) }] };
    } catch (err) {
      if (err instanceof ToolError) return { isError: true, content: [{ type: 'text', text: err.message }] };
      console.error('MCP tool failed:', err);
      return { isError: true, content: [{ type: 'text', text: 'Something went wrong on the server.' }] };
    }
  };
}

/** Drops keys whose value is `undefined` (omitted by the client); keeps explicit nulls, which clear a field. */
export function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Create-or-patch on a band CRUD service. Without `id`, creates a new row (fresh UUID) from
 * `fields`. With `id`, merges `fields` over the existing row so omitted fields keep their value —
 * the REST PUT replaces the whole row, which is the wrong default for an LLM sending a few fields.
 * `validate` sees the full merged body before anything is written.
 */
export async function saveViaService<Api extends Record<string, unknown>>(
  ctx: McpContext,
  service: BandCrudService<Api>,
  bandId: string,
  id: string | undefined,
  fields: Record<string, unknown>,
  validate?: (body: Record<string, unknown>) => Promise<string | null>,
): Promise<{ created: boolean; item: Api }> {
  await assertBandAccess(ctx, bandId, 'write');
  const patch = definedOnly(fields);
  if (id) {
    const existing = await service.get(bandId, id);
    if (!existing) throw new ToolError(`No ${service.resourceKey} with id ${id} in this band.`);
    const body = { ...existing, ...patch, id };
    const error = await validate?.(body);
    if (error) throw new ToolError(error);
    const item = await service.update(bandId, id, body, ctx.userId);
    if (!item) throw new ToolError(`No ${service.resourceKey} with id ${id} in this band.`);
    return { created: false, item };
  }
  const newId = crypto.randomUUID();
  const body = { ...patch, id: newId };
  const error = await validate?.(body);
  if (error) throw new ToolError(error);
  const result = await service.save(bandId, newId, body, ctx.userId);
  if (!result.ok) throw new ToolError('Could not create it — id collision, please retry.');
  return { created: true, item: result.value };
}

export async function deleteViaService(
  ctx: McpContext,
  service: BandCrudService<unknown>,
  bandId: string,
  id: string,
): Promise<{ deleted: true; movedToTrash: true }> {
  await assertBandAccess(ctx, bandId, 'write');
  if (!(await service.remove(bandId, id, ctx.userId))) {
    throw new ToolError(`No ${service.resourceKey} with id ${id} in this band.`);
  }
  return { deleted: true, movedToTrash: true };
}

export const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
export const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;
