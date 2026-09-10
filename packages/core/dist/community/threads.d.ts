/**
 * Assembles the conversation on a solution.
 *
 * Comments and proposed edits are stored separately — they are different things
 * with different lifecycles — but a reader does not care which table a remark
 * came from. What they want is the history in order: someone said step 3 was
 * out of date, someone proposed a change, the reviewer accepted it, an agent
 * confirmed it still works.
 *
 * So this merges the two into one chronological thread, oldest first, with
 * replies nested under whatever they replied to. Pure, so the ordering and
 * nesting rules can be tested without a database.
 */
import type { FieldChange, ProposalStatus } from './proposals.js';
export interface ThreadAuthor {
    readonly handle: string;
    readonly displayName: string | null;
    readonly avatarUrl: string | null;
    /** Agents publish solutions; only humans comment and propose. Kept for display. */
    readonly kind: 'human' | 'agent';
}
export interface CommentInput {
    readonly id: string;
    readonly targetType: 'solution' | 'comment' | 'edit_proposal' | 'problem';
    readonly targetId: string;
    readonly parentId: string | null;
    readonly body: string;
    readonly author: ThreadAuthor;
    readonly createdAt: string;
    readonly deleted: boolean;
    readonly score: number;
    /** How the signed-in reader voted, so the button can render its own state. */
    readonly myVote: -1 | 1 | null;
}
export interface ProposalInput {
    readonly id: string;
    readonly reason: string;
    readonly status: ProposalStatus;
    readonly baseVersion: number;
    readonly appliedVersion: number | null;
    readonly changes: readonly FieldChange[];
    readonly author: ThreadAuthor;
    readonly createdAt: string;
    readonly decidedAt: string | null;
    /** The reviewer's own words, when it left any. */
    readonly review: {
        readonly verdict: string;
        readonly issues: readonly {
            code: string;
            message: string;
        }[];
        readonly reviewerKind: 'automatic' | 'ai' | 'human';
        readonly model: string | null;
    } | null;
}
export type ThreadEntry = {
    readonly kind: 'comment';
    readonly id: string;
    readonly body: string;
    readonly author: ThreadAuthor;
    readonly createdAt: string;
    readonly deleted: boolean;
    readonly score: number;
    readonly myVote: -1 | 1 | null;
    readonly replies: readonly ThreadEntry[];
} | {
    readonly kind: 'proposal';
    readonly id: string;
    readonly reason: string;
    readonly status: ProposalStatus;
    readonly baseVersion: number;
    readonly appliedVersion: number | null;
    readonly changes: readonly FieldChange[];
    readonly author: ThreadAuthor;
    readonly createdAt: string;
    readonly decidedAt: string | null;
    readonly review: ProposalInput['review'];
    readonly replies: readonly ThreadEntry[];
};
/**
 * Builds the thread for one solution.
 *
 * A comment nests under its `parentId` when it has one, otherwise under the
 * proposal it targets, otherwise it sits at the top level. A comment whose
 * parent is missing — deleted outright, or belonging to another solution — is
 * lifted to the top level rather than dropped: losing a remark silently is
 * worse than showing it slightly out of place.
 */
export declare function buildThread(comments: readonly CommentInput[], proposals: readonly ProposalInput[]): ThreadEntry[];
/** Total remarks in a thread, replies included. Used for the collapsed header. */
export declare function countEntries(entries: readonly ThreadEntry[]): number;
//# sourceMappingURL=threads.d.ts.map