import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRider, deleteRider, getRider, listRiders, updateRider } from '../../routes/bandRiders.js';
import {
  createPressKit,
  deletePressKit,
  listPressKits,
  loadBandPressKit,
  pressKitToApi,
  updatePressKit,
} from '../../routes/bandPressKits.js';
import { DELETE, READ_ONLY, ToolError, WRITE, assertBandAccess, definedOnly, run, type McpContext } from '../context.js';

export function registerGigPrepTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'list_riders',
    {
      title: 'List technical riders',
      description: "A band's technical riders (name, notes, sharing flag). Use get_rider for the stage plot / input list items.",
      inputSchema: { bandId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const riders = await listRiders(bandId);
      return {
        riders: riders.map(({ items, drawingLayers, ...rest }) => ({
          ...rest,
          itemCount: Array.isArray(items) ? items.length : 0,
          hasDrawing: Array.isArray(drawingLayers) && drawingLayers.length > 0,
        })),
      };
    }),
  );

  server.registerTool(
    'get_rider',
    {
      title: 'Get technical rider',
      description: 'A technical rider in full, including stage plot items (instruments, mics, monitors with positions and channel info).',
      inputSchema: { bandId: z.string(), riderId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId, riderId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const rider = await getRider(bandId, riderId);
      if (!rider) throw new ToolError(`No rider with id ${riderId} in this band.`);
      return rider;
    }),
  );

  server.registerTool(
    'save_rider',
    {
      title: 'Create or update technical rider',
      description:
        "Creates a rider (omit riderId; name required) or updates one (only the fields you send change). Edits the rider's text fields; " +
        'the visual stage plot is edited in the app. publicShareEnabled makes it readable by anyone with its public link. Requires the editor role.',
      inputSchema: {
        bandId: z.string(),
        riderId: z.string().optional(),
        name: z.string().min(1).optional(),
        hospitalityNotes: z.string().nullable().optional(),
        logisticsNotes: z.string().nullable().optional(),
        publicShareEnabled: z.boolean().optional(),
        icon: z.string().nullable().optional(),
      },
      annotations: WRITE,
    },
    run(async ({ bandId, riderId, ...fields }) => {
      await assertBandAccess(ctx, bandId, 'write');
      let id = riderId;
      let created = false;
      if (!id) {
        if (!fields.name) throw new ToolError('name is required when creating a rider.');
        id = (await createRider(bandId, fields.name)).id;
        created = true;
      }
      const rider = await updateRider(bandId, id, definedOnly(fields));
      if (!rider) throw new ToolError(`No rider with id ${id} in this band.`);
      return { created, rider };
    }),
  );

  server.registerTool(
    'delete_rider',
    {
      title: 'Delete technical rider',
      description: "Moves a technical rider to the band's trash. Requires the editor role.",
      inputSchema: { bandId: z.string(), riderId: z.string() },
      annotations: DELETE,
    },
    run(async ({ bandId, riderId }) => {
      await assertBandAccess(ctx, bandId, 'write');
      if (!(await deleteRider(bandId, riderId))) throw new ToolError(`No rider with id ${riderId} in this band.`);
      return { deleted: true, movedToTrash: true };
    }),
  );

  server.registerTool(
    'list_press_kits',
    {
      title: 'List press kits',
      description: "A band's press kits (bio text as HTML, video links, pre-save links, listed gigs).",
      inputSchema: { bandId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      return { pressKits: await listPressKits(bandId) };
    }),
  );

  server.registerTool(
    'get_press_kit',
    {
      title: 'Get press kit',
      description: 'One press kit in full.',
      inputSchema: { bandId: z.string(), pressKitId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId, pressKitId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const row = await loadBandPressKit(bandId, pressKitId);
      if (!row) throw new ToolError(`No press kit with id ${pressKitId} in this band.`);
      return pressKitToApi(row);
    }),
  );

  const urlList = z.array(z.string().url());
  server.registerTool(
    'save_press_kit',
    {
      title: 'Create or update press kit',
      description:
        'Creates a press kit (omit pressKitId; name required) or updates one (only the fields you send change). ' +
        'Images are uploaded in the app. gigIds lists the band\'s gigs as tour dates on the kit (other bands\' ids are dropped). Requires the editor role.',
      inputSchema: {
        bandId: z.string(),
        pressKitId: z.string().optional(),
        name: z.string().min(1).optional(),
        richText: z.string().optional().describe('Bio / press text as simple HTML (<p>, <strong>, <em>, <ul>, <li>, <a>, <h2>).'),
        videoUrls: urlList.optional(),
        selectedVideoUrls: urlList.optional().describe('Subset of videoUrls shown on the shared kit.'),
        presaveReleaseName: z.string().nullable().optional(),
        presaveReleaseDate: z.string().nullable().optional().describe('YYYY-MM-DD'),
        presaveUrls: urlList.optional(),
        selectedPresaveUrls: urlList.optional(),
        gigIds: z.array(z.string()).optional(),
        icon: z.string().nullable().optional(),
      },
      annotations: WRITE,
    },
    run(async ({ bandId, pressKitId, ...fields }) => {
      await assertBandAccess(ctx, bandId, 'write');
      let id = pressKitId;
      let created = false;
      if (!id) {
        if (!fields.name) throw new ToolError('name is required when creating a press kit.');
        id = (await createPressKit(bandId, fields.name, ctx.userId)).id;
        created = true;
      }
      const pressKit = await updatePressKit(bandId, id, definedOnly(fields));
      if (!pressKit) throw new ToolError(`No press kit with id ${id} in this band.`);
      return { created, pressKit };
    }),
  );

  server.registerTool(
    'delete_press_kit',
    {
      title: 'Delete press kit',
      description: "Moves a press kit to the band's trash. Requires the editor role.",
      inputSchema: { bandId: z.string(), pressKitId: z.string() },
      annotations: DELETE,
    },
    run(async ({ bandId, pressKitId }) => {
      await assertBandAccess(ctx, bandId, 'write');
      if (!(await deletePressKit(bandId, pressKitId))) throw new ToolError(`No press kit with id ${pressKitId} in this band.`);
      return { deleted: true, movedToTrash: true };
    }),
  );
}
