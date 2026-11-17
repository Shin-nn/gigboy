import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gigsService, validateGigInput } from '../../routes/bandGigs.js';
import { toursService } from '../../routes/bandTours.js';
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

const isoDate = z.string().describe('ISO 8601 date-time with offset, e.g. "2026-12-31T20:00:00+01:00".');
const nullableIso = isoDate.nullable().optional();
const nullableString = z.string().nullable().optional();

const gigFields = {
  title: z.string().min(1).optional().describe('Required when creating.'),
  startsAt: isoDate.optional().describe('Show start (on stage). Required when creating. ISO 8601 with offset.'),
  endsAt: nullableIso,
  getInAt: nullableIso.describe('Load-in time.'),
  soundCheckAt: nullableIso,
  timezone: nullableString.describe('IANA zone the gig is in, e.g. "Europe/Prague" (for display).'),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  venue: nullableString,
  address: nullableString,
  contactName: nullableString,
  contactPhone: nullableString,
  contactEmail: nullableString,
  notes: nullableString,
  tourId: nullableString.describe('Tour this gig belongs to (see list_tours).'),
  setlistId: nullableString.describe('Setlist to play (see list_setlists).'),
  pressKitId: nullableString,
  riderId: nullableString.describe('Technical rider (see list_riders).'),
};

export function registerCalendarTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'list_gigs',
    {
      title: 'List gigs',
      description: "A band's gigs/shows sorted by start time. Optionally limit to a time window or a tour.",
      inputSchema: {
        bandId: z.string(),
        from: isoDate.optional().describe('Only gigs starting at or after this time.'),
        to: isoDate.optional().describe('Only gigs starting before this time.'),
        tourId: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    run(async ({ bandId, from, to, tourId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const fromMs = from ? Date.parse(from) : -Infinity;
      const toMs = to ? Date.parse(to) : Infinity;
      if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new ToolError('from/to must be ISO 8601 dates.');
      const gigs = (await gigsService.list(bandId))
        .filter((g) => {
          const t = Date.parse(g.startsAt);
          return t >= fromMs && t < toMs && (!tourId || g.tourId === tourId);
        })
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      return { gigs };
    }),
  );

  server.registerTool(
    'save_gig',
    {
      title: 'Create or update gig',
      description:
        'Creates a gig (omit gigId; title and startsAt required) or updates one (only the fields you send change, null clears). ' +
        'Attached tour/setlist/rider/press kit must belong to the same band. Requires the editor role.',
      inputSchema: { bandId: z.string(), gigId: z.string().optional(), ...gigFields },
      annotations: WRITE,
    },
    run(async ({ bandId, gigId, ...fields }) => {
      const { created, item } = await saveViaService(ctx, gigsService, bandId, gigId, fields, (body) =>
        validateGigInput(bandId, body),
      );
      return { created, gig: item };
    }),
  );

  server.registerTool(
    'delete_gig',
    {
      title: 'Delete gig',
      description: "Moves a gig to the band's trash. Requires the editor role.",
      inputSchema: { bandId: z.string(), gigId: z.string() },
      annotations: DELETE,
    },
    run(({ bandId, gigId }) => deleteViaService(ctx, gigsService, bandId, gigId)),
  );

  server.registerTool(
    'list_tours',
    {
      title: 'List tours',
      description: "A band's tours (named runs of gigs). Gigs reference a tour by tourId.",
      inputSchema: { bandId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      return { tours: await toursService.list(bandId) };
    }),
  );

  server.registerTool(
    'save_tour',
    {
      title: 'Create or update tour',
      description: 'Creates a tour (omit tourId; name required) or renames/updates one. Assign gigs to it with save_gig. Requires the editor role.',
      inputSchema: {
        bandId: z.string(),
        tourId: z.string().optional(),
        name: z.string().min(1).optional(),
        icon: z.string().nullable().optional(),
      },
      annotations: WRITE,
    },
    run(async ({ bandId, tourId, ...fields }) => {
      if (!tourId && !fields.name) throw new ToolError('name is required when creating a tour.');
      const { created, item } = await saveViaService(ctx, toursService, bandId, tourId, fields);
      return { created, tour: item };
    }),
  );

  server.registerTool(
    'delete_tour',
    {
      title: 'Delete tour',
      description: "Moves a tour to the band's trash. Its gigs are kept (they just lose the tour). Requires the editor role.",
      inputSchema: { bandId: z.string(), tourId: z.string() },
      annotations: DELETE,
    },
    run(({ bandId, tourId }) => deleteViaService(ctx, toursService, bandId, tourId)),
  );
}
