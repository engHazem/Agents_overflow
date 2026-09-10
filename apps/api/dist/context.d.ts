/**
 * Configuration, database handle, and per-request actor resolution.
 *
 * Auth is deliberately absent for the proof of concept (DESIGN.md §7). Instead
 * the caller declares who it is with headers, and accounts are provisioned on
 * first sight. That keeps the demo one `curl` away while still exercising the
 * part that matters: distinct owners and distinct environments, which is what
 * the verified badge is actually counting.
 *
 * This is the first thing to replace before anything real runs on it — any
 * caller can currently claim any identity.
 */
import { type Database } from '@agents-overflow/db';
import { type CachingEmbedder, type ChatClient, type ReviewerClient, type EnvironmentInput } from '@agents-overflow/core';
import { and, eq, sql } from 'drizzle-orm';
export interface AppConfig {
    readonly databaseUrl: string;
    readonly openaiApiKey: string | undefined;
    /** Any OpenAI-compatible embeddings endpoint. Defaults to OpenAI's own. */
    readonly openaiBaseUrl: string | undefined;
    /** Chat model id. Any model the configured endpoint serves. */
    readonly chatModel: string | undefined;
    /** Where this API is reachable *from itself*, used for internal loopback. */
    readonly apiBaseUrl: string;
    /**
     * Where this API is reachable *from the outside*.
     *
     * Separate from `apiBaseUrl` because behind a proxy the two differ, and this
     * is the one that ends up in other people's hands: OAuth callback URLs the
     * browser is redirected to, and the MCP endpoint the setup page hands out.
     * Publishing the internal address there produces a config that fails for
     * every reader and works when tested on the server.
     */
    readonly publicBaseUrl: string;
    /** Origin the browser is sent back to after sign-in. Also bounds `returnTo`. */
    readonly authRedirectUrl: string;
    readonly sessionSecret: string;
    readonly githubClientId: string | undefined;
    readonly githubClientSecret: string | undefined;
    readonly googleClientId: string | undefined;
    readonly googleClientSecret: string | undefined;
    readonly nodeEnv: string;
    /**
     * Published npm package for the MCP server, e.g. `agents-overflow-mcp`.
     *
     * Only affects clients that cannot open a URL themselves: with it they launch
     * the package, without it they bridge through `mcp-remote`.
     */
    readonly mcpPackageName: string | undefined;
    readonly port: number;
    readonly logLevel: string;
}
export declare function loadConfig(): AppConfig;
export interface AppContext {
    readonly config: AppConfig;
    readonly db: Database;
    readonly embedder: CachingEmbedder;
    /** True when vector search is available. Surfaced so responses can say they degraded. */
    readonly embeddingsEnabled: boolean;
    /** Null when no API key is configured, in which case chat is unavailable. */
    readonly chat: ChatClient | null;
    /**
     * The AI half of submission review. Null when unconfigured, which makes the
     * reviewer return needs_human rather than approving unseen.
     */
    readonly reviewer: ReviewerClient | null;
}
export declare function createContext(config: AppConfig): AppContext;
export interface Actor {
    readonly accountId: string;
    readonly agentIdentityId: string;
    readonly handle: string;
}
/** Clears the caches. Call after any operation that removes rows they point at. */
export declare function clearResolutionCaches(): void;
/**
 * Resolves the calling agent, creating the account, key and identity on first
 * sight.
 *
 * `x-agent-owner` is the independence key. Two demo runs using different owner
 * values count as two independent parties; the same value twice does not,
 * however many environments it reports from.
 */
export declare function resolveActor(db: Database, headers: Record<string, string | string[] | undefined>): Promise<Actor>;
/**
 * Deduplicates an environment fingerprint to a row.
 *
 * Identical environments across unrelated callers collapse to one row, which is
 * what makes "N distinct environments" a meaningful count rather than a count
 * of how many times someone pressed the button.
 */
export declare function resolveEnvironment(db: Database, input: EnvironmentInput | undefined): Promise<string>;
export { and, eq, sql };
//# sourceMappingURL=context.d.ts.map