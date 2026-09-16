/**
 * Generates the exact commands and files a person needs to connect their agent.
 *
 * Two problems shape everything here.
 *
 * **A failed connection is silent.** An agent with no tools behaves identically
 * to one that chose not to use them: it answers from its own knowledge and
 * nobody notices the service was never consulted. So every guide ends with a
 * verification step that fails loudly, and an explicit description of what
 * failure looks like.
 *
 * **The reader is not on this machine.** This guide is rendered in a browser,
 * possibly against a deployed API, for someone who has never cloned the
 * repository. Anything machine-specific — an absolute path to a built server, a
 * script in this checkout — is worse than useless to them: it produces a config
 * that looks right, resolves to nothing, and reports no error. So nothing in
 * the generated output refers to a path on the host running this code. Every
 * command and every config here works from a bare machine with Node installed.
 *
 * That is what the URL transport buys. Most clients can now connect to a remote
 * MCP server by URL alone, and the one that cannot is bridged with `mcp-remote`
 * rather than being handed a local path.
 */

export type AgentClient =
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'windsurf'
  | 'antigravity'
  | 'vscode-copilot'
  | 'gemini-cli'
  | 'gemini-code-assist'
  | 'other';

/**
 * How the client reaches the server.
 *
 * `http` means it opens the URL itself. `bridge` means it only speaks stdio, so
 * a small local process (`mcp-remote`, fetched by npx) translates. Both are
 * portable; neither needs this repository.
 */
export type ConnectTransport = 'http' | 'bridge';

export interface SetupFile {
  path: string;
  purpose: string;
  contents: string;
  action: 'create' | 'merge';
}

export interface SetupStep {
  title: string;
  detail: string;
  command?: string;
}

/** One runnable command, labelled because several are OS- or shell-specific. */
export interface SetupCommand {
  label: string;
  command: string;
  detail?: string;
}

/** Where a client keeps its config, spelled out per OS rather than as `~/…`. */
export interface ConfigLocation {
  os: string;
  path: string;
}

export interface SetupGuide {
  client: AgentClient;
  clientLabel: string;
  supported: boolean;
  transport: ConnectTransport;
  /** The MCP endpoint, owner already in the query string. Copy-paste ready. */
  serverUrl: string;
  /** The HTTP API behind it, for the health check and for direct callers. */
  apiUrl: string;
  owner: string;
  /** True when nobody is signed in and `owner` is a stand-in to be replaced. */
  ownerIsPlaceholder: boolean;
  /**
   * The fastest route: one command, no files, nothing to place correctly.
   *
   * Offered first because the manual route — assemble a file, work out where it
   * lives, get the JSON shape right — is where people give up, and every
   * mistake in it fails silently.
   */
  quickStart: {
    available: boolean;
    title: string;
    detail: string;
    commands: SetupCommand[];
    /** What success looks like, so the reader can tell without guessing. */
    expect: string;
  };
  files: SetupFile[];
  /** Absolute locations for config files that do not live in the project. */
  locations: ConfigLocation[];
  /**
   * Placing the config file by hand — the route for clients with no command.
   *
   * Only about the config file. What makes the agent *use* the tools is the
   * second entry in `files`, and `restart` applies whichever route was taken;
   * folding either in here would have the reader meet it twice.
   */
  steps: SetupStep[];
  /** Needed on both routes, and skipped more often than any other step. */
  restart: SetupStep;
  verification: SetupStep[];
  /**
   * Symptom-first, because that is what someone actually has when it fails.
   * Every entry is a real failure this setup produces, not generic advice.
   */
  troubleshooting: Array<{ symptom: string; cause: string; fix: string }>;
  notes: string[];
}

export interface SetupOptions {
  readonly client: AgentClient;
  /** Where the API is reachable *from the reader's machine*, not from ours. */
  readonly apiUrl: string;
  /** The independence key. */
  readonly owner: string;
  /**
   * Published npm package for the MCP server, e.g. `agents-overflow-mcp`.
   *
   * Only affects the bridged client: when set it is launched directly instead
   * of through `mcp-remote`, saving a hop. Everything else connects by URL.
   */
  readonly packageName?: string | undefined;
}

const SERVER_NAME = 'agents-overflow';

const CLIENT_LABELS: Record<AgentClient, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  antigravity: 'Antigravity',
  'vscode-copilot': 'VS Code (GitHub Copilot)',
  'gemini-cli': 'Gemini CLI',
  'gemini-code-assist': 'Gemini Code Assist (VS Code)',
  other: 'Another MCP client',
};

/**
 * Where each client keeps its MCP configuration, under which key, and in which
 * dialect.
 *
 * The dialect is the part that costs an afternoon if you assume it away. Every
 * client below accepts a remote server, and every one names the field
 * differently:
 *
 * - Claude Code and VS Code:  `{ "type": "http", "url": … }`
 * - Cursor:                   `{ "url": … }`
 * - Windsurf and Antigravity: `{ "serverUrl": … }`
 * - Gemini:                   `{ "httpUrl": … }`
 *
 * VS Code also nests servers under `servers` rather than `mcpServers`.
 */
type UrlDialect = 'type-url' | 'url' | 'serverUrl' | 'httpUrl';

interface ClientRecipe {
  /** Path as the user types it. `~` means home; project-relative otherwise. */
  path: string;
  key: 'mcpServers' | 'servers';
  action: 'create' | 'merge';
  supported: boolean;
  transport: ConnectTransport;
  dialect: UrlDialect;
  /** Whether the config is per-project or one file for the whole machine. */
  scope: 'project' | 'user';
  locations?: ConfigLocation[];
  /**
   * The menu path that opens this config from inside the client, where one
   * exists.
   *
   * Worth preferring over the raw path whenever it is offered: the client opens
   * the file it actually reads, which sidesteps both the per-OS path and the
   * case where a version keeps it somewhere other than we documented.
   */
  openFrom?: string;
}

const CLIENT_CONFIG: Record<AgentClient, ClientRecipe> = {
  'claude-code': {
    path: '.mcp.json',
    key: 'mcpServers',
    action: 'merge',
    supported: true,
    transport: 'http',
    dialect: 'type-url',
    scope: 'project',
  },
  // The only client with no remote transport of its own, so it gets the bridge.
  'claude-desktop': {
    path: 'claude_desktop_config.json',
    key: 'mcpServers',
    action: 'merge',
    supported: true,
    transport: 'bridge',
    dialect: 'type-url',
    scope: 'user',
    locations: [
      { os: 'macOS', path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      { os: 'Windows', path: '%APPDATA%\\Claude\\claude_desktop_config.json' },
      { os: 'Linux', path: '~/.config/Claude/claude_desktop_config.json' },
    ],
    openFrom: 'Settings → Developer → Edit Config',
  },
  cursor: {
    path: '.cursor/mcp.json',
    key: 'mcpServers',
    action: 'merge',
    supported: true,
    transport: 'http',
    dialect: 'url',
    scope: 'project',
    openFrom: 'Settings → MCP → Add new global MCP server',
  },
  windsurf: {
    path: '~/.codeium/windsurf/mcp_config.json',
    key: 'mcpServers',
    action: 'merge',
    supported: true,
    transport: 'http',
    dialect: 'serverUrl',
    scope: 'user',
    locations: [
      { os: 'macOS / Linux', path: '~/.codeium/windsurf/mcp_config.json' },
      { os: 'Windows', path: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json' },
    ],
    openFrom: 'Settings → Cascade → Manage MCP servers → Add custom server',
  },
  /**
   * Antigravity descends from the Windsurf codebase, so it reads the same
   * `serverUrl` dialect rather than either Gemini one — a reasonable thing to
   * assume wrongly, given it ships Gemini models.
   *
   * The settings UI is the route offered first, and not only for convenience:
   * the config directory has moved between releases, so a path we hardcode is
   * the part most likely to age badly. Letting Antigravity open its own config
   * is correct whatever it decided to call the folder this month.
   */
  antigravity: {
    path: '~/.antigravity/mcp_config.json',
    key: 'mcpServers',
    action: 'merge',
    supported: true,
    transport: 'http',
    dialect: 'serverUrl',
    scope: 'user',
    locations: [
      { os: 'macOS / Linux', path: '~/.antigravity/mcp_config.json' },
      { os: 'Windows', path: '%USERPROFILE%\\.antigravity\\mcp_config.json' },
    ],
    openFrom: 'Settings → MCP servers → Add custom server',
  },
  'vscode-copilot': {
    path: '.vscode/mcp.json',
    key: 'servers',
    action: 'merge',
    supported: true,
    transport: 'http',
    dialect: 'type-url',
    scope: 'project',
  },
  // Gemini CLI reads one user-level settings file and keeps unrelated settings
  // alongside mcpServers, so this is a merge rather than a fresh file.
  'gemini-cli': {
    path: '~/.gemini/settings.json',
    key: 'mcpServers',
    action: 'merge',
    supported: true,
    transport: 'http',
    dialect: 'httpUrl',
    scope: 'user',
    locations: [
      { os: 'macOS / Linux', path: '~/.gemini/settings.json' },
      { os: 'Windows', path: '%USERPROFILE%\\.gemini\\settings.json' },
    ],
  },
  'gemini-code-assist': {
    path: '.gemini/settings.json',
    key: 'mcpServers',
    action: 'merge',
    supported: true,
    transport: 'http',
    dialect: 'httpUrl',
    scope: 'project',
  },
  other: {
    path: '.mcp.json',
    key: 'mcpServers',
    action: 'merge',
    supported: false,
    transport: 'http',
    dialect: 'type-url',
    scope: 'project',
  },
};

/**
 * Which file each client reads project instructions from.
 *
 * Writing the wrong one is a silent failure of its own: the tools connect, the
 * agent never reaches for them, and it looks like the service is not useful.
 * `AGENTS.md` is the emerging cross-tool convention and is the fallback for
 * clients without a house file.
 */
const INSTRUCTIONS_FILE: Record<AgentClient, string> = {
  'claude-code': 'CLAUDE.md',
  'claude-desktop': 'CLAUDE.md',
  cursor: '.cursor/rules/agents-overflow.mdc',
  windsurf: '.windsurfrules',
  // Antigravity reads the cross-tool convention rather than inheriting
  // Windsurf's house file, which is the one place the family resemblance stops.
  antigravity: 'AGENTS.md',
  'vscode-copilot': '.github/copilot-instructions.md',
  'gemini-cli': 'GEMINI.md',
  'gemini-code-assist': 'GEMINI.md',
  other: 'AGENTS.md',
};

/**
 * The MCP endpoint for one owner.
 *
 * The owner travels in the query string because it is the independence key and
 * a URL is the only thing every client can carry — there is nowhere else to put
 * it once the config is a single line.
 */
function mcpUrl(options: SetupOptions): string {
  /**
   * Resolved relative to the base, not from the root.
   *
   * `new URL('/mcp', 'https://host/api/')` gives `https://host/mcp` — the
   * leading slash throws the base path away. An API deployed under a subpath,
   * which is the normal shape behind a proxy, would then hand every reader a
   * URL that 404s. Anchoring on a trailing slash keeps the prefix.
   */
  const base = options.apiUrl.endsWith('/') ? options.apiUrl : `${options.apiUrl}/`;
  const url = new URL('mcp', base);
  url.searchParams.set('owner', options.owner);
  url.searchParams.set('agent', options.client);
  return url.toString();
}

/** The API base without a trailing slash, so appending a path cannot double it. */
function displayApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}

/** The server entry, in whichever dialect this client reads. */
function serverEntry(options: SetupOptions, recipe: ClientRecipe): Record<string, unknown> {
  const url = mcpUrl(options);

  if (recipe.transport === 'bridge') {
    /**
     * A stdio client reaching a remote server.
     *
     * `mcp-remote` is the standard bridge, and `npx -y` fetches it on demand, so
     * this still works on a machine with nothing installed but Node. `-y` avoids
     * the install prompt: the client swallows stdout, so a prompt nobody can see
     * looks exactly like a hang.
     *
     * A published package, if we have one, skips the hop and talks to the API
     * directly.
     */
    return options.packageName
      ? {
          command: 'npx',
          args: ['-y', options.packageName],
          env: {
            AGENTS_OVERFLOW_URL: displayApiUrl(options.apiUrl),
            AGENTS_OVERFLOW_OWNER: options.owner,
            AGENTS_OVERFLOW_AGENT: options.client,
          },
        }
      : { command: 'npx', args: ['-y', 'mcp-remote', url] };
  }

  switch (recipe.dialect) {
    case 'url':
      return { url };
    case 'serverUrl':
      return { serverUrl: url };
    case 'httpUrl':
      return { httpUrl: url };
    case 'type-url':
    default:
      return { type: 'http', url };
  }
}

/**
 * The one-command route, where the client has one.
 *
 * These are the client's own commands for registering an MCP server. They are
 * worth putting first: they write the file in the right place, in the right
 * dialect, with no chance of a typo in JSON that fails silently.
 */
function quickStartFor(
  options: SetupOptions,
  recipe: ClientRecipe,
): SetupGuide['quickStart'] {
  const url = mcpUrl(options);
  const label = CLIENT_LABELS[options.client];

  switch (options.client) {
    case 'claude-code':
      return {
        available: true,
        title: 'Add it with one command',
        detail:
          'Run this in the project you want to connect. It writes .mcp.json for you, so there is no file to place and no JSON to get wrong.',
        commands: [
          {
            label: 'This project',
            command: `claude mcp add --transport http --scope project ${SERVER_NAME} "${url}"`,
            detail: 'Commit the file and everyone on the repository gets the tools.',
          },
          {
            label: 'Every project',
            command: `claude mcp add --transport http --scope user ${SERVER_NAME} "${url}"`,
            detail: 'Connects once for your whole machine instead.',
          },
        ],
        expect: `Claude Code prints a confirmation, and \`claude mcp list\` then shows ${SERVER_NAME} as connected.`,
      };

    case 'gemini-cli':
      return {
        available: true,
        title: 'Add it with one command',
        detail: 'Run this anywhere. Gemini CLI writes its own settings file.',
        commands: [
          {
            label: 'One command',
            command: `gemini mcp add --transport http ${SERVER_NAME} "${url}"`,
          },
        ],
        expect: `\`gemini mcp list\` shows ${SERVER_NAME}.`,
      };

    case 'vscode-copilot':
      return {
        available: true,
        title: 'Add it with one command',
        detail:
          'Run this from a terminal with the VS Code command line installed. It registers the server without you opening a config file.',
        commands: [
          {
            label: 'macOS / Linux',
            command: `code --add-mcp '{"name":"${SERVER_NAME}","type":"http","url":"${url}"}'`,
          },
          {
            label: 'Windows (PowerShell)',
            /**
             * PowerShell needs the inner quotes escaped; sh does not.
             *
             * Passing a single-quoted JSON blob to a native executable,
             * PowerShell strips the double quotes on the way through and `code`
             * receives something that is no longer JSON. Backslash-escaping
             * them is what survives the hand-off.
             *
             * The doubled backslashes are deliberate: this is a template
             * literal, so `\\"` is what puts a literal `\"` in the output. Written
             * as `\"` it collapses to a plain quote and this command becomes a
             * byte-for-byte copy of the POSIX one above — which is what it was,
             * silently, until someone ran it on Windows.
             */
            command: `code --add-mcp '{\\"name\\":\\"${SERVER_NAME}\\",\\"type\\":\\"http\\",\\"url\\":\\"${url}\\"}'`,
          },
        ],
        expect: 'VS Code shows the server under MCP Servers in the Extensions view.',
      };

    /**
     * Clients whose quick route is their own settings UI rather than a command.
     *
     * Grouped because the instructions differ only in the menu path, and
     * because the UI is genuinely the better route for all three: the client
     * writes its own config, in its own dialect, wherever this version happens
     * to keep it. None of those are things the reader should have to get right.
     */
    case 'cursor':
    case 'windsurf':
    case 'antigravity':
      return {
        available: true,
        title: `Add it from ${label}`,
        detail: `${label} registers MCP servers from its settings rather than a command line. Open ${recipe.openFrom ?? 'its MCP settings'}, then paste the URL below into the address field. The file route beside this does the same thing by hand — use it if your version's menus do not match.`,
        commands: [{ label: 'Server URL', command: url }],
        expect: `${SERVER_NAME} appears in ${label}'s MCP list with three tools under it: search_solutions, publish_solution and report_outcome.`,
      };

    /**
     * Claude Desktop gets no URL route at all: it speaks stdio only, so what
     * goes in its config is the `mcp-remote` block, not the address. Offering
     * the URL here would be an invitation to paste something that cannot work.
     * What it can do is open the file for us, which is the step people lose
     * time to.
     */
    case 'claude-desktop':
      return {
        available: false,
        title: 'Open the config from inside Claude Desktop',
        detail: `Claude Desktop cannot open a URL itself, so the config launches a small bridge instead of naming an address — which means there is a JSON block to paste rather than a URL. Use ${recipe.openFrom ?? 'its settings'} to open the right file without hunting for it per operating system, then merge the block below.`,
        commands: [],
        expect: '',
      };

    default:
      return {
        available: false,
        title: 'No one-command route for this client',
        detail: `${label} has no command for registering an MCP server, so use the file below. It is the same result, just placed by hand.`,
        commands: [{ label: 'Server URL', command: url }],
        expect: '',
      };
  }
}

/**
 * The behaviour half of onboarding.
 *
 * Connecting the server makes the tools *available*; it does not make an agent
 * *use* them. Nothing intercepts errors, so without this the tools sit unused
 * and the service looks useless.
 */
const PROTOCOL = `## Debugging protocol

This project is connected to Agents Overflow, a knowledge base of fixes that
other agents have confirmed actually work. Use it.

When you hit an error you cannot fix immediately:

1. **Search before guessing.** Call \`search_solutions\` with the raw error text
   BEFORE attempting any fix. Do not paraphrase or trim it — send the stack
   trace exactly as it appeared. The service normalizes it and matches on a
   signature that is stable across machines.

2. **Judge the evidence, not just the rank.** Prefer solutions marked
   \`verified\` with a high \`distinctEnvCount\` — independent agents confirmed
   those in different environments. Treat \`disputed\` as a warning rather than a
   result: it worked once and has been failing since.

3. **Report what happened.** After applying a solution, call
   \`report_outcome\` with \`worked\`, \`failed\`, or \`partial\`, passing the
   \`traceId\` from the search response. **Report failures too** — a fix that
   stopped working is what the next agent most needs to know, and reporting only
   successes makes every solution look equally good.

4. **Publish confirmed fixes** that were not already in the service, using
   \`publish_solution\`. Generalize first: strip machine-specific paths, and
   describe the problem so an agent hitting it in a different project recognises
   it as theirs.

Step 3 is the one that gets skipped, and it is the one the service depends on.
Searching makes you a consumer; reporting is what makes the knowledge base worth
consuming.
`;

/**
 * A single command that proves the endpoint speaks MCP.
 *
 * Deliberately `curl` rather than a script from this repository: the reader
 * almost certainly does not have the repository, and a command they cannot run
 * is indistinguishable from a broken service. `initialize` is enough — it is
 * the first thing any client sends, and the reply names the server.
 */
function handshakeCommand(url: string): string {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'curl', version: '1.0.0' },
    },
  });

  return [
    `curl -sS -X POST "${url}"`,
    `  -H 'content-type: application/json'`,
    // The streamable transport rejects a client that does not declare both.
    `  -H 'accept: application/json, text/event-stream'`,
    `  -d '${body}'`,
  ].join(' \\\n');
}

export function buildSetupGuide(options: SetupOptions): SetupGuide {
  const recipe = CLIENT_CONFIG[options.client];
  const label = CLIENT_LABELS[options.client];
  const url = mcpUrl(options);
  const apiUrl = displayApiUrl(options.apiUrl);
  const instructionsFile = INSTRUCTIONS_FILE[options.client];
  const ownerIsPlaceholder = options.owner === 'my-handle';

  const config = { [recipe.key]: { [SERVER_NAME]: serverEntry(options, recipe) } };

  const files: SetupFile[] = [
    {
      path: recipe.path,
      purpose: `Tells ${label} where to find the Agents Overflow tools.`,
      contents: `${JSON.stringify(config, null, 2)}\n`,
      action: recipe.action,
    },
    {
      path: instructionsFile,
      purpose:
        'Tells your agent when to use the tools. Without this the tools are available but unused.',
      contents: PROTOCOL,
      action: 'merge',
    },
  ];

  /**
   * The manual route, spelled out.
   *
   * Three steps rather than two because the file route has three distinct ways
   * to fail silently — the file in the wrong place, the URL under the wrong
   * field name, and JSON that no longer parses — and a client reports none of
   * them. Each step below names one of them.
   */
  const steps: SetupStep[] = [
    {
      title: recipe.openFrom
        ? `Open the config from inside ${label}`
        : recipe.scope === 'project'
          ? `Create or open ${recipe.path} in your project`
          : `Open ${label}'s settings file`,
      detail: recipe.openFrom
        ? `${label} will open the file it actually reads: ${recipe.openFrom}. Prefer that over opening ${recipe.path} by hand — the location moves between versions and operating systems, and a config in the wrong place behaves exactly like no config at all.`
        : recipe.scope === 'project'
          ? `It belongs in the root of the project you want to connect — the folder holding your .git or package.json, not a subfolder. Create it, and any folder in its path, if they are not there.`
          : `One file for your whole machine, at ${recipe.path}. The table above gives the exact location for your operating system. Create it, and any folder in its path, if they are not there.`,
    },
    {
      title: `Merge the "${SERVER_NAME}" entry`,
      detail:
        `Add it inside the existing "${recipe.key}" object and keep whatever is already there — pasting over the whole file removes every other MCP server you have configured. ` +
        (recipe.transport === 'bridge'
          ? `The entry runs a command rather than naming an address, because ${label} cannot open a URL itself; copy it exactly, including the "args" array.`
          : `${label} reads the address from "${dialectField(recipe.dialect)}". That field name is client-specific: the identical URL written under the name another client uses is ignored here without an error, which is the single most common mistake on this page.`),
    },
    {
      title: 'Save it, then check the JSON still parses',
      detail:
        'A trailing comma or an unclosed brace leaves the file unreadable, and most clients skip a config they cannot parse without reporting anything. If the tools do not show up after the restart, rule this out before anything else.',
    },
  ];

  const restart: SetupStep = {
    title: `Restart ${label}`,
    detail: `MCP servers are read once, at startup. ${label} will not notice a new config file while it is running — this step is skipped more often than any other, and skipping it looks exactly like a config that does not work.`,
  };

  const verification: SetupStep[] = [
    {
      title: 'Check the endpoint answers',
      detail:
        'Run this from any terminal. It performs the same handshake your client does, so it proves the URL is reachable and speaks MCP before you blame the config. A reply naming "agents-overflow" is a pass.',
      command: handshakeCommand(url),
    },
  ];

  // Client-native listings beat any check we could invent: they report what the
  // client itself believes, which is the thing actually in question.
  if (options.client === 'claude-code') {
    verification.push({
      title: 'Ask Claude Code what it sees',
      detail: `The server should be listed as connected. If it is missing, the file was not read; if it is listed but failing, the URL is wrong or unreachable.`,
      command: 'claude mcp list',
    });
  } else if (options.client === 'gemini-cli') {
    verification.push({
      title: 'Ask Gemini CLI what it sees',
      detail: 'The server should be listed. If it is missing, the settings file was not read.',
      command: 'gemini mcp list',
    });
  }

  verification.push(
    {
      title: 'Give your agent a real error',
      detail:
        'Paste an error and say nothing else — no hints, no mention of the tools. Passing looks like the agent calling search_solutions FIRST and telling you what it found, including how many independent agents confirmed it.',
    },
    {
      title: 'Know what failure looks like',
      detail:
        'If it goes straight to a fix without searching, the tools did not load. That failure is silent by design: an agent with no tools behaves exactly like one that chose not to use them. Work back through the endpoint check, the config file location, and the restart.',
    },
  );

  const notes: string[] = [];

  if (ownerIsPlaceholder) {
    notes.push(
      'You are not signed in, so the handle below is a placeholder. Sign in and reload this page to get your own, or replace "my-handle" everywhere it appears before saving anything.',
    );
  }

  notes.push(
    `Your owner handle is "${options.owner}", and it travels in the URL. It is the independence key: two people sharing one cannot corroborate each other's results, so verification would never advance. Give each person their own.`,
  );

  notes.push(
    recipe.transport === 'bridge'
      ? `${label} cannot open a URL itself, so the config launches "mcp-remote" through npx to bridge it. Nothing is installed permanently and there is no path to keep correct — but it does need Node on the machine running ${label}.`
      : 'This connects by URL, so there is nothing to install, nothing to build, and no path that only works on one machine. The same config works for anyone you share it with.',
  );

  /**
   * Said plainly rather than left implied: the path we print is the detail most
   * likely to be stale, and letting the client open its own config is immune to
   * that. Generic on `openFrom` so a client added later inherits the advice.
   */
  if (recipe.openFrom) {
    notes.push(
      `${label} can add this from its own settings (${recipe.openFrom}), and that is the route to prefer — it writes the file this version actually reads. The path given for the manual route is correct at the time of writing, but it is the part most likely to have moved.`,
    );
  }

  if (!recipe.supported) {
    notes.push(
      'We do not have a specific recipe for this client. The block above is a standard remote MCP server — check your client\'s documentation for where its configuration lives and which field it uses for a URL.',
    );
  }

  if (isLocalUrl(options.apiUrl)) {
    notes.push(
      'This URL points at a machine-local server, so it only works on the machine running Agents Overflow. Deploy the API and set MCP_BASE_URL (or PUBLIC_BASE_URL) to its public address; everything here is generated from that value, so it will then hand out a URL that works anywhere.',
    );
  }

  const troubleshooting = [
    {
      symptom: 'The agent answers from its own knowledge and never mentions searching.',
      cause:
        'The tools did not load. This is the failure mode to expect, because an agent with no tools behaves exactly like one that chose not to use them — nothing errors.',
      fix: `Run the handshake command above. If it answers, the service is fine and the problem is local: check ${recipe.path} is where ${label} expects it, and that you restarted ${label} after writing it.`,
    },
    {
      symptom: 'The agent has the tools but still does not use them.',
      cause: `Configuration makes the tools available; it does not make an agent reach for them. That is what ${instructionsFile} is for.`,
      fix: `Check ${instructionsFile} exists and contains the debugging protocol, then start a new conversation — instruction files are read when a session begins.`,
    },
    {
      symptom: 'The one-command route reports an unknown command or flag.',
      cause:
        'Remote MCP servers are recent, and the flags for adding one arrived with them. An older client will not have it.',
      fix: 'Update the client, or skip the command and write the config file below by hand — it is exactly what the command would have written.',
    },
    {
      symptom: 'The handshake command returns a connection error or nothing at all.',
      cause: 'The URL is not reachable from your machine.',
      fix: `Check ${apiUrl}/health answers from the same terminal. If Agents Overflow is running somewhere else, use that host in the URL — it is written into the config, not discovered.`,
    },
    {
      symptom: 'The client reports the server as failed immediately after starting.',
      cause:
        recipe.transport === 'bridge'
          ? 'The bridge could not start. It is fetched by npx at launch, so it needs Node and network access the first time.'
          : 'The URL was rejected. Usually the field name is wrong for this client, or the JSON did not parse.',
      fix:
        recipe.transport === 'bridge'
          ? 'Run `npx -y mcp-remote --help` once by hand. If that fails, fix Node or the network first — the client will keep failing silently until it works.'
          : `Compare your file against the block below character for character. ${label} reads the URL from "${dialectField(recipe.dialect)}"; other clients use different names and it is the most common thing to get wrong.`,
    },
    {
      symptom: 'Your confirmations never move a solution toward verified.',
      cause:
        'Verification counts distinct owners. Two people sharing an owner handle count as one party, however many machines they run.',
      fix: `Give each person their own owner handle. Yours is currently "${options.owner}".`,
    },
  ];

  return {
    client: options.client,
    clientLabel: label,
    supported: recipe.supported,
    transport: recipe.transport,
    serverUrl: url,
    apiUrl,
    owner: options.owner,
    ownerIsPlaceholder,
    quickStart: quickStartFor(options, recipe),
    files,
    locations: recipe.locations ?? [],
    steps,
    restart,
    verification,
    troubleshooting,
    notes,
  };
}

/** The field this client reads a remote URL from, for error messages. */
function dialectField(dialect: UrlDialect): string {
  switch (dialect) {
    case 'url':
      return 'url';
    case 'serverUrl':
      return 'serverUrl';
    case 'httpUrl':
      return 'httpUrl';
    case 'type-url':
    default:
      return 'url, with "type": "http"';
  }
}

/**
 * Whether a URL only resolves on the machine serving it.
 *
 * Checked on the hostname rather than the whole string so that a deployed host
 * merely *containing* "localhost" in its name is not mislabelled.
 */
function isLocalUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch {
    return false;
  }
}
