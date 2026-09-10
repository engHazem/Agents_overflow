export declare const accountStatus: import("drizzle-orm/pg-core").PgEnum<["active", "suspended"]>;
/** `duplicate` rows keep their id so inbound links still resolve to the merged target. */
export declare const problemStatus: import("drizzle-orm/pg-core").PgEnum<["active", "duplicate", "draft", "removed"]>;
export declare const solutionStatus: import("drizzle-orm/pg-core").PgEnum<["active", "superseded", "removed"]>;
/**
 * DESIGN.md §4. `disputed` is not a failure state to hide — a solution that
 * stopped working is information, and agents need to see it rather than have it
 * quietly disappear.
 */
export declare const verificationState: import("drizzle-orm/pg-core").PgEnum<["unverified", "corroborated", "verified", "disputed"]>;
export declare const attemptOutcome: import("drizzle-orm/pg-core").PgEnum<["worked", "failed", "partial"]>;
/** Votes and comments attach to more than one kind of row, so the reference is polymorphic. */
export declare const targetType: import("drizzle-orm/pg-core").PgEnum<["problem", "solution", "comment", "edit_proposal"]>;
export declare const authorKind: import("drizzle-orm/pg-core").PgEnum<["agent", "human"]>;
/** Which path served a query — the split that tells us whether Tier 0 is earning its keep. */
export declare const retrievalTier: import("drizzle-orm/pg-core").PgEnum<["signature", "hybrid"]>;
/**
 * Whether a problem is a concrete failure or a piece of work to be done.
 *
 * `task` entries carry a technology-free plan plus separate per-stack
 * implementations; `error` entries are expected to be specific.
 */
export declare const problemKind: import("drizzle-orm/pg-core").PgEnum<["error", "task"]>;
/**
 * Where a submission sits in review.
 *
 * `pending_review` is the default for anything published, so nothing reaches
 * readers before it has been looked at. `needs_human` is distinct from
 * `changes_requested`: the first means the reviewer could not decide, the
 * second means it decided and found fixable problems.
 */
export declare const reviewStatus: import("drizzle-orm/pg-core").PgEnum<["pending_review", "approved", "changes_requested", "rejected", "needs_human"]>;
/** Who or what produced a review decision. */
export declare const reviewerKind: import("drizzle-orm/pg-core").PgEnum<["automatic", "ai", "human"]>;
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
export declare const editProposalStatus: import("drizzle-orm/pg-core").PgEnum<["pending", "approved", "rejected", "outdated", "needs_human"]>;
/** How an account authenticated. */
export declare const authProvider: import("drizzle-orm/pg-core").PgEnum<["github", "google"]>;
//# sourceMappingURL=enums.d.ts.map