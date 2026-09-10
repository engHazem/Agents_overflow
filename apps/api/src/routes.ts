/**
 * HTTP surface.
 *
 * Three agent endpoints (`search`, `publish`, `report`) and two browse
 * endpoints for the forum view.
 */

import {
  blocksPublication,
  buildEmbedInput,
  buildSetupGuide,
  buildSystemPrompt,
  environmentsToVerified,
  normalize,
  reviewSubmission,
  scanForSecrets,
  verificationStateFor,
  NORMALIZER_VERSION,
  SESSION_COOKIE,
  type ChatContext,
} from '@agents-overflow/core';
import { schema } from '@agents-overflow/db';
import {
  chatRequest,
  problemListQuery,
  publishRequest,
  reportRequest,
  searchRequest,
  setupQuery,
  type ChatResponse,
  type LeaderboardResponse,
  type MyAgentsResponse,
  type ProblemAuthor,
  type ProblemDetail,
  type ProblemListResponse,
  type PublishResponse,
  type ReportResponse,
} from '@agents-overflow/shared';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { currentUser } from './auth.js';
import { resolveActor, resolveEnvironment, type AppContext } from './context.js';
import { isUuid, notFound } from './params.js';
import { runSearch } from './search.js';

/**
 * Normalizes an implementation label into a stable key.
 *
 * The unique index is on (solution, stack), so "Node + Fastify", "node+fastify"
 * and "Fastify / Node" must collapse to one row rather than three spellings of
 * the same thing.
 */
function normalizeStack(input: { label: string; language?: string; framework?: string }): string {
  const parts = [input.language, input.framework].filter(Boolean) as string[];
  const source = parts.length > 0 ? parts.join('+') : input.label;

  return source
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean)
    .sort()
    .join('+')
    .slice(0, 64);
}

/** How many forum entries to ground a general question on. */
const CHAT_CORPUS_PROBLEMS = 5;

/**
 * Rejects a request that came from the website rather than from an agent.
 *
 * Publishing and verifying are agent-only by design. The verified badge means
 * "independent agents ran this in their own environments"; a person clicking a
 * button in a browser has run nothing, and letting them add to that count would
 * make the badge a measure of enthusiasm rather than evidence.
 *
 * The signal is the session cookie: the website has one, an MCP server does
 * not. That is a deliberate choice of a *positive* signal over a negative one —
 * checking for a missing `x-agent-name` header would let anyone bypass the rule
 * by adding it, whereas a browser cannot easily stop sending its own cookie.
 */
function rejectIfBrowser(
  request: { cookies?: Record<string, string | undefined> },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  action: 'publish' | 'report',
): boolean {
  if (!request.cookies?.[SESSION_COOKIE]) return false;

  reply.status(403).send({
    error: 'agents_only',
    message:
      action === 'publish'
        ? 'Solutions are published by agents, not from the website. Connect an agent and let it publish what it confirmed.'
        : 'Results are reported by agents that actually ran the fix. Connect an agent so its confirmations count as evidence.',
  });
  return true;
}

/** Order used for "best verification" comparisons. */
const VERIFICATION_RANK = {
  disputed: 0,
  unverified: 1,
  corroborated: 2,
  verified: 3,
} as const;

// ---------------------------------------------------------------------------
// Authorship
//
// A byline is assembled from three tables: the account owns the problem, the
// agent identity says which agent published it, and the avatar lives on
// whichever auth identity the account signed in with. Selected as columns on
// the query that already runs rather than fetched per row — a page of twenty
// problems would otherwise cost sixty extra round trips for one line of text.
// ---------------------------------------------------------------------------

/** Author columns, spread into a problem query's select list. */
const AUTHOR_COLUMNS = {
  authorKind: schema.problem.authorKind,
  authorHandle: schema.account.handle,
  authorDisplayName: schema.account.displayName,
  authorAgentName: schema.agentIdentity.agentName,
  /**
   * An account can hold more than one auth identity — GitHub and Google both
   * resolving to one account — and only some carry a picture. Any will do;
   * `LIMIT 1` is what stops the subquery from multiplying the outer row.
   */
  authorAvatarUrl: sql<string | null>`(SELECT ident.avatar_url FROM ${schema.authIdentity} ident
    WHERE ident.account_id = ${schema.problem}.author_account_id AND ident.avatar_url IS NOT NULL LIMIT 1)`,
} as const;

interface AuthorRow {
  authorKind: 'agent' | 'human';
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAgentName: string | null;
  authorAvatarUrl: string | null;
}

/**
 * Null when the account is gone.
 *
 * `authorAccountId` is `ON DELETE SET NULL`, so a problem outlives the account
 * that published it. Substituting a placeholder handle would put a name on the
 * page that belongs to nobody, so this returns null and the client renders no
 * byline at all.
 */
function problemAuthorFrom(row: AuthorRow): ProblemAuthor | null {
  if (!row.authorHandle) return null;
  return {
    handle: row.authorHandle,
    displayName: row.authorDisplayName,
    avatarUrl: row.authorAvatarUrl,
    kind: row.authorKind,
    agentName: row.authorAgentName,
  };
}

export async function registerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    embeddings: ctx.embeddingsEnabled ? 'enabled' : 'disabled',
  }));

  // -------------------------------------------------------------------------
  // Agent: search
  // -------------------------------------------------------------------------
  app.post('/v1/search', async (request, reply) => {
    const parsed = searchRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'search payload failed validation',
        details: parsed.error.flatten(),
      });
    }

    const actor = await resolveActor(ctx.db, request.headers);
    const environmentId = parsed.data.environment
      ? await resolveEnvironment(ctx.db, parsed.data.environment)
      : null;

    const result = await runSearch(ctx, parsed.data, actor, environmentId, parsed.data.environment);
    return reply.send(result);
  });

  // -------------------------------------------------------------------------
  // Agent: publish
  // -------------------------------------------------------------------------
  app.post('/v1/publish', async (request, reply) => {
    if (rejectIfBrowser(request, reply, 'publish')) return reply;

    const parsed = publishRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'publish payload failed validation',
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const actor = await resolveActor(ctx.db, request.headers);

    // ---- Secret scanning, before anything is stored ------------------------
    //
    // Runs first and without a model. A leaked credential is public the moment
    // it is written, so this check never depends on judgement that could be
    // argued with by the submission itself.
    const scanned = scanForSecrets(
      [
        input.error ?? '',
        input.title,
        input.statement,
        input.solution.body,
        input.solution.commands ?? '',
        input.solution.rationale ?? '',
        ...input.implementations.flatMap((i) => [i.body, i.commands ?? '']),
      ].join('\n'),
    );

    if (scanned.blocked) {
      // Refused outright rather than redacted and stored: quietly removing a
      // credential teaches the author nothing and leaves the key live.
      return reply.status(422).send({
        error: 'secret_detected',
        message:
          'This submission appears to contain a credential. Nothing was saved. Remove it, rotate the key, and publish again.',
        details: {
          findings: scanned.findings.map((f) => ({
            rule: f.rule,
            description: f.description,
            severity: f.severity,
          })),
        },
      });
    }

    // ---- Review ------------------------------------------------------------
    const review = await reviewSubmission(
      {
        kind: input.kind,
        title: input.title,
        statement: input.statement,
        errorText: input.error,
        solutionTitle: input.solution.title,
        solutionBody: input.solution.body,
        commands: input.solution.commands,
        rationale: input.solution.rationale,
        tags: input.tags,
      },
      ctx.reviewer,
    );

    /**
     * The reviewer is the only reviewer — there is no human queue behind it.
     *
     * So a refusal is final and nothing is stored, while a submission it could
     * not judge is published and marked rather than hidden forever behind a
     * review nobody will perform. By this point the checks that actually
     * protect people — secret scanning and dangerous commands — have already
     * passed deterministically; what is missing is only quality judgement.
     */
    if (blocksPublication(review.verdict)) {
      return reply.status(422).send({
        error: review.verdict === 'rejected' ? 'rejected' : 'changes_requested',
        message:
          review.verdict === 'rejected'
            ? 'The reviewer rejected this submission. Nothing was saved.'
            : 'The reviewer asked for changes before this can be published. Nothing was saved.',
        details: { issues: review.issues },
      });
    }

    const reviewStatusValue = review.verdict === 'approved' ? 'approved' : 'needs_human';

    // ---- Normalize ---------------------------------------------------------
    //
    // A task has no error text, so it has no signature. Its searchable text is
    // the statement instead, which is what another agent would be describing.
    const normalized = input.error ? normalize(input.error) : null;
    const searchableError = normalized?.canonical ?? input.statement;

    const embedInput = buildEmbedInput({
      title: input.title,
      statement: input.statement,
      normalizedError: searchableError,
      tags: input.tags,
    });

    // Publishing an error someone already published is the common case, not an
    // error. The signature makes it an attach rather than a duplicate thread.
    // Tasks have no signature, so they never attach.
    const existing = normalized
      ? await ctx.db
          .select({ id: schema.problem.id })
          .from(schema.problem)
          .where(
            and(
              eq(schema.problem.signature, normalized.signature),
              eq(schema.problem.normalizerVersion, NORMALIZER_VERSION),
            ),
          )
          .limit(1)
      : [];

    let problemId: string;
    let outcome: PublishResponse['outcome'];

    if (existing[0]) {
      problemId = existing[0].id;
      outcome = 'attached';
    } else {
      const embedding = await ctx.embedder.embed(embedInput);

      const [created] = await ctx.db
        .insert(schema.problem)
        .values({
          kind: input.kind,
          reviewStatus: reviewStatusValue,
          signature: normalized?.signature ?? null,
          normalizerVersion: NORMALIZER_VERSION,
          title: input.title,
          statement: input.statement,
          normalizedError: searchableError,
          embedInput,
          embedding,
          embeddedAt: embedding ? new Date() : null,
          tags: input.tags.map((t) => t.toLowerCase()),
          language: input.language ?? null,
          authorKind: 'agent',
          authorAccountId: actor.accountId,
          authorAgentIdentityId: actor.agentIdentityId,
        })
        .returning({ id: schema.problem.id });

      if (!created) {
        return reply.status(500).send({ error: 'insert_failed', message: 'could not create problem' });
      }
      problemId = created.id;
      outcome = 'created';
    }

    const [solution] = await ctx.db
      .insert(schema.solution)
      .values({
        problemId,
        reviewStatus: reviewStatusValue,
        title: input.solution.title,
        body: input.solution.body,
        commands: input.solution.commands ?? null,
        diff: input.solution.diff ?? null,
        rationale: input.solution.rationale ?? null,
        requires: input.solution.requires ?? {},
        authorKind: 'agent',
        authorAccountId: actor.accountId,
        authorAgentIdentityId: actor.agentIdentityId,
      })
      .returning({ id: schema.solution.id });

    if (!solution) {
      return reply.status(500).send({ error: 'insert_failed', message: 'could not create solution' });
    }

    /**
     * Version 1 of the solution's text, recorded at publish.
     *
     * Written here rather than lazily on first edit, because a proposal shows a
     * diff against the revision it was written on. Without this row the very
     * first proposed change would have no "before" to display, and the history
     * would begin at version 2 — as if the original had never existed.
     */
    await ctx.db.insert(schema.solutionRevision).values({
      solutionId: solution.id,
      version: 1,
      title: input.solution.title,
      body: input.solution.body,
      commands: input.solution.commands ?? null,
      diff: input.solution.diff ?? null,
      rationale: input.solution.rationale ?? null,
      changeReason: 'published',
    });

    // ---- Per-stack implementations ----------------------------------------
    const implementationIds: string[] = [];

    for (const impl of input.implementations) {
      const [row] = await ctx.db
        .insert(schema.implementation)
        .values({
          solutionId: solution.id,
          stack: normalizeStack(impl),
          label: impl.label,
          language: impl.language?.toLowerCase() ?? null,
          framework: impl.framework?.toLowerCase() ?? null,
          requires: impl.requires ?? {},
          body: impl.body,
          commands: impl.commands ?? null,
          diff: impl.diff ?? null,
          reviewStatus: reviewStatusValue,
          authorKind: 'agent',
          authorAccountId: actor.accountId,
          authorAgentIdentityId: actor.agentIdentityId,
        })
        .onConflictDoUpdate({
          target: [schema.implementation.solutionId, schema.implementation.stack],
          set: { body: impl.body, commands: impl.commands ?? null, updatedAt: new Date() },
        })
        .returning({ id: schema.implementation.id });

      if (row) implementationIds.push(row.id);
    }

    // ---- Record the decision ----------------------------------------------
    //
    // Append-only. A human override later is a new row, not an edit, so the
    // evidence that makes the override legitimate survives.
    await ctx.db.insert(schema.review).values({
      targetType: 'problem',
      targetId: problemId,
      status: reviewStatusValue,
      reviewerKind: review.model ? 'ai' : 'automatic',
      reviewerModel: review.model,
      issues: [...review.issues],
      confidence: review.confidence === null ? null : String(review.confidence),
      failureReason: review.failureReason ?? null,
      secretFindings: scanned.findings.map((f) => ({
        rule: f.rule,
        description: f.description,
        severity: f.severity,
        index: f.index,
      })),
    });

    const response: PublishResponse = {
      problemId,
      solutionId: solution.id,
      signature: normalized?.signature ?? null,
      implementationIds,
      outcome,
      review: {
        status: reviewStatusValue,
        issues: [...review.issues],
        blocked: false,
      },
    };
    return reply.status(201).send(response);
  });

  // -------------------------------------------------------------------------
  // Agent: report — the verification signal
  // -------------------------------------------------------------------------
  app.post('/v1/report', async (request, reply) => {
    if (rejectIfBrowser(request, reply, 'report')) return reply;

    const parsed = reportRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'report payload failed validation',
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const actor = await resolveActor(ctx.db, request.headers);

    const [solution] = await ctx.db
      .select()
      .from(schema.solution)
      .where(eq(schema.solution.id, input.solutionId))
      .limit(1);

    if (!solution) {
      return reply.status(404).send({ error: 'not_found', message: 'solution does not exist' });
    }

    const previousVerification = solution.verification;
    const environmentId = await resolveEnvironment(ctx.db, input.environment);

    // The unique index on (solution, account, environment) is what enforces
    // independence. Re-reporting updates the verdict and bumps the counter; it
    // never adds weight.
    const existing = await ctx.db
      .select({ id: schema.attemptReport.id })
      .from(schema.attemptReport)
      .where(
        and(
          eq(schema.attemptReport.solutionId, input.solutionId),
          eq(schema.attemptReport.accountId, actor.accountId),
          eq(schema.attemptReport.environmentId, environmentId),
        ),
      )
      .limit(1);

    const wasUpdate = existing.length > 0;

    const [report] = await ctx.db
      .insert(schema.attemptReport)
      .values({
        solutionId: input.solutionId,
        problemId: solution.problemId,
        agentIdentityId: actor.agentIdentityId,
        accountId: actor.accountId,
        environmentId,
        implementationId: input.implementationId ?? null,
        outcome: input.outcome,
        notes: input.notes ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.attemptReport.solutionId,
          schema.attemptReport.accountId,
          schema.attemptReport.environmentId,
        ],
        set: {
          outcome: input.outcome,
          notes: input.notes ?? null,
          reportCount: sql`${schema.attemptReport.reportCount} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.attemptReport.id });

    // Recompute from the report table, which is the source of truth. The
    // counters on `solution` are a cache for ranking.
    const [stats] = (await ctx.db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE outcome = 'worked')::int   AS success_count,
        COUNT(*) FILTER (WHERE outcome = 'failed')::int   AS failure_count,
        COUNT(*) FILTER (WHERE outcome = 'partial')::int  AS partial_count,
        COUNT(DISTINCT environment_id) FILTER (WHERE outcome IN ('worked','partial'))::int AS distinct_env_count,
        COUNT(DISTINCT account_id)     FILTER (WHERE outcome IN ('worked','partial'))::int AS distinct_owner_count,
        MAX(updated_at) FILTER (WHERE outcome = 'worked')  AS last_confirmed_at
      FROM ${schema.attemptReport}
      WHERE solution_id = ${input.solutionId}
    `)) as unknown as {
      success_count: number;
      failure_count: number;
      partial_count: number;
      distinct_env_count: number;
      distinct_owner_count: number;
      last_confirmed_at: string | null;
    }[];

    const totals = stats ?? {
      success_count: 0,
      failure_count: 0,
      partial_count: 0,
      distinct_env_count: 0,
      distinct_owner_count: 0,
      last_confirmed_at: null,
    };

    const verificationInput = {
      successCount: totals.success_count,
      failureCount: totals.failure_count,
      partialCount: totals.partial_count,
      distinctEnvCount: totals.distinct_env_count,
      distinctOwnerCount: totals.distinct_owner_count,
    };

    const verification = verificationStateFor(verificationInput);

    await ctx.db
      .update(schema.solution)
      .set({
        successCount: verificationInput.successCount,
        failureCount: verificationInput.failureCount,
        partialCount: verificationInput.partialCount,
        distinctEnvCount: verificationInput.distinctEnvCount,
        distinctOwnerCount: verificationInput.distinctOwnerCount,
        verification,
        lastConfirmedAt: totals.last_confirmed_at ? new Date(totals.last_confirmed_at) : solution.lastConfirmedAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.solution.id, input.solutionId));

    // Close the retrieval loop: this turns the earlier query into a labelled
    // (query, solution, outcome) triple.
    if (input.traceId && report) {
      await ctx.db
        .update(schema.retrievalTrace)
        .set({
          chosenSolutionId: input.solutionId,
          chosenProblemId: solution.problemId,
          attemptReportId: report.id,
        })
        .where(eq(schema.retrievalTrace.id, input.traceId));
    }

    /**
     * A named implementation accumulates its own evidence.
     *
     * The plan and the stack-specific steps succeed independently, which is
     * what makes "the plan is sound but the Go version keeps failing" something
     * the data can actually say. Recomputed from the report table for the same
     * reason the solution counters are: the reports are the source of truth and
     * these are a cache.
     */
    if (input.implementationId) {
      const [implStats] = (await ctx.db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE outcome = 'worked')::int   AS success_count,
          COUNT(*) FILTER (WHERE outcome = 'failed')::int   AS failure_count,
          COUNT(*) FILTER (WHERE outcome = 'partial')::int  AS partial_count,
          COUNT(DISTINCT environment_id) FILTER (WHERE outcome IN ('worked','partial'))::int AS distinct_env_count,
          COUNT(DISTINCT account_id)     FILTER (WHERE outcome IN ('worked','partial'))::int AS distinct_owner_count,
          MAX(updated_at) FILTER (WHERE outcome = 'worked') AS last_confirmed_at
        FROM ${schema.attemptReport}
        WHERE implementation_id = ${input.implementationId}
      `)) as unknown as {
        success_count: number;
        failure_count: number;
        partial_count: number;
        distinct_env_count: number;
        distinct_owner_count: number;
        last_confirmed_at: string | null;
      }[];

      if (implStats) {
        const implInput = {
          successCount: implStats.success_count,
          failureCount: implStats.failure_count,
          partialCount: implStats.partial_count,
          distinctEnvCount: implStats.distinct_env_count,
          distinctOwnerCount: implStats.distinct_owner_count,
        };

        await ctx.db
          .update(schema.implementation)
          .set({
            ...implInput,
            verification: verificationStateFor(implInput),
            lastConfirmedAt: implStats.last_confirmed_at
              ? new Date(implStats.last_confirmed_at)
              : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.implementation.id, input.implementationId));
      }
    }

    const response: ReportResponse = {
      recorded: true,
      wasUpdate,
      verification,
      previousVerification,
      distinctEnvCount: verificationInput.distinctEnvCount,
      distinctOwnerCount: verificationInput.distinctOwnerCount,
      environmentsToVerified: environmentsToVerified(verificationInput),
    };
    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // My agents — what the signed-in person's fleet has done
  // -------------------------------------------------------------------------
  app.get('/v1/me/agents', async (request, reply) => {
    const user = await currentUser(ctx, request);
    if (!user) {
      return reply.status(401).send({ error: 'unauthenticated', message: 'Sign in first.' });
    }

    /**
     * Counted per agent, not per account.
     *
     * Someone running three agents needs to see which is contributing; a single
     * account-level total would hide an agent that only ever consumes. The
     * subqueries are correlated rather than joined because a join across three
     * one-to-many relationships multiplies the rows and inflates every count.
     */
    const rows = (await ctx.db.execute(sql`
      SELECT
        ai.id::text        AS id,
        ai.agent_name      AS agent_name,
        ai.model_id        AS model_id,
        ai.first_seen_at   AS first_seen_at,
        ai.last_seen_at    AS last_seen_at,
        (SELECT COUNT(*)::int FROM ${schema.problem} p
           WHERE p.author_agent_identity_id = ai.id)                       AS problems_published,
        (SELECT COUNT(*)::int FROM ${schema.solution} s
           WHERE s.author_agent_identity_id = ai.id)                       AS solutions_published,
        (SELECT COUNT(*)::int FROM ${schema.attemptReport} r
           WHERE r.agent_identity_id = ai.id)                              AS reports_submitted,
        (SELECT COUNT(*)::int FROM ${schema.attemptReport} r
           WHERE r.agent_identity_id = ai.id AND r.outcome = 'worked')     AS confirmations_given,
        (SELECT COUNT(*)::int FROM ${schema.solution} s
           WHERE s.author_agent_identity_id = ai.id
             AND s.verification = 'verified')                              AS verified_contributions
      FROM ${schema.agentIdentity} ai
      WHERE ai.account_id = ${user.accountId}
      ORDER BY ai.last_seen_at DESC
    `)) as unknown as Array<{
      id: string;
      agent_name: string;
      model_id: string | null;
      first_seen_at: string;
      last_seen_at: string;
      problems_published: number;
      solutions_published: number;
      reports_submitted: number;
      confirmations_given: number;
      verified_contributions: number;
    }>;

    const agents = rows.map((r) => ({
      id: r.id,
      agentName: r.agent_name,
      modelId: r.model_id,
      firstSeenAt: new Date(r.first_seen_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
      problemsPublished: r.problems_published,
      solutionsPublished: r.solutions_published,
      reportsSubmitted: r.reports_submitted,
      confirmationsGiven: r.confirmations_given,
      verifiedContributions: r.verified_contributions,
    }));

    const response: MyAgentsResponse = {
      handle: user.handle,
      displayName: user.displayName,
      agents,
      totals: {
        agents: agents.length,
        problemsPublished: agents.reduce((n, a) => n + a.problemsPublished, 0),
        solutionsPublished: agents.reduce((n, a) => n + a.solutionsPublished, 0),
        reportsSubmitted: agents.reduce((n, a) => n + a.reportsSubmitted, 0),
        verifiedContributions: agents.reduce((n, a) => n + a.verifiedContributions, 0),
      },
    };
    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // Leaderboard — people, shown with the agents they run
  // -------------------------------------------------------------------------
  app.get('/v1/leaderboard', async (_request, reply) => {
    const rows = (await ctx.db.execute(sql`
      SELECT
        a.handle,
        a.display_name,
        (SELECT ident.avatar_url FROM ${schema.authIdentity} ident
           WHERE ident.account_id = a.id AND ident.avatar_url IS NOT NULL
           LIMIT 1)                                                        AS avatar_url,
        COALESCE((SELECT array_agg(DISTINCT ai.agent_name) FROM ${schema.agentIdentity} ai
           WHERE ai.account_id = a.id), ARRAY[]::text[])                   AS agent_names,
        (SELECT COUNT(DISTINCT ai.id)::int FROM ${schema.agentIdentity} ai
           WHERE ai.account_id = a.id)                                     AS agent_count,
        (SELECT COUNT(*)::int FROM ${schema.solution} s
           WHERE s.author_account_id = a.id)                               AS solutions_published,
        (SELECT COUNT(*)::int FROM ${schema.attemptReport} r
           WHERE r.account_id = a.id)                                      AS reports_submitted,
        (SELECT COUNT(*)::int FROM ${schema.solution} s
           WHERE s.author_account_id = a.id AND s.verification = 'verified') AS verified_contributions
      FROM ${schema.account} a
      WHERE a.status = 'active'
      ORDER BY verified_contributions DESC, solutions_published DESC, reports_submitted DESC
      LIMIT 50
    `)) as unknown as Array<{
      handle: string;
      display_name: string | null;
      avatar_url: string | null;
      agent_names: string[];
      agent_count: number;
      solutions_published: number;
      reports_submitted: number;
      verified_contributions: number;
    }>;

    /**
     * Verified work is weighted far above volume.
     *
     * Publishing is cheap and reporting is cheaper; getting something confirmed
     * by other people's agents is the only part that cannot be self-dealt. A
     * flat count would rank a prolific agent above a careful one.
     */
    const entries = rows
      .map((r) => ({
        handle: r.handle,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        agentNames: r.agent_names,
        agentCount: r.agent_count,
        solutionsPublished: r.solutions_published,
        reportsSubmitted: r.reports_submitted,
        verifiedContributions: r.verified_contributions,
        score: r.verified_contributions * 10 + r.solutions_published * 3 + r.reports_submitted,
      }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);

    const response: LeaderboardResponse = { entries };
    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // Onboarding — the files and steps to connect an agent
  // -------------------------------------------------------------------------
  app.get('/v1/setup', async (request, reply) => {
    const parsed = setupQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'unknown agent client',
        details: parsed.error.flatten(),
      });
    }

    // Prefer the signed-in user's handle: it is the independence key, and a
    // shared default would mean nobody's confirmations ever counted separately.
    const user = await currentUser(ctx, request);
    const owner = parsed.data.owner?.trim() || user?.handle || 'my-handle';

    const guide = buildSetupGuide({
      client: parsed.data.client,
      packageName: ctx.config.mcpPackageName,
      // The URL the *reader* must use, which is not necessarily the one we are
      // reachable at internally. Behind a proxy these differ, and handing out
      // the internal one produces a config that fails for everyone.
      apiUrl: ctx.config.publicBaseUrl,
      owner,
    });

    return reply.send(guide);
  });

  // -------------------------------------------------------------------------
  // Chat — grounded in one problem's real evidence
  // -------------------------------------------------------------------------
  app.post('/v1/chat', async (request, reply) => {
    const parsed = chatRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'chat payload failed validation',
        details: parsed.error.flatten(),
      });
    }

    if (!ctx.chat) {
      return reply.status(503).send({
        error: 'chat_unavailable',
        message: 'No model endpoint is configured. Set OPENAI_API_KEY and OPENAI_BASE_URL.',
      });
    }

    const input = parsed.data;
    const mode = input.problemId ? 'problem' : 'corpus';

    /** Ids to ground on: either the one asked about, or the best search hits. */
    let problemIds: string[];

    if (input.problemId) {
      problemIds = [input.problemId];
    } else {
      // No specific thread: retrieve first, then answer. This is what keeps a
      // general question grounded in published solutions rather than the
      // model's own recollection.
      const question = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const actor = await resolveActor(ctx.db, request.headers);

      const found = await runSearch(
        ctx,
        { error: question, limit: CHAT_CORPUS_PROBLEMS },
        actor,
        null,
        input.environment,
      );
      problemIds = found.hits.map((h) => h.problemId);
    }

    const problems =
      problemIds.length === 0
        ? []
        : await ctx.db
            .select({
              id: schema.problem.id,
              title: schema.problem.title,
              statement: schema.problem.statement,
              normalizedError: schema.problem.normalizedError,
              tags: schema.problem.tags,
            })
            .from(schema.problem)
            .where(inArray(schema.problem.id, problemIds));

    if (input.problemId && problems.length === 0) {
      return reply.status(404).send({ error: 'not_found', message: 'problem does not exist' });
    }

    const solutionFilters = [
      inArray(schema.solution.problemId, problemIds.length > 0 ? problemIds : ['']),
      eq(schema.solution.status, 'active'),
    ];
    // When the user is looking at one solution, narrow to it — otherwise the
    // model hedges across alternatives nobody asked about.
    if (input.solutionId) solutionFilters.push(eq(schema.solution.id, input.solutionId));

    const solutions =
      problemIds.length === 0
        ? []
        : await ctx.db.select().from(schema.solution).where(and(...solutionFilters));

    const byProblem = new Map<string, typeof solutions>();
    for (const s of solutions) {
      const list = byProblem.get(s.problemId) ?? [];
      list.push(s);
      byProblem.set(s.problemId, list);
    }

    // Preserve search ranking: the most relevant entry should be read first.
    const ordered = problemIds
      .map((id) => problems.find((p) => p.id === id))
      .filter((p): p is (typeof problems)[number] => p !== undefined);

    const context: ChatContext = {
      mode,
      problems: ordered.map((problem) => ({
        id: problem.id,
        title: problem.title,
        statement: problem.statement,
        normalizedError: problem.normalizedError,
        tags: problem.tags,
        solutions: (byProblem.get(problem.id) ?? []).map((s) => ({
          title: s.title,
          body: s.body,
          commands: s.commands,
          rationale: s.rationale,
          verification: s.verification,
          successCount: s.successCount,
          failureCount: s.failureCount,
          distinctEnvCount: s.distinctEnvCount,
          distinctOwnerCount: s.distinctOwnerCount,
          requires: s.requires,
        })),
      })),
      ...(input.environment ? { callerEnvironment: input.environment } : {}),
    };

    const result = await ctx.chat.complete(buildSystemPrompt(context), input.messages);

    if (!result) {
      return reply.status(502).send({
        error: 'chat_failed',
        message: 'The model endpoint did not respond. Try again.',
      });
    }

    const response: ChatResponse = {
      message: result.content,
      model: result.model,
      mode,
      groundedOn: {
        solutionCount: solutions.length,
        totalReports: solutions.reduce(
          (n, s) => n + s.successCount + s.failureCount + s.partialCount,
          0,
        ),
      },
      sources: ordered.map((problem) => {
        const list = byProblem.get(problem.id) ?? [];
        const best = list[0];
        return {
          problemId: problem.id,
          title: problem.title,
          verification: best?.verification ?? 'unverified',
          distinctEnvCount: best?.distinctEnvCount ?? 0,
        };
      }),
    };
    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // Browse: the forum view
  // -------------------------------------------------------------------------
  app.get('/v1/problems', async (request, reply) => {
    const parsed = problemListQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'query failed validation',
        details: parsed.error.flatten(),
      });
    }

    const { q, tag, verified, limit, offset } = parsed.data;

    const filters = [eq(schema.problem.status, 'active')];
    if (q) {
      const term = `%${q}%`;
      const match = or(ilike(schema.problem.title, term), ilike(schema.problem.statement, term));
      if (match) filters.push(match);
    }
    if (tag) filters.push(sql`${schema.problem.tags} @> ARRAY[${tag}]::text[]`);

    const where = and(...filters);

    // Explicit columns: `select()` would pull `embedding` (1536 floats per row,
    // serialized as text) and the `tsvector`, neither of which the list uses.
    // Measured at roughly ten times the latency for a page of results.
    //
    // The total comes back as a window function rather than a second query —
    // one saved round trip, which is worth more than it sounds against a
    // database in another region.
    const rows = await ctx.db
      .select({
        id: schema.problem.id,
        title: schema.problem.title,
        statement: schema.problem.statement,
        tags: schema.problem.tags,
        language: schema.problem.language,
        createdAt: schema.problem.createdAt,
        total: sql<number>`count(*) over()`.mapWith(Number),
        ...AUTHOR_COLUMNS,
      })
      .from(schema.problem)
      // Left joins throughout: an unattributed problem still belongs in the
      // list. An inner join would quietly drop it.
      .leftJoin(schema.account, eq(schema.account.id, schema.problem.authorAccountId))
      .leftJoin(
        schema.agentIdentity,
        eq(schema.agentIdentity.id, schema.problem.authorAgentIdentityId),
      )
      .where(where)
      .orderBy(desc(schema.problem.createdAt))
      .limit(limit)
      .offset(offset);

    const total = rows[0]?.total ?? 0;

    const ids = rows.map((r) => r.id);
    const solutions =
      ids.length === 0
        ? []
        : await ctx.db
            .select()
            .from(schema.solution)
            .where(and(inArray(schema.solution.problemId, ids), eq(schema.solution.status, 'active')));

    const byProblem = new Map<string, typeof solutions>();
    for (const s of solutions) {
      const list = byProblem.get(s.problemId) ?? [];
      list.push(s);
      byProblem.set(s.problemId, list);
    }

    let items = rows.map((row) => {
      const list = byProblem.get(row.id) ?? [];
      const bestVerification = list.reduce<ReportResponse['verification']>(
        (best, s) => (VERIFICATION_RANK[s.verification] > VERIFICATION_RANK[best] ? s.verification : best),
        'unverified',
      );
      return {
        id: row.id,
        title: row.title,
        statement: row.statement,
        tags: row.tags,
        language: row.language,
        solutionCount: list.length,
        bestVerification,
        totalReports: list.reduce((n, s) => n + s.successCount + s.failureCount + s.partialCount, 0),
        createdAt: row.createdAt.toISOString(),
        author: problemAuthorFrom(row),
      };
    });

    // Applied after assembly because "verified" is a property of the attached
    // solutions, not a column on the problem.
    if (verified) items = items.filter((i) => i.bestVerification === 'verified');

    const response: ProblemListResponse = { items, total, limit, offset };
    return reply.send(response);
  });

  app.get<{ Params: { id: string } }>('/v1/problems/:id', async (request, reply) => {
    const { id } = request.params;
    if (!isUuid(id)) return reply.status(404).send(notFound('problem'));

    const [row] = await ctx.db
      .select({
        id: schema.problem.id,
        title: schema.problem.title,
        statement: schema.problem.statement,
        tags: schema.problem.tags,
        language: schema.problem.language,
        createdAt: schema.problem.createdAt,
        normalizedError: schema.problem.normalizedError,
        signature: schema.problem.signature,
        ...AUTHOR_COLUMNS,
      })
      .from(schema.problem)
      .leftJoin(schema.account, eq(schema.account.id, schema.problem.authorAccountId))
      .leftJoin(
        schema.agentIdentity,
        eq(schema.agentIdentity.id, schema.problem.authorAgentIdentityId),
      )
      .where(eq(schema.problem.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'not_found', message: 'problem does not exist' });

    const solutions = await ctx.db
      .select()
      .from(schema.solution)
      .where(and(eq(schema.solution.problemId, id), eq(schema.solution.status, 'active')));

    const { confidenceScore } = await import('@agents-overflow/core');

    const bestVerification = solutions.reduce<ReportResponse['verification']>(
      (best, s) => (VERIFICATION_RANK[s.verification] > VERIFICATION_RANK[best] ? s.verification : best),
      'unverified',
    );

    const detail: ProblemDetail = {
      id: row.id,
      title: row.title,
      statement: row.statement,
      tags: row.tags,
      language: row.language,
      solutionCount: solutions.length,
      bestVerification,
      totalReports: solutions.reduce((n, s) => n + s.successCount + s.failureCount + s.partialCount, 0),
      createdAt: row.createdAt.toISOString(),
      author: problemAuthorFrom(row),
      normalizedError: row.normalizedError,
      signature: row.signature,
      solutions: solutions.map((s) => ({
        id: s.id,
        title: s.title,
        body: s.body,
        commands: s.commands,
        diff: s.diff,
        rationale: s.rationale,
        verification: s.verification,
        successCount: s.successCount,
        failureCount: s.failureCount,
        distinctEnvCount: s.distinctEnvCount,
        distinctOwnerCount: s.distinctOwnerCount,
        lastConfirmedAt: s.lastConfirmedAt?.toISOString() ?? null,
        confidence: confidenceScore({
          successCount: s.successCount,
          failureCount: s.failureCount,
          partialCount: s.partialCount,
          distinctEnvCount: s.distinctEnvCount,
          distinctOwnerCount: s.distinctOwnerCount,
        }),
      })),
    };

    return reply.send(detail);
  });
}
