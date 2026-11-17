import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '../../db/client.js';
import { bandMembers, bands, users } from '../../db/schema.js';
import { toBandApi } from '../../lib/band.js';
import { READ_ONLY, ToolError, assertBandAccess, bandRoleOf, run, type McpContext } from '../context.js';

export function registerBandTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'The Gigboy user this API token acts as.',
      annotations: READ_ONLY,
    },
    run(async () => {
      const [u] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
      if (!u) throw new ToolError('The user for this token no longer exists.');
      return { id: u.id, username: u.username, fullName: u.fullName, email: u.email };
    }),
  );

  server.registerTool(
    'list_bands',
    {
      title: 'List bands',
      description:
        'Bands you are a member of, with your role in each. "editor" can change band content; "viewer" is read-only. ' +
        'Almost every other tool takes a bandId from here.',
      annotations: READ_ONLY,
    },
    run(async () => {
      const rows = await db
        .select({ id: bands.id, name: bands.name, description: bands.description, ownerId: bands.ownerId, role: bandMembers.role })
        .from(bandMembers)
        .innerJoin(bands, eq(bandMembers.bandId, bands.id))
        .where(eq(bandMembers.userId, ctx.userId));
      return {
        bands: rows.map((r) => ({ ...r, isOwner: r.ownerId === ctx.userId })),
      };
    }),
  );

  server.registerTool(
    'get_band',
    {
      title: 'Get band',
      description: 'A band\'s details and its members (ids, names, roles).',
      inputSchema: { bandId: z.string() },
      annotations: READ_ONLY,
    },
    run(async ({ bandId }) => {
      await assertBandAccess(ctx, bandId, 'read');
      const [row] = await db.select().from(bands).where(eq(bands.id, bandId)).limit(1);
      if (!row) throw new ToolError(`Band ${bandId} not found.`);
      const band = await toBandApi(row);
      return {
        id: band.id,
        name: band.name,
        description: band.description,
        ownerId: band.ownerId,
        yourRole: await bandRoleOf(ctx.userId, bandId),
        members: band.memberIds.map((id) => ({
          id,
          role: band.memberRoles[id],
          username: band.memberUsernames[id],
          fullName: band.memberFullNames[id],
        })),
      };
    }),
  );
}
