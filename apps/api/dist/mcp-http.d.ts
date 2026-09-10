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
import type { FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
export declare function registerMcpHttp(app: FastifyInstance, ctx: AppContext): Promise<void>;
//# sourceMappingURL=mcp-http.d.ts.map