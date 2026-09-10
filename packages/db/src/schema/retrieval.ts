import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { retrievalTier } from './enums.js';
import { account, agentIdentity, environment } from './identity.js';
import { attemptReport, problem, solution } from './knowledge.js';

/** One entry per candidate, per retrieval method, with its rank in that method's list. */
export interface TraceCandidate {
  readonly problemId: string;
  readonly ftsRank: number | null;
  readonly vectorRank: number | null;
  readonly rrfScore: number;
  readonly finalScore: number | null;
  readonly preconditionStatus: 'satisfied' | 'violated' | 'unknown' | null;
}

/**
 * Every query served, with enough detail to reconstruct why it returned what it
 * returned (DESIGN.md §3.11).
 *
 * This exists from the first commit for a reason that cannot be recovered
 * later: an attempt report turns a trace into a `(query, solution, outcome)`
 * triple — a ground-truth relevance label produced as a byproduct of the core
 * loop. Every query served before this table exists is a label lost for good.
 *
 * It is what will eventually answer: is Tier 0 hitting often enough to matter,
 * does fusion put the right answer in the top 100, and is the reranker worth
 * turning on.
 */
export const retrievalTrace = pgTable(
  'retrieval_trace',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    querySignature: text('query_signature').notNull(),
    normalizedQuery: text('normalized_query').notNull(),
    tier: retrievalTier('tier').notNull(),

    agentIdentityId: uuid('agent_identity_id').references(() => agentIdentity.id, {
      onDelete: 'set null',
    }),
    accountId: uuid('account_id').references(() => account.id, { onDelete: 'set null' }),
    environmentId: uuid('environment_id').references(() => environment.id, {
      onDelete: 'set null',
    }),

    /** Both ranked lists plus fused and final scores, per candidate. */
    candidates: jsonb('candidates').$type<TraceCandidate[]>().notNull(),
    /** Ordered problem ids actually handed back to the caller. */
    returned: jsonb('returned').$type<string[]>().notNull(),

    /** What the agent went on to apply, when it tells us. */
    chosenProblemId: uuid('chosen_problem_id').references(() => problem.id, {
      onDelete: 'set null',
    }),
    chosenSolutionId: uuid('chosen_solution_id').references(() => solution.id, {
      onDelete: 'set null',
    }),
    /** The label. Set when the outcome report arrives, closing the loop. */
    attemptReportId: uuid('attempt_report_id').references(() => attemptReport.id, {
      onDelete: 'set null',
    }),

    candidateCount: integer('candidate_count').notNull().default(0),
    latencyMs: integer('latency_ms'),
    embeddingCacheHit: boolean('embedding_cache_hit'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('retrieval_trace_signature_idx').on(t.querySignature),
    index('retrieval_trace_tier_idx').on(t.tier, t.createdAt),
    index('retrieval_trace_chosen_idx').on(t.chosenSolutionId),
    /** Finding labelled traces — the training and eval set. */
    index('retrieval_trace_labelled_idx').on(t.attemptReportId),
  ],
);
