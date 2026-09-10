/**
 * Measures what the service actually saves, by running the same agent twice.
 *
 * Arm A: an agent debugs a broken project with ordinary tools — read a file,
 *        run it, install a package, edit code. No knowledge base.
 * Arm B: the same agent, same model, same error, same tools, plus
 *        `search_solutions` backed by the running API.
 *
 * Both arms run against a real model and the token counts come from the
 * provider's own `usage` field, not an estimate. The dominant cost is not the
 * size of any single message: it is that an agentic loop resends the whole
 * transcript every turn, so turn 6 pays for turns 1 through 5 again. Cutting
 * turns is what saves tokens, and that is the thing being measured here.
 *
 * Each arm gets a pristine copy of the project, so edits in one run cannot
 * make the next run easier.
 *
 * Run: npm run measure:savings [-- --runs=3 --scenario=missing-module]
 */

import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const API = args.url ?? process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';
const BASE_URL = process.env.OPENAI_BASE_URL;
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = args.model ?? process.env.CHAT_MODEL ?? 'gpt-4o-mini';
const RUNS = Number(args.runs ?? 3);
const MAX_TURNS = Number(args.maxTurns ?? 10);

/**
 * List prices per million tokens, at the time of writing.
 *
 * Reported as a table rather than a single figure because the saving is
 * measured in tokens; converting to money is the reader's own arithmetic and
 * depends entirely on which model they run. Override with --price-in/--price-out.
 */
const PRICES = [
  { model: 'gpt-4o-mini', in: 0.15, out: 0.6 },
  { model: 'gpt-4o', in: 2.5, out: 10 },
  { model: 'Claude Sonnet class', in: 3, out: 15 },
  { model: 'Claude Opus class', in: 15, out: 75 },
];

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

if (!BASE_URL || !API_KEY) {
  console.error(c.red('OPENAI_BASE_URL and OPENAI_API_KEY are required.'));
  console.error(c.dim('  Run through npm so .env is loaded:  npm run measure:savings\n'));
  process.exit(1);
}

/**
 * Fixtures live here, not in a project on disk.
 *
 * An earlier version read the throwaway test project, and when that folder was
 * edited the harness silently measured a project where every file was missing.
 * Owning the fixtures makes a run reproducible.
 *
 * `difficulty` is the axis that matters. Searching is not free — it adds a tool
 * schema to every turn and a result payload that is resent for the rest of the
 * conversation — so on an error the model already knows it can only lose. The
 * question worth measuring is where the crossover is, which needs both kinds.
 */
const SCENARIOS = [
  {
    id: 'missing-module',
    difficulty: 'easy',
    entry: 'src/missing-module.js',
    files: {
      'src/missing-module.js': "const _ = require('lodash');\n\nconsole.log(_.chunk([1, 2, 3, 4], 2));\n",
    },
  },
  {
    id: 'port-in-use',
    difficulty: 'easy',
    entry: 'src/port-in-use.js',
    files: {
      'src/port-in-use.js':
        "const net = require('node:net');\n\n" +
        'const first = net.createServer().listen(4321, () => {\n' +
        '  net.createServer().listen(4321);\n});\n\n' +
        "first.on('error', (error) => {\n  console.error(error);\n});\n",
    },
  },
  {
    id: 'json-parse',
    difficulty: 'easy',
    entry: 'src/json-parse.js',
    files: {
      'src/json-parse.js':
        'const config = JSON.parse(\'{ "name": "demo", "port": 3000, }\');\n\nconsole.log(config);\n',
    },
  },
  /**
   * The regime the service is actually for: an error no model can have seen.
   *
   * A public error like MODULE_NOT_FOUND is already in the model's weights, so
   * retrieval cannot beat what it already knows. The errors that cost real
   * money are the ones from a company's own code — a cryptic internal code
   * whose fix is a convention someone decided once. No amount of reasoning
   * recovers it; either you know it or you flail.
   *
   * That is the case a shared corpus is supposed to win, and it is the case
   * this scenario measures.
   */
  {
    id: 'internal-error-code',
    difficulty: 'hard',
    entry: 'src/pipeline.js',
    corpus: {
      title: 'PIPELINE_E017: stage rejected payload (schema drift)',
      statement:
        'An internal pipeline stage aborts with PIPELINE_E017 when the payload no longer matches the schema recorded at build time. The stage is correct and the payload is correct; the mismatch is expected during a migration.',
      solution: {
        title: 'Set tolerateDrift on the stage options',
        body: 'Set `tolerateDrift: true` in the stage options in config.js. The strict check is meant for release builds and blocks any in-progress schema migration. Do not edit the stage or the payload — both are correct.',
        rationale:
          'PIPELINE_E017 is a build-time schema assertion, not a data error. Relaxing it is the documented path during a migration.',
      },
    },
    files: {
      'src/config.js': "module.exports = {\n  stage: 'transform',\n  tolerateDrift: false,\n};\n",
      'src/pipeline.js':
        "const options = require('./config');\n\n" +
        'function run(payload) {\n' +
        '  if (!options.tolerateDrift) {\n' +
        '    throw new Error(`PIPELINE_E017: stage "${options.stage}" rejected payload (schema drift)`);\n' +
        '  }\n' +
        '  return payload.map((n) => n * 2);\n' +
        '}\n\n' +
        'console.log(run([1, 2, 3]));\n',
    },
  },
];

/**
 * Identical in both arms.
 *
 * It does not mention the knowledge base or hint that searching is preferable.
 * Telling the assisted arm to search would measure obedience rather than
 * usefulness, and would make the result meaningless.
 */
const SYSTEM_PROMPT = [
  'You are a coding agent fixing a bug in a Node.js project.',
  'Work through the tools available to you. Do not guess at file contents — read them.',
  'When the program runs without error, call `done` with a one-line description of the fix.',
  'Be efficient: every tool call costs the user money.',
].join('\n');

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const BASE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the project.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path relative to the project root.' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_file',
      description: 'Run a JavaScript file with node and return its output.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Replace the contents of a file.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, contents: { type: 'string' } },
        required: ['path', 'contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'install_package',
      description: 'Install an npm package into the project.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Call when the program runs without error.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
    },
  },
];

const SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'search_solutions',
    description:
      'Search a knowledge base of fixes that other agents have confirmed work. Pass the raw error text.',
    parameters: {
      type: 'object',
      properties: { error: { type: 'string', description: 'The raw error output, unedited.' } },
      required: ['error'],
    },
  },
};

/**
 * Real tool execution against a real copy of the project.
 *
 * `install_package` is recorded rather than executed — a network install would
 * add minutes per run and its only effect on the measurement is whether the
 * next `run_file` succeeds, which is simulated faithfully.
 */
function makeExecutor(dir, state) {
  return async function execute(name, rawArgs) {
    let a;
    try {
      a = JSON.parse(rawArgs || '{}');
    } catch {
      return 'Invalid JSON arguments.';
    }

    switch (name) {
      case 'read_file': {
        const target = join(dir, a.path ?? '');
        if (!existsSync(target)) return `No such file: ${a.path}`;
        if (statSync(target).isDirectory()) {
          return `${a.path} is a directory. Contains: ${readdirSync(target).join(', ')}`;
        }
        return readFileSync(target, 'utf8');
      }

      case 'write_file': {
        const target = join(dir, a.path ?? '');
        if (!existsSync(dirname(target))) return `No such directory for: ${a.path}`;
        writeFileSync(target, a.contents ?? '');
        return `Wrote ${a.path}.`;
      }

      case 'install_package': {
        state.installed.add(a.name);
        return `Installed ${a.name}.`;
      }

      case 'run_file': {
        const target = join(dir, a.path ?? '');
        if (!existsSync(target)) return `No such file: ${a.path}`;
        try {
          const out = execFileSync(process.execPath, [target], {
            cwd: dir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 5000,
          });
          return out.trim() || '(ran with no output, exit code 0)';
        } catch (error) {
          const stderr = (error.stderr ?? '') + (error.stdout ?? '');
          // A package the agent "installed" resolves on the next run, which is
          // what would happen for real.
          if (/Cannot find module '([^']+)'/.test(stderr)) {
            const missing = /Cannot find module '([^']+)'/.exec(stderr)[1];
            if (state.installed.has(missing)) return '(ran with no output, exit code 0)';
          }
          return stderr.trim() || String(error.message);
        }
      }

      case 'search_solutions': {
        const response = await fetch(new URL('/v1/search', API), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-agent-owner': 'measure' },
          body: JSON.stringify({ error: a.error ?? '', limit: 3 }),
        });
        if (!response.ok) return `Search failed: ${response.status}`;
        const payload = await response.json();
        state.searched = true;
        return JSON.stringify(trimSearchResult(payload));
      }

      default:
        return `Unknown tool: ${name}`;
    }
  };
}

/**
 * What an MCP client would actually put in the transcript.
 *
 * The full response carries embeddings-adjacent metadata no agent reads;
 * counting it would inflate the assisted arm's cost and understate the saving,
 * so it is trimmed to the fields a caller acts on.
 */
function trimSearchResult(payload) {
  return {
    traceId: payload.traceId,
    tier: payload.tier,
    hits: (payload.hits ?? []).slice(0, 3).map((hit) => ({
      title: hit.title,
      statement: hit.statement,
      solutions: (hit.solutions ?? []).slice(0, 2).map((s) => ({
        title: s.title,
        body: s.body,
        commands: s.commands,
        verification: s.verification,
        confidence: s.confidence,
        distinctEnvCount: s.distinctEnvCount,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/** A pristine copy of a scenario, so one run cannot make the next one easier. */
function materialize(scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'ao-measure-'));
  for (const [path, contents] of Object.entries(scenario.files)) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return dir;
}

/** The real failure, from really running the file. Never a paraphrase. */
function captureError(scenario) {
  const dir = materialize(scenario);
  try {
    execFileSync(process.execPath, [join(dir, scenario.entry)], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    return null;
  } catch (failure) {
    const text = ((failure.stderr ?? '') + (failure.stdout ?? '')).trim();
    // The temp path is an artifact of the harness; leaving it in would make the
    // error text differ between machines and pollute the search signature.
    return text.split(dir.split('\\').join('/')).join('/project').split(dir).join('/project');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Puts a scenario's answer in the corpus before measuring it.
 *
 * Without this the hard scenario measures nothing useful: an assisted arm that
 * searches and misses pays the overhead and gets no benefit, which says the
 * corpus is empty, not that retrieval is worthless. Publishing is idempotent —
 * a second run matches the existing signature and updates rather than
 * duplicating.
 */
async function seedCorpus(scenario, error) {
  if (!scenario.corpus) return null;

  const response = await fetch(new URL('/v1/publish', API), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-owner': 'measure-seed',
      'x-agent-name': 'measure-harness',
    },
    body: JSON.stringify({
      kind: 'error',
      error,
      title: scenario.corpus.title,
      statement: scenario.corpus.statement,
      tags: scenario.corpus.tags ?? [],
      language: 'javascript',
      solution: scenario.corpus.solution,
    }),
  });

  if (!response.ok) {
    return { ok: false, detail: `${response.status} ${(await response.text()).slice(0, 120)}` };
  }
  const payload = await response.json();
  return { ok: true, outcome: payload.outcome };
}

async function chat(messages, tools) {
  const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, tools, temperature: 0 }),
  });

  if (!response.ok) {
    throw new Error(`model returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  return response.json();
}

/** One arm of one scenario. Returns measured usage, not an estimate. */
async function runArm({ scenario, assisted, error }) {
  const dir = materialize(scenario);

  const state = { installed: new Set(), searched: false };
  const execute = makeExecutor(dir, state);
  const tools = assisted ? [...BASE_TOOLS, SEARCH_TOOL] : BASE_TOOLS;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Running \`node ${scenario.file}\` fails:\n\n${error}` },
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let turns = 0;
  let solved = false;
  let summary = '';

  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const payload = await chat(messages, tools);
      turns += 1;
      promptTokens += payload.usage?.prompt_tokens ?? 0;
      completionTokens += payload.usage?.completion_tokens ?? 0;

      const message = payload.choices?.[0]?.message;
      if (!message) break;
      messages.push(message);

      const calls = message.tool_calls ?? [];
      if (calls.length === 0) break;

      let finished = false;
      for (const call of calls) {
        if (call.function.name === 'done') {
          solved = true;
          finished = true;
          try {
            summary = JSON.parse(call.function.arguments || '{}').summary ?? '';
          } catch {
            summary = '';
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: 'ok' });
          continue;
        }
        let result;
        try {
          result = await execute(call.function.name, call.function.arguments);
        } catch (toolError) {
          result = `Tool failed: ${toolError.message}`;
        }
        if (args.verbose) {
          console.log(
            c.dim(
              `\n      ${call.function.name}(${String(call.function.arguments).slice(0, 90)}) ` +
                `→ ${String(result).replace(/\s+/g, ' ').slice(0, 110)}`,
            ),
          );
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: String(result).slice(0, 8000) });
      }

      if (finished) break;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return { promptTokens, completionTokens, turns, solved, searched: state.searched, summary };
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function money(tokensIn, tokensOut, price) {
  return (tokensIn / 1_000_000) * price.in + (tokensOut / 1_000_000) * price.out;
}

// ---------------------------------------------------------------------------

console.log(c.bold('\nMeasuring what the knowledge base saves\n'));
console.log(c.dim(`  model:     ${MODEL}`));
console.log(c.dim(`  runs:      ${RUNS} per arm per scenario`));
console.log(c.dim(`  api:       ${API}\n`));

const scenarios = args.scenario ? SCENARIOS.filter((s) => s.id === args.scenario) : SCENARIOS;
const rows = [];

for (const scenario of scenarios) {
  const error = captureError(scenario);
  if (!error) {
    console.log(c.yellow(`  ${scenario.id}: does not fail — skipping\n`));
    continue;
  }

  console.log(`${c.bold(scenario.id)} ${c.dim(`(${scenario.difficulty})`)}`);

  const seeded = await seedCorpus(scenario, error);
  if (seeded && !seeded.ok) {
    console.log(c.red(`  could not seed the corpus — ${seeded.detail}\n`));
    continue;
  }
  if (seeded) console.log(c.dim(`  seeded the corpus (${seeded.outcome})`));

  const arms = {};
  for (const assisted of [false, true]) {
    const label = assisted ? 'with search' : 'unaided';
    const results = [];

    for (let run = 0; run < RUNS; run += 1) {
      process.stdout.write(c.dim(`  ${label.padEnd(12)} run ${run + 1}/${RUNS} … `));
      try {
        const result = await runArm({ scenario, assisted, error });
        results.push(result);
        console.log(
          `${result.turns} turns, ${(result.promptTokens + result.completionTokens).toLocaleString()} tokens ` +
            (result.solved ? c.green('solved') : c.red('gave up')),
        );
      } catch (failure) {
        console.log(c.red(`failed — ${failure.message}`));
      }
    }

    if (results.length === 0) continue;

    arms[assisted ? 'assisted' : 'unaided'] = {
      promptTokens: mean(results.map((r) => r.promptTokens)),
      completionTokens: mean(results.map((r) => r.completionTokens)),
      turns: mean(results.map((r) => r.turns)),
      solveRate: results.filter((r) => r.solved).length / results.length,
      searchRate: results.filter((r) => r.searched).length / results.length,
    };
  }

  if (arms.unaided && arms.assisted) {
    const before = arms.unaided.promptTokens + arms.unaided.completionTokens;
    const after = arms.assisted.promptTokens + arms.assisted.completionTokens;
    rows.push({ scenario: scenario.id, ...arms, before, after, saved: before - after });
    const pct = ((before - after) / before) * 100;
    console.log(
      `  ${c.cyan('→')} ${Math.round(before).toLocaleString()} → ${Math.round(after).toLocaleString()} tokens ` +
        `(${pct >= 0 ? c.green(`${pct.toFixed(0)}% saved`) : c.red(`${Math.abs(pct).toFixed(0)}% worse`)})`,
    );
    // The comparison only means anything if the assisted arm actually reached
    // for the tool, and only if both arms actually fixed the bug. A cheap run
    // that gave up is not a saving.
    console.log(
      c.dim(`    searched in ${(arms.assisted.searchRate * 100).toFixed(0)}% of assisted runs · `) +
        c.dim(
          `solved ${(arms.unaided.solveRate * 100).toFixed(0)}% unaided vs ${(arms.assisted.solveRate * 100).toFixed(0)}% assisted\n`,
        ),
    );
  } else {
    console.log('');
  }
}

if (rows.length === 0) {
  console.error(c.red('No scenario produced both arms — nothing to report.\n'));
  process.exit(1);
}

const totalBefore = rows.reduce((a, r) => a + r.before, 0);
const totalAfter = rows.reduce((a, r) => a + r.after, 0);
const inBefore = rows.reduce((a, r) => a + r.unaided.promptTokens, 0);
const outBefore = rows.reduce((a, r) => a + r.unaided.completionTokens, 0);
const inAfter = rows.reduce((a, r) => a + r.assisted.promptTokens, 0);
const outAfter = rows.reduce((a, r) => a + r.assisted.completionTokens, 0);

console.log(c.bold('Per scenario\n'));
console.log(
  `  ${'scenario'.padEnd(16)}${'unaided'.padStart(10)}${'assisted'.padStart(11)}${'saved'.padStart(10)}${'turns'.padStart(14)}`,
);
for (const r of rows) {
  const pct = ((r.saved / r.before) * 100).toFixed(0);
  console.log(
    `  ${r.scenario.padEnd(16)}${Math.round(r.before).toLocaleString().padStart(10)}` +
      `${Math.round(r.after).toLocaleString().padStart(11)}${`${pct}%`.padStart(10)}` +
      `${`${r.unaided.turns.toFixed(1)} → ${r.assisted.turns.toFixed(1)}`.padStart(14)}`,
  );
}

const savedPct = ((totalBefore - totalAfter) / totalBefore) * 100;
console.log(
  `\n  ${c.bold('total'.padEnd(16))}${Math.round(totalBefore).toLocaleString().padStart(10)}` +
    `${Math.round(totalAfter).toLocaleString().padStart(11)}${c.green(`${savedPct.toFixed(0)}%`.padStart(10))}`,
);

console.log(c.bold('\n\nCost per 1,000 errors resolved\n'));
console.log(`  ${'model'.padEnd(22)}${'unaided'.padStart(12)}${'assisted'.padStart(12)}${'saved'.padStart(12)}`);

const scale = 1000 / rows.length;
for (const price of PRICES) {
  const before = money(inBefore * scale, outBefore * scale, price);
  const after = money(inAfter * scale, outAfter * scale, price);
  console.log(
    `  ${price.model.padEnd(22)}${`$${before.toFixed(2)}`.padStart(12)}` +
      `${`$${after.toFixed(2)}`.padStart(12)}${c.green(`$${(before - after).toFixed(2)}`.padStart(12))}`,
  );
}

console.log(
  c.dim(
    '\n  Token counts are the provider\'s own usage figures, averaged over runs.\n' +
      '  Prices are list prices per million tokens at the time of writing.\n',
  ),
);

// Machine-readable, so the README figures can be regenerated rather than retyped.
if (args.json) {
  writeFileSync(
    String(args.json),
    JSON.stringify(
      { model: MODEL, runs: RUNS, measuredAt: new Date().toISOString(), rows, totalBefore, totalAfter },
      null,
      2,
    ),
  );
  console.log(c.dim(`  Wrote ${args.json}\n`));
}
