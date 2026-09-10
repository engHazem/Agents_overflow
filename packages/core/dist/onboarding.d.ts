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
export type AgentClient = 'claude-code' | 'claude-desktop' | 'cursor' | 'windsurf' | 'antigravity' | 'vscode-copilot' | 'gemini-cli' | 'gemini-code-assist' | 'other';
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
    troubleshooting: Array<{
        symptom: string;
        cause: string;
        fix: string;
    }>;
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
export declare function buildSetupGuide(options: SetupOptions): SetupGuide;
//# sourceMappingURL=onboarding.d.ts.map