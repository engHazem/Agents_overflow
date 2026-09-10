import { describe, expect, it } from 'vitest';

import { buildSetupGuide, type AgentClient } from './onboarding.js';

const CLIENTS: AgentClient[] = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'windsurf',
  'antigravity',
  'vscode-copilot',
  'gemini-cli',
  'gemini-code-assist',
  'other',
];

const DEPLOYED = 'https://agents-overflow.example.com';

function guideFor(client: AgentClient, overrides: Partial<Parameters<typeof buildSetupGuide>[0]> = {}) {
  return buildSetupGuide({ client, apiUrl: DEPLOYED, owner: 'ada', ...overrides });
}

/** Everything the page hands the reader, flattened, so nothing escapes a check. */
function allText(client: AgentClient, overrides = {}): string {
  const g = guideFor(client, overrides);
  return JSON.stringify(g);
}

describe('portability — the reader is not on this machine', () => {
  /**
   * The failure this guards is the expensive one: a config containing a path
   * that exists only on the host that generated it resolves to nothing, and an
   * agent with no tools looks exactly like one that chose not to use them. So
   * no output may reference the filesystem of whoever is running this code.
   */
  it.each(CLIENTS)('leaks no host filesystem path for %s', (client) => {
    const text = allText(client);

    expect(text).not.toContain(process.cwd());
    // The built server that the old, path-based recipe pointed at.
    expect(text).not.toContain('apps/mcp/dist');
    expect(text).not.toMatch(/["' (]\/(?:home|Users|mnt|var|opt|tmp)\//);
  });

  it.each(CLIENTS)('produces a config that parses as JSON for %s', (client) => {
    const [config] = guideFor(client).files;
    expect(() => JSON.parse(config.contents)).not.toThrow();
  });

  it.each(CLIENTS)('reaches the service by URL, not by local command, for %s', (client) => {
    const guide = guideFor(client);
    const entry = Object.values(
      Object.values(JSON.parse(guide.files[0].contents))[0] as Record<string, unknown>,
    )[0] as Record<string, unknown>;

    // Either it opens the URL itself, or it shells out to npx — which needs
    // nothing but Node, unlike a path into a checkout of this repository.
    if (guide.transport === 'http') {
      expect(JSON.stringify(entry)).toContain(guide.serverUrl);
    } else {
      expect(entry.command).toBe('npx');
    }
  });
});

describe('the endpoint URL', () => {
  it('carries the owner, because a URL is the only thing every client holds', () => {
    const url = new URL(guideFor('cursor').serverUrl);

    expect(url.pathname).toBe('/mcp');
    expect(url.searchParams.get('owner')).toBe('ada');
    expect(url.searchParams.get('agent')).toBe('cursor');
  });

  it('keeps a base path when the API is mounted under one', () => {
    const guide = guideFor('cursor', { apiUrl: 'https://example.com/api/' });
    expect(guide.serverUrl.startsWith('https://example.com/api/mcp')).toBe(true);
  });

  it('flags the placeholder owner so nobody saves it as their own', () => {
    expect(guideFor('cursor', { owner: 'my-handle' }).ownerIsPlaceholder).toBe(true);
    expect(guideFor('cursor').ownerIsPlaceholder).toBe(false);
  });

  it('warns when the URL only resolves on the machine serving it', () => {
    const local = guideFor('cursor', { apiUrl: 'http://localhost:3000' });
    expect(local.notes.some((n) => n.includes('machine-local'))).toBe(true);
  });

  it('does not warn about a deployed host that merely contains "localhost"', () => {
    // Checked on the hostname, not by substring, or this is a false positive.
    const guide = guideFor('cursor', { apiUrl: 'https://localhost-mirror.example.com' });
    expect(guide.notes.some((n) => n.includes('machine-local'))).toBe(false);
  });
});

describe('per-client dialects', () => {
  /**
   * Every client accepts a remote server and every one names the field
   * differently. Getting it wrong is the single most common setup mistake, and
   * it fails silently, so each dialect is pinned here.
   */
  const DIALECTS: Array<[AgentClient, string, string]> = [
    ['claude-code', 'mcpServers', 'url'],
    ['cursor', 'mcpServers', 'url'],
    ['windsurf', 'mcpServers', 'serverUrl'],
    ['antigravity', 'mcpServers', 'serverUrl'],
    ['vscode-copilot', 'servers', 'url'],
    ['gemini-cli', 'mcpServers', 'httpUrl'],
    ['gemini-code-assist', 'mcpServers', 'httpUrl'],
  ];

  it.each(DIALECTS)('%s nests under %s and reads the URL from %s', (client, key, field) => {
    const config = JSON.parse(guideFor(client).files[0].contents) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;

    expect(Object.keys(config)).toEqual([key]);
    expect(config[key]['agents-overflow'][field]).toBe(guideFor(client).serverUrl);
  });

  /**
   * Antigravity ships Gemini models, which makes "it is the Gemini one" the
   * natural and wrong assumption — the config it actually reads is inherited
   * from Windsurf, whose codebase it descends from. Following the model rather
   * than the lineage produces a config the client ignores without complaint.
   */
  it('gives Antigravity the Windsurf dialect, not either Gemini one', () => {
    const entry = JSON.parse(guideFor('antigravity').files[0].contents).mcpServers[
      'agents-overflow'
    ];

    expect(entry.serverUrl).toBe(guideFor('antigravity').serverUrl);
    expect(entry.httpUrl).toBeUndefined();
    expect(entry.url).toBeUndefined();
    // And it is a first-class recipe, not the generic fallback.
    expect(guideFor('antigravity').supported).toBe(true);
    expect(guideFor('antigravity').transport).toBe('http');
  });

  it('labels each client\'s own agent in the endpoint URL', () => {
    // The label travels to the service, so "who is connecting" stays answerable
    // once several of these are pointed at one owner.
    expect(new URL(guideFor('antigravity').serverUrl).searchParams.get('agent')).toBe('antigravity');
  });

  it('declares the transport type where the client requires it', () => {
    for (const client of ['claude-code', 'vscode-copilot'] as AgentClient[]) {
      const config = JSON.parse(guideFor(client).files[0].contents) as Record<string, any>;
      const key = client === 'vscode-copilot' ? 'servers' : 'mcpServers';
      expect(config[key]['agents-overflow'].type).toBe('http');
    }
  });
});

describe('the bridged client', () => {
  it('bridges Claude Desktop through mcp-remote, since it cannot open a URL', () => {
    const guide = guideFor('claude-desktop');
    const entry = JSON.parse(guide.files[0].contents).mcpServers['agents-overflow'];

    expect(guide.transport).toBe('bridge');
    expect(entry.args).toEqual(['-y', 'mcp-remote', guide.serverUrl]);
  });

  it('skips the bridge when a published package is available', () => {
    const guide = guideFor('claude-desktop', { packageName: 'agents-overflow-mcp' });
    const entry = JSON.parse(guide.files[0].contents).mcpServers['agents-overflow'];

    expect(entry.args).toEqual(['-y', 'agents-overflow-mcp']);
    // The owner has nowhere to live in a query string here, so it moves to env.
    expect(entry.env.AGENTS_OVERFLOW_OWNER).toBe('ada');
    expect(entry.env.AGENTS_OVERFLOW_URL).toBe(DEPLOYED);
  });

  it('spells out where the config lives per OS, rather than as "~/…"', () => {
    const guide = guideFor('claude-desktop');
    expect(guide.locations.map((l) => l.os)).toEqual(['macOS', 'Windows', 'Linux']);
    expect(guide.locations.every((l) => l.path.length > 0)).toBe(true);
  });

  it('uses npx -y, because an install prompt nobody can see looks like a hang', () => {
    const entry = JSON.parse(guideFor('claude-desktop').files[0].contents).mcpServers[
      'agents-overflow'
    ];
    expect(entry.args[0]).toBe('-y');
  });
});

describe('the one-command route', () => {
  it.each(['claude-code', 'gemini-cli', 'vscode-copilot'] as AgentClient[])(
    'offers a runnable command for %s that carries the real URL',
    (client) => {
      const guide = guideFor(client);

      expect(guide.quickStart.available).toBe(true);
      expect(guide.quickStart.commands.length).toBeGreaterThan(0);
      expect(guide.quickStart.commands.every((c) => c.command.includes(guide.serverUrl))).toBe(true);
    },
  );

  it('escapes the VS Code command for PowerShell separately from sh', () => {
    /**
     * These were byte-identical once, both labelled by OS. PowerShell strips
     * the inner double quotes when handing a single-quoted blob to a native
     * executable, so the POSIX form reaches `code` as something that is no
     * longer JSON.
     */
    const [posix, windows] = guideFor('vscode-copilot').quickStart.commands;

    expect(windows.label).toContain('Windows');
    expect(windows.command).not.toBe(posix.command);
    expect(windows.command).toContain('\\"name\\"');
    expect(posix.command).toContain('"name"');
  });

  /**
   * A settings UI is a quick route too.
   *
   * These clients have no command line for registering a server, but they will
   * write their own config from a pasted URL — which is strictly better than
   * the file route, because the client picks the location and the dialect.
   * Treating them as "no quick route" sent people to hand-edit a file for no
   * reason.
   */
  it.each(['cursor', 'windsurf', 'antigravity'] as AgentClient[])(
    'offers %s its own settings UI as the quick route, carrying the URL',
    (client) => {
      const guide = guideFor(client);

      expect(guide.quickStart.available).toBe(true);
      expect(guide.quickStart.commands[0].command).toBe(guide.serverUrl);
      // The menu path is the whole value of this route; without it the reader
      // is being told to use a UI without being told where.
      expect(guide.quickStart.detail).toMatch(/Settings →/);
    },
  );

  it('says so plainly when a client has no quick route at all', () => {
    for (const client of ['gemini-code-assist', 'other'] as AgentClient[]) {
      const guide = guideFor(client);
      expect(guide.quickStart.available).toBe(false);
      // Still hands over the URL: it is what the manual route needs anyway.
      expect(guide.quickStart.commands[0].command).toBe(guide.serverUrl);
    }
  });

  /**
   * The one client that must NOT be handed a URL to paste.
   *
   * Claude Desktop speaks stdio only, so its config holds an `mcp-remote`
   * invocation rather than an address. Offering the URL on the quick tab would
   * invite pasting something that cannot work and fails silently when it does.
   */
  it('offers Claude Desktop no URL to paste, because a URL is not what it takes', () => {
    const guide = guideFor('claude-desktop');

    expect(guide.quickStart.available).toBe(false);
    expect(guide.quickStart.commands).toEqual([]);
    // It can still open the right file, which is the step people lose time to.
    expect(guide.quickStart.detail).toContain('Settings → Developer → Edit Config');
  });
});

describe('behaviour, not just connection', () => {
  /**
   * Connecting the tools does not make an agent use them. Every guide ships the
   * protocol file for that reason, and the step that gets skipped — reporting
   * outcomes — has to be in it.
   */
  it.each(CLIENTS)('ships the debugging protocol for %s', (client) => {
    const guide = guideFor(client);
    const protocol = guide.files[1];

    expect(guide.files).toHaveLength(2);
    expect(protocol.contents).toContain('search_solutions');
    expect(protocol.contents).toContain('report_outcome');
    expect(protocol.contents).toContain('Report failures too');
  });

  it('writes the protocol to the file each client actually reads', () => {
    const expected: Array<[AgentClient, string]> = [
      ['claude-code', 'CLAUDE.md'],
      ['cursor', '.cursor/rules/agents-overflow.mdc'],
      ['windsurf', '.windsurfrules'],
      // Antigravity takes the cross-tool convention rather than inheriting
      // Windsurf's house file — the one place the family resemblance stops.
      ['antigravity', 'AGENTS.md'],
      ['vscode-copilot', '.github/copilot-instructions.md'],
      ['gemini-cli', 'GEMINI.md'],
      ['other', 'AGENTS.md'],
    ];

    for (const [client, file] of expected) {
      expect(guideFor(client).files[1].path).toBe(file);
    }
  });

  it('never tells the reader to replace a config file wholesale', () => {
    // Overwriting removes any other MCP server they had, which they will not
    // notice until something else stops working.
    for (const client of CLIENTS) {
      expect(guideFor(client).files.every((f) => f.action === 'merge')).toBe(true);
    }
  });
});

describe('verification and failure', () => {
  it.each(CLIENTS)('gives %s a handshake that any terminal can run', (client) => {
    const guide = guideFor(client);
    const handshake = guide.verification[0].command ?? '';

    expect(handshake).toContain(guide.serverUrl);
    expect(handshake).toContain('"method":"initialize"');
    // The streamable transport rejects a client that declares only one of these.
    expect(handshake).toContain('text/event-stream');
  });

  it('adds the client\'s own listing where it has one', () => {
    const commands = (client: AgentClient) =>
      guideFor(client)
        .verification.map((v) => v.command)
        .filter(Boolean);

    expect(commands('claude-code')).toContain('claude mcp list');
    expect(commands('gemini-cli')).toContain('gemini mcp list');
  });

  it.each(CLIENTS)('tells %s what silent failure looks like', (client) => {
    const guide = guideFor(client);

    expect(guide.verification.some((v) => v.title.includes('failure'))).toBe(true);
    expect(guide.troubleshooting.length).toBeGreaterThan(3);
    expect(guide.troubleshooting.every((t) => t.symptom && t.cause && t.fix)).toBe(true);
  });

  it('names the right field in the wrong-field fix, per client', () => {
    const windsurf = guideFor('windsurf').troubleshooting.find((t) =>
      t.symptom.includes('failed immediately'),
    );
    expect(windsurf?.fix).toContain('serverUrl');

    const gemini = guideFor('gemini-cli').troubleshooting.find((t) =>
      t.symptom.includes('failed immediately'),
    );
    expect(gemini?.fix).toContain('httpUrl');
  });

  it('explains the independence key in terms of what it costs to share', () => {
    const guide = guideFor('cursor');
    expect(guide.notes.some((n) => n.includes('independence key'))).toBe(true);
    expect(
      guide.troubleshooting.some((t) => t.symptom.includes('never move a solution toward verified')),
    ).toBe(true);
  });
});

describe('unknown clients', () => {
  it('still produces a working generic config, marked as unverified', () => {
    const guide = guideFor('other');

    expect(guide.supported).toBe(false);
    expect(guide.notes.some((n) => n.includes('do not have a specific recipe'))).toBe(true);
    expect(JSON.parse(guide.files[0].contents).mcpServers['agents-overflow'].url).toBe(
      guide.serverUrl,
    );
  });
});

describe('trailing slashes', () => {
  it('does not double the slash when appending a path to the API URL', () => {
    const guide = buildSetupGuide({ client: 'cursor', apiUrl: `${DEPLOYED}/`, owner: 'ada' });

    expect(guide.apiUrl).toBe(DEPLOYED);
    expect(JSON.stringify(guide)).not.toContain('.com//');
  });

  it('resolves the same endpoint whether or not the base has a trailing slash', () => {
    const bare = buildSetupGuide({ client: 'cursor', apiUrl: DEPLOYED, owner: 'ada' });
    const slashed = buildSetupGuide({ client: 'cursor', apiUrl: `${DEPLOYED}/`, owner: 'ada' });

    expect(bare.serverUrl).toBe(slashed.serverUrl);
  });
});

describe('the manual route', () => {
  /**
   * One step per silent failure.
   *
   * The file route has exactly three ways to fail without any client reporting
   * it: the file in the wrong place, the URL under the wrong field name, and
   * JSON that no longer parses. Each has to be named, or the reader has no way
   * to tell which one they hit.
   */
  it.each(CLIENTS)('tells %s where the file goes, what to merge, and to check it parses', (client) => {
    const guide = guideFor(client);

    expect(guide.steps).toHaveLength(3);
    expect(guide.steps[1].detail).toContain('keep whatever is already there');
    expect(guide.steps[2].detail).toContain('parse');
  });

  it('names the field this client reads the URL from, in the merge step', () => {
    // The same URL under another client's field name is ignored in silence, so
    // the step that says "merge" has to say "into what".
    expect(guideFor('windsurf').steps[1].detail).toContain('serverUrl');
    expect(guideFor('antigravity').steps[1].detail).toContain('serverUrl');
    expect(guideFor('gemini-cli').steps[1].detail).toContain('httpUrl');
    expect(guideFor('cursor').steps[1].detail).toContain('url');

    // The bridged client has no URL field at all — telling it to check one
    // would send the reader looking for something that is not there.
    expect(guideFor('claude-desktop').steps[1].detail).toContain('args');
  });

  it('keeps the protocol and the restart out of the step list', () => {
    // Both apply on either route, so the page shows them once, on their own.
    for (const client of CLIENTS) {
      const titles = guideFor(client).steps.map((s) => s.title).join(' ');
      expect(titles).not.toContain('Restart');
      expect(titles).not.toContain('protocol');
    }
  });

  it.each(CLIENTS)('names the client in the restart step for %s', (client) => {
    const guide = guideFor(client);
    expect(guide.restart.title).toBe(`Restart ${guide.clientLabel}`);
    expect(guide.restart.detail).toContain('startup');
  });

  it('points project-scoped clients at the project and user-scoped at the machine', () => {
    expect(guideFor('claude-code').steps[0].title).toContain('.mcp.json');
    // User-scoped, and with no settings UI to defer to, so the path is the step.
    expect(guideFor('gemini-cli').steps[0].detail).toContain('whole machine');
  });

  /**
   * A path we print is a guess about someone else's machine; a menu path is
   * not. Where the client can open its own config, the step says so instead —
   * that is the version-proof route, and the reason it exists.
   */
  it('defers to the client\'s own settings where it can open its config', () => {
    for (const client of ['claude-desktop', 'windsurf', 'antigravity', 'cursor'] as AgentClient[]) {
      const guide = guideFor(client);

      expect(guide.steps[0].title).toContain('Open the config from inside');
      expect(guide.steps[0].detail).toMatch(/Settings →/);
      expect(guide.notes.some((n) => n.includes('most likely to have moved'))).toBe(true);
    }
  });
});
