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
export const EMBEDDING_MODEL = 'text-embedding-3-large';
/**
 * DESIGN.md §3.9: pgvector cannot build an HNSW index above 2000 dimensions, so
 * the native 3072 would silently fall back to a sequential scan on every query.
 * The `text-embedding-3` family is Matryoshka-trained, so this truncation is
 * natively supported rather than a lossy hack.
 */
export const EMBEDDING_DIMENSIONS = 1536;
/**
 * Rescales a vector to unit length.
 *
 * Required after truncating a Matryoshka embedding: the retained slice is no
 * longer unit-length, and cosine distance in pgvector assumes it is.
 */
function normalizeToUnitLength(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0)
        return vector;
    return vector.map((v) => v / magnitude);
}
export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export function createOpenAIEmbedder(options) {
    const { apiKey, baseUrl = DEFAULT_BASE_URL, model = EMBEDDING_MODEL, dimensions = EMBEDDING_DIMENSIONS, 
    // Measured 5–10.5s against a self-hosted OpenAI-compatible endpoint. A 10s
    // timeout sat right on that boundary, so vector search would drop out
    // intermittently and report itself as degraded for no real reason.
    timeoutMs = 25_000, onError, } = options;
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/embeddings`;
    return {
        async embed(text) {
            if (text.trim().length === 0)
                return null;
            // Without a timeout a hung provider call becomes a hung request; the
            // fallback path only helps if we actually reach it.
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({ model, input: text, dimensions }),
                    signal: controller.signal,
                });
                if (!response.ok) {
                    onError?.(new Error(`embeddings ${response.status}: ${await response.text()}`));
                    return null;
                }
                const payload = (await response.json());
                const vector = payload.data?.[0]?.embedding;
                if (!vector || vector.length === 0) {
                    onError?.(new Error('embedding response contained no vector'));
                    return null;
                }
                if (vector.length === dimensions)
                    return vector;
                // Not every OpenAI-compatible endpoint honours `dimensions`. The
                // text-embedding-3 family is Matryoshka-trained, so truncating and
                // renormalizing is the supported way to shorten a vector — and it beats
                // failing, since a longer vector would be rejected by the column anyway.
                if (vector.length > dimensions) {
                    return normalizeToUnitLength(vector.slice(0, dimensions));
                }
                onError?.(new Error(`embedding too short: got ${vector.length}, need ${dimensions}`));
                return null;
            }
            catch (error) {
                onError?.(error);
                return null;
            }
            finally {
                clearTimeout(timer);
            }
        },
    };
}
/** Used when no API key is configured. Makes the no-embeddings path explicit rather than accidental. */
export const nullEmbedder = {
    async embed() {
        return null;
    },
};
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
export function createCachingEmbedder(inner, maxEntries = 500) {
    const cache = new Map();
    return {
        get size() {
            return cache.size;
        },
        async embedWithMeta(text) {
            const key = text.trim();
            const hit = cache.get(key);
            if (hit) {
                // Refresh recency so the working set survives eviction.
                cache.delete(key);
                cache.set(key, hit);
                return { vector: hit, cached: true };
            }
            const vector = await inner.embed(text);
            if (vector) {
                if (cache.size >= maxEntries) {
                    const oldest = cache.keys().next().value;
                    if (oldest !== undefined)
                        cache.delete(oldest);
                }
                cache.set(key, vector);
            }
            return { vector, cached: false };
        },
        async embed(text) {
            return (await this.embedWithMeta(text)).vector;
        },
    };
}
/**
 * The text actually embedded (DESIGN.md §3.9).
 *
 * Never the raw stack trace: two unrelated errors from the same framework share
 * most of their tokens — identical boilerplate frames, `node_modules` paths,
 * runtime scaffolding — so embedding raw traces teaches the index to cluster by
 * framework instead of by problem.
 */
export function buildEmbedInput(parts) {
    const segments = [parts.title, parts.statement, parts.normalizedError];
    if (parts.tags?.length)
        segments.push(parts.tags.join(' '));
    return segments
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join('\n\n');
}
//# sourceMappingURL=embedding.js.map