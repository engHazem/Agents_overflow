import { describe, expect, it } from 'vitest';

import {
  applyProposal,
  changedFields,
  isOpen,
  isStale,
  statusForVerdict,
  summarizeChanges,
  type ProposedChange,
  type SolutionContent,
} from './proposals.js';
import { nextVote, tally } from './votes.js';
import { buildThread, countEntries, type CommentInput, type ProposalInput } from './threads.js';

const BASE: SolutionContent = {
  title: 'Install the peer dependency',
  body: 'Run npm install jwt@4 and restart.',
  commands: 'npm install jwt@4',
  diff: null,
  rationale: 'Version 4 shipped the missing types.',
};

describe('what a proposal changes', () => {
  it('reports only the fields that actually differ', () => {
    const changes = changedFields(BASE, { commands: 'npm install jwt@5' });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      field: 'commands',
      before: 'npm install jwt@4',
      after: 'npm install jwt@5',
    });
  });

  it('treats identical text as no change', () => {
    // Resubmitting the same text is not an edit. Letting it through would mint
    // an empty version and a thread entry claiming a change nobody made.
    expect(changedFields(BASE, { title: BASE.title, body: BASE.body })).toEqual([]);
  });

  it('ignores surrounding whitespace when deciding whether anything moved', () => {
    expect(changedFields(BASE, { commands: '  npm install jwt@4  ' })).toEqual([]);
  });

  it('treats null and undefined as "leave it alone", not "blank it"', () => {
    /**
     * The dangerous direction. A proposal that only fixes the title arrives
     * with every other field unset; if unset meant "clear", approving it would
     * wipe the body and the reviewer would have approved a diff it never saw.
     */
    const proposal: ProposedChange = { title: 'Install the peer dependency (v5)', body: null };
    const changes = changedFields(BASE, proposal);

    expect(changes.map((c) => c.field)).toEqual(['title']);
    expect(applyProposal(BASE, proposal).body).toBe(BASE.body);
  });

  it('does not accept an empty string as a change', () => {
    expect(changedFields(BASE, { body: '   ' })).toEqual([]);
  });

  it('can set a field that was previously null', () => {
    const changes = changedFields(BASE, { diff: '--- a/x\n+++ b/x' });
    expect(changes[0]).toMatchObject({ field: 'diff', before: null });
  });
});

describe('applying a proposal', () => {
  it('moves the changed fields and carries the rest across verbatim', () => {
    const next = applyProposal(BASE, { commands: 'npm install jwt@5', title: 'Use jwt v5' });

    expect(next).toEqual({
      ...BASE,
      title: 'Use jwt v5',
      commands: 'npm install jwt@5',
    });
  });

  it('is a no-op when nothing changed', () => {
    expect(applyProposal(BASE, {})).toEqual(BASE);
  });

  it('does not mutate the input', () => {
    const before = structuredClone(BASE);
    applyProposal(BASE, { body: 'Something else entirely.' });
    expect(BASE).toEqual(before);
  });
});

describe('staleness — the precondition that stops silent reverts', () => {
  it('is fresh when the solution has not moved', () => {
    expect(isStale(3, 3)).toBe(false);
  });

  it('is stale once someone else\'s edit has landed', () => {
    /**
     * Two people edit step 3. A is approved, taking the solution to version 2.
     * B was written against version 1. Applying B now would revert A, and
     * neither author would be told.
     */
    expect(isStale(1, 2)).toBe(true);
  });

  it('is stale if it somehow claims a version that does not exist yet', () => {
    // Not reachable through the API, but treating it as applicable would mean
    // writing a version number that is already taken.
    expect(isStale(5, 2)).toBe(true);
  });
});

describe('reviewer verdict to proposal status', () => {
  it('approves an approval', () => {
    expect(statusForVerdict('approved')).toBe('approved');
  });

  it('refuses on rejection and on changes requested', () => {
    // `changes_requested` is a decision, not a pause. Leaving it pending would
    // park it in a queue nothing drains and read as "still being looked at".
    expect(statusForVerdict('rejected')).toBe('rejected');
    expect(statusForVerdict('changes_requested')).toBe('rejected');
  });

  it('escalates when the reviewer could not decide', () => {
    expect(statusForVerdict('needs_human')).toBe('needs_human');
  });

  it('keeps only undecided statuses open', () => {
    expect(isOpen('pending')).toBe(true);
    expect(isOpen('needs_human')).toBe(true);
    expect(isOpen('approved')).toBe(false);
    expect(isOpen('rejected')).toBe(false);
    expect(isOpen('outdated')).toBe(false);
  });

  it('summarizes by field name rather than by text', () => {
    expect(summarizeChanges(changedFields(BASE, { commands: 'npm i jwt@5' }))).toBe('commands');
    expect(summarizeChanges([])).toBe('no changes');
  });
});

describe('votes', () => {
  it('records a vote where there was none', () => {
    expect(nextVote(null, 1)).toBe(1);
    expect(nextVote(null, -1)).toBe(-1);
  });

  it('removes the vote when the same button is pressed twice', () => {
    // The second click is how a person retracts the first. Anything else
    // strands them with a vote they cannot take back.
    expect(nextVote(1, 1)).toBe(null);
    expect(nextVote(-1, -1)).toBe(null);
  });

  it('switches sides in one click', () => {
    expect(nextVote(-1, 1)).toBe(1);
    expect(nextVote(1, -1)).toBe(-1);
  });

  it('tallies up, down and net separately', () => {
    expect(tally([1, 1, 1, -1])).toEqual({ up: 3, down: 1, score: 2 });
  });

  it('lets the score go negative rather than hiding disagreement', () => {
    expect(tally([-1, -1, 1]).score).toBe(-1);
  });

  it('handles an empty tally', () => {
    expect(tally([])).toEqual({ up: 0, down: 0, score: 0 });
  });
});

const AUTHOR = { handle: 'dev_marcos', displayName: 'Marcos', avatarUrl: null, kind: 'human' as const };

function comment(over: Partial<CommentInput> & { id: string; createdAt: string }): CommentInput {
  return {
    targetType: 'solution',
    targetId: 'sol-1',
    parentId: null,
    body: 'a remark',
    author: AUTHOR,
    deleted: false,
    score: 0,
    myVote: null,
    ...over,
  };
}

function proposal(over: Partial<ProposalInput> & { id: string; createdAt: string }): ProposalInput {
  return {
    reason: 'version 4 was removed',
    status: 'pending',
    baseVersion: 1,
    appliedVersion: null,
    changes: [],
    author: AUTHOR,
    decidedAt: null,
    review: null,
    ...over,
  };
}

describe('the thread', () => {
  it('merges comments and proposals into one list, oldest first', () => {
    const thread = buildThread(
      [
        comment({ id: 'c1', createdAt: '2026-01-01T10:00:00Z' }),
        comment({ id: 'c2', createdAt: '2026-01-03T10:00:00Z' }),
      ],
      [proposal({ id: 'p1', createdAt: '2026-01-02T10:00:00Z' })],
    );

    // A reader scrolls downward, so the newest remark belongs at the bottom.
    expect(thread.map((e) => e.id)).toEqual(['c1', 'p1', 'c2']);
    expect(thread.map((e) => e.kind)).toEqual(['comment', 'proposal', 'comment']);
  });

  it('nests a reply under its parent comment', () => {
    const thread = buildThread(
      [
        comment({ id: 'c1', createdAt: '2026-01-01T10:00:00Z' }),
        comment({ id: 'c2', createdAt: '2026-01-02T10:00:00Z', parentId: 'c1' }),
      ],
      [],
    );

    expect(thread).toHaveLength(1);
    expect(thread[0].replies.map((r) => r.id)).toEqual(['c2']);
  });

  it('nests a comment on a proposal under that proposal', () => {
    const thread = buildThread(
      [
        comment({
          id: 'c1',
          createdAt: '2026-01-02T10:00:00Z',
          targetType: 'edit_proposal',
          targetId: 'p1',
        }),
      ],
      [proposal({ id: 'p1', createdAt: '2026-01-01T10:00:00Z' })],
    );

    expect(thread.map((e) => e.id)).toEqual(['p1']);
    expect(thread[0].replies.map((r) => r.id)).toEqual(['c1']);
  });

  it('lifts an orphan to the top level rather than dropping it', () => {
    // Parent gone, or belonging to another solution. Losing a remark silently
    // is worse than showing it slightly out of place.
    const thread = buildThread(
      [comment({ id: 'c1', createdAt: '2026-01-01T10:00:00Z', parentId: 'nonexistent' })],
      [],
    );

    expect(thread.map((e) => e.id)).toEqual(['c1']);
  });

  it('keeps a deleted comment in place but empties its body', () => {
    // Removing the row outright would detach every reply beneath it.
    const thread = buildThread(
      [
        comment({ id: 'c1', createdAt: '2026-01-01T10:00:00Z', deleted: true, body: 'secret' }),
        comment({ id: 'c2', createdAt: '2026-01-02T10:00:00Z', parentId: 'c1' }),
      ],
      [],
    );

    expect(thread[0].kind).toBe('comment');
    expect(thread[0]).toMatchObject({ deleted: true, body: '' });
    expect(thread[0].replies).toHaveLength(1);
  });

  it('sorts replies oldest first too, at every depth', () => {
    const thread = buildThread(
      [
        comment({ id: 'c1', createdAt: '2026-01-01T10:00:00Z' }),
        comment({ id: 'late', createdAt: '2026-01-05T10:00:00Z', parentId: 'c1' }),
        comment({ id: 'early', createdAt: '2026-01-02T10:00:00Z', parentId: 'c1' }),
        comment({ id: 'deep', createdAt: '2026-01-06T10:00:00Z', parentId: 'early' }),
      ],
      [],
    );

    expect(thread[0].replies.map((r) => r.id)).toEqual(['early', 'late']);
    expect(thread[0].replies[0].replies.map((r) => r.id)).toEqual(['deep']);
  });

  it('carries the reviewer decision on the proposal entry', () => {
    const thread = buildThread(
      [],
      [
        proposal({
          id: 'p1',
          createdAt: '2026-01-01T10:00:00Z',
          status: 'approved',
          appliedVersion: 2,
          decidedAt: '2026-01-01T10:05:00Z',
          review: { verdict: 'approved', issues: [], reviewerKind: 'ai', model: 'some-model' },
        }),
      ],
    );

    expect(thread[0]).toMatchObject({
      kind: 'proposal',
      status: 'approved',
      appliedVersion: 2,
      review: { verdict: 'approved', reviewerKind: 'ai' },
    });
  });

  it('counts every entry including nested replies', () => {
    const thread = buildThread(
      [
        comment({ id: 'c1', createdAt: '2026-01-01T10:00:00Z' }),
        comment({ id: 'c2', createdAt: '2026-01-02T10:00:00Z', parentId: 'c1' }),
        comment({ id: 'c3', createdAt: '2026-01-03T10:00:00Z', parentId: 'c2' }),
      ],
      [proposal({ id: 'p1', createdAt: '2026-01-04T10:00:00Z' })],
    );

    expect(countEntries(thread)).toBe(4);
  });

  it('returns an empty thread rather than failing when there is nothing', () => {
    expect(buildThread([], [])).toEqual([]);
    expect(countEntries([])).toBe(0);
  });
});
