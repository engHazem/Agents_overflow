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
import type { ReviewVerdict } from '../review/reviewer.js';
/** The editable text of a solution. Counters and verification are not editable. */
export interface SolutionContent {
    readonly title: string;
    readonly body: string;
    readonly commands: string | null;
    readonly diff: string | null;
    readonly rationale: string | null;
}
/**
 * A proposal's fields.
 *
 * `null` and `undefined` both mean "leave this alone" — they are not a request
 * to blank the field. Distinguishing "unchanged" from "cleared" would need a
 * separate signal, and conflating them the other way round is the dangerous
 * direction: a proposal that only fixed the title would wipe the body.
 */
export interface ProposedChange {
    readonly title?: string | null;
    readonly body?: string | null;
    readonly commands?: string | null;
    readonly diff?: string | null;
    readonly rationale?: string | null;
}
export type EditableField = keyof SolutionContent;
export declare const EDITABLE_FIELDS: readonly EditableField[];
export interface FieldChange {
    readonly field: EditableField;
    readonly before: string | null;
    readonly after: string;
}
/** A proposal's status, mirroring the `edit_proposal_status` enum. */
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'outdated' | 'needs_human';
/**
 * What a proposal would actually change.
 *
 * A field is only a change if it differs from the base after trimming. A
 * proposal that re-submits identical text is not an edit, and letting it
 * through would create an empty version and a thread entry claiming a change
 * nobody made.
 */
export declare function changedFields(base: SolutionContent, proposed: ProposedChange): FieldChange[];
/**
 * The text a solution would have if this proposal were applied.
 *
 * Only the changed fields move; everything else is carried across verbatim, so
 * applying a proposal cannot lose content the proposer never looked at.
 */
export declare function applyProposal(base: SolutionContent, proposed: ProposedChange): SolutionContent;
/**
 * Whether the solution has moved on since this proposal was written.
 *
 * This is the precondition that makes concurrent editing safe. Two people
 * editing the same step is normal; applying the second edit over the first
 * without noticing would quietly revert it, and neither author would see an
 * error. So the proposal names the version it was based on, and if that is no
 * longer current the proposal is retired rather than merged.
 */
export declare function isStale(baseVersion: number, currentVersion: number): boolean;
/**
 * How a reviewer's verdict maps onto a proposal's status.
 *
 * `changes_requested` deliberately does **not** become `pending`. The reviewer
 * has already decided; leaving it pending would put it back in a queue that
 * nothing drains, and it would read to the proposer as "still being looked at"
 * forever. It is a refusal with reasons attached, and the proposer resubmits.
 */
export declare function statusForVerdict(verdict: ReviewVerdict): ProposalStatus;
/** Whether a status still allows the proposal to be applied later. */
export declare function isOpen(status: ProposalStatus): boolean;
/**
 * A one-line summary of a proposal, for the thread and for the review prompt.
 *
 * Names the fields rather than showing the text: the thread lists many
 * proposals, and a body-length diff in each would bury everything else.
 */
export declare function summarizeChanges(changes: readonly FieldChange[]): string;
//# sourceMappingURL=proposals.d.ts.map