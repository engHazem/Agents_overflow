/**
 * Smoke test for the MCP server.
 *
 * Speaks JSON-RPC over stdio the way a real MCP client would: initialize,
 * list tools, then actually call one. Confirms the server starts, advertises
 * its tools, and reaches the HTTP API — none of which typechecking proves.
 *
 * Requires the API to be running.
 */

import { spawn } from 'node:child_process';

const API = process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';

/**
 * Checked up front, because the MCP server starts happily without it.
 *
 * `initialize` and `tools/list` are answered locally, so the run gets two green
 * lines before the first real call fails — previously with a JSON parse error
 * from the API's plain-text response, which reads as a bug in the server rather
 * than a service that was never started.
 */
const health = await fetch(`${API}/health`).catch(() => null);
if (!health?.ok) {
  console.error(`\nCannot reach the API at ${API}.`);
  console.error('The MCP server is a thin wrapper over it, so every tool call would fail.');
  console.error('Start it first:  npm run api\n');
  process.exit(1);
}

const child = spawn(process.execPath, ['apps/mcp/dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, AGENTS_OVERFLOW_OWNER: 'mcp-smoke' },
});

let buffer = '';
const pending = new Map();

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  // Responses are newline-delimited JSON on stdout.
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    } catch {
      // Not a JSON-RPC frame; ignore.
    }
  }
});

child.stderr.on('data', (c) => process.stderr.write(`  [mcp] ${c}`));

let nextId = 1;
function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => reject(new Error(`${method} timed out`)), 40_000);
  });
}

try {
  const init = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '1.0.0' },
  });
  console.log(`initialize  -> ${init.result?.serverInfo?.name} v${init.result?.serverInfo?.version}`);

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  const tools = await send('tools/list', {});
  console.log(`tools/list  -> ${tools.result?.tools?.map((t) => t.name).join(', ')}`);

  const call = await send('tools/call', {
    name: 'search_solutions',
    arguments: {
      error: "Error: Cannot find module 'lodash'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)",
      limit: 2,
    },
  });

  const text = call.result?.content?.[0]?.text;
  if (!text) throw new Error(`no content returned: ${JSON.stringify(call).slice(0, 300)}`);

  // The tools return JSON on success and prose on failure, so quote what came
  // back rather than letting a parse error stand in for the real message.
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`tool did not return JSON. It said: ${text.slice(0, 300)}`);
  }
  console.log(`tools/call  -> tier=${payload.tier} hits=${payload.hits?.length}`);
  if (payload.hits?.[0]) {
    console.log(`               top: ${payload.hits[0].title}`);
    console.log(`               matched by: ${payload.hits[0].matchedBy.join('+')}`);
  }

  console.log('\nMCP server OK');
  child.kill();
  process.exit(0);
} catch (error) {
  console.error(`\nMCP smoke test FAILED: ${error.message}`);
  child.kill();
  process.exit(1);
}
