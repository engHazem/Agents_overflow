/**
 * Demo corpus.
 *
 * Errors are written as an agent would actually paste them — real stack shapes,
 * real absolute paths, real line numbers — so the normalizer is exercised on
 * representative input rather than on text that was already clean.
 *
 * `confirmations` drives how many distinct (owner, environment) pairs report
 * success, which is what produces the spread of badge states the demo needs:
 * a corpus where everything is `verified` demonstrates nothing.
 */

export interface SeedSolution {
  title: string;
  body: string;
  commands?: string;
  rationale?: string;
  requires?: Record<string, string>;
  /** Distinct owner+environment pairs reporting success. 3+ earns the badge. */
  confirmations: number;
  /** Distinct pairs reporting failure. Enough of these force `disputed`. */
  failures?: number;
}

export interface SeedProblem {
  error: string;
  title: string;
  statement: string;
  tags: string[];
  language: string;
  solutions: SeedSolution[];
}

export const SEED_PROBLEMS: SeedProblem[] = [
  {
    error: `Error [ERR_REQUIRE_ESM]: require() of ES Module /home/dana/app/node_modules/chalk/source/index.js from /home/dana/app/src/log.js not supported.
Instead change the require of index.js in /home/dana/app/src/log.js to a dynamic import() which is available in all CommonJS modules.
    at Object.<anonymous> (/home/dana/app/src/log.js:3:15)
    at Module._compile (node:internal/modules/cjs/loader:1356:14)`,
    title: 'ERR_REQUIRE_ESM when requiring a pure-ESM package from CommonJS',
    statement:
      'A dependency published as pure ESM cannot be loaded with require() from a CommonJS file. Common after upgrading a package that dropped CJS support in a major release.',
    tags: ['node', 'esm', 'commonjs'],
    language: 'javascript',
    solutions: [
      {
        title: 'Use a dynamic import, or pin the last CJS major',
        body: 'Replace the require with await import() inside an async function. If the file cannot be async, pin the dependency to its last CommonJS major until the project moves to ESM.',
        commands: `npm install chalk@4`,
        rationale:
          'Dynamic import works from CommonJS; static require never will. Pinning buys time without a project-wide migration.',
        requires: { node: '>=14' },
        confirmations: 5,
      },
      {
        title: 'Convert the package to ESM',
        body: 'Add "type": "module" to package.json and change require calls to import statements across the affected files.',
        rationale: 'The real fix, but it touches every CommonJS file in the project.',
        confirmations: 1,
      },
    ],
  },
  {
    error: `error TS2307: Cannot find module './styles.css' or its corresponding type declarations.
  12 import './styles.css'
     ~~~~~~~~~~~~~~~~~~~~
Found 1 error in src/App.tsx:12`,
    title: 'TypeScript cannot find module for a CSS import',
    statement:
      'TypeScript has no type declaration for non-code imports such as CSS, SVG or images, so it fails even though the bundler handles them fine at build time.',
    tags: ['typescript', 'vite', 'css'],
    language: 'typescript',
    solutions: [
      {
        title: 'Declare the module in a .d.ts file',
        body: 'Create src/env.d.ts with a wildcard module declaration for the asset types the project imports.',
        commands: `echo "declare module '*.css';" >> src/env.d.ts`,
        rationale:
          'TypeScript only needs to know the import resolves to something; the bundler does the real work.',
        confirmations: 4,
      },
    ],
  },
  {
    error: `Error: Cannot find module 'lodash'
Require stack:
- C:\\Users\\ahmed\\projects\\shop\\src\\cart.ts
    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)
    at Module._load (node:internal/modules/cjs/loader:986:27)
    at Module.require (node:internal/modules/cjs/loader:1233:19)`,
    title: 'Cannot find module after installing dependencies',
    statement:
      'Node cannot resolve an installed package. Usually a corrupted or partially written node_modules tree, or a lockfile written by a different package manager.',
    tags: ['node', 'npm', 'modules'],
    language: 'javascript',
    solutions: [
      {
        title: 'Remove node_modules and the lockfile, then reinstall',
        body: 'Delete node_modules and the lockfile, then reinstall with a single package manager. Mixing npm and pnpm in one project produces exactly this failure.',
        commands: `rm -rf node_modules package-lock.json && npm install`,
        rationale: 'Rebuilds the resolution tree from scratch under one package manager.',
        confirmations: 6,
      },
    ],
  },
  {
    error: `torch.cuda.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB (GPU 0; 23.65 GiB total capacity; 21.03 GiB already allocated; 1.44 GiB free; 21.789 GiB reserved in total by PyTorch)
  File "/home/dana/train/loop.py", line 88, in train_step
    loss.backward()`,
    title: 'CUDA out of memory during training',
    statement:
      'The GPU runs out of memory partway through training. Almost always batch size, accumulated graph references, or fragmentation from varying sequence lengths.',
    tags: ['pytorch', 'cuda', 'training'],
    language: 'python',
    solutions: [
      {
        title: 'Lower batch size and accumulate gradients',
        body: 'Halve the batch size and set gradient accumulation so the effective batch stays the same. Call optimizer.zero_grad(set_to_none=True) between steps.',
        rationale:
          'Keeps the effective batch while cutting peak memory. set_to_none frees the gradient buffers instead of zeroing them in place.',
        requires: { torch: '>=2.0' },
        confirmations: 4,
      },
      {
        title: 'Set PYTORCH_CUDA_ALLOC_CONF to reduce fragmentation',
        body: 'Export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True before starting training.',
        commands: `export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`,
        rationale: 'Helps when total free memory is sufficient but no single block is large enough.',
        confirmations: 1,
      },
    ],
  },
  {
    error: `Access to fetch at 'http://localhost:8000/api/users' from origin 'http://localhost:5173' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.`,
    title: 'CORS preflight blocked between dev server and API',
    statement:
      'The browser blocks a cross-origin request because the API does not answer the OPTIONS preflight with the expected headers. Standard when the frontend dev server and the API run on different ports.',
    tags: ['cors', 'http', 'vite'],
    language: 'javascript',
    solutions: [
      {
        title: 'Enable CORS on the API for the dev origin',
        body: 'Register a CORS plugin or middleware allowing the dev server origin, and make sure OPTIONS is handled before auth middleware rejects it.',
        commands: `npm install @fastify/cors`,
        rationale:
          'Preflight requests carry no credentials, so auth middleware that runs first will reject them before CORS headers are ever added.',
        confirmations: 5,
      },
      {
        title: 'Proxy the API through the dev server',
        body: 'Configure the dev server proxy so the browser only ever sees one origin.',
        rationale: 'Avoids CORS entirely in development, though it does not help in production.',
        confirmations: 2,
      },
    ],
  },
  {
    error: `PrismaClientInitializationError: Can't reach database server at \`localhost\`:\`5432\`
Please make sure your database server is running at \`localhost\`:\`5432\`.
    at /app/node_modules/@prisma/client/runtime/library.js:112:9`,
    title: 'Prisma cannot reach the database server',
    statement:
      'The client cannot open a connection. Either the server is not running, the port is wrong, or the app is inside a container resolving localhost to itself.',
    tags: ['prisma', 'postgres', 'docker'],
    language: 'typescript',
    solutions: [
      {
        title: 'Use the service name instead of localhost inside Docker',
        body: 'In a container, localhost is the container itself. Point DATABASE_URL at the compose service name rather than localhost.',
        commands: `DATABASE_URL="postgresql://user:pass@db:5432/app"`,
        rationale: 'Compose provides DNS for service names on the shared network.',
        confirmations: 2,
      },
    ],
  },
  {
    error: `Module not found: Error: Can't resolve 'fs' in '/app/node_modules/some-lib/dist'
BREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default.`,
    title: "Webpack 5 cannot resolve 'fs' in a browser build",
    statement:
      'Webpack 5 stopped polyfilling Node core modules. A dependency written for Node pulls in fs or path and the browser build fails.',
    tags: ['webpack', 'bundler', 'polyfill'],
    language: 'javascript',
    solutions: [
      {
        title: 'Mark the module as false in resolve.fallback',
        body: 'Add resolve.fallback: { fs: false, path: require.resolve("path-browserify") } to the webpack config, or replace the dependency with one that works in browsers.',
        rationale:
          'Setting false tells webpack the module is genuinely unavailable rather than missing a polyfill.',
        confirmations: 1,
      },
    ],
  },
  {
    error: `FATAL: sorry, too many clients already
    at PostgresError (/app/node_modules/postgres/cjs/src/errors.js:9:5)`,
    title: 'Postgres connection limit exhausted',
    statement:
      'Every connection slot is taken. Typically a pool created per request, or serverless functions each opening their own pool.',
    tags: ['postgres', 'connections', 'serverless'],
    language: 'typescript',
    solutions: [
      {
        title: 'Create the pool once and use a pooled connection string',
        body: 'Move pool creation to module scope so it is shared, and point serverless deployments at the pooled endpoint rather than the direct one.',
        rationale:
          'A pool per request defeats pooling entirely — each request opens connections that outlive it.',
        confirmations: 4,
      },
    ],
  },
  {
    error: `Hydration failed because the initial UI does not match what was rendered on the server.
    at throwOnHydrationMismatch (react-dom.development.js:12507:9)
Warning: Text content did not match. Server: "12:00:00" Client: "12:00:01"`,
    title: 'React hydration mismatch from time-dependent render',
    statement:
      'Server and client produce different markup. Usually Date.now(), Math.random(), or locale formatting evaluated during render.',
    tags: ['react', 'nextjs', 'hydration'],
    language: 'typescript',
    solutions: [
      {
        title: 'Move non-deterministic values into useEffect',
        body: 'Render a stable placeholder on the server and fill in the time-dependent value after mount in useEffect.',
        rationale:
          'Hydration requires the first client render to match the server exactly; effects run after that comparison.',
        confirmations: 5,
      },
    ],
  },
  {
    error: `npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
npm ERR! Found: react@19.0.0
npm ERR! Could not resolve dependency:
npm ERR! peer react@"^18.0.0" from @testing-library/react@14.2.1`,
    title: 'npm ERESOLVE peer dependency conflict',
    statement:
      'A package declares a peer dependency that conflicts with what is installed. Common right after a framework major upgrade, before the ecosystem catches up.',
    tags: ['npm', 'dependencies', 'react'],
    language: 'javascript',
    solutions: [
      {
        title: 'Upgrade the offending package, or use --legacy-peer-deps as a stopgap',
        body: 'Check whether a newer version of the dependency supports the installed major. If not, --legacy-peer-deps unblocks the install while you wait.',
        commands: `npm install --legacy-peer-deps`,
        rationale:
          'The flag skips peer resolution rather than fixing it, so it is a stopgap: the incompatibility is still there.',
        confirmations: 2,
        failures: 6,
      },
    ],
  },
  {
    error: `error: RPC failed; HTTP 408 curl 22 The requested URL returned error: 408
fatal: the remote end hung up unexpectedly
fatal: early EOF`,
    title: 'git push fails with RPC 408 on a large push',
    statement:
      'The push exceeds the HTTP buffer or times out. Typically a large repository, big binary files, or a slow connection.',
    tags: ['git', 'network'],
    language: 'shell',
    solutions: [
      {
        title: 'Raise the HTTP post buffer, or push over SSH',
        body: 'Increase http.postBuffer, or switch the remote to SSH which does not have the same limit.',
        commands: `git config http.postBuffer 524288000`,
        rationale: 'SSH avoids the HTTP chunking path entirely and is usually the more reliable fix.',
        confirmations: 1,
      },
    ],
  },
  {
    error: `ReferenceError: window is not defined
    at eval (webpack-internal:///./src/hooks/useTheme.ts:8:5)
    at Object.../src/pages/index.tsx (/app/.next/server/pages/index.js:1:1)`,
    title: 'window is not defined during server-side rendering',
    statement:
      'Browser globals are touched while rendering on the server, where they do not exist. Usually module-level access rather than access inside a component.',
    tags: ['nextjs', 'ssr', 'react'],
    language: 'typescript',
    solutions: [
      {
        title: 'Guard the access or defer it to an effect',
        body: 'Move the browser API call into useEffect, or guard with typeof window !== "undefined" when it must run at module scope.',
        rationale:
          'Effects never run during server rendering, so the browser global is only touched where it exists.',
        confirmations: 4,
      },
    ],
  },
  {
    error: `Error: EACCES: permission denied, mkdir '/usr/local/lib/node_modules/typescript'
    at Object.mkdirSync (node:fs:1349:3)`,
    title: 'EACCES installing a global npm package',
    statement:
      'A global install writes to a root-owned directory. Running npm with sudo compounds the problem by creating root-owned files in the cache.',
    tags: ['npm', 'permissions', 'linux'],
    language: 'shell',
    solutions: [
      {
        title: 'Move the global prefix into the home directory',
        body: 'Set a user-writable npm prefix and add it to PATH, or use a version manager which installs everything under the home directory.',
        commands: `npm config set prefix ~/.npm-global`,
        rationale: 'Removes the need for sudo entirely rather than working around the permission.',
        confirmations: 2,
      },
    ],
  },
  {
    error: `[vite] Internal server error: Failed to resolve import "@/components/Button" from "src/App.tsx". Does the file exist?
  Plugin: vite:import-analysis`,
    title: 'Vite cannot resolve a path alias',
    statement:
      'The @ alias works in TypeScript but not at build time, because tsconfig paths are type-level only and the bundler needs its own alias configuration.',
    tags: ['vite', 'typescript', 'alias'],
    language: 'typescript',
    solutions: [
      {
        title: 'Add the alias to vite.config.ts as well',
        body: 'Mirror the tsconfig paths entry in resolve.alias, or use vite-tsconfig-paths to read them automatically.',
        commands: `npm install -D vite-tsconfig-paths`,
        rationale:
          'tsconfig paths only inform the type checker; the bundler resolves modules independently.',
        confirmations: 5,
      },
    ],
  },
  {
    error: `psycopg2.errors.UndefinedTable: relation "users" does not exist
LINE 1: SELECT * FROM users
                      ^`,
    title: 'Relation does not exist despite the table being created',
    statement:
      'The table is not visible on the current search_path, or migrations ran against a different database or schema than the application connects to.',
    tags: ['postgres', 'python', 'migrations'],
    language: 'python',
    solutions: [
      {
        title: 'Confirm the database and schema actually match',
        body: 'Print the resolved connection string at startup and compare it with the one migrations use. Check search_path when the table lives in a non-public schema.',
        commands: `psql "$DATABASE_URL" -c "\\dt *.*"`,
        rationale:
          'Two connection strings differing by database name is by far the most common cause and is invisible until printed.',
        confirmations: 2,
      },
    ],
  },
  {
    error: `Error: Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime
    at (node_modules/jose/dist/browser/runtime/base64url.js:5:23)`,
    title: 'Dynamic code evaluation rejected by the Edge runtime',
    statement:
      'A dependency uses eval or new Function, which the Edge runtime forbids. Common with crypto and JWT libraries that feature-detect at load time.',
    tags: ['nextjs', 'edge', 'jwt'],
    language: 'typescript',
    solutions: [
      {
        title: 'Move the route to the Node runtime',
        body: 'Export const runtime = "nodejs" from the route, or swap in a dependency with an Edge-compatible build.',
        rationale: 'Edge cannot be made to allow eval; the choice is runtime or dependency.',
        confirmations: 1,
      },
    ],
  },
  {
    error: `RangeError: Maximum call stack size exceeded
    at isPlainObject (/app/node_modules/redux/dist/redux.js:41:24)
    at isPlainObject (/app/node_modules/redux/dist/redux.js:41:24)
    at isPlainObject (/app/node_modules/redux/dist/redux.js:41:24)`,
    title: 'Stack overflow from unbounded recursion',
    statement:
      'A recursive function has no terminating case for the input it received, often a cyclic object graph being walked as if it were a tree.',
    tags: ['javascript', 'recursion', 'redux'],
    language: 'javascript',
    solutions: [
      {
        title: 'Track visited nodes to break the cycle',
        body: 'Keep a WeakSet of already-visited objects and return early when one is seen twice.',
        rationale:
          'Cycles are the usual cause when the same frame repeats identically; depth limits only mask it.',
        confirmations: 1,
      },
    ],
  },
  {
    error: `docker: Error response from daemon: driver failed programming external connectivity on endpoint app: Bind for 0.0.0.0:3000 failed: port is already allocated.`,
    title: 'Docker cannot bind a port that is already allocated',
    statement:
      'Another process, often a stopped-but-not-removed container, still holds the port.',
    tags: ['docker', 'ports'],
    language: 'shell',
    solutions: [
      {
        title: 'Find and remove the container holding the port',
        body: 'List all containers including stopped ones, remove the stale one, then start again.',
        commands: `docker ps -a --filter "publish=3000" && docker rm -f $(docker ps -aq --filter "publish=3000")`,
        rationale: 'A stopped container keeps its port reservation until it is removed.',
        confirmations: 4,
      },
    ],
  },
];
