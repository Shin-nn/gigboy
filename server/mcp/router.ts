import { Router } from 'express';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { resolveApiToken } from '../lib/apiTokens.js';
import { createMcpServer } from './server.js';

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

/**
 * MCP endpoint (Streamable HTTP, stateless): every POST carries a personal API token as
 * `Authorization: Bearer gbt_…` and gets a fresh server bound to that token's user. There are no
 * MCP sessions, so GET (server-initiated SSE stream) and DELETE (end session) aren't supported.
 */
export const mcpRouter = Router();

mcpRouter.post('/', async (req, res) => {
  try {
    const token = bearerToken(req);
    const userId = token ? await resolveApiToken(token) : null;
    if (!userId) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="gigboy"');
      jsonRpcError(res, 401, 'Missing or invalid API token. Create one in Gigboy under Profile → API tokens.');
      return;
    }
    const server = createMcpServer({ userId });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request failed:', err);
    if (!res.headersSent) jsonRpcError(res, 500, 'Internal server error.');
  }
});

mcpRouter.all('/', (_req, res) => {
  res.setHeader('Allow', 'POST');
  jsonRpcError(res, 405, 'Method not allowed. This MCP server is stateless; use POST.');
});
