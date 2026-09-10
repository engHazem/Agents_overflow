/**
 * Version extraction.
 *
 * Versions are pulled out of the *raw* text, before redaction runs, because
 * redaction destroys some of the contexts they appear in — a pnpm store path
 * like `node_modules/.pnpm/react@18.2.0/` collapses to a placeholder and takes
 * the version with it.
 *
 * They are extracted rather than deleted because they are the input to the
 * deterministic precondition check (DESIGN.md §3.6), which is what catches
 * "this solution requires torch <2.3 but the caller has 2.4" — a judgement a
 * reranker cannot reliably make.
 */
export interface DetectedVersion {
    /** Package or runtime name, lowercased. `null` for a bare `v1.2.3`. */
    readonly subject: string | null;
    readonly version: string;
    /** The matched text, kept for debugging extraction misses. */
    readonly raw: string;
}
/**
 * Returns every version reference found, deduplicated on subject + version.
 * A more specific pattern earlier in the list wins over a later bare match.
 */
export declare function extractVersions(input: string): DetectedVersion[];
//# sourceMappingURL=versions.d.ts.map