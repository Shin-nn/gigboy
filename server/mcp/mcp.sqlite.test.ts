// @vitest-environment node
/**
 * End-to-end check of the SQLite backend and the MCP endpoint together: a real SQLite file built
 * from migrations-sqlite/, the real db client/schema switch (DATABASE_URL=file:…), REST routers
 * for the parts that exercise dialect-sensitive features (upserts, JSON, booleans, timestamps, a
 * transaction), and an MCP SDK client talking to /mcp over HTTP with a personal API token.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const h = vi.hoisted(() => {
  // Must be set before anything imports db/schema.ts, which picks the dialect at load time.
  const dir = `${process.env.TMPDIR ?? '/tmp'}/gigboy-sqlite-${process.pid}-${Date.now()}`;
  process.env.DATABASE_URL = `file:${dir}/gigboy.db`;
  process.env.ATTACHMENTS_DIR ??= `${dir}/attachments`;
  return { dir };
});

let base: string;
let server: ReturnType<express.Express['listen']>;
let editorToken: string;
let viewerToken: string;

async function migrate() {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const { migrate: run } = await import('drizzle-orm/libsql/migrator');
  const client = createClient({ url: process.env.DATABASE_URL! });
  await run(drizzle(client), { migrationsFolder: join(process.cwd(), 'server/db/migrations-sqlite') });
  client.close();
}

async function call(method: string, path: string, user?: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json };
}

async function mcpClient(token: string) {
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  return client;
}

/** Calls a tool and returns [parsed JSON body, isError]. */
async function tool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
  let parsed: any = text; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { parsed = JSON.parse(text); } catch { /* error message */ }
  return [parsed, Boolean(res.isError)] as const;
}

beforeAll(async () => {
  mkdirSync(h.dir, { recursive: true });
  await migrate();
  const { db, dialect } = await import('../db/client.js');
  expect(dialect).toBe('sqlite');
  const { users, bands, bandMembers } = await import('../db/schema.js');
  await db.insert(users).values([
    { id: 'editor', email: 'e@x', emailLower: 'e@x', username: 'editor', passwordHash: 'x' },
    { id: 'viewer', email: 'v@x', emailLower: 'v@x', username: 'viewer', passwordHash: 'x' },
    { id: 'other', email: 'o@x', emailLower: 'o@x', username: 'other', passwordHash: 'x' },
  ]);
  await db.insert(bands).values([
    { id: 'b1', name: 'Band One', ownerId: 'editor' },
    { id: 'b2', name: 'Other Band', ownerId: 'other' },
  ]);
  await db.insert(bandMembers).values([
    { bandId: 'b1', userId: 'editor', role: 'editor' },
    { bandId: 'b1', userId: 'viewer', role: 'viewer' },
    { bandId: 'b2', userId: 'other', role: 'editor' },
  ]);

  const { createApiToken } = await import('../lib/apiTokens.js');
  editorToken = (await createApiToken('editor', 'test', null)).token;
  viewerToken = (await createApiToken('viewer', 'test', null)).token;

  const { mcpRouter } = await import('./router.js');
  const { apiTokensRouter } = await import('../routes/apiTokens.js');
  const { bandSongsRouter } = await import('../routes/bandSongs.js');
  const { bandRidersRouter } = await import('../routes/bandRiders.js');
  const { bandCalendarFeedRouter } = await import('../routes/bandCalendarFeed.js');
  const { bandSongTransposeRouter } = await import('../routes/songMemberPrefs.js');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const u = req.header('x-user-id');
    if (u) (req as unknown as { userId?: string }).userId = u;
    next();
  });
  app.use('/api/api-tokens', apiTokensRouter);
  app.use('/api/bands/:bandId/songs/:songId/transpose', bandSongTransposeRouter);
  app.use('/api/bands/:bandId/songs', bandSongsRouter);
  app.use('/api/bands/:bandId/riders', bandRidersRouter);
  app.use('/api/bands/:bandId/calendar-feed', bandCalendarFeedRouter);
  app.use('/mcp', mcpRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  rmSync(h.dir, { recursive: true, force: true });
});

describe('SQLite backend via the REST routers', () => {
  it('round-trips JSON, timestamps and upserts', async () => {
    const song = { id: 's1', title: 'First', chordpro: '[G]Hi', tags: ['rock', 'cover'], tempo: 120 };
    const created = await call('POST', '/api/bands/b1/songs', 'editor', song);
    expect(created.status).toBe(200);
    expect(created.json.song).toMatchObject({ id: 's1', tags: ['rock', 'cover'], tempo: 120 });
    expect(Date.parse(created.json.song.createdAt)).toBeGreaterThan(Date.parse('2020-01-01'));

    const updated = await call('POST', '/api/bands/b1/songs', 'editor', { ...song, title: 'First (v2)' });
    expect(updated.json.song.title).toBe('First (v2)');
    expect((await call('GET', '/api/bands/b1/songs', 'viewer')).json.songs).toHaveLength(1);
    // Another band can't hijack the id.
    expect((await call('POST', '/api/bands/b2/songs', 'other', { ...song, title: 'Hijack' })).status).toBe(409);
  });

  it('upserts composite-key rows (onConflictDoUpdate)', async () => {
    expect((await call('PUT', '/api/bands/b1/songs/s1/transpose', 'viewer', { transpose: 2 })).status).toBe(200);
    const again = await call('PUT', '/api/bands/b1/songs/s1/transpose', 'viewer', { transpose: -1 });
    expect(again.status).toBe(200);
  });

  it('stores booleans and counts', async () => {
    const created = await call('POST', '/api/bands/b1/riders', 'editor', { name: 'Main' });
    expect(created.json.rider).toMatchObject({ name: 'Main', publicShareEnabled: false, sortOrder: 0, items: [] });
    const updated = await call('PUT', `/api/bands/b1/riders/${created.json.rider.id}`, 'editor', { publicShareEnabled: true });
    expect(updated.json.rider.publicShareEnabled).toBe(true);
  });

  it('runs transactions and honours the partial unique index', async () => {
    const first = await call('POST', '/api/bands/b1/calendar-feed', 'editor');
    expect(first.status).toBe(200);
    const regenerated = await call('POST', '/api/bands/b1/calendar-feed/regenerate', 'editor');
    expect(regenerated.status).toBe(200);
    expect(regenerated.json.feed.token).not.toBe(first.json.feed.token);
  });
});

describe('API tokens', () => {
  it('creates, lists and revokes tokens without exposing the hash', async () => {
    const created = await call('POST', '/api/api-tokens', 'other', { name: 'Claude', expiresInDays: 30 });
    expect(created.status).toBe(200);
    expect(created.json.token).toMatch(/^gbt_/);
    const list = await call('GET', '/api/api-tokens', 'other');
    expect(list.json.apiTokens).toHaveLength(1);
    expect(JSON.stringify(list.json)).not.toContain(created.json.token);
    expect((await call('DELETE', `/api/api-tokens/${created.json.apiToken.id}`, 'editor')).status).toBe(404);
    expect((await call('DELETE', `/api/api-tokens/${created.json.apiToken.id}`, 'other')).status).toBe(200);
    expect((await call('GET', '/api/api-tokens')).status).toBe(401);
  });
});

describe('MCP endpoint', () => {
  it('rejects requests without a valid token', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer gbt_nope' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('lists tools and only the caller\'s bands', async () => {
    const client = await mcpClient(editorToken);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['list_bands', 'save_song', 'get_setlist', 'save_gig']));
    const [result] = await tool(client, 'list_bands');
    expect(result.bands).toEqual([expect.objectContaining({ id: 'b1', role: 'editor', isOwner: true })]);
    const [, isError] = await tool(client, 'list_songs', { bandId: 'b2' });
    expect(isError).toBe(true);
    await client.close();
  });

  it('creates and patches songs, recording revisions', async () => {
    const client = await mcpClient(editorToken);
    const [created] = await tool(client, 'save_song', { bandId: 'b1', title: 'MCP Song', chordpro: '[C]La', key: 'C' });
    expect(created.created).toBe(true);
    const id = created.song.id;
    const [patched] = await tool(client, 'save_song', { bandId: 'b1', songId: id, tempo: 98, key: null });
    expect(patched.song).toMatchObject({ title: 'MCP Song', chordpro: '[C]La', tempo: 98 });
    expect(patched.song.key).toBeUndefined();
    const [found] = await tool(client, 'list_songs', { bandId: 'b1', query: 'mcp' });
    expect(found.songs.map((s: { id: string }) => s.id)).toEqual([id]);

    const { db } = await import('../db/client.js');
    const { songRevisions } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const revisions = await db.select().from(songRevisions).where(eq(songRevisions.songId, id));
    expect(revisions.length).toBeGreaterThanOrEqual(1);
    expect(revisions[0].editorUserId).toBe('editor');
    await client.close();
  });

  it('builds setlists from band songs only and resolves them in order', async () => {
    const client = await mcpClient(editorToken);
    const [, badIds] = await tool(client, 'save_setlist', { bandId: 'b1', name: 'Bad', songIds: ['nope'] });
    expect(badIds).toBe(true);
    const [created] = await tool(client, 'save_setlist', {
      bandId: 'b1',
      name: 'Friday',
      songIds: ['s1'],
      songNotes: { s1: 'Count in slow' },
    });
    const [setlist] = await tool(client, 'get_setlist', { bandId: 'b1', setlistId: created.setlist.id });
    expect(setlist.songs).toEqual([expect.objectContaining({ position: 1, songId: 's1', title: 'First (v2)', note: 'Count in slow' })]);
    await client.close();
  });

  it('validates gigs and keeps attachments within the band', async () => {
    const client = await mcpClient(editorToken);
    const [, noStart] = await tool(client, 'save_gig', { bandId: 'b1', title: 'No date' });
    expect(noStart).toBe(true);
    const [created] = await tool(client, 'save_gig', {
      bandId: 'b1',
      title: 'Club show',
      startsAt: '2026-12-31T20:00:00+01:00',
      venue: 'Club',
    });
    expect(created.gig).toMatchObject({ title: 'Club show', startsAt: '2026-12-31T19:00:00.000Z', status: 'confirmed' });
    const [, badEnd] = await tool(client, 'save_gig', { bandId: 'b1', gigId: created.gig.id, endsAt: '2026-12-31T18:00:00Z' });
    expect(badEnd).toBe(true);
    const [list] = await tool(client, 'list_gigs', { bandId: 'b1', from: '2026-12-01T00:00:00Z' });
    expect(list.gigs).toHaveLength(1);
    const [deleted] = await tool(client, 'delete_gig', { bandId: 'b1', gigId: created.gig.id });
    expect(deleted.movedToTrash).toBe(true);
    await client.close();
  });

  it('lets viewers read but not write', async () => {
    const client = await mcpClient(viewerToken);
    const [songs, readErr] = await tool(client, 'list_songs', { bandId: 'b1' });
    expect(readErr).toBe(false);
    expect(songs.total).toBeGreaterThan(0);
    const [message, writeErr] = await tool(client, 'save_song', { bandId: 'b1', title: 'Nope' });
    expect(writeErr).toBe(true);
    expect(message).toContain('editor');
    await client.close();
  });

  it('creates riders and press kits', async () => {
    const client = await mcpClient(editorToken);
    const [rider] = await tool(client, 'save_rider', { bandId: 'b1', name: 'Festival', hospitalityNotes: 'Water' });
    expect(rider.rider).toMatchObject({ name: 'Festival', hospitalityNotes: 'Water' });
    const [kit] = await tool(client, 'save_press_kit', { bandId: 'b1', name: 'EPK', richText: '<p>Hi</p>' });
    expect(kit.pressKit).toMatchObject({ name: 'EPK', richText: '<p>Hi</p>' });
    await client.close();
  });
});
