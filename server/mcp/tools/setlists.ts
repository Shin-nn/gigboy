import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setlistsService } from '../../routes/bandSetlists.js';
import { songsService } from '../../routes/bandSongs.js';
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
import { assertSongsInBand } from './songs.js';

export function registerSetlistTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'list_setlists',
    {
      title: 'List setlists',
      description: "A band's setlists with song counts. Use get_setlist for the songs in order.",
      inputSchema: { bandId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const setlists = await setlistsService.list(bandId);
      return {
        setlists: setlists.map((s) => ({ id: s.id, name: s.name, songCount: s.songIds.length, updatedAt: s.updatedAt })),
      };
    }),
  );

  server.registerTool(
    'get_setlist',
    {
      title: 'Get setlist',
      description: 'A setlist with its songs in running order (title, key, tempo, duration, per-song note) and the total duration.',
      inputSchema: { bandId: z.string(), setlistId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId, setlistId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const setlist = await setlistsService.get(bandId, setlistId);
      if (!setlist) throw new ToolError(`No setlist with id ${setlistId} in this band.`);
      const byId = new Map((await songsService.list(bandId)).map((s) => [s.id, s]));
      const items = setlist.songIds.map((id, index) => {
        const song = byId.get(id);
        return {
          position: index + 1,
          songId: id,
          title: song?.title ?? '(deleted song)',
          artist: song?.artist,
          key: song?.key,
          tempo: song?.tempo,
          durationSeconds: song?.durationSeconds,
          note: setlist.songNotes?.[id],
        };
      });
      const totalDurationSeconds = items.reduce((sum, i) => sum + (i.durationSeconds ?? 0), 0);
      return { id: setlist.id, name: setlist.name, icon: setlist.icon, totalDurationSeconds, songs: items };
    }),
  );

  server.registerTool(
    'save_setlist',
    {
      title: 'Create or update setlist',
      description:
        'Creates a setlist (omit setlistId; name required) or updates one (only the fields you send change). ' +
        'songIds is the full running order and replaces the existing one. Requires the editor role.',
      inputSchema: {
        bandId: z.string(),
        setlistId: z.string().optional(),
        name: z.string().min(1).optional(),
        songIds: z.array(z.string()).optional(),
        songNotes: z
          .record(z.string(), z.string())
          .nullable()
          .optional()
          .describe('Per-song stage notes keyed by song id (replaces all notes).'),
        icon: z.string().nullable().optional(),
      },
      annotations: WRITE,
    },
    run(async ({ bandId, setlistId, ...fields }) => {
      if (!setlistId && !fields.name) throw new ToolError('name is required when creating a setlist.');
      await assertBandAccess(ctx, bandId, 'write');
      await assertSongsInBand(bandId, fields.songIds);
      const { created, item } = await saveViaService(ctx, setlistsService, bandId, setlistId, fields);
      return { created, setlist: item };
    }),
  );

  server.registerTool(
    'delete_setlist',
    {
      title: 'Delete setlist',
      description: "Moves a setlist to the band's trash. Songs are not deleted. Requires the editor role.",
      inputSchema: { bandId: z.string(), setlistId: z.string() },
      annotations: DELETE,
    },
    run(({ bandId, setlistId }) => deleteViaService(ctx, setlistsService, bandId, setlistId)),
  );
}
