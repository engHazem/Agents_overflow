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
import { type DetectedVersion } from './versions.js';
export { isErrorLine, isStackFrame, collapseRepeatedFrames, extractCore } from './frames.js';
export { redact, REDACT_RULES, type RedactRule, type RedactResult } from './redact.js';
export { extractVersions, type DetectedVersion } from './versions.js';
/**
 * Bumped whenever the normalization behaviour changes. Stored alongside each
 * signature so a rollout can identify rows that need reindexing instead of
 * silently serving hashes produced by two different algorithms.
 */
export declare const NORMALIZER_VERSION = 2;
export interface NormalizeResult {
    /** Full normalized text. Feeds the FTS document and the embedding input. */
    readonly canonical: string;
    /** The stable slice that gets hashed — error line, context, top frames. */
    readonly core: string;
    /** sha256 of the case-folded core. The Tier 0 lookup key. */
    readonly signature: string;
    /** Version references found in the raw input, for the precondition check. */
    readonly versions: readonly DetectedVersion[];
    /** Redaction rule name to substitution count. Observability only. */
    readonly redactions: Readonly<Record<string, number>>;
    readonly normalizerVersion: number;
    readonly truncated: boolean;
}
export declare function signatureOf(core: string): string;
export declare function normalize(raw: string): NormalizeResult;
//# sourceMappingURL=index.d.ts.map