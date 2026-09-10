/**
 * Prints the config to connect another project to this service.
 *
 * The `.mcp.json` at this repo's root points at `localhost`, which is right for
 * working on the service and wrong for testing it from somewhere else. This
 * prints the same thing for any supported client, any owner, any host.
 *
 * It delegates to the same generator the Connect page uses, deliberately: two
 * implementations of "what goes in the config file" is two dialect tables to
 * keep in step, and a wrong field name fails silently — the agent simply has no
 * tools and carries on guessing, which looks identical to the service being
 * useless.
 *
 * Run: node scripts/agent-config.mjs [owner-handle] [client]
 *   AGENTS_OVERFLOW_URL=https://… node scripts/agent-config.mjs ada cursor
 */

import { buildSetupGuide } from '../packages/core/dist/onboarding.js';

const CLIENTS = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'windsurf',
  'vscode-copilot',
  'gemini-cli',
  'gemini-code-assist',
  'other',
];

/**
 * The owner handle is the independence key: two agents sharing it cannot
 * corroborate each other's results, however many machines they run on. So
 * each person testing needs their own.
 */
const owner = process.argv[2] ?? 'my-handle';
const client = process.argv[3] ?? 'claude-code';

if (!CLIENTS.includes(client)) {
  console.error(`Unknown client "${client}". One of: ${CLIENTS.join(', ')}`);
  process.exit(1);
}

const apiUrl = process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';
const guide = buildSetupGuide({
  client,
  apiUrl,
  owner,
  packageName: process.env.MCP_PACKAGE_NAME || undefined,
});

const [config, instructions] = guide.files;

// The config goes to stdout alone, so `> .mcp.json` produces a usable file.
console.log(config.contents.trimEnd());

const err = (line = '') => console.error(line);

err();
err(`Client:    ${guide.clientLabel}`);
err(`Endpoint:  ${guide.serverUrl}`);
err(`Owner:     ${owner}${process.argv[2] ? '' : '  (pass one as the first argument)'}`);
err();
err(`Save as:   ${config.path}`);
for (const location of guide.locations) {
  err(`             ${location.os}: ${location.path}`);
}
err(`           ${config.action === 'merge' ? 'Merge into the existing file — replacing it drops any other MCP servers.' : 'A new file.'}`);
err();

if (guide.quickStart.available) {
  err('Or skip the file entirely:');
  for (const command of guide.quickStart.commands) {
    err(`  ${command.label}: ${command.command}`);
  }
  err();
}

// Connecting the tools does not make an agent reach for them, so the config on
// its own is half the job. Naming the other half here keeps this script honest
// with the Connect page rather than quietly shipping a connection nobody uses.
err(`Then add the debugging protocol to ${instructions.path}, or the agent will`);
err('have the tools available and never use them. The full text is on the');
err(`Connect page, and in docs/INTEGRATION.md.`);
err();

for (const note of guide.notes) {
  err(`  · ${note}`);
}
err();
