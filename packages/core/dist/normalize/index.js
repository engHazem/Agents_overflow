/**
 * The normalizer.
 *
 * One function, used on both the write and the read path (DESIGN.md §3.1).
 * Three subsystems depend on it producing identical output for equivalent
 * inputs:
 *
 *   1. Tier 0's signature hash
 *   2. the full-text search document
 *   3. the embedding input
 *
 * Running the same transform over stored documents and incoming queries is also
 * what closes the query/document distribution mismatch — documents are curated
 * summaries, queries are raw crash output — at no extra cost.
 *
 * Changing any behaviour here invalidates every stored signature. Treat a
 * change as a migration, not an edit.
 */
import { createHash } from 'node:crypto';
import { collapseRepeatedFrames, extractCore } from './frames.js';
import { redact } from './redact.js';
import { extractVersions } from './versions.js';
export { isErrorLine, isStackFrame, collapseRepeatedFrames, extractCore } from './frames.js';
export { redact, REDACT_RULES } from './redact.js';
export { extractVersions } from './versions.js';
/**
 * Bumped whenever the normalization behaviour changes. Stored alongside each
 * signature so a rollout can identify rows that need reindexing instead of
 * silently serving hashes produced by two different algorithms.
 */
export const NORMALIZER_VERSION = 2;
/** Guards against a pathological input dominating storage and embedding cost. */
const MAX_CANONICAL_CHARS = 8_000;
/** Collapses whitespace runs and blank-line runs without joining separate lines. */
function tidy(text) {
    const lines = text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd());
    const collapsed = collapseRepeatedFrames(lines);
    return collapsed
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
/**
 * Case-folds and collapses whitespace before hashing.
 *
 * Case folding is safe here because the core is used only as a hash input —
 * the human- and model-readable text keeps its original case in `canonical`,
 * where `ENOENT` vs `enoent` still carries meaning.
 */
function hashInput(core) {
    return core.toLowerCase().replace(/\s+/g, ' ').trim();
}
export function signatureOf(core) {
    return createHash('sha256').update(hashInput(core), 'utf8').digest('hex');
}
export function normalize(raw) {
    // Versions come out of the raw text: redaction destroys some of the contexts
    // they appear in.
    const versions = extractVersions(raw);
    const { text, counts } = redact(raw);
    const tidied = tidy(text);
    const truncated = tidied.length > MAX_CANONICAL_CHARS;
    const canonical = truncated ? tidied.slice(0, MAX_CANONICAL_CHARS) : tidied;
    // Derived from the *untruncated* text so a long trailing log cannot change
    // the identity of the error at the top.
    const core = extractCore(tidied);
    return {
        canonical,
        core,
        signature: signatureOf(core),
        versions,
        redactions: counts,
        normalizerVersion: NORMALIZER_VERSION,
        truncated,
    };
}
//# sourceMappingURL=index.js.map