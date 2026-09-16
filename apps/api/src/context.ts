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

import { createDatabase, schema, type Database } from '@agents-overflow/db';
import {
  createCachingEmbedder,
  createChatClient,
  createOpenAIEmbedder,
  environmentHash,
  nullEmbedder,
  type CachingEmbedder,
  type ChatClient,
  type ReviewerClient,
  type EnvironmentInput,
} from '@agents-overflow/core';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

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
   * is the one that ends up in other people's hands: the OAuth callback URL the
   * browser is redirected to. Publishing the internal address there produces a
   * flow that fails for every reader and works when tested on the server.
   */
  readonly publicBaseUrl: string;
  /**
   * Where coding agents reach this API — the MCP endpoint the setup page hands
   * out.
   *
   * Separate from `publicBaseUrl` because browsers and agents may not take the
   * same route. A frontend that proxies `/v1/auth` keeps the session cookie
   * first-party, which means `publicBaseUrl` is the frontend's address; but the
   * proxy does not carry `/mcp`, so an agent handed that address gets a static
   * host that rejects the handshake. Defaults to `publicBaseUrl`.
   */
  readonly mcpBaseUrl: string;
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

export function loadConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }

  const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT ?? 3000}`;
  // Defaults to the internal address so a single-host deployment needs no
  // extra configuration; set it explicitly the moment a proxy is involved.
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || apiBaseUrl;

  return {
    databaseUrl,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
    chatModel: process.env.CHAT_MODEL || undefined,

    apiBaseUrl,
    publicBaseUrl,
    mcpBaseUrl: process.env.MCP_BASE_URL || publicBaseUrl,
    authRedirectUrl: process.env.AUTH_REDIRECT_URL || 'http://localhost:5173',
    // Falls back to a random value so the server still starts; sessions then
    // simply do not survive a restart, which is the right failure for dev.
    sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('base64url'),
    githubClientId: process.env.GITHUB_CLIENT_ID || undefined,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || undefined,
    googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
    nodeEnv: process.env.NODE_ENV || 'development',
    mcpPackageName: process.env.MCP_PACKAGE_NAME || undefined,
    port: Number(process.env.PORT ?? 3000),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}

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

export function createContext(config: AppConfig): AppContext {
  const db = createDatabase({ connectionString: config.databaseUrl });

  // No key configured is a supported mode, not a crash: the pipeline falls back
  // to full-text search alone rather than the service failing to start.
  const base = config.openaiApiKey
    ? createOpenAIEmbedder({
        apiKey: config.openaiApiKey,
        ...(config.openaiBaseUrl ? { baseUrl: config.openaiBaseUrl } : {}),
        onError: (error) => console.warn('[embeddings]', error),
      })
    : nullEmbedder;

  // Embedding dominates search latency, and agents re-issue near-identical
  // queries constantly because the same errors recur.
  const embedder = createCachingEmbedder(base);

  // Chat needs the same credentials as embeddings. Absent them the feature is
  // simply off rather than the service failing to start.
  const chat = config.openaiApiKey
    ? createChatClient({
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl ?? 'https://api.openai.com/v1',
        ...(config.chatModel ? { model: config.chatModel } : {}),
        onError: (error) => console.warn('[chat]', error),
      })
    : null;

  /**
   * The reviewer shares the chat client but is a distinct role, so it gets its
   * own adapter: review replies must be terse and structured, and a future
   * change to the chat model must not silently change review behaviour.
   */
  const reviewer: ReviewerClient | null = chat
    ? { complete: (system, user) => chat.complete(system, [{ role: 'user', content: user }]) }
    : null;

  return {
    config,
    db,
    embedder,
    embeddingsEnabled: Boolean(config.openaiApiKey),
    chat,
    reviewer,
  };
}

export interface Actor {
  readonly accountId: string;
  readonly agentIdentityId: string;
  readonly handle: string;
}

/**
 * Process-local caches for identity and environment resolution.
 *
 * Both are pure upserts that return the same row for the same input forever, so
 * repeating them costs three or four network round trips on every single
 * request. Against a managed Postgres in another region that dominates request
 * latency — more than the actual search.
 *
 * The staleness risk is narrow and deliberate: only a database reset while the
 * process is running invalidates these, which in practice means restarting the
 * API after `seed:reset`.
 */
const actorCache = new Map<string, Actor>();
const environmentCache = new Map<string, string>();

/** Clears the caches. Call after any operation that removes rows they point at. */
export function clearResolutionCaches(): void {
  actorCache.clear();
  environmentCache.clear();
}

/**
 * Resolves the calling agent, creating the account, key and identity on first
 * sight.
 *
 * `x-agent-owner` is the independence key. Two demo runs using different owner
 * values count as two independent parties; the same value twice does not,
 * however many environments it reports from.
 */
export async function resolveActor(
  db: Database,
  headers: Record<string, string | string[] | undefined>,
): Promise<Actor> {
  const header = (name: string): string | undefined => {
    const value = headers[name];
    const first = Array.isArray(value) ? value[0] : value;
    return first?.trim() || undefined;
  };

  const handle = (header('x-agent-owner') ?? 'demo').slice(0, 64).toLowerCase();
  const agentName = (header('x-agent-name') ?? 'unknown-agent').slice(0, 64);
  const modelId = header('x-agent-model')?.slice(0, 64) ?? null;

  const cacheKey = `${handle}${agentName}${modelId ?? ''}`;
  const cached = actorCache.get(cacheKey);
  if (cached) return cached;

  const [account] = await db
    .insert(schema.account)
    .values({ handle, displayName: handle })
    .onConflictDoUpdate({
      target: schema.account.handle,
      // A no-op update rather than doNothing, so the row is returned either way.
      set: { updatedAt: new Date() },
    })
    .returning({ id: schema.account.id });

  if (!account) throw new Error('failed to resolve account');

  const keyHash = `demo:${handle}`;
  const [apiKey] = await db
    .insert(schema.apiKey)
    .values({ accountId: account.id, name: 'demo', keyHash, prefix: 'demo' })
    .onConflictDoUpdate({ target: schema.apiKey.keyHash, set: { lastUsedAt: new Date() } })
    .returning({ id: schema.apiKey.id });

  if (!apiKey) throw new Error('failed to resolve api key');

  const [identity] = await db
    .insert(schema.agentIdentity)
    .values({ apiKeyId: apiKey.id, accountId: account.id, agentName, modelId })
    .onConflictDoUpdate({
      target: [schema.agentIdentity.apiKeyId, schema.agentIdentity.agentName, schema.agentIdentity.modelId],
      set: { lastSeenAt: new Date() },
    })
    .returning({ id: schema.agentIdentity.id });

  if (!identity) throw new Error('failed to resolve agent identity');

  const actor: Actor = { accountId: account.id, agentIdentityId: identity.id, handle };
  actorCache.set(cacheKey, actor);
  return actor;
}

/**
 * Deduplicates an environment fingerprint to a row.
 *
 * Identical environments across unrelated callers collapse to one row, which is
 * what makes "N distinct environments" a meaningful count rather than a count
 * of how many times someone pressed the button.
 */
export async function resolveEnvironment(
  db: Database,
  input: EnvironmentInput | undefined,
): Promise<string> {
  const env = input ?? {};
  const envHash = environmentHash(env);

  const cached = environmentCache.get(envHash);
  if (cached) return cached;

  const [row] = await db
    .insert(schema.environment)
    .values({
      envHash,
      os: env.os ?? null,
      arch: env.arch ?? null,
      runtime: env.runtime ?? null,
      runtimeVersion: env.runtimeVersion ?? null,
      packageManager: env.packageManager ?? null,
      framework: env.framework ?? null,
      frameworkVersion: env.frameworkVersion ?? null,
      packages: env.packages ?? {},
    })
    .onConflictDoUpdate({ target: schema.environment.envHash, set: { envHash } })
    .returning({ id: schema.environment.id });

  if (!row) throw new Error('failed to resolve environment');

  environmentCache.set(envHash, row.id);
  return row.id;
}

export { and, eq, sql };
