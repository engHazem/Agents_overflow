/**
 * Vote arithmetic.
 *
 * Kept apart from `attempt_report` throughout. A vote is an opinion; a report
 * is an observation from a machine that actually ran the fix. Collapsing them
 * into a single score would let a popular-but-broken answer outrank a
 * confirmed one, so ranking consumes them as two independent signals
 * (DESIGN.md §3.8). Nothing here feeds verification.
 */
/**
 * What a click means, given what this account already voted.
 *
 * Voting the same way twice removes the vote — the second click is how a person
 * undoes the first, and every site behaves this way, so doing anything else
 * strands people with a vote they cannot retract. `null` means "no vote".
 */
export function nextVote(existing, incoming) {
    return existing === incoming ? null : incoming;
}
export function tally(values) {
    const up = values.filter((v) => v === 1).length;
    const down = values.length - up;
    return { up, down, score: up - down };
}
//# sourceMappingURL=votes.js.map