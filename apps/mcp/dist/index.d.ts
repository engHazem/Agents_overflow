#!/usr/bin/env node
/**
 * MCP server over stdio — for clients that launch the server themselves.
 *
 * Most clients can now connect to the API's `/mcp` endpoint by URL instead,
 * which needs no local checkout and no path. This entrypoint remains for
 * clients that only speak stdio.
 *
 * Configure with `AGENTS_OVERFLOW_URL` (default http://localhost:3000) and
 * `AGENTS_OVERFLOW_OWNER`, which is the independence key — two agents sharing an
 * owner cannot corroborate each other.
 */
export { createAgentsOverflowServer } from './tools.js';
//# sourceMappingURL=index.d.ts.map