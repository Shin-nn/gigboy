import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context.js';
import { registerBandTools } from './tools/bands.js';
import { registerSongTools } from './tools/songs.js';
import { registerSetlistTools } from './tools/setlists.js';
import { registerCalendarTools } from './tools/calendar.js';
import { registerGigPrepTools } from './tools/gigPrep.js';

const INSTRUCTIONS = `Gigboy is a band songbook and gig-prep app. Data is organized per band: start with list_bands,
then pass a bandId to the other tools. Songs hold lyrics and chords in ChordPro; setlists and song lists
reference songs by id; gigs can link a tour, setlist, technical rider and press kit. Writes need the
"editor" role in that band. save_* tools create when the id is omitted and otherwise change only the
fields you send. delete_* tools move things to the band's trash (restorable in the app for 30 days).`;

/** Builds an MCP server whose tools all act as `ctx.userId`. One instance per HTTP request. */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({ name: 'gigboy', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  registerBandTools(server, ctx);
  registerSongTools(server, ctx);
  registerSetlistTools(server, ctx);
  registerCalendarTools(server, ctx);
  registerGigPrepTools(server, ctx);
  return server;
}
