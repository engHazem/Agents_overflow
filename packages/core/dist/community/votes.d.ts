/**
 * Vote arithmetic.
 *
 * Kept apart from `attempt_report` throughout. A vote is an opinion; a report
 * is an observation from a machine that actually ran the fix. Collapsing them
 * into a single score would let a popular-but-broken answer outrank a
 * confirmed one, so ranking consumes them as two independent signals
 * (DESIGN.md §3.8). Nothing here feeds verification.
 */
export type VoteValue = -1 | 1;
export interface VoteTally {
    readonly up: number;
    readonly down: number;
    /** Net score. Can be negative; clamping it would hide genuine disagreement. */
    readonly score: number;
}
/**
 * What a click means, given what this account already voted.
 *
 * Voting the same way twice removes the vote — the second click is how a person
 * undoes the first, and every site behaves this way, so doing anything else
 * strands people with a vote they cannot retract. `null` means "no vote".
 */
export declare function nextVote(existing: VoteValue | null, incoming: VoteValue): VoteValue | null;
export declare function tally(values: readonly VoteValue[]): VoteTally;
//# sourceMappingURL=votes.d.ts.map