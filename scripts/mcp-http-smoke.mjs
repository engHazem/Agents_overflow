/**
 * Smoke test for MCP over HTTP.
 *
 * Speaks JSON-RPC to `/mcp` the way a remote-capable client does: initialize,
 * list tools, then a real tool call. This is the path that lets someone connect
 * with only a URL, so it needs the same proof the stdio server got.
 *
 * Run with the API running: node scripts/mcp-http-smoke.mjs
 */

const BASE = process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';
const ENDPOINT = `${BASE}/mcp?owner=http-smoke&agent=smoke-test`;

let id = 0;

async function rpc(method, params) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The transport requires the client to say it accepts both.
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: (id += 1), method, params }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`${method} -> ${response.status}: ${text.slice(0, 300)}`);

  // The transport may answer as JSON or as a single SSE frame.
  const payload = text.startsWith('event:') || text.startsWith('data:')
    ? JSON.parse(text.split('data: ')[1] ?? '{}')
    : JSON.parse(text);

  if (payload.error) throw new Error(`${method} -> ${JSON.stringify(payload.error)}`);
  return payload.result;
}

try {
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'http-smoke', version: '1.0.0' },
  });
  console.log(`initialize  -> ${init?.serverInfo?.name} v${init?.serverInfo?.version}`);

  const tools = await rpc('tools/list', {});
  console.log(`tools/list  -> ${tools?.tools?.map((t) => t.name).join(', ')}`);

  const call = await rpc('tools/call', {
    name: 'search_solutions',
    arguments: {
      error: "Error: Cannot find module 'lodash'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)",
      limit: 2,
    },
  });

  const text = call?.content?.[0]?.text;
  if (!text) throw new Error('no content returned');

  const result = JSON.parse(text);
  console.log(`tools/call  -> tier=${result.tier} hits=${result.hits?.length}`);
  if (result.hits?.[0]) console.log(`               top: ${result.hits[0].title}`);

  console.log('\nMCP over HTTP OK — a client can connect with just the URL\n');
} catch (error) {
  console.error(`\nMCP over HTTP FAILED: ${error.message}\n`);
  process.exit(1);
}
