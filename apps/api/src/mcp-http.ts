/**
 * MCP over HTTP, mounted on the API itself.
 *
 * This is what lets an agent connect with nothing but a URL. The alternative —
 * launching a local server over stdio — needs a checkout of this repository and
 * an absolute path in the config, which is only ever correct on the machine that
 * generated it and fails silently everywhere else.
 *
 * Stateless: a fresh server and transport per request, no session store. The
 * tools are pure pass-throughs to endpoints that already exist, so there is no
 * per-connection state worth keeping, and statelessness means the API can run
 * behind a load balancer without sticky sessions.
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAgentsOverflowServer } from '@agents-overflow/mcp';
import type { FastifyInstance } from 'fastify';

import type { AppContext } from './context.js';

/**
 * The owner arrives in the query string.
 *
 * It is the independence key, so it has to come from somewhere — and a URL is
 * the only thing every MCP client can carry. That makes it as spoofable as the
 * `x-agent-owner` header it becomes, which is the same trust level the rest of
 * the service currently operates at. Personal API keys are the fix, and are on
 * the roadmap; until then this is honest rather than pretending otherwise.
 */
function ownerFrom(query: unknown): string {
  const value = (query as { owner?: unknown })?.owner;
  const owner = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 64) : '';
  return owner || 'anonymous';
}

function agentNameFrom(query: unknown): string {
  const value = (query as { agent?: unknown })?.agent;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 64) : 'mcp-http';
}

export async function registerMcpHttp(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post('/mcp', async (request, reply) => {
    const server = createAgentsOverflowServer({
      // Loopback to our own API rather than calling the route handlers
      // directly: the tools then exercise exactly the same path an external
      // agent does, including validation and the agent-only guards.
      baseUrl: ctx.config.apiBaseUrl,
      owner: ownerFrom(request.query),
      agentName: agentNameFrom(request.query),
    });

    const transport = new StreamableHTTPServerTransport({
      // Stateless: no session id, so nothing has to be remembered between calls.
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Fastify must stop managing the response: the transport writes to the raw
    // stream itself, and letting both write produces a corrupted reply.
    reply.hijack();

    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      request.log.error({ err: error }, 'mcp http request failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          }),
        );
      }
    }
  });

  /**
   * Clients probe with GET before opening a stream. Answering plainly beats a
   * 404, which reads as "wrong URL" and sends people back to check their config
   * when the config was right.
   */
  app.get('/mcp', async (_request, reply) =>
    reply.status(405).send({
      error: 'method_not_allowed',
      message: 'This MCP endpoint accepts POST. Point your client at this URL and it will handle it.',
    }),
  );
}
