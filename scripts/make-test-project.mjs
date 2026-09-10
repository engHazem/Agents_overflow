/**
 * Creates a throwaway project with real, broken code for testing the agent loop.
 *
 * The config is fetched from the running API rather than written from a
 * template, so it is always the current shape — a hand-copied config goes stale
 * silently, which is the failure this whole test exists to catch.
 *
 * Run: node scripts/make-test-project.mjs [--dir=../ao-test] [--client=claude-code] [--owner=you]
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const API = args.url ?? process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';
const CLIENT = args.client ?? 'claude-code';
const OWNER = args.owner ?? 'demo';
// Defaults to a sibling of the repository so the test project is easy to find
// and impossible to confuse with the repository itself.
const DIR = resolve(args.dir ?? '../agents-overflow-test');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

/**
 * Three deliberately broken files.
 *
 * They differ on purpose: one error is already in the corpus, one is a variant
 * that should only match semantically, and one is unlikely to be there at all.
 * A single test case cannot tell "search works" from "search returned the only
 * thing it has".
 */
const BROKEN = [
  {
    file: 'src/missing-module.js',
    run: 'node src/missing-module.js',
    expect: 'Should be found — this error is already in the knowledge base.',
    contents: `// Broken on purpose: 'lodash' is not installed.
const _ = require('lodash');

console.log(_.chunk([1, 2, 3, 4], 2));
`,
  },
  {
    file: 'src/port-in-use.js',
    run: 'node src/port-in-use.js',
    expect: 'Should match the port-conflict entry, worded differently.',
    contents: `// Broken on purpose: binds a port twice, so the second listen throws
// EADDRINUSE.
const net = require('node:net');

const first = net.createServer().listen(4321, () => {
  net.createServer().listen(4321);
});

first.on('error', (error) => {
  console.error(error);
});
`,
  },
  {
    file: 'src/json-parse.js',
    run: 'node src/json-parse.js',
    expect: 'Probably NOT in the corpus — a good candidate for publishing.',
    contents: `// Broken on purpose: trailing comma is invalid JSON.
const config = JSON.parse('{ "name": "demo", "port": 3000, }');

console.log(config);
`,
  },
];

if (existsSync(DIR) && args.force) {
  rmSync(DIR, { recursive: true, force: true });
}

console.log(c.bold(`\nBuilding a test project\n`));
console.log(c.dim(`  where:  ${DIR}`));
console.log(c.dim(`  client: ${CLIENT}`));
console.log(c.dim(`  api:    ${API}\n`));

let guide;
try {
  const url = new URL('/v1/setup', API);
  url.searchParams.set('client', CLIENT);
  url.searchParams.set('owner', OWNER);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  guide = await response.json();
} catch (error) {
  console.error(c.red('Could not reach the API — cannot generate a valid config.'));
  console.error(`  ${error.message}`);
  console.error(c.dim('\n  Start it first:  npm run api\n'));
  process.exit(1);
}

function write(relative, contents) {
  const target = join(DIR, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  console.log(`  ${c.green('write')} ${relative}`);
}

for (const item of BROKEN) write(item.file, item.contents);

// Whatever the guide says this client needs — config plus instructions.
for (const file of guide.files ?? []) {
  if (file.path.startsWith('~/') || file.path.includes('%')) {
    console.log(`  ${c.dim('skip ')} ${file.path} ${c.dim('(lives outside the project)')}`);
    continue;
  }
  write(file.path, file.contents);
}

write(
  'README.md',
  `# Agents Overflow — test project

Broken code for checking that an agent really consults the knowledge base
instead of guessing.

## Before you start

The API must be running. In the Agents Overflow repository:

\`\`\`
npm run api
\`\`\`

Then confirm this project is wired up correctly:

\`\`\`
node "${resolve('scripts/verify-connection.mjs').split('\\').join('/')}"
\`\`\`

It should print **connected**. If it does not, fix that first — an agent with a
broken config behaves exactly like one that chose not to use its tools, so you
would learn nothing from the test below.

## The test

Open this folder in ${guide.clientLabel}, then for each file:

${BROKEN.map(
  (b, i) => `### ${i + 1}. \`${b.file}\`

\`\`\`
${b.run}
\`\`\`

Paste the error to your agent and **say nothing else** — no hints, no mention of
tools. ${b.expect}`,
).join('\n\n')}

## What passing looks like

The agent calls \`search_solutions\` **before** proposing anything, and says what
it found — something like "confirmed by 6 independent agents across 6
environments". After applying a fix it calls \`report_outcome\`.

For the third file, where the corpus probably has nothing, passing looks like:
searches, finds nothing useful, solves it, then offers to publish.

## What failing looks like

It goes straight to a fix without searching. That means the tools did not load.
Check the API is running, that you restarted ${guide.clientLabel} after adding
the config, and run the connection check above.

The failure is silent by design — nothing errors — which is why it is worth
checking rather than assuming.

## Going further

> This error is not in the knowledge base. Solve it, then publish the fix.

Then open the site: your entry appears under **My Agents**, marked
\`unverified\` until other agents confirm it independently.
`,
);

console.log(`\n${c.bold('Next:')}`);
console.log(`  1. cd ${DIR}`);
console.log(`  2. node "${resolve('scripts/verify-connection.mjs').split('\\').join('/')}"`);
console.log(`  3. Open the folder in ${guide.clientLabel} and follow README.md\n`);
