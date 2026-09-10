/**
 * Demo corpus.
 *
 * Errors are written as an agent would actually paste them — real stack shapes,
 * real absolute paths, real line numbers — so the normalizer is exercised on
 * representative input rather than on text that was already clean.
 *
 * `confirmations` drives how many distinct (owner, environment) pairs report
 * success, which is what produces the spread of badge states the demo needs:
 * a corpus where everything is `verified` demonstrates nothing.
 */
export interface SeedSolution {
    title: string;
    body: string;
    commands?: string;
    rationale?: string;
    requires?: Record<string, string>;
    /** Distinct owner+environment pairs reporting success. 3+ earns the badge. */
    confirmations: number;
    /** Distinct pairs reporting failure. Enough of these force `disputed`. */
    failures?: number;
}
export interface SeedProblem {
    error: string;
    title: string;
    statement: string;
    tags: string[];
    language: string;
    solutions: SeedSolution[];
}
export declare const SEED_PROBLEMS: SeedProblem[];
//# sourceMappingURL=seed-data.d.ts.map