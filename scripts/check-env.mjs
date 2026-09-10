/**
 * Reports which environment variables are configured, without printing secrets.
 *
 * Exists because "did I actually save that?" is otherwise answered by opening a
 * file full of credentials, and a missing key currently shows up as a confusing
 * runtime failure rather than a clear message.
 *
 * Run: node scripts/check-env.mjs
 */

import { existsSync, readFileSync } from 'node:fs';

const GROUPS = [
  { name: 'Database', keys: ['DATABASE_URL'], required: true },
  { name: 'AI', keys: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CHAT_MODEL'], required: false },
  {
    name: 'Sign-in with GitHub',
    keys: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    required: false,
  },
  {
    name: 'Sign-in with Google',
    keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    required: false,
  },
  { name: 'Sessions', keys: ['SESSION_SECRET', 'AUTH_REDIRECT_URL'], required: false },
];

/** Values safe to show in full — they are not secrets. */
const SHOW_VALUE = new Set(['OPENAI_BASE_URL', 'CHAT_MODEL', 'AUTH_REDIRECT_URL']);

if (!existsSync('.env')) {
  console.error('.env not found. Copy .env.example to .env first.');
  process.exit(1);
}

const values = new Map();
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
  if (!match) continue;
  const raw = match[2].trim();
  // Strip one layer of matching quotes, and anything after an unquoted #.
  const unquoted = /^(['"])(.*)\1$/.exec(raw);
  values.set(match[1], unquoted ? unquoted[2] : raw.split('#')[0].trim());
}

let missingRequired = 0;

for (const group of GROUPS) {
  const states = group.keys.map((key) => {
    const value = values.get(key);
    if (value === undefined) return { key, state: 'missing' };
    if (value === '') return { key, state: 'empty' };
    return { key, state: 'set', value };
  });

  const ready = states.every((s) => s.state === 'set');
  console.log(`\n${ready ? '[ok]' : '[--]'} ${group.name}`);

  for (const { key, state, value } of states) {
    if (state === 'set') {
      const shown = SHOW_VALUE.has(key) ? value : `set (${value.length} chars)`;
      console.log(`     ${key.padEnd(22)} ${shown}`);
    } else {
      console.log(`     ${key.padEnd(22)} ${state.toUpperCase()}`);
      if (group.required) missingRequired += 1;
    }
  }
}

console.log('');
process.exit(missingRequired > 0 ? 1 : 0);
