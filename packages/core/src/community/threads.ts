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
    readonly issues: readonly { code: string; message: string }[];
    readonly reviewerKind: 'automatic' | 'ai' | 'human';
    readonly model: string | null;
  } | null;
}

export type ThreadEntry =
  | {
      readonly kind: 'comment';
      readonly id: string;
      readonly body: string;
      readonly author: ThreadAuthor;
      readonly createdAt: string;
      readonly deleted: boolean;
      readonly score: number;
      readonly myVote: -1 | 1 | null;
      readonly replies: readonly ThreadEntry[];
    }
  | {
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

function byOldestFirst(a: { createdAt: string }, b: { createdAt: string }): number {
  // Oldest first: a thread is read downward, so the newest remark belongs at
  // the bottom where the reader already is.
  const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  return delta !== 0 ? delta : 0;
}

/**
 * Builds the thread for one solution.
 *
 * A comment nests under its `parentId` when it has one, otherwise under the
 * proposal it targets, otherwise it sits at the top level. A comment whose
 * parent is missing — deleted outright, or belonging to another solution — is
 * lifted to the top level rather than dropped: losing a remark silently is
 * worse than showing it slightly out of place.
 */
export function buildThread(
  comments: readonly CommentInput[],
  proposals: readonly ProposalInput[],
): ThreadEntry[] {
  const commentNodes = new Map<string, ThreadEntry & { kind: 'comment' }>();
  const replies = new Map<string, ThreadEntry[]>();

  for (const comment of comments) {
    commentNodes.set(comment.id, {
      kind: 'comment',
      id: comment.id,
      body: comment.deleted ? '' : comment.body,
      author: comment.author,
      createdAt: comment.createdAt,
      deleted: comment.deleted,
      score: comment.score,
      myVote: comment.myVote,
      replies: [],
    });
  }

  const proposalNodes = new Map<string, ThreadEntry & { kind: 'proposal' }>();
  for (const proposal of proposals) {
    proposalNodes.set(proposal.id, {
      kind: 'proposal',
      id: proposal.id,
      reason: proposal.reason,
      status: proposal.status,
      baseVersion: proposal.baseVersion,
      appliedVersion: proposal.appliedVersion,
      changes: proposal.changes,
      author: proposal.author,
      createdAt: proposal.createdAt,
      decidedAt: proposal.decidedAt,
      review: proposal.review,
      replies: [],
    });
  }

  const roots: ThreadEntry[] = [...proposalNodes.values()];

  const attach = (parentKey: string, node: ThreadEntry) => {
    const list = replies.get(parentKey) ?? [];
    list.push(node);
    replies.set(parentKey, list);
  };

  for (const comment of comments) {
    const node = commentNodes.get(comment.id);
    if (!node) continue;

    if (comment.parentId && commentNodes.has(comment.parentId)) {
      attach(comment.parentId, node);
      continue;
    }

    if (comment.targetType === 'edit_proposal' && proposalNodes.has(comment.targetId)) {
      attach(comment.targetId, node);
      continue;
    }

    roots.push(node);
  }

  const withReplies = (node: ThreadEntry): ThreadEntry => ({
    ...node,
    replies: (replies.get(node.id) ?? []).sort(byOldestFirst).map(withReplies),
  });

  return roots.sort(byOldestFirst).map(withReplies);
}

/** Total remarks in a thread, replies included. Used for the collapsed header. */
export function countEntries(entries: readonly ThreadEntry[]): number {
  return entries.reduce((n, entry) => n + 1 + countEntries(entry.replies), 0);
}
