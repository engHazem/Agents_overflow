/**
 * Comments, votes, and proposed edits.
 *
 * The half of the knowledge base that humans write. Everything else here is
 * produced by agents and confirmed by machines that ran the fix; this is where
 * a person who knows the thing that went stale can say so.
 *
 * Three rules shape all of it:
 *
 * **A proposal is a request, not an edit.** Nothing mutates a solution until a
 * reviewer approves it. An agent that knows better publishes its own solution;
 * a human asks. That asymmetry is deliberate — the corpus is machine-verified,
 * and letting an unverified human edit overwrite it directly would put opinion
 * on top of evidence.
 *
 * **A refusal is kept.** A rejected proposal stays in the thread with its
 * reasons. "Someone asked for this and it was declined, and here is why" is
 * information the next reader wants, and deleting it invites the same proposal
 * again next week.
 *
 * **Votes never touch verification.** A vote is an opinion; an attempt report
 * is an observation from a machine that actually ran the thing. They are
 * counted separately and they stay that way (DESIGN.md §3.8) — otherwise a
 * popular broken answer outranks a confirmed one.
 */

import {
  applyProposal,
  buildThread,
  changedFields,
  countEntries,
  nextVote,
  reviewSubmission,
  scanForSecrets,
  statusForVerdict,
  summarizeChanges,
  tally,
  type CommentInput,
  type FieldChange,
  type ProposalInput,
  type SolutionContent,
  type ThreadAuthor,
  type VoteValue,
} from '@agents-overflow/core';
import { schema } from '@agents-overflow/db';
import {
  createCommentRequest,
  createProposalRequest,
  voteRequest,
  type CreateProposalResponse,
  type RevisionsResponse,
  type ThreadResponse,
  type VoteResponse,
} from '@agents-overflow/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { currentUser } from './auth.js';
import { isUuid, notFound } from './params.js';
import type { AppContext } from './context.js';

/** Signed-in accounts only. Anonymous participation has no independence key. */
async function requireAccount(ctx: AppContext, request: FastifyRequest) {
  const user = await currentUser(ctx, request);
  if (!user) return null;
  return user;
}

const UNAUTHENTICATED = {
  error: 'unauthenticated',
  message: 'Sign in to take part in a thread.',
} as const;

/**
 * The editable text of a solution, and nothing else.
 *
 * An explicit column list rather than `select()`: this joins nothing and the
 * counters are irrelevant here, but more to the point, naming the columns is
 * what keeps an editable-field set from silently growing when the table does.
 */
const CONTENT_COLUMNS = {
  id: schema.solution.id,
  problemId: schema.solution.problemId,
  version: schema.solution.version,
  title: schema.solution.title,
  body: schema.solution.body,
  commands: schema.solution.commands,
  diff: schema.solution.diff,
  rationale: schema.solution.rationale,
  status: schema.solution.status,
} as const;

function authorFrom(row: {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}): ThreadAuthor {
  return {
    // A cascade-deleted account leaves the remark behind; showing it as
    // "[removed]" beats a blank byline that looks like a rendering bug.
    handle: row.handle ?? '[removed]',
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    kind: 'human',
  };
}

/**
 * Vote counts for a set of targets, plus how this reader voted.
 *
 * One query for the tallies and one for the reader's own votes, rather than a
 * query per comment: a busy thread is exactly where an N+1 hurts, and the
 * reader's votes cannot be folded into the aggregate without a join that
 * changes the counts.
 */
async function voteState(
  ctx: AppContext,
  targets: ReadonlyArray<{ targetType: 'solution' | 'comment' | 'edit_proposal'; targetId: string }>,
  accountId: string | null,
) {
  const empty = {
    tallies: new Map<string, { up: number; down: number; score: number }>(),
    mine: new Map<string, VoteValue>(),
  };
  if (targets.length === 0) return empty;

  const ids = [...new Set(targets.map((t) => t.targetId))];

  const rows = await ctx.db
    .select({
      targetType: schema.vote.targetType,
      targetId: schema.vote.targetId,
      value: schema.vote.value,
    })
    .from(schema.vote)
    .where(inArray(schema.vote.targetId, ids));

  const grouped = new Map<string, VoteValue[]>();
  for (const row of rows) {
    const key = `${row.targetType}:${row.targetId}`;
    const list = grouped.get(key) ?? [];
    list.push(row.value === 1 ? 1 : -1);
    grouped.set(key, list);
  }

  const tallies = new Map<string, { up: number; down: number; score: number }>();
  for (const [key, values] of grouped) tallies.set(key, tally(values));

  const mine = new Map<string, VoteValue>();
  if (accountId) {
    const own = await ctx.db
      .select({
        targetType: schema.vote.targetType,
        targetId: schema.vote.targetId,
        value: schema.vote.value,
      })
      .from(schema.vote)
      .where(and(eq(schema.vote.accountId, accountId), inArray(schema.vote.targetId, ids)));

    for (const row of own) {
      mine.set(`${row.targetType}:${row.targetId}`, row.value === 1 ? 1 : -1);
    }
  }

  return { tallies, mine };
}

export async function registerCommunityRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  // -------------------------------------------------------------------------
  // The thread — comments and proposals as one conversation
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/solutions/:id/thread', async (request, reply) => {
    const { id } = request.params;
    if (!isUuid(id)) return reply.status(404).send(notFound('solution'));

    const user = await currentUser(ctx, request);

    const [solution] = await ctx.db
      .select({ id: schema.solution.id, version: schema.solution.version })
      .from(schema.solution)
      .where(eq(schema.solution.id, id))
      .limit(1);

    if (!solution) {
      return reply.status(404).send({ error: 'not_found', message: 'solution does not exist' });
    }

    const proposalRows = await ctx.db
      .select({
        id: schema.editProposal.id,
        reason: schema.editProposal.reason,
        status: schema.editProposal.status,
        baseVersion: schema.editProposal.baseVersion,
        appliedVersion: schema.editProposal.appliedVersion,
        createdAt: schema.editProposal.createdAt,
        decidedAt: schema.editProposal.decidedAt,
        proposedTitle: schema.editProposal.proposedTitle,
        proposedBody: schema.editProposal.proposedBody,
        proposedCommands: schema.editProposal.proposedCommands,
        proposedDiff: schema.editProposal.proposedDiff,
        proposedRationale: schema.editProposal.proposedRationale,
        handle: schema.account.handle,
        displayName: schema.account.displayName,
        avatarUrl: sql<string | null>`(SELECT ident.avatar_url FROM ${schema.authIdentity} ident
          WHERE ident.account_id = ${schema.editProposal}.account_id AND ident.avatar_url IS NOT NULL LIMIT 1)`,
      })
      .from(schema.editProposal)
      .leftJoin(schema.account, eq(schema.account.id, schema.editProposal.accountId))
      .where(eq(schema.editProposal.solutionId, id));

    /**
     * The text each proposal was written against, so the diff shown is the one
     * the proposer actually saw.
     *
     * Reconstructed from the revision at its base version rather than from the
     * solution as it stands now — otherwise an old proposal would appear to
     * change something it never touched, or nothing at all.
     */
    const baseVersions = [...new Set(proposalRows.map((p) => p.baseVersion))];
    const revisionRows =
      baseVersions.length > 0
        ? await ctx.db
            .select({
              version: schema.solutionRevision.version,
              title: schema.solutionRevision.title,
              body: schema.solutionRevision.body,
              commands: schema.solutionRevision.commands,
              diff: schema.solutionRevision.diff,
              rationale: schema.solutionRevision.rationale,
            })
            .from(schema.solutionRevision)
            .where(
              and(
                eq(schema.solutionRevision.solutionId, id),
                inArray(schema.solutionRevision.version, baseVersions),
              ),
            )
        : [];

    const baseByVersion = new Map(revisionRows.map((r) => [r.version, r]));

    // The reviewer's decision per proposal, newest first — a proposal can be
    // reviewed more than once if a person overrides the model.
    const reviewRows =
      proposalRows.length > 0
        ? await ctx.db
            .select({
              targetId: schema.review.targetId,
              status: schema.review.status,
              issues: schema.review.issues,
              reviewerKind: schema.review.reviewerKind,
              reviewerModel: schema.review.reviewerModel,
              createdAt: schema.review.createdAt,
            })
            .from(schema.review)
            .where(
              and(
                eq(schema.review.targetType, 'edit_proposal'),
                inArray(
                  schema.review.targetId,
                  proposalRows.map((p) => p.id),
                ),
              ),
            )
        : [];

    const reviewByProposal = new Map<string, (typeof reviewRows)[number]>();
    for (const row of reviewRows) {
      const existing = reviewByProposal.get(row.targetId);
      if (!existing || existing.createdAt < row.createdAt) reviewByProposal.set(row.targetId, row);
    }

    const commentRows = await ctx.db
      .select({
        id: schema.comment.id,
        targetType: schema.comment.targetType,
        targetId: schema.comment.targetId,
        parentId: schema.comment.parentId,
        body: schema.comment.body,
        createdAt: schema.comment.createdAt,
        deletedAt: schema.comment.deletedAt,
        handle: schema.account.handle,
        displayName: schema.account.displayName,
        avatarUrl: sql<string | null>`(SELECT ident.avatar_url FROM ${schema.authIdentity} ident
          WHERE ident.account_id = ${schema.comment}.account_id AND ident.avatar_url IS NOT NULL LIMIT 1)`,
      })
      .from(schema.comment)
      .leftJoin(schema.account, eq(schema.account.id, schema.comment.accountId))
      .where(
        // Comments on the solution itself, and comments on any of its
        // proposals — one query, because they render as one thread.
        proposalRows.length > 0
          ? sql`(${schema.comment.targetType} = 'solution' AND ${schema.comment.targetId} = ${id})
                OR (${schema.comment.targetType} = 'edit_proposal' AND ${schema.comment.targetId} IN ${sql`(${sql.join(
                  proposalRows.map((p) => sql`${p.id}::uuid`),
                  sql`, `,
                )})`})`
          : and(eq(schema.comment.targetType, 'solution'), eq(schema.comment.targetId, id)),
      );

    const votes = await voteState(
      ctx,
      [
        { targetType: 'solution' as const, targetId: id },
        ...commentRows.map((c) => ({ targetType: 'comment' as const, targetId: c.id })),
      ],
      user?.accountId ?? null,
    );

    const comments: CommentInput[] = commentRows.map((row) => ({
      id: row.id,
      targetType: row.targetType as CommentInput['targetType'],
      targetId: row.targetId,
      parentId: row.parentId,
      body: row.body,
      author: authorFrom(row),
      createdAt: row.createdAt.toISOString(),
      deleted: row.deletedAt !== null,
      score: votes.tallies.get(`comment:${row.id}`)?.score ?? 0,
      myVote: votes.mine.get(`comment:${row.id}`) ?? null,
    }));

    const proposals: ProposalInput[] = proposalRows.map((row) => {
      const base = baseByVersion.get(row.baseVersion);
      const content: SolutionContent = {
        title: base?.title ?? '',
        body: base?.body ?? '',
        commands: base?.commands ?? null,
        diff: base?.diff ?? null,
        rationale: base?.rationale ?? null,
      };

      const changes: FieldChange[] = base
        ? changedFields(content, {
            title: row.proposedTitle,
            body: row.proposedBody,
            commands: row.proposedCommands,
            diff: row.proposedDiff,
            rationale: row.proposedRationale,
          })
        : // The base revision is gone. Better to show the proposed text with no
          // "before" than to claim there was no change.
          (
            [
              ['title', row.proposedTitle],
              ['body', row.proposedBody],
              ['commands', row.proposedCommands],
              ['diff', row.proposedDiff],
              ['rationale', row.proposedRationale],
            ] as const
          )
            .filter(([, value]) => value !== null && value.trim() !== '')
            .map(([field, value]) => ({
              field: field as FieldChange['field'],
              before: null,
              after: (value as string).trim(),
            }));

      const review = reviewByProposal.get(row.id);

      return {
        id: row.id,
        reason: row.reason,
        status: row.status,
        baseVersion: row.baseVersion,
        appliedVersion: row.appliedVersion,
        changes,
        author: authorFrom(row),
        createdAt: row.createdAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
        review: review
          ? {
              verdict: review.status,
              issues: review.issues,
              reviewerKind: review.reviewerKind,
              model: review.reviewerModel,
            }
          : null,
      };
    });

    const entries = buildThread(comments, proposals);
    const solutionVotes = votes.tallies.get(`solution:${id}`) ?? { up: 0, down: 0, score: 0 };

    const response: ThreadResponse = {
      solutionId: id,
      version: solution.version,
      entries,
      entryCount: countEntries(entries),
      votes: {
        ...solutionVotes,
        myVote: votes.mine.get(`solution:${id}`) ?? null,
      },
      canParticipate: user !== null,
    };

    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------
  app.post('/v1/comments', async (request, reply) => {
    const user = await requireAccount(ctx, request);
    if (!user) return reply.status(401).send(UNAUTHENTICATED);

    const parsed = createCommentRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'comment failed validation',
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;

    /**
     * A credential in a comment is as public as one in a solution.
     *
     * Refused rather than redacted: quietly stripping a key leaves it live and
     * teaches the author nothing.
     */
    const scanned = scanForSecrets(input.body);
    if (scanned.blocked) {
      return reply.status(422).send({
        error: 'secret_detected',
        message:
          'This comment appears to contain a credential. Nothing was saved. Remove it, rotate the key, and post again.',
        details: {
          findings: scanned.findings.map((f) => ({
            rule: f.rule,
            description: f.description,
            severity: f.severity,
          })),
        },
      });
    }

    const targetExists = await commentTargetExists(ctx, input.targetType, input.targetId);
    if (!targetExists) {
      return reply
        .status(404)
        .send({ error: 'not_found', message: 'nothing to comment on at that id' });
    }

    if (input.parentId) {
      // A reply has to belong to the same target, or the thread builder would
      // nest it under something the reader is not looking at.
      const [parent] = await ctx.db
        .select({
          targetType: schema.comment.targetType,
          targetId: schema.comment.targetId,
        })
        .from(schema.comment)
        .where(eq(schema.comment.id, input.parentId))
        .limit(1);

      if (!parent) {
        return reply
          .status(404)
          .send({ error: 'not_found', message: 'the comment being replied to does not exist' });
      }

      if (parent.targetType !== input.targetType || parent.targetId !== input.targetId) {
        return reply.status(400).send({
          error: 'invalid_request',
          message: 'a reply must be on the same solution as the comment it replies to',
        });
      }
    }

    const [row] = await ctx.db
      .insert(schema.comment)
      .values({
        targetType: input.targetType,
        targetId: input.targetId,
        parentId: input.parentId ?? null,
        accountId: user.accountId,
        body: input.body,
      })
      .returning({ id: schema.comment.id, createdAt: schema.comment.createdAt });

    if (!row) {
      return reply.status(500).send({ error: 'insert_failed', message: 'could not save comment' });
    }

    return reply.status(201).send({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      author: {
        handle: user.handle,
        displayName: user.displayName,
        avatarUrl: null,
        kind: 'human' as const,
      },
    });
  });

  /**
   * Soft delete, author only.
   *
   * The row stays so replies beneath it keep their parent — removing it
   * outright would orphan an entire sub-thread to hide one remark. The body is
   * blanked on read, not in the database, so a moderator can still see what was
   * said.
   */
  app.delete<{ Params: { id: string } }>('/v1/comments/:id', async (request, reply) => {
    const user = await requireAccount(ctx, request);
    if (!user) return reply.status(401).send(UNAUTHENTICATED);

    if (!isUuid(request.params.id)) return reply.status(404).send(notFound('comment'));

    const [row] = await ctx.db
      .select({ id: schema.comment.id, accountId: schema.comment.accountId })
      .from(schema.comment)
      .where(eq(schema.comment.id, request.params.id))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: 'not_found', message: 'comment does not exist' });
    }

    if (row.accountId !== user.accountId) {
      return reply
        .status(403)
        .send({ error: 'forbidden', message: 'You can only delete your own comments.' });
    }

    await ctx.db
      .update(schema.comment)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.comment.id, row.id), isNull(schema.comment.deletedAt)));

    return reply.status(204).send();
  });

  // -------------------------------------------------------------------------
  // Votes
  // -------------------------------------------------------------------------
  app.post('/v1/votes', async (request, reply) => {
    const user = await requireAccount(ctx, request);
    if (!user) return reply.status(401).send(UNAUTHENTICATED);

    const parsed = voteRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'vote failed validation',
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;

    const exists = await commentTargetExists(ctx, input.targetType, input.targetId);
    if (!exists) {
      return reply.status(404).send({ error: 'not_found', message: 'nothing to vote on at that id' });
    }

    const [existing] = await ctx.db
      .select({ value: schema.vote.value })
      .from(schema.vote)
      .where(
        and(
          eq(schema.vote.accountId, user.accountId),
          eq(schema.vote.targetType, input.targetType),
          eq(schema.vote.targetId, input.targetId),
        ),
      )
      .limit(1);

    const current: VoteValue | null = existing ? (existing.value === 1 ? 1 : -1) : null;
    const next = nextVote(current, input.value);

    if (next === null) {
      await ctx.db
        .delete(schema.vote)
        .where(
          and(
            eq(schema.vote.accountId, user.accountId),
            eq(schema.vote.targetType, input.targetType),
            eq(schema.vote.targetId, input.targetId),
          ),
        );
    } else {
      await ctx.db
        .insert(schema.vote)
        .values({
          accountId: user.accountId,
          targetType: input.targetType,
          targetId: input.targetId,
          value: next,
        })
        .onConflictDoUpdate({
          target: [schema.vote.accountId, schema.vote.targetType, schema.vote.targetId],
          set: { value: next },
        });
    }

    const state = await voteState(
      ctx,
      [{ targetType: input.targetType as 'solution', targetId: input.targetId }],
      user.accountId,
    );
    const key = `${input.targetType}:${input.targetId}`;

    const response: VoteResponse = {
      targetType: input.targetType,
      targetId: input.targetId,
      ...(state.tallies.get(key) ?? { up: 0, down: 0, score: 0 }),
      myVote: state.mine.get(key) ?? null,
    };

    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // Proposed edits
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/v1/solutions/:id/proposals',
    async (request, reply) => {
      const user = await requireAccount(ctx, request);
      if (!user) return reply.status(401).send(UNAUTHENTICATED);

      const parsed = createProposalRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'invalid_request',
          message: 'proposal failed validation',
          details: parsed.error.flatten(),
        });
      }

      const input = parsed.data;
      const solutionId = request.params.id;
      if (!isUuid(solutionId)) return reply.status(404).send(notFound('solution'));

      const [solution] = await ctx.db
        .select(CONTENT_COLUMNS)
        .from(schema.solution)
        .where(eq(schema.solution.id, solutionId))
        .limit(1);

      if (!solution) {
        return reply.status(404).send({ error: 'not_found', message: 'solution does not exist' });
      }

      if (solution.status !== 'active') {
        return reply.status(409).send({
          error: 'not_editable',
          message: 'That solution has been superseded or removed. Propose against the current one.',
        });
      }

      /**
       * The precondition, checked before anything else costs money.
       *
       * If the solution has moved since the proposer loaded it, their diff is
       * against text that no longer exists. Applying it would revert whoever
       * landed first, with no error shown to either of them.
       */
      if (input.baseVersion !== solution.version) {
        return reply.status(409).send({
          error: 'outdated',
          message: `This solution has changed since you started — it is now version ${solution.version}. Reload and redo the change so you are editing the current text.`,
          details: { currentVersion: solution.version, yourBaseVersion: input.baseVersion },
        });
      }

      const base: SolutionContent = {
        title: solution.title,
        body: solution.body,
        commands: solution.commands,
        diff: solution.diff,
        rationale: solution.rationale,
      };

      const changes = changedFields(base, input);
      if (changes.length === 0) {
        return reply.status(400).send({
          error: 'no_changes',
          message: 'Nothing in this proposal differs from the current text.',
        });
      }

      const scanned = scanForSecrets(
        [input.reason, ...changes.map((c) => c.after)].join('\n'),
      );
      if (scanned.blocked) {
        return reply.status(422).send({
          error: 'secret_detected',
          message:
            'This proposal appears to contain a credential. Nothing was saved. Remove it, rotate the key, and propose again.',
          details: {
            findings: scanned.findings.map((f) => ({
              rule: f.rule,
              description: f.description,
              severity: f.severity,
            })),
          },
        });
      }

      const [problem] = await ctx.db
        .select({
          title: schema.problem.title,
          statement: schema.problem.statement,
          tags: schema.problem.tags,
          kind: schema.problem.kind,
          /**
           * The reviewer refuses an `error` submission that arrives without
           * error text, which is correct for a new publication and fatal here:
           * a proposal never carries the error, so omitting it rejected every
           * single proposal with `missing_error` — a message about a field the
           * proposer was never asked for.
           *
           * The normalized form is what we keep; the raw text is not stored.
           */
          normalizedError: schema.problem.normalizedError,
        })
        .from(schema.problem)
        .where(eq(schema.problem.id, solution.problemId))
        .limit(1);

      const merged = applyProposal(base, input);

      /**
       * The reviewer judges the *result*, not the fragment.
       *
       * A diff can look reasonable in isolation and leave the solution
       * self-contradictory — step 3 updated, step 5 still naming the old
       * version. Reviewing the merged text is the only way that shows up.
       */
      const review = await reviewSubmission(
        {
          kind: problem?.kind === 'task' ? 'task' : 'error',
          title: problem?.title ?? merged.title,
          statement: problem?.statement ?? '',
          errorText: problem?.normalizedError ?? undefined,
          solutionTitle: merged.title,
          solutionBody: merged.body,
          commands: merged.commands ?? undefined,
          rationale: merged.rationale ?? undefined,
          tags: problem?.tags ?? [],
        },
        ctx.reviewer,
      );

      const status = statusForVerdict(review.verdict);

      const [proposal] = await ctx.db
        .insert(schema.editProposal)
        .values({
          solutionId,
          accountId: user.accountId,
          baseVersion: input.baseVersion,
          status,
          reason: input.reason,
          proposedTitle: input.title ?? null,
          proposedBody: input.body ?? null,
          proposedCommands: input.commands ?? null,
          proposedDiff: input.diff ?? null,
          proposedRationale: input.rationale ?? null,
          decidedAt: new Date(),
        })
        .returning({ id: schema.editProposal.id });

      if (!proposal) {
        return reply
          .status(500)
          .send({ error: 'insert_failed', message: 'could not save proposal' });
      }

      // Append-only, and targeted at the proposal so the thread can show the
      // reviewer's reasons next to the change it judged.
      await ctx.db.insert(schema.review).values({
        targetType: 'edit_proposal',
        targetId: proposal.id,
        status: review.verdict === 'approved' ? 'approved' : review.verdict,
        reviewerKind: review.model ? 'ai' : 'automatic',
        reviewerModel: review.model,
        issues: [...review.issues],
        confidence: review.confidence === null ? null : String(review.confidence),
        failureReason: review.failureReason ?? null,
        secretFindings: [],
      });

      let appliedVersion: number | null = null;
      let finalStatus = status;

      if (status === 'approved') {
        const applied = await applyApprovedProposal(ctx, {
          solutionId,
          proposalId: proposal.id,
          baseVersion: input.baseVersion,
          merged,
          reason: input.reason,
        });

        if (applied === null) {
          /**
           * Someone else's proposal landed between the check above and here.
           *
           * The compare-and-swap is what makes this safe: the update only fires
           * while the version is still what the proposer saw, so the loser is
           * retired instead of overwriting the winner.
           */
          finalStatus = 'outdated';
          await ctx.db
            .update(schema.editProposal)
            .set({ status: 'outdated', updatedAt: new Date() })
            .where(eq(schema.editProposal.id, proposal.id));
        } else {
          appliedVersion = applied;
          await ctx.db
            .update(schema.editProposal)
            .set({ appliedVersion: applied, updatedAt: new Date() })
            .where(eq(schema.editProposal.id, proposal.id));
        }
      }

      const response: CreateProposalResponse = {
        id: proposal.id,
        status: finalStatus,
        changes,
        appliedVersion,
        review: {
          verdict: review.verdict,
          issues: review.issues.map((i) => ({ code: i.code, message: i.message })),
          reviewerKind: review.model ? 'ai' : 'automatic',
          model: review.model,
        },
        message: messageFor(finalStatus, appliedVersion, summarizeChanges(changes)),
      };

      return reply.status(201).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // Version history
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/solutions/:id/revisions', async (request, reply) => {
    const { id } = request.params;
    if (!isUuid(id)) return reply.status(404).send(notFound('solution'));

    const [solution] = await ctx.db
      .select({ id: schema.solution.id, version: schema.solution.version })
      .from(schema.solution)
      .where(eq(schema.solution.id, id))
      .limit(1);

    if (!solution) {
      return reply.status(404).send(notFound('solution'));
    }

    const rows = await ctx.db
      .select({
        version: schema.solutionRevision.version,
        title: schema.solutionRevision.title,
        body: schema.solutionRevision.body,
        commands: schema.solutionRevision.commands,
        diff: schema.solutionRevision.diff,
        rationale: schema.solutionRevision.rationale,
        changeReason: schema.solutionRevision.changeReason,
        createdAt: schema.solutionRevision.createdAt,
      })
      .from(schema.solutionRevision)
      .where(eq(schema.solutionRevision.solutionId, id));

    const response: RevisionsResponse = {
      solutionId: id,
      version: solution.version,
      revisions: rows
        .sort((a, b) => a.version - b.version)
        .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };

    return reply.send(response);
  });
}

/**
 * Applies an approved proposal, or refuses if the solution moved.
 *
 * Returns the new version number, or null when the compare-and-swap lost. The
 * `WHERE version = base` clause is the whole safety property: two approvals
 * racing cannot both write version 3, and the unique index on
 * (solution, version) is the backstop if the swap is ever removed.
 */
async function applyApprovedProposal(
  ctx: AppContext,
  args: {
    solutionId: string;
    proposalId: string;
    baseVersion: number;
    merged: SolutionContent;
    reason: string;
  },
): Promise<number | null> {
  const nextVersion = args.baseVersion + 1;

  const updated = await ctx.db
    .update(schema.solution)
    .set({
      title: args.merged.title,
      body: args.merged.body,
      commands: args.merged.commands,
      diff: args.merged.diff,
      rationale: args.merged.rationale,
      version: nextVersion,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.solution.id, args.solutionId),
        // Compare-and-swap. Fires only while the text is still what the
        // proposer was looking at.
        eq(schema.solution.version, args.baseVersion),
      ),
    )
    .returning({ version: schema.solution.version });

  if (updated.length === 0) return null;

  await ctx.db.insert(schema.solutionRevision).values({
    solutionId: args.solutionId,
    version: nextVersion,
    title: args.merged.title,
    body: args.merged.body,
    commands: args.merged.commands,
    diff: args.merged.diff,
    rationale: args.merged.rationale,
    changeReason: args.reason,
    proposalId: args.proposalId,
  });

  return nextVersion;
}

/** Whether the thing being commented on or voted on exists. */
async function commentTargetExists(
  ctx: AppContext,
  targetType: 'solution' | 'comment' | 'edit_proposal' | 'problem',
  targetId: string,
): Promise<boolean> {
  // The reference is polymorphic and therefore cannot be a foreign key, so
  // integrity is checked here — otherwise a typo produces a comment attached
  // to nothing, invisible in every thread and impossible to delete from the UI.
  switch (targetType) {
    case 'solution': {
      const [row] = await ctx.db
        .select({ id: schema.solution.id })
        .from(schema.solution)
        .where(eq(schema.solution.id, targetId))
        .limit(1);
      return row !== undefined;
    }
    case 'problem': {
      const [row] = await ctx.db
        .select({ id: schema.problem.id })
        .from(schema.problem)
        .where(eq(schema.problem.id, targetId))
        .limit(1);
      return row !== undefined;
    }
    case 'edit_proposal': {
      const [row] = await ctx.db
        .select({ id: schema.editProposal.id })
        .from(schema.editProposal)
        .where(eq(schema.editProposal.id, targetId))
        .limit(1);
      return row !== undefined;
    }
    case 'comment': {
      const [row] = await ctx.db
        .select({ id: schema.comment.id })
        .from(schema.comment)
        .where(eq(schema.comment.id, targetId))
        .limit(1);
      return row !== undefined;
    }
    default:
      return false;
  }
}

/** Plain-language outcome, because a status alone does not say what to do next. */
function messageFor(
  status: 'pending' | 'approved' | 'rejected' | 'outdated' | 'needs_human',
  appliedVersion: number | null,
  fields: string,
): string {
  switch (status) {
    case 'approved':
      return `Applied. The solution is now version ${appliedVersion} — you changed ${fields}.`;
    case 'rejected':
      return 'The reviewer declined this change. Its reasons are on the proposal in the thread, and you can revise and propose again.';
    case 'needs_human':
      return 'The reviewer could not decide, so this is waiting on a person. It stays in the thread meanwhile.';
    case 'outdated':
      return 'Someone else changed this solution while your proposal was being reviewed, so it was not applied. Reload and redo the change against the current text.';
    default:
      return 'Your proposal was recorded.';
  }
}
