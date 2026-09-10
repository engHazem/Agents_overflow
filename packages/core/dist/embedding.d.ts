/**
 * Embeddings.
 *
 * Uses `fetch` directly rather than the OpenAI SDK — one dependency fewer and
 * the request is three lines.
 *
 * **Every failure path returns `null` rather than throwing.** A demo that dies
 * because an embedding call timed out is a demo that dies on stage. Callers
 * treat `null` as "vector search unavailable" and fall back to full-text
 * search, which degrades result quality instead of the whole request.
 */
export declare const EMBEDDING_MODEL = "text-embedding-3-large";
/**
 * DESIGN.md §3.9: pgvector cannot build an HNSW index above 2000 dimensions, so
 * the native 3072 would silently fall back to a sequential scan on every query.
 * The `text-embedding-3` family is Matryoshka-trained, so this truncation is
 * natively supported rather than a lossy hack.
 */
export declare const EMBEDDING_DIMENSIONS = 1536;
export interface Embedder {
    /** Returns `null` when embeddings are unavailable — never throws. */
    embed(text: string): Promise<number[] | null>;
}
export declare const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export interface OpenAIEmbedderOptions {
    readonly apiKey: string;
    /** Any OpenAI-compatible endpoint. Include the version path, e.g. `.../v1`. */
    readonly baseUrl?: string;
    readonly model?: string;
    readonly dimensions?: number;
    readonly timeoutMs?: number;
    readonly onError?: (error: unknown) => void;
}
export declare function createOpenAIEmbedder(options: OpenAIEmbedderOptions): Embedder;
/** Used when no API key is configured. Makes the no-embeddings path explicit rather than accidental. */
export declare const nullEmbedder: Embedder;
export interface CachingEmbedder extends Embedder {
    /** Same as `embed`, but reports whether the vector came from the cache. */
    embedWithMeta(text: string): Promise<{
        vector: number[] | null;
        cached: boolean;
    }>;
    readonly size: number;
}
/**
 * In-memory cache for query embeddings.
 *
 * Embedding is by far the slowest stage of a search — an order of magnitude
 * more than every database query combined — and agents re-issue near-identical
 * queries constantly, because the same errors recur. Caching on the normalized
 * text turns a repeat query into a database-only round trip.
 *
 * Deliberately process-local and unbounded in lifetime but bounded in size:
 * a shared cache is a Redis dependency, and this is worth having without one.
 * Failures are never cached, so a transient provider outage does not pin a
 * `null` in front of a query for the rest of the process's life.
 */
export declare function createCachingEmbedder(inner: Embedder, maxEntries?: number): CachingEmbedder;
/**
 * The text actually embedded (DESIGN.md §3.9).
 *
 * Never the raw stack trace: two unrelated errors from the same framework share
 * most of their tokens — identical boilerplate frames, `node_modules` paths,
 * runtime scaffolding — so embedding raw traces teaches the index to cluster by
 * framework instead of by problem.
 */
export declare function buildEmbedInput(parts: {
    title: string;
    statement: string;
    normalizedError: string;
    tags?: readonly string[];
}): string;
//# sourceMappingURL=embedding.d.ts.map