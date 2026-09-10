/**
 * Connects the agent in the current project to Agents Overflow.
 *
 * Writes the two files by hand-assembly-free: the MCP config for whichever
 * client you use, and the instructions file that tells the agent when to reach
 * for the tools. Both are fetched from the running API so the server path is
 * correct for this machine — a relative or stale path fails silently, leaving
 * the agent with no tools and no indication anything is wrong.
 *
 * Run from the project you want to connect:
 *
 *   node <path-to-repo>/scripts/connect-agent.mjs --client=cursor
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const API = args.url ?? process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';
const CLIENT = args.client ?? 'claude-code';
const OWNER = args.owner;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/** `~/…` is a shell convention, not a filesystem one — Node needs it expanded. */
function expand(path) {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : resolve(path);
}

/**
 * Merges the server entry into an existing JSON config.
 *
 * Never overwrites the whole file: these configs routinely hold other MCP
 * servers and unrelated settings, and replacing them is a destructive surprise
 * that is hard to attribute later.
 */
function mergeJson(target, contents) {
  const incoming = JSON.parse(contents);

  if (!existsSync(target)) return incoming;

  let existing;
  try {
    existing = JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    // A malformed file is not ours to silently discard.
    throw new Error(`${target} exists but is not valid JSON. Merge the entry by hand.`);
  }

  for (const [key, value] of Object.entries(incoming)) {
    existing[key] = { ...(existing[key] ?? {}), ...value };
  }
  return existing;
}

/** Appends to a text file, skipping if the protocol is already there. */
function mergeText(target, contents) {
  if (!existsSync(target)) return contents;

  const current = readFileSync(target, 'utf8');
  if (current.includes('Agents Overflow')) return null;

  return `${current.trimEnd()}\n\n${contents}`;
}

console.log(c.bold(`\nConnecting this project to Agents Overflow\n`));
console.log(c.dim(`  api:    ${API}`));
console.log(c.dim(`  client: ${CLIENT}`));
console.log(c.dim(`  here:   ${process.cwd()}\n`));

let guide;
try {
  const url = new URL('/v1/setup', API);
  url.searchParams.set('client', CLIENT);
  if (OWNER) url.searchParams.set('owner', String(OWNER));

  const response = await fetch(url);
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  guide = await response.json();
} catch (error) {
  console.error(c.red('Could not reach the API.'));
  console.error(`  ${error.message}`);
  console.error(c.dim(`\n  Start it with: npm run api\n`));
  process.exit(1);
}

let written = 0;
let skipped = 0;

for (const file of guide.files) {
  const target = expand(file.path);

  try {
    /**
     * Merge whenever the file already exists, whatever the guide called it.
     *
     * `action` describes the usual case for a person reading instructions —
     * "you probably do not have this file yet". It is not permission for a
     * script to overwrite one that does exist. Cursor's config is declared
     * `create`, and taking that literally destroyed an unrelated MCP server
     * that was already configured.
     */
    const exists = existsSync(target);

    const next = !exists
      ? file.contents
      : target.endsWith('.json')
        ? JSON.stringify(mergeJson(target, file.contents), null, 2) + '\n'
        : mergeText(target, file.contents);

    if (next === null) {
      console.log(`  ${c.dim('skip')}  ${file.path} ${c.dim('(already connected)')}`);
      skipped += 1;
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
    console.log(`  ${c.green('write')} ${file.path}`);
    written += 1;
  } catch (error) {
    console.log(`  ${c.red('fail')}  ${file.path} — ${error.message}`);
  }
}

console.log(`\n${c.green(`${written} file${written === 1 ? '' : 's'} written`)}${skipped ? c.dim(`, ${skipped} already in place`) : ''}`);

console.log(c.bold(`\nOne thing left:`));
console.log(`  Restart ${guide.clientLabel}. MCP servers are read at startup.\n`);

console.log(c.dim('Then break something and paste the error to your agent. It should call'));
console.log(c.dim('search_solutions before suggesting a fix. If it does not, the tools did'));
console.log(c.dim('not load — that failure is silent, so it is worth checking.\n'));
