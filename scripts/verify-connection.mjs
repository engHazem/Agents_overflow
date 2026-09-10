/**
 * Proves a generated config actually connects.
 *
 * Reads the config file the way an MCP client does — from disk, taking only
 * what is in it — and completes a real handshake. This is the check that was
 * missing: everything else verified that we *produced* a file, not that the
 * file works.
 *
 * Run from the project you connected:
 *   node <repo>/scripts/verify-connection.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/**
 * Configs that belong to the project you are standing in.
 *
 * Only these decide pass or fail. A machine-wide config is reported but never
 * counted: it may belong to a client you are not testing, and failing on it
 * makes a working setup look broken.
 */
const PROJECT_SCOPED = new Set([
  '.mcp.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json',
  '.gemini/settings.json',
]);

/**
 * Every place a supported client keeps its MCP config.
 *
 * Project-scoped paths first, then machine-wide ones. Candidates that do not
 * apply to this OS simply do not exist and drop out, so all three Claude
 * Desktop locations can be listed unconditionally.
 */
const CANDIDATES = [
  '.mcp.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json',
  '.gemini/settings.json',
  join(homedir(), '.gemini', 'settings.json'),
  join(homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
  join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  join(homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
  ...(process.env.APPDATA ? [join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json')] : []),
];

const found = CANDIDATES.filter((p) => existsSync(p));

if (found.length === 0) {
  console.error(c.red('\nNo MCP config found here.'));
  console.error(c.dim('  Looked in: ' + CANDIDATES.slice(0, 4).join(', ')));
  console.error(c.dim('  Run this from the project you connected.\n'));
  process.exit(1);
}

console.log(c.bold('\nChecking your agent configuration\n'));

let failures = 0;

for (const path of found) {
  console.log(`${c.bold(path)}`);

  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.log(`  ${c.red('invalid JSON')} — ${error.message}\n`);
    failures += 1;
    continue;
  }

  const servers = config.mcpServers ?? config.servers ?? {};
  const entry = servers['agents-overflow'];

  if (!entry) {
    console.log(`  ${c.yellow('no agents-overflow entry')} — found: ${Object.keys(servers).join(', ') || 'nothing'}`);

    if (!PROJECT_SCOPED.has(path)) {
      // A machine-wide config for a client you are not testing. Counting it as
      // a failure sends someone off to fix something that was never part of
      // this project — the exact wild goose chase this script should prevent.
      console.log(c.dim('  Machine-wide config for another client — not part of this project.\n'));
      continue;
    }

    console.log('');
    failures += 1;
    continue;
  }

  // Each client names the URL field differently, and this script has to read
  // all of them: missing one reports a perfectly good config as broken, which
  // sends someone off to fix what was never wrong.
  const url = entry.url ?? entry.httpUrl ?? entry.serverUrl;

  if (url) {
    console.log(`  ${c.dim('connects by URL:')} ${url}`);
    const ok = await checkUrl(url);
    if (!ok) failures += 1;
  } else if (entry.command) {
    const args = entry.args ?? [];
    const bridgedUrl = args.find((arg) => /^https?:\/\//.test(arg));

    if (bridgedUrl) {
      /**
       * A stdio client bridged to the remote server, e.g. `npx -y mcp-remote
       * <url>`. The URL is the part that can be wrong, and it is testable from
       * here, so test it rather than trusting the shape of the command.
       */
      console.log(`  ${c.dim('bridges to:')} ${bridgedUrl} ${c.dim(`(via ${entry.command} ${args.filter((a) => a !== bridgedUrl).join(' ')})`)}`);
      const ok = await checkUrl(bridgedUrl);
      if (!ok) failures += 1;
      continue;
    }

    const target = args[args.length - 1] ?? '';
    console.log(`  ${c.dim('launches:')} ${entry.command} ${target}`);

    if (entry.command === 'node') {
      // A path-based entry. Only correct on the machine that generated it, and
      // when it is wrong the agent simply has no tools and never says so.
      if (!existsSync(target)) {
        console.log(`  ${c.red('that file does not exist')} — the agent will have no tools, silently.`);
        console.log(c.dim('    Regenerate the config from the Connect page: it now connects by URL,'));
        console.log(c.dim('    which has no path to get wrong.\n'));
        failures += 1;
        continue;
      }
      console.log(`  ${c.green('the server file exists')}`);
      console.log(c.dim('    Cannot test a stdio server from here — your client launches it.\n'));
      continue;
    }

    /**
     * Some other launcher. Saying nothing is better than a green tick we have
     * not earned — this script exists because a config that looks right and
     * connects to nothing is the expensive failure.
     */
    console.log(`  ${c.yellow('cannot verify this entry from here')} — it launches a local process.`);
    console.log(c.dim('    Nothing is wrong yet; this check just cannot prove it works.\n'));
  } else {
    console.log(`  ${c.red('entry has no url, serverUrl, httpUrl or command')}\n`);
    failures += 1;
  }
}

async function checkUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1' } },
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      console.log(`  ${c.red(`server answered ${response.status}`)}`);
      console.log(c.dim(`    ${text.slice(0, 160)}`));
      console.log(c.dim('    Is the API running? Try: npm run api\n'));
      return false;
    }

    const payload = text.includes('data: ') ? JSON.parse(text.split('data: ')[1]) : JSON.parse(text);
    const name = payload?.result?.serverInfo?.name;

    if (!name) {
      console.log(`  ${c.red('handshake did not return server info')}\n`);
      return false;
    }

    console.log(`  ${c.green('connected')} — ${name}\n`);
    return true;
  } catch (error) {
    console.log(`  ${c.red('could not reach it')} — ${error.message}`);
    console.log(c.dim('    Is the API running? Try: npm run api\n'));
    return false;
  }
}

if (failures === 0) {
  console.log(c.green('Configuration works. Restart your agent if you have not already.\n'));
} else {
  console.log(c.red(`${failures} problem${failures === 1 ? '' : 's'} found.\n`));
}

process.exit(failures === 0 ? 0 : 1);
