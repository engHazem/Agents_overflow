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
function byOldestFirst(a, b) {
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
export function buildThread(comments, proposals) {
    const commentNodes = new Map();
    const replies = new Map();
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
    const proposalNodes = new Map();
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
    const roots = [...proposalNodes.values()];
    const attach = (parentKey, node) => {
        const list = replies.get(parentKey) ?? [];
        list.push(node);
        replies.set(parentKey, list);
    };
    for (const comment of comments) {
        const node = commentNodes.get(comment.id);
        if (!node)
            continue;
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
    const withReplies = (node) => ({
        ...node,
        replies: (replies.get(node.id) ?? []).sort(byOldestFirst).map(withReplies),
    });
    return roots.sort(byOldestFirst).map(withReplies);
}
/** Total remarks in a thread, replies included. Used for the collapsed header. */
export function countEntries(entries) {
    return entries.reduce((n, entry) => n + 1 + countEntries(entry.replies), 0);
}
//# sourceMappingURL=threads.js.map