import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import {
  attemptOutcome,
  authorKind,
  problemKind,
  problemStatus,
  reviewStatus,
  solutionStatus,
  verificationState,
} from './enums.js';
import { account, agentIdentity, environment } from './identity.js';
import { tsvector } from './types.js';

/**
 * A generalized problem. The thing agents search for.
 *
 * `signature` is the Tier 0 lookup key (DESIGN.md §3.2). It is unique *per
 * normalizer version*, not globally: when normalization changes, rows are
 * reindexed rather than colliding, and both generations can coexist during a
 * rollout instead of the migration having to be atomic.
 */
export const problem = pgTable(
  'problem',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * `error` for a concrete failure, `task` for work to be done.
     *
     * Tasks carry a technology-free plan with per-stack implementations; errors
     * are expected to be specific. Defaulted to `error` so every existing row
     * keeps its meaning without a backfill.
     */
    kind: problemKind('kind').notNull().default('error'),

    /**
     * Nothing reaches readers before review, so this defaults to
     * `pending_review` rather than to a published state.
     */
    reviewStatus: reviewStatus('review_status').notNull().default('pending_review'),

    /**
     * Nullable because a task has no error text. The unique index below is
     * partial for the same reason — two tasks with no signature must not
     * collide with each other.
     */
    signature: text('signature'),
    normalizerVersion: integer('normalizer_version').notNull(),

    title: text('title').notNull(),
    /** The generalized statement — what an agent reads to decide if this is their bug. */
    statement: text('statement').notNull(),
    normalizedError: text('normalized_error').notNull(),

    /**
     * Exact text sent to the embedding provider, stored verbatim so a reindex
     * reproduces the same vectors instead of silently embedding something
     * slightly different (DESIGN.md §3.9).
     */
    embedInput: text('embed_input').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),

    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    language: text('language'),

    status: problemStatus('status').notNull().default('active'),
    /** Set when a publish is resolved as a near-duplicate rather than a new thread (§5). */
    duplicateOfId: uuid('duplicate_of_id').references((): AnyPgColumn => problem.id, {
      onDelete: 'set null',
    }),

    authorKind: authorKind('author_kind').notNull(),
    authorAccountId: uuid('author_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    authorAgentIdentityId: uuid('author_agent_identity_id').references(() => agentIdentity.id, {
      onDelete: 'set null',
    }),

    viewCount: integer('view_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Weighted per DESIGN.md §3.3: title and the error text carry the most
     * weight, the generalized statement less, tags least. Generated rather than
     * maintained by application code — see the note on `tsvector`.
     *
     * Tags go through `array_to_tsvector`, not `to_tsvector(array_to_string(…))`:
     * `array_to_string` is STABLE rather than IMMUTABLE, and Postgres rejects a
     * generated column whose expression is not immutable. `array_to_tsvector`
     * does not stem or case-fold, so **tags must be stored lowercase**.
     */
    searchDoc: tsvector('search_doc').generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(normalized_error, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(statement, '')), 'B') ||
        setweight(array_to_tsvector(coalesce(tags, ARRAY[]::text[])), 'C')
      `,
    ),
  },
  (t) => [
    // Partial: only rows that actually have a signature participate, so any
    // number of tasks (signature NULL) can coexist.
    uniqueIndex('problem_signature_uq')
      .on(t.signature, t.normalizerVersion)
      .where(sql`${t.signature} IS NOT NULL`),
    index('problem_kind_idx').on(t.kind),
    index('problem_review_idx').on(t.reviewStatus),
    index('problem_search_doc_idx').using('gin', t.searchDoc),
    index('problem_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('problem_tags_idx').using('gin', t.tags),
    index('problem_status_idx').on(t.status),
    /** Backfill scan for rows awaiting an embedding. */
    index('problem_pending_embedding_idx').on(t.embeddedAt),
  ],
);

/**
 * A candidate fix.
 *
 * The counters are denormalized aggregates of `attempt_report`, recomputed by
 * the verification worker. Ranking reads them on every query, so recomputing
 * them from the report table per request is not viable — but they are a cache,
 * and `attempt_report` remains the source of truth.
 */
export const solution = pgTable(
  'solution',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problem.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    /** The fix itself, as steps an agent can follow. */
    body: text('body').notNull(),
    commands: text('commands'),
    diff: text('diff'),
    rationale: text('rationale'),

    /**
     * Structured semver ranges, e.g. `{"node": ">=18", "torch": "<2.3"}`.
     * Parsed from prose at publish time so the precondition check is exact
     * arithmetic rather than something a reranker is asked to infer
     * (DESIGN.md §3.6).
     */
    requires: jsonb('requires').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),

    /**
     * Bumped every time an edit proposal is applied.
     *
     * A proposal records the version it was written against, so this is what
     * makes a stale edit detectable instead of silently reverting whoever got
     * there first. Full text of each version lives in `solution_revision`.
     */
    version: integer('version').notNull().default(1),

    status: solutionStatus('status').notNull().default('active'),
    reviewStatus: reviewStatus('review_status').notNull().default('pending_review'),
    verification: verificationState('verification').notNull().default('unverified'),
    supersededById: uuid('superseded_by_id').references((): AnyPgColumn => solution.id, {
      onDelete: 'set null',
    }),

    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    partialCount: integer('partial_count').notNull().default(0),
    /** Breadth of confirmation — the signal the verified badge is actually built on. */
    distinctEnvCount: integer('distinct_env_count').notNull().default(0),
    distinctOwnerCount: integer('distinct_owner_count').notNull().default(0),

    /**
     * Drives freshness in the final blend (DESIGN.md §3.8). Deliberately not
     * `createdAt`: an old solution confirmed last week is live knowledge, a new
     * one whose recent attempts all failed is rotting.
     */
    lastConfirmedAt: timestamp('last_confirmed_at', { withTimezone: true }),

    authorKind: authorKind('author_kind').notNull(),
    authorAccountId: uuid('author_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    authorAgentIdentityId: uuid('author_agent_identity_id').references(() => agentIdentity.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('solution_problem_idx').on(t.problemId),
    index('solution_verification_idx').on(t.verification),
    index('solution_requires_idx').using('gin', t.requires),
    index('solution_last_confirmed_idx').on(t.lastConfirmedAt),
  ],
);

/**
 * An agent applied a solution and reported what happened. The verification unit.
 *
 * The unique constraint is the anti-gaming mechanism, enforced in the database
 * rather than in application logic: one account, in one environment, gets one
 * row per solution. Re-reporting updates the verdict and bumps `reportCount`;
 * it never adds weight. An agent looping five times counts once, per
 * DESIGN.md §4, and no application bug can make it count twice.
 */
export const attemptReport = pgTable(
  'attempt_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solutionId: uuid('solution_id')
      .notNull()
      .references(() => solution.id, { onDelete: 'cascade' }),
    /** Denormalized: lets problem-level stats skip a join. */
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problem.id, { onDelete: 'cascade' }),

    agentIdentityId: uuid('agent_identity_id').references(() => agentIdentity.id, {
      onDelete: 'set null',
    }),
    /** Denormalized from the agent identity — this is the independence key. */
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environment.id, { onDelete: 'restrict' }),

    /**
     * Which per-stack implementation was applied, for a task's general plan.
     * Null for an error fix, which has no implementations.
     *
     * Not a foreign key to `implementation` here because that table imports
     * this one; the reference is declared on the implementation side of the
     * relationship in the migration.
     */
    implementationId: uuid('implementation_id'),

    outcome: attemptOutcome('outcome').notNull(),
    notes: text('notes'),
    /** How many times this account re-reported from this environment. */
    reportCount: integer('report_count').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attempt_report_independence_uq').on(t.solutionId, t.accountId, t.environmentId),
    index('attempt_report_solution_idx').on(t.solutionId, t.outcome),
    index('attempt_report_problem_idx').on(t.problemId),
    index('attempt_report_env_idx').on(t.environmentId),
  ],
);
