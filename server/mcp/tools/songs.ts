import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '../../db/client.js';
import { songs } from '../../db/schema.js';
import { songsService } from '../../routes/bandSongs.js';
import { songListsService } from '../../routes/bandSongLists.js';
import {
  DELETE,
  READ_ONLY,
  ToolError,
  WRITE,
  assertBandAccess,
  deleteViaService,
  run,
  saveViaService,
  type McpContext,
} from '../context.js';

type Song = Awaited<ReturnType<typeof songsService.list>>[number];

/** Throws unless every id is a song in `bandId`. */
export async function assertSongsInBand(bandId: string, songIds: string[] | null | undefined): Promise<void> {
  const unique = [...new Set(songIds ?? [])];
  if (!unique.length) return;
  const found = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.bandId, bandId), inArray(songs.id, unique)));
  const foundIds = new Set(found.map((s) => s.id));
  const missing = unique.filter((id) => !foundIds.has(id));
  if (missing.length) throw new ToolError(`These song ids are not songs in this band: ${missing.join(', ')}`);
}

function songSummary(s: Song) {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    key: s.key,
    tempo: s.tempo,
    durationSeconds: s.durationSeconds,
    tags: s.tags,
    language: s.language,
    updatedAt: s.updatedAt,
  };
}

const nullableString = z.string().nullable().optional();
const nullableInt = z.number().int().nullable().optional();

const songFields = {
  title: z.string().min(1).optional().describe('Song title. Required when creating.'),
  chordpro: z
    .string()
    .optional()
    .describe('Lyrics and chords in ChordPro format: chords inline in brackets, e.g. "[G]Hello [C]world", sections with {start_of_chorus}/{end_of_chorus} etc.'),
  artist: nullableString,
  author: nullableString.describe('Songwriter / composer.'),
  key: nullableString.describe('Musical key, e.g. "G" or "Em".'),
  capo: nullableInt,
  tempo: nullableInt.describe('BPM.'),
  timeSignature: nullableString.describe('e.g. "4/4".'),
  preferredTranspose: nullableInt.describe('Band-default transpose in semitones.'),
  language: z.string().optional().describe('Primary lyric language code, e.g. "en", "cs". Defaults to "en".'),
  secondaryLanguages: z.array(z.string()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  playbackUrl: nullableString.describe('Reference recording link (YouTube, Spotify, ...).'),
  date: nullableString.describe('Free-form song date, YYYY-MM-DD.'),
  durationSeconds: nullableInt.describe('Play length in seconds (used for setlist durations).'),
};

export function registerSongTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'list_songs',
    {
      title: 'List songs',
      description:
        "A band's songs as summaries (no lyrics). Optionally filter by a case-insensitive text query on title/artist/author, or by tag. Use get_song for the full ChordPro.",
      inputSchema: {
        bandId: z.string(),
        query: z.string().optional(),
        tag: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    run(async ({ bandId, query, tag }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const q = query?.trim().toLowerCase();
      const all = await songsService.list(bandId);
      const matches = all
        .filter((s) => !q || [s.title, s.artist, s.author].some((v) => typeof v === 'string' && v.toLowerCase().includes(q)))
        .filter((s) => !tag || (s.tags ?? []).includes(tag))
        .sort((a, b) => a.title.localeCompare(b.title));
      return { total: matches.length, songs: matches.map(songSummary) };
    }),
  );

  server.registerTool(
    'get_song',
    {
      title: 'Get song',
      description: 'One song with all its fields, including the full ChordPro lyrics/chords.',
      inputSchema: { bandId: z.string(), songId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId, songId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const song = await songsService.get(bandId, songId);
      if (!song) throw new ToolError(`No song with id ${songId} in this band.`);
      return song;
    }),
  );

  server.registerTool(
    'save_song',
    {
      title: 'Create or update song',
      description:
        'Creates a song (omit songId; title is required) or updates one (pass songId; only the fields you send change, null clears a field). ' +
        'Each save is recorded in the song\'s revision history. Requires the editor role.',
      inputSchema: { bandId: z.string(), songId: z.string().optional(), ...songFields },
      annotations: WRITE,
    },
    run(async ({ bandId, songId, ...fields }) => {
      if (!songId && !fields.title) throw new ToolError('title is required when creating a song.');
      const { created, item } = await saveViaService(ctx, songsService, bandId, songId, fields);
      return { created, song: item };
    }),
  );

  server.registerTool(
    'delete_song',
    {
      title: 'Delete song',
      description: "Moves a song to the band's trash (restorable from the app for 30 days). Also removes its recordings and attachments. Requires the editor role.",
      inputSchema: { bandId: z.string(), songId: z.string() },
      annotations: DELETE,
    },
    run(({ bandId, songId }) => deleteViaService(ctx, songsService, bandId, songId)),
  );

  server.registerTool(
    'list_song_lists',
    {
      title: 'List song lists',
      description: 'A band\'s song lists (named collections of songs, e.g. "Covers", "Repertoire 2026"), with their song ids.',
      inputSchema: { bandId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      return { songLists: await songListsService.list(bandId) };
    }),
  );

  server.registerTool(
    'save_song_list',
    {
      title: 'Create or update song list',
      description: 'Creates a song list (omit songListId; name required) or updates one (only the fields you send change). Requires the editor role.',
      inputSchema: {
        bandId: z.string(),
        songListId: z.string().optional(),
        name: z.string().min(1).optional(),
        songIds: z.array(z.string()).optional().describe('Full ordered list of song ids (replaces the current list).'),
        icon: z.string().nullable().optional(),
      },
      annotations: WRITE,
    },
    run(async ({ bandId, songListId, ...fields }) => {
      if (!songListId && !fields.name) throw new ToolError('name is required when creating a song list.');
      await assertBandAccess(ctx, bandId, 'write');
      await assertSongsInBand(bandId, fields.songIds);
      const { created, item } = await saveViaService(ctx, songListsService, bandId, songListId, fields);
      return { created, songList: item };
    }),
  );

  server.registerTool(
    'delete_song_list',
    {
      title: 'Delete song list',
      description: "Moves a song list to the band's trash. The songs themselves are not deleted. Requires the editor role.",
      inputSchema: { bandId: z.string(), songListId: z.string() },
      annotations: DELETE,
    },
    run(({ bandId, songListId }) => deleteViaService(ctx, songListsService, bandId, songListId)),
  );
}
