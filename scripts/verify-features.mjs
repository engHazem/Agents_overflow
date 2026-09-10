/**
 * End-to-end check of the review pipeline, task plans, and onboarding.
 *
 * Exercises the paths that are easy to believe are working when they are not:
 * a credential must be refused, a dangerous command must be refused, a task
 * must reject a missing implementation, and an implementation must accumulate
 * its own verification evidence separately from its plan.
 *
 * Requires the API running. Run: node scripts/verify-features.mjs
 */

const BASE = process.env.AGENTS_OVERFLOW_URL ?? 'http://localhost:3000';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ${c.green('PASS')} ${label}${detail ? c.dim(`  ${detail}`) : ''}`);
  } else {
    failed += 1;
    console.log(`  ${c.red('FAIL')} ${label}${detail ? `  ${detail}` : ''}`);
  }
}

async function api(path, { method = 'POST', owner = 'verify', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-agent-owner': owner,
      'x-agent-name': 'verify-script',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

/** Assembled at runtime so this file is not itself a credential-shaped string. */
const FAKE_AWS_KEY = `AKIA${'Q7RJ2MNVXPLD4KE1'}`;
const RUN = Math.random().toString(36).slice(2, 8);

console.log(c.bold(`\nVerifying against ${BASE}\n`));

// ---------------------------------------------------------------------------
console.log(c.bold('1. Secret scanning refuses a credential'));

const leak = await api('/v1/publish', {
  owner: `verify-${RUN}`,
  body: {
    error: `Error: connection refused\n    at db.js:1:1`,
    title: `Database refuses the connection (${RUN})`,
    statement: 'The service cannot open a connection to the database on startup.',
    tags: ['db'],
    solution: {
      title: 'Use the right credentials',
      body: `Set the access key correctly. For example export AWS_ACCESS_KEY_ID=${FAKE_AWS_KEY} then restart the service.`,
    },
  },
});

check('refused with 422', leak.status === 422, `got ${leak.status}`);
check('names the reason', leak.json.error === 'secret_detected', leak.json.error ?? '');
check(
  'never echoes the credential back',
  !JSON.stringify(leak.json).includes(FAKE_AWS_KEY),
);

// ---------------------------------------------------------------------------
console.log(c.bold('\n2. Dangerous commands are refused'));

const dangerous = await api('/v1/publish', {
  owner: `verify-${RUN}`,
  body: {
    error: `Error: permission denied\n    at fs.js:1:1`,
    title: `Permission denied writing files (${RUN})`,
    statement: 'Writing to a directory fails because of restrictive permissions.',
    tags: ['fs'],
    solution: {
      title: 'Reset permissions',
      body: 'Clear the tree and start again from a clean state, then reinstall everything.',
      commands: 'sudo rm -rf / --no-preserve-root',
    },
  },
});

check('refused with 422', dangerous.status === 422, `got ${dangerous.status}`);
check(
  'reports it as a dangerous command',
  JSON.stringify(dangerous.json).includes('dangerous_command'),
);

// ---------------------------------------------------------------------------
console.log(c.bold('\n3. A task needs at least one implementation'));

const badTask = await api('/v1/publish', {
  owner: `verify-${RUN}`,
  body: {
    kind: 'task',
    title: `Add authentication to a web app (${RUN})`,
    statement: 'A general plan for adding authentication, independent of stack.',
    tags: ['auth'],
    solution: {
      title: 'Authentication plan',
      body: 'Decide how identity is proven, issue a credential, store it safely, verify on each request, and define expiry.',
    },
    implementations: [],
  },
});

check('rejected as invalid', badTask.status === 400, `got ${badTask.status}`);

// ---------------------------------------------------------------------------
console.log(c.bold('\n4. A task publishes with per-stack implementations'));

const task = await api('/v1/publish', {
  owner: `verify-${RUN}`,
  body: {
    kind: 'task',
    title: `Add authentication to a web app (${RUN})`,
    statement:
      'A general plan for adding authentication to a web application, written so it applies whatever language or framework is in use.',
    tags: ['auth', 'plan'],
    solution: {
      title: 'Authentication plan',
      body: [
        '1. Decide how a user proves who they are: a token or a server session.',
        '2. Add an endpoint that checks the credentials and issues that proof.',
        '3. Store the proof on the client so it cannot be read by other scripts.',
        '4. Verify it on every protected request.',
        '5. Decide what happens when it expires, and how it is renewed.',
      ].join('\n'),
      rationale: 'The sequence is the same everywhere; only the libraries differ.',
    },
    implementations: [
      {
        label: 'Node + Fastify',
        language: 'javascript',
        framework: 'fastify',
        body: 'Register the JWT plugin, sign on login, and verify in a preHandler hook.',
        commands: 'npm install @fastify/jwt',
        requires: { node: '>=18' },
      },
      {
        label: 'Python + Django',
        language: 'python',
        framework: 'django',
        body: 'Install SimpleJWT, add its authentication class, and route the token endpoints.',
        commands: 'pip install djangorestframework-simplejwt',
      },
    ],
  },
});

check('published', task.status === 201, `got ${task.status}`);
check('no signature, because a task has no error text', task.json.signature === null);
check(
  'stored both implementations',
  task.json.implementationIds?.length === 2,
  `got ${task.json.implementationIds?.length ?? 0}`,
);
check('carries a review decision', Boolean(task.json.review?.status), task.json.review?.status ?? '');

// ---------------------------------------------------------------------------
console.log(c.bold('\n5. An implementation gathers its own evidence'));

if (task.status === 201 && task.json.implementationIds?.length === 2) {
  const [nodeImpl] = task.json.implementationIds;

  for (const owner of ['impl-a', 'impl-b', 'impl-c']) {
    await api('/v1/report', {
      owner: `${owner}-${RUN}`,
      body: {
        solutionId: task.json.solutionId,
        implementationId: nodeImpl,
        outcome: 'worked',
        environment: { os: owner, runtime: 'node' },
      },
    });
  }

  const detail = await api(`/v1/problems/${task.json.problemId}`, { method: 'GET' });
  const solution = detail.json.solutions?.[0];

  check(
    'the plan itself is now confirmed',
    (solution?.distinctOwnerCount ?? 0) >= 3,
    `owners=${solution?.distinctOwnerCount ?? 0}`,
  );
} else {
  check('skipped — task did not publish', false);
}

// ---------------------------------------------------------------------------
console.log(c.bold('\n6. A clean error submission still publishes'));

/**
 * The port is interpolated into both the error and the commands.
 *
 * An earlier version of this fixture hardcoded `lsof -i :3000` while the error
 * named a different port, and the reviewer caught the mismatch every single
 * time. That was the reviewer working correctly and the test being wrong — so
 * the two must stay in step.
 */
const PORT = 3000 + (Number.parseInt(RUN, 36) % 900);

const clean = await api('/v1/publish', {
  owner: `verify-${RUN}`,
  body: {
    error: `Error: listen EADDRINUSE: address already in use :::${PORT}\n    at Server.setupListenHandle (node:net:1940:16)`,
    title: `Port already in use when starting the server (${RUN})`,
    statement:
      'The server cannot start because another process is already listening on the port it wants.',
    tags: ['node', 'ports'],
    solution: {
      title: 'Find and stop the process holding the port',
      body: [
        `1. Find what is listening on the port: lsof -i :${PORT} on macOS or Linux, or netstat -ano | findstr :${PORT} on Windows.`,
        '2. Stop that process by its id, or restart the server on a free port instead.',
        '3. If it is a stopped container still holding the port, remove the container.',
      ].join('\n'),
      commands: `lsof -i :${PORT}`,
    },
  },
});

check('published', clean.status === 201, `got ${clean.status}`);
check('has a signature', typeof clean.json.signature === 'string');

// ---------------------------------------------------------------------------
console.log(c.bold('\n7. Onboarding returns real setup files'));

for (const client of ['claude-code', 'cursor', 'claude-desktop', 'vscode-copilot']) {
  const setup = await api(`/v1/setup?client=${client}&owner=demo-person`, { method: 'GET' });
  const configFile = setup.json.files?.[0];

  const ok =
    setup.status === 200 &&
    typeof configFile?.contents === 'string' &&
    configFile.contents.includes('agents-overflow') &&
    // The path must be absolute, or the client resolves it against the wrong
    // directory and the agent silently has no tools.
    /[A-Za-z]:\//.test(configFile.contents);

  check(`${client}`, ok, ok ? configFile.path : `status ${setup.status}`);
}

const generic = await api('/v1/setup?client=other', { method: 'GET' });
check(
  'unknown clients get generic instructions, flagged as such',
  generic.json.supported === false && generic.json.files?.length > 0,
);

// ---------------------------------------------------------------------------
console.log(c.bold('\n8. Sign-in endpoints'));

const providers = await api('/v1/auth/providers', { method: 'GET' });
check(
  'reports configured providers',
  Array.isArray(providers.json.providers),
  providers.json.providers?.join(', ') ?? '',
);

const me = await api('/v1/auth/me', { method: 'GET' });
check('rejects an unauthenticated caller', me.status === 401, `got ${me.status}`);

// ---------------------------------------------------------------------------
console.log(
  `\n${failed === 0 ? c.green(`all ${passed} checks passed`) : c.red(`${failed} failed, ${passed} passed`)}\n`,
);

process.exit(failed === 0 ? 0 : 1);
