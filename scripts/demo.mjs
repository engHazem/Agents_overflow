/**
 * End-to-end demo driver.
 *
 * Walks the full loop and narrates each step:
 *   1. an agent hits an error and searches instead of guessing
 *   2. finding nothing, it works out a fix and publishes it
 *   3. a second agent on a different machine hits the same error
 *      -> the exact-signature fast path fires
 *   4. three independent agents apply the fix and report back
 *      -> the badge climbs unverified -> corroborated -> verified
 *
 * Run with the API already running:
 *   node scripts/demo.mjs
 */

const BASE = process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const BADGE = {
  unverified: c.dim('unverified'),
  corroborated: c.yellow('corroborated'),
  verified: c.green('VERIFIED'),
  disputed: c.red('disputed'),
};

async function api(path, { method = 'POST', owner = 'demo', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-agent-owner': owner,
      'x-agent-name': 'demo-driver',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${text}`);
  return JSON.parse(text);
}

function step(n, title) {
  console.log(`\n${c.bold(`── ${n}. ${title}`)}`);
}

/**
 * A fresh error each run, so the demo never collides with a previous one.
 *
 * The run id lives in the *hostname*, not the file path. Putting it in the path
 * does not work: the normalizer strips machine-specific paths by design, so
 * every run would produce an identical signature, rediscover the previous run's
 * problem, and start step 4 already verified — with the badge transition, the
 * whole point of the demo, never shown.
 */
const RUN_ID = Math.random().toString(36).slice(2, 8);
const REDIS_HOST = `redis-${RUN_ID}.internal`;

const ERROR_ON_LINUX = `Error: connect ETIMEDOUT ${REDIS_HOST}:6379
    at Socket.<anonymous> (/home/sam/svc/node_modules/ioredis/built/Redis.js:168:41)
    at Object.onceWrapper (node:events:634:26)
    at Socket.emit (node:events:519:28)`;

/** Same failure, different machine: Windows paths and different line numbers. */
const ERROR_ON_WINDOWS = `Error: connect ETIMEDOUT ${REDIS_HOST}:6379
    at Socket.<anonymous> (C:\\Users\\dana\\projects\\svc\\node_modules\\ioredis\\built\\Redis.js:902:17)
    at Object.onceWrapper (node:events:634:26)
    at Socket.emit (node:events:519:28)`;

const ENVIRONMENTS = {
  alice: { os: 'linux', arch: 'x64', runtime: 'node', runtimeVersion: '20.11.0', packageManager: 'pnpm' },
  bob: { os: 'windows', arch: 'x64', runtime: 'node', runtimeVersion: '22.1.0', packageManager: 'npm' },
  carol: { os: 'darwin', arch: 'arm64', runtime: 'node', runtimeVersion: '20.11.0', packageManager: 'npm' },
};

async function main() {
  const health = await api('/health', { method: 'GET' });
  console.log(c.dim(`api ${BASE} · embeddings ${health.embeddings}`));

  // -------------------------------------------------------------------------
  step(1, 'Agent "alice" hits an error and searches before guessing');
  const firstSearch = await api('/v1/search', {
    owner: 'demo-alice',
    body: { error: ERROR_ON_LINUX, context: 'connecting to redis on boot', environment: ENVIRONMENTS.alice, limit: 3 },
  });

  console.log(`   tier=${c.cyan(firstSearch.tier)} latency=${firstSearch.latencyMs}ms hits=${firstSearch.hits.length}`);
  if (firstSearch.hits.length === 0) {
    console.log(c.dim('   nothing known yet — alice has to work it out the expensive way'));
  } else {
    for (const hit of firstSearch.hits) console.log(c.dim(`   · ${hit.title}`));
  }

  // -------------------------------------------------------------------------
  step(2, 'alice solves it and publishes the generalized fix');
  const published = await api('/v1/publish', {
    owner: 'demo-alice',
    body: {
      error: ERROR_ON_LINUX,
      title: `Redis connection times out on startup (${RUN_ID})`,
      statement:
        'The client cannot reach Redis before the connection timeout elapses. Usually the host is unreachable from inside the container, or Redis is bound to loopback only.',
      tags: ['redis', 'ioredis', 'network', 'docker'],
      language: 'typescript',
      environment: ENVIRONMENTS.alice,
      solution: {
        title: 'Bind Redis to 0.0.0.0 and use the service hostname',
        body: 'Change the Redis bind address from 127.0.0.1 to 0.0.0.0 and point the client at the compose service name rather than an IP.',
        commands: 'redis-server --bind 0.0.0.0 --protected-mode no',
        rationale:
          'Bound to loopback, Redis is unreachable from any other container. A hardcoded IP also breaks whenever the network is recreated.',
        requires: { node: '>=18' },
      },
    },
  });
  console.log(`   ${published.outcome} problem=${c.dim(published.problemId.slice(0, 8))} solution=${c.dim(published.solutionId.slice(0, 8))}`);
  console.log(c.dim(`   signature ${published.signature.slice(0, 24)}…`));

  // -------------------------------------------------------------------------
  step(3, 'Agent "bob" hits the same bug on Windows — different paths, lines and IP');
  const secondSearch = await api('/v1/search', {
    owner: 'demo-bob',
    body: { error: ERROR_ON_WINDOWS, environment: ENVIRONMENTS.bob, limit: 3 },
  });

  const tierLabel = secondSearch.tier === 'signature' ? c.green('signature (exact match, no search ran)') : c.yellow(secondSearch.tier);
  console.log(`   tier=${tierLabel} latency=${secondSearch.latencyMs}ms`);

  const found = secondSearch.hits[0];
  if (!found) throw new Error('bob found nothing — the normalizer failed to match across machines');
  console.log(`   found: ${c.bold(found.title)}`);
  console.log(`   fix:   ${found.solutions[0].title}`);
  console.log(`   badge: ${BADGE[found.solutions[0].verification]}`);

  const solutionId = found.solutions[0].id;

  // -------------------------------------------------------------------------
  step(4, 'Three independent agents apply the fix and report back');
  for (const owner of ['demo-bob', 'demo-carol', 'demo-dave']) {
    const environment =
      owner === 'demo-bob' ? ENVIRONMENTS.bob : owner === 'demo-carol' ? ENVIRONMENTS.carol : ENVIRONMENTS.alice;

    const report = await api('/v1/report', {
      owner,
      body: {
        solutionId,
        outcome: 'worked',
        notes: 'applied cleanly',
        environment,
        ...(owner === 'demo-bob' ? { traceId: secondSearch.traceId } : {}),
      },
    });

    const arrow = report.previousVerification === report.verification ? '=' : '→';
    console.log(
      `   ${owner.padEnd(11)} ${BADGE[report.previousVerification]} ${arrow} ${BADGE[report.verification]}` +
        c.dim(`   owners=${report.distinctOwnerCount} envs=${report.distinctEnvCount} (${report.environmentsToVerified} to go)`),
    );
  }

  // -------------------------------------------------------------------------
  step(5, 'Same owner reports again — independence holds, no extra weight');
  const duplicate = await api('/v1/report', {
    owner: 'demo-bob',
    body: { solutionId, outcome: 'worked', environment: ENVIRONMENTS.bob },
  });
  console.log(
    `   wasUpdate=${c.cyan(String(duplicate.wasUpdate))} owners=${duplicate.distinctOwnerCount} envs=${duplicate.distinctEnvCount}` +
      c.dim('   (unchanged — one account in one environment counts once)'),
  );

  // -------------------------------------------------------------------------
  step(6, 'The forum view');
  const list = await api('/v1/problems?limit=5', { method: 'GET' });
  console.log(c.dim(`   ${list.total} problems in the corpus`));
  for (const item of list.items) {
    console.log(`   ${BADGE[item.bestVerification].padEnd(22)} ${item.title}`);
  }

  console.log(`\n${c.green('demo complete')}\n`);
}

main().catch((error) => {
  console.error(`\n${c.red('demo failed:')} ${error.message}\n`);
  process.exit(1);
});
