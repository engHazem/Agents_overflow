/**
 * Verification and confidence.
 *
 * The badge is the product's central claim, so the rules that mint it are kept
 * in one place, as pure functions, and tested.
 */

export type VerificationState = 'unverified' | 'corroborated' | 'verified' | 'disputed';

/** Distinct environments needed for the badge. DESIGN.md §4's N. */
export const VERIFIED_ENV_THRESHOLD = 3;

/** Distinct environments at which a solution stops being a lone anecdote. */
export const CORROBORATED_ENV_THRESHOLD = 2;

/** Minimum reports before failures can push a solution into `disputed`. */
const DISPUTE_MIN_REPORTS = 3;

/** Failure share above which a solution is disputed. */
const DISPUTE_FAILURE_RATE = 0.5;

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
export function wilsonLowerBound(successes: number, total: number): number {
  if (total <= 0) return 0;

  const z = 1.96;
  const phat = successes / total;
  const z2 = z * z;

  const numerator = phat + z2 / (2 * total) - z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  const denominator = 1 + z2 / total;

  return Math.max(0, Math.min(1, numerator / denominator));
}

/**
 * Confidence for ranking: the Wilson bound scaled by how broadly the solution
 * has been confirmed.
 *
 * Breadth matters separately from rate. Ten successes from one environment is a
 * solution that works *there*; three successes from three different
 * environments is a solution that generalizes, which is the thing an agent in a
 * fourth environment actually needs to know.
 */
export function confidenceScore(input: VerificationInput): number {
  const total = input.successCount + input.failureCount + input.partialCount;
  if (total === 0) return 0;

  // Partials are half credit — they moved the problem without resolving it.
  const effectiveSuccesses = input.successCount + input.partialCount * 0.5;
  const rate = wilsonLowerBound(effectiveSuccesses, total);

  // Saturating breadth multiplier: the jump from 1 to 3 environments should
  // matter far more than the jump from 30 to 32.
  const breadth = Math.log1p(input.distinctEnvCount) / Math.log1p(VERIFIED_ENV_THRESHOLD);

  return Math.max(0, Math.min(1, rate * Math.min(1, breadth)));
}

/**
 * The state machine behind the badge.
 *
 * `disputed` is checked first and deliberately overrides `verified`: a solution
 * that used to work and now fails is the most important thing to surface, not
 * something to hide behind a badge it earned earlier.
 */
export function verificationStateFor(input: VerificationInput): VerificationState {
  const total = input.successCount + input.failureCount + input.partialCount;

  if (total >= DISPUTE_MIN_REPORTS && input.failureCount / total > DISPUTE_FAILURE_RATE) {
    return 'disputed';
  }

  // Independence is two-sided: N environments reached through one account is
  // one party's word repeated, not corroboration.
  const independent = Math.min(input.distinctEnvCount, input.distinctOwnerCount);

  if (input.successCount > 0 && independent >= VERIFIED_ENV_THRESHOLD) return 'verified';
  if (input.successCount > 0 && independent >= CORROBORATED_ENV_THRESHOLD) return 'corroborated';

  return 'unverified';
}

/** How many more distinct environments are needed for the badge. Drives the demo's progress line. */
export function environmentsToVerified(input: VerificationInput): number {
  const independent = Math.min(input.distinctEnvCount, input.distinctOwnerCount);
  return Math.max(0, VERIFIED_ENV_THRESHOLD - independent);
}
