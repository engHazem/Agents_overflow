/**
 * Verification and confidence.
 *
 * The badge is the product's central claim, so the rules that mint it are kept
 * in one place, as pure functions, and tested.
 */
export type VerificationState = 'unverified' | 'corroborated' | 'verified' | 'disputed';
/** Distinct environments needed for the badge. DESIGN.md §4's N. */
export declare const VERIFIED_ENV_THRESHOLD = 3;
/** Distinct environments at which a solution stops being a lone anecdote. */
export declare const CORROBORATED_ENV_THRESHOLD = 2;
export interface VerificationInput {
    readonly successCount: number;
    readonly failureCount: number;
    readonly partialCount: number;
    /** Distinct environments that reported success. Breadth, not volume. */
    readonly distinctEnvCount: number;
    readonly distinctOwnerCount: number;
}
/**
 * Wilson score lower bound at ~95% confidence.
 *
 * Used instead of a raw success rate because a raw rate cannot distinguish
 * evidence from luck: 1-for-1 is 100% and 47-for-50 is 94%, and ranking the
 * first above the second would put every untested guess at the top of every
 * result list. The Wilson bound asks what success rate the data actually
 * supports, so it grows as confirmations accumulate.
 */
export declare function wilsonLowerBound(successes: number, total: number): number;
/**
 * Confidence for ranking: the Wilson bound scaled by how broadly the solution
 * has been confirmed.
 *
 * Breadth matters separately from rate. Ten successes from one environment is a
 * solution that works *there*; three successes from three different
 * environments is a solution that generalizes, which is the thing an agent in a
 * fourth environment actually needs to know.
 */
export declare function confidenceScore(input: VerificationInput): number;
/**
 * The state machine behind the badge.
 *
 * `disputed` is checked first and deliberately overrides `verified`: a solution
 * that used to work and now fails is the most important thing to surface, not
 * something to hide behind a badge it earned earlier.
 */
export declare function verificationStateFor(input: VerificationInput): VerificationState;
/** How many more distinct environments are needed for the badge. Drives the demo's progress line. */
export declare function environmentsToVerified(input: VerificationInput): number;
//# sourceMappingURL=verification.d.ts.map