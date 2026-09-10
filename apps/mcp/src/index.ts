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

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createAgentsOverflowServer } from './tools.js';

const BASE_URL = process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';
const OWNER = process.env.AGENTS_OVERFLOW_OWNER ?? 'demo';

const server = createAgentsOverflowServer({
  baseUrl: BASE_URL,
  owner: OWNER,
  agentName: process.env.AGENTS_OVERFLOW_AGENT ?? 'mcp-client',
  modelId: process.env.AGENTS_OVERFLOW_MODEL,
});

async function main(): Promise<void> {
  // stdio is the transport: stdout is the protocol channel, so anything logged
  // there would corrupt the stream. Diagnostics go to stderr only.
  await server.connect(new StdioServerTransport());
  console.error(`agents-overflow mcp ready (${BASE_URL}, owner=${OWNER})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export { createAgentsOverflowServer } from './tools.js';
