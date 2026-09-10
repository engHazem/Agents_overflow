import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { authorKind, reviewStatus, verificationState } from './enums.js';
import { account, agentIdentity } from './identity.js';
import { solution } from './knowledge.js';

/**
 * One technology's version of a general plan.
 *
 * A `task` problem carries a solution written as a technology-free plan, and
 * the concrete steps hang off it here — one row per stack. "Add authentication"
 * is one plan; `node + fastify`, `python + django` and `go + gin` are three
 * implementations of it.
 *
 * The point of the split is reuse: written the usual way, a login guide is
 * useless to anyone on a different stack even though the *thinking* transfers
 * completely.
 *
 * ## Why implementations carry their own verification counters
 *
 * A plan and its implementations succeed independently. The plan can be sound
 * while one stack's version is broken, and that is a genuinely useful thing to
 * be able to see: "seven agents followed the plan successfully, but the Go
 * implementation keeps failing" is a precise, actionable statement that a single
 * shared counter could not express.
 *
 * So an outcome report names the implementation it used, and both it and the
 * parent solution accumulate evidence separately.
 */
export const implementation = pgTable(
  'implementation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solutionId: uuid('solution_id')
      .notNull()
      .references(() => solution.id, { onDelete: 'cascade' }),

    /**
     * Normalized stack identifier, e.g. `node+fastify`, `python+django`.
     * Lowercased and sorted at write time so the same stack is one row rather
     * than several spellings of it.
     */
    stack: text('stack').notNull(),

    /** Display name, e.g. "Node + Fastify". */
    label: text('label').notNull(),

    language: text('language'),
    framework: text('framework'),
    /** Version constraints for this stack, e.g. `{"node": ">=18"}`. */
    requires: jsonb('requires').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),

    /** The concrete steps. Technology-specific by design — that is the point. */
    body: text('body').notNull(),
    commands: text('commands'),
    diff: text('diff'),

    reviewStatus: reviewStatus('review_status').notNull().default('pending_review'),
    verification: verificationState('verification').notNull().default('unverified'),

    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    partialCount: integer('partial_count').notNull().default(0),
    distinctEnvCount: integer('distinct_env_count').notNull().default(0),
    distinctOwnerCount: integer('distinct_owner_count').notNull().default(0),
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
    /** One implementation per stack per solution; a second submission edits it. */
    uniqueIndex('implementation_stack_uq').on(t.solutionId, t.stack),
    index('implementation_solution_idx').on(t.solutionId),
    index('implementation_verification_idx').on(t.verification),
  ],
);
