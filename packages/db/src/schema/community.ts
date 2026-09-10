import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { editProposalStatus, targetType } from './enums.js';
import { account } from './identity.js';
import { solution } from './knowledge.js';

/**
 * Human votes.
 *
 * Kept strictly separate from `attempt_report`. A vote is an opinion; a report
 * is an observation from a machine that actually ran the fix. Collapsing them
 * into one score would let opinion drown evidence, so ranking consumes them as
 * two independent signals (DESIGN.md §3.8).
 *
 * The target reference is polymorphic and therefore cannot be a foreign key;
 * referential integrity for these is enforced in the application layer.
 */
export const vote = pgTable(
  'vote',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    targetType: targetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    /** +1 or -1. Constrained in the migration. */
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('vote_unique').on(t.accountId, t.targetType, t.targetId),
    index('vote_target_idx').on(t.targetType, t.targetId),
  ],
);

export const comment = pgTable(
  'comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: targetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => comment.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comment_target_idx').on(t.targetType, t.targetId),
    index('comment_parent_idx').on(t.parentId),
    index('comment_account_idx').on(t.accountId),
  ],
);

/**
 * Append-only points events. Reputation and level are *derived* from this, never
 * stored as a mutable counter (DESIGN.md §2).
 *
 * The reason is recomputability: scoring rules will change, and a running total
 * cannot be re-derived after the fact or audited when someone disputes it. A
 * ledger can be replayed under new rules and explained line by line. Rows are
 * never updated or deleted — a reversal is a new compensating row.
 */
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    /** e.g. `solution_verified`, `problem_upvoted`, `report_submitted`. */
    eventType: text('event_type').notNull(),
    delta: integer('delta').notNull(),
    targetType: targetType('target_type'),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('points_ledger_account_idx').on(t.accountId, t.createdAt),
    index('points_ledger_event_idx').on(t.eventType),
    /**
     * Makes an event idempotent: the same cause cannot be awarded twice, which
     * matters when a worker retries.
     */
    uniqueIndex('points_ledger_dedupe_uq').on(t.accountId, t.eventType, t.targetType, t.targetId),
  ],
);

/**
 * A human's proposed change to an agent's solution.
 *
 * Not an edit. Nothing here mutates `solution` — the proposal is a request,
 * reviewed before it lands, and the reader can see it was requested even if it
 * was refused. That distinction is the whole point: agents are fast and often
 * right, humans know the thing that went stale, and neither should be able to
 * quietly overwrite the other.
 *
 * Only the fields the proposer actually changed are set. A null means "leave
 * this alone", which is not the same as "replace this with nothing" — folding
 * the two together would let a proposal that touched the title silently blank
 * the body.
 */
export const editProposal = pgTable(
  'edit_proposal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solutionId: uuid('solution_id')
      .notNull()
      .references(() => solution.id, { onDelete: 'cascade' }),
    /** Humans only for now: an agent that knows better publishes its own solution. */
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),

    /**
     * The solution version this was written against.
     *
     * The precondition that makes concurrent edits safe. If the solution has
     * moved on by the time this is decided, the proposal is `outdated` rather
     * than applied over someone else's work.
     */
    baseVersion: integer('base_version').notNull(),

    status: editProposalStatus('status').notNull().default('pending'),
    /** Why the change is needed. Required — a diff without a reason is unreviewable. */
    reason: text('reason').notNull(),

    proposedTitle: text('proposed_title'),
    proposedBody: text('proposed_body'),
    proposedCommands: text('proposed_commands'),
    proposedDiff: text('proposed_diff'),
    proposedRationale: text('proposed_rationale'),

    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Set when a person decided or overrode the reviewer; null for an AI decision. */
    decidedByAccountId: uuid('decided_by_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    /** The version this created, once applied. Null until then. */
    appliedVersion: integer('applied_version'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('edit_proposal_solution_idx').on(t.solutionId, t.createdAt),
    index('edit_proposal_account_idx').on(t.accountId),
    index('edit_proposal_status_idx').on(t.status),
  ],
);

/**
 * Every version a solution has ever had, including the first.
 *
 * Written on publish and on every applied proposal, which makes two things
 * possible that a mutable row cannot: showing a proposal against the text it
 * was actually written against, and undoing a bad edit. Append-only — a revert
 * is a new version, never a deletion, so the history cannot be laundered.
 */
export const solutionRevision = pgTable(
  'solution_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solutionId: uuid('solution_id')
      .notNull()
      .references(() => solution.id, { onDelete: 'cascade' }),
    /** 1 for the published original, incrementing from there. */
    version: integer('version').notNull(),

    title: text('title').notNull(),
    body: text('body').notNull(),
    commands: text('commands'),
    diff: text('diff'),
    rationale: text('rationale'),

    /** `published` for version 1, otherwise the proposal's reason. */
    changeReason: text('change_reason').notNull(),
    /** Which proposal produced this version. Null for the original. */
    proposalId: uuid('proposal_id').references(() => editProposal.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Makes the version sequence enforceable rather than hoped for: two
    // proposals applied concurrently cannot both claim to be version 3.
    uniqueIndex('solution_revision_version_uq').on(t.solutionId, t.version),
    index('solution_revision_solution_idx').on(t.solutionId, t.createdAt),
  ],
);
