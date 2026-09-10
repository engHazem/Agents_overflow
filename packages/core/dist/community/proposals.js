/**
 * The rules governing a proposed edit to a solution.
 *
 * Pure on purpose. Whether a proposal is stale, what it actually changes, and
 * what the text becomes once applied are all decisions that have to be
 * identical on the write path, in a test, and in whatever background job
 * eventually re-runs them. Anything reading the database cannot be checked
 * cheaply, and these are the rules that must not be guessed at.
 *
 * The model is a pull request, deliberately:
 *
 * - a proposal is a *request*, so nothing mutates until it is approved;
 * - it records the version it was written against, so it cannot silently
 *   overwrite an edit that landed first;
 * - it is kept after a refusal, because "someone asked for this and it was
 *   declined" is information the next reader wants.
 */
export const EDITABLE_FIELDS = [
    'title',
    'body',
    'commands',
    'diff',
    'rationale',
];
/**
 * What a proposal would actually change.
 *
 * A field is only a change if it differs from the base after trimming. A
 * proposal that re-submits identical text is not an edit, and letting it
 * through would create an empty version and a thread entry claiming a change
 * nobody made.
 */
export function changedFields(base, proposed) {
    const changes = [];
    for (const field of EDITABLE_FIELDS) {
        const raw = proposed[field];
        if (raw === undefined || raw === null)
            continue;
        const after = raw.trim();
        if (!after)
            continue;
        const before = base[field];
        if ((before ?? '').trim() === after)
            continue;
        changes.push({ field, before: before ?? null, after });
    }
    return changes;
}
/**
 * The text a solution would have if this proposal were applied.
 *
 * Only the changed fields move; everything else is carried across verbatim, so
 * applying a proposal cannot lose content the proposer never looked at.
 */
export function applyProposal(base, proposed) {
    const next = { ...base };
    const changes = changedFields(base, proposed);
    return changes.reduce((content, change) => ({ ...content, [change.field]: change.after }), next);
}
/**
 * Whether the solution has moved on since this proposal was written.
 *
 * This is the precondition that makes concurrent editing safe. Two people
 * editing the same step is normal; applying the second edit over the first
 * without noticing would quietly revert it, and neither author would see an
 * error. So the proposal names the version it was based on, and if that is no
 * longer current the proposal is retired rather than merged.
 */
export function isStale(baseVersion, currentVersion) {
    return baseVersion !== currentVersion;
}
/**
 * How a reviewer's verdict maps onto a proposal's status.
 *
 * `changes_requested` deliberately does **not** become `pending`. The reviewer
 * has already decided; leaving it pending would put it back in a queue that
 * nothing drains, and it would read to the proposer as "still being looked at"
 * forever. It is a refusal with reasons attached, and the proposer resubmits.
 */
export function statusForVerdict(verdict) {
    switch (verdict) {
        case 'approved':
            return 'approved';
        case 'rejected':
        case 'changes_requested':
            return 'rejected';
        case 'needs_human':
        default:
            return 'needs_human';
    }
}
/** Whether a status still allows the proposal to be applied later. */
export function isOpen(status) {
    return status === 'pending' || status === 'needs_human';
}
/**
 * A one-line summary of a proposal, for the thread and for the review prompt.
 *
 * Names the fields rather than showing the text: the thread lists many
 * proposals, and a body-length diff in each would bury everything else.
 */
export function summarizeChanges(changes) {
    if (changes.length === 0)
        return 'no changes';
    return changes.map((c) => c.field).join(', ');
}
//# sourceMappingURL=proposals.js.map