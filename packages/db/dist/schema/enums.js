import { pgEnum } from 'drizzle-orm/pg-core';
export const accountStatus = pgEnum('account_status', ['active', 'suspended']);
/** `duplicate` rows keep their id so inbound links still resolve to the merged target. */
export const problemStatus = pgEnum('problem_status', ['active', 'duplicate', 'draft', 'removed']);
export const solutionStatus = pgEnum('solution_status', ['active', 'superseded', 'removed']);
/**
 * DESIGN.md §4. `disputed` is not a failure state to hide — a solution that
 * stopped working is information, and agents need to see it rather than have it
 * quietly disappear.
 */
export const verificationState = pgEnum('verification_state', [
    'unverified',
    'corroborated',
    'verified',
    'disputed',
]);
export const attemptOutcome = pgEnum('attempt_outcome', ['worked', 'failed', 'partial']);
/** Votes and comments attach to more than one kind of row, so the reference is polymorphic. */
export const targetType = pgEnum('target_type', [
    'problem',
    'solution',
    'comment',
    'edit_proposal',
]);
export const authorKind = pgEnum('author_kind', ['agent', 'human']);
/** Which path served a query — the split that tells us whether Tier 0 is earning its keep. */
export const retrievalTier = pgEnum('retrieval_tier', ['signature', 'hybrid']);
/**
 * Whether a problem is a concrete failure or a piece of work to be done.
 *
 * `task` entries carry a technology-free plan plus separate per-stack
 * implementations; `error` entries are expected to be specific.
 */
export const problemKind = pgEnum('problem_kind', ['error', 'task']);
/**
 * Where a submission sits in review.
 *
 * `pending_review` is the default for anything published, so nothing reaches
 * readers before it has been looked at. `needs_human` is distinct from
 * `changes_requested`: the first means the reviewer could not decide, the
 * second means it decided and found fixable problems.
 */
export const reviewStatus = pgEnum('review_status', [
    'pending_review',
    'approved',
    'changes_requested',
    'rejected',
    'needs_human',
]);
/** Who or what produced a review decision. */
export const reviewerKind = pgEnum('reviewer_kind', ['automatic', 'ai', 'human']);
/**
 * Where a proposed edit sits.
 *
 * `outdated` is the one that is easy to leave out and expensive to omit. Two
 * people editing the same solution is normal, and once the first is applied the
 * second was written against text that no longer exists. Applying it anyway
 * would silently revert the first change, so a proposal records the version it
 * was written against and is retired rather than merged when that version is no
 * longer current — the same precondition a pull request uses.
 */
export const editProposalStatus = pgEnum('edit_proposal_status', [
    'pending',
    'approved',
    'rejected',
    'outdated',
    'needs_human',
]);
/** How an account authenticated. */
export const authProvider = pgEnum('auth_provider', ['github', 'google']);
//# sourceMappingURL=enums.js.map