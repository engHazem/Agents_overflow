/**
 * The retrieval pipeline (DESIGN.md §3).
 *
 * Tier 0 is an exact signature lookup that short-circuits everything else.
 * Tier 1 runs full-text and vector search independently, fuses them by rank,
 * and blends the result with verification evidence.
 *
 * Deviation from §3.3, taken deliberately for the proof of concept: fusion runs
 * in TypeScript rather than as a SQL CTE. It reuses the already-tested pure
 * function, and at demo scale the extra round trip is invisible. The SQL
 * version is a later optimisation, not a correctness fix.
 */

import {
  buildTsQuery,
  confidenceScore,
  normalize,
  normalizeRrfScores,
  reciprocalRankFusion,
  NORMALIZER_VERSION,
  type EnvironmentInput,
  type MatchSource,
} from '@agents-overflow/core';
import { schema } from '@agents-overflow/db';
import type { SearchRequest, SearchResponse, SearchHit, SolutionSummary } from '@agents-overflow/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { AppContext, Actor } from './context.js';

/** Retrieval depth per list. Must exceed the fused cut, or fusion selects nothing (§3.4). */
const FTS_DEPTH = 150;
const VECTOR_DEPTH = 150;
const FUSED_DEPTH = 100;

/**
 * Cosine-distance ceiling for a vector candidate.
 *
 * Without a floor, ANN search returns the *nearest* rows regardless of whether
 * they are related at all — over a small corpus that means nearly everything.
 * Both retrieval lists then contain most of the corpus, RRF ends up ranking
 * noise, and generic infrastructure vocabulary ("server", "localhost") decides
 * the ordering.
 *
 * Measured separation on this corpus is clean: genuinely related problems sit
 * at 0.40-0.48 while unrelated ones start around 0.64. 0.62 sits in that gap.
 *
 * This is a recall/precision trade and the right value depends on the corpus,
 * so it is a named constant rather than an inline literal — it should be tuned
 * against the retrieval traces once there are enough of them.
 */
const VECTOR_MAX_DISTANCE = 0.62;

/**
 * Blend weights (§3.8), redistributed because there is no reranker in v1: its
 * 0.55 relevance share folds into the fused retrieval score, which is the only
 * relevance signal available.
 */
const W_RELEVANCE = 0.75;
const W_CONFIDENCE = 0.2;
const W_FRESHNESS = 0.05;

/**
 * The `env_match` term of §3.8 is not implemented here.
 *
 * A problem has no environment of its own — only the reports confirming its
 * solutions do — so computing proximity means aggregating the environments a
 * solution was confirmed in and comparing those to the caller's. That is a real
 * feature, not a one-liner, and shipping a placeholder that compares the wrong
 * fields would be worse than leaving the signal out: it would look like it
 * worked. Its 0.10 share is folded into relevance until it is built properly.
 */

/** Half-life for the freshness decay, in days. */
const FRESHNESS_HALF_LIFE_DAYS = 90;

type SolutionRow = typeof schema.solution.$inferSelect;

/**
 * Explicit column list for every problem read on the query path.
 *
 * `select()` would also fetch `embedding` (1536 floats per row, serialized as
 * text), `search_doc` (a tsvector) and `embed_input` — none of which the
 * response uses. Measured at ~1.9s for 19 rows versus ~200ms for these columns.
 * At corpus scale that difference is the whole latency budget.
 */
const PROBLEM_COLUMNS = {
  id: schema.problem.id,
  title: schema.problem.title,
  statement: schema.problem.statement,
  tags: schema.problem.tags,
  language: schema.problem.language,
  status: schema.problem.status,
  createdAt: schema.problem.createdAt,
} as const;

type ProblemRow = {
  id: string;
  title: string;
  statement: string;
  tags: string[];
  language: string | null;
};

/**
 * Decays from the last successful confirmation, never from creation date: an
 * old solution confirmed last week is live knowledge, a new one whose recent
 * attempts all failed is rotting.
 */
function freshness(lastConfirmedAt: Date | null): number {
  if (!lastConfirmedAt) return 0;
  const days = (Date.now() - lastConfirmedAt.getTime()) / 86_400_000;
  return Math.pow(0.5, Math.max(0, days) / FRESHNESS_HALF_LIFE_DAYS);
}

function toSolutionSummary(row: SolutionRow): SolutionSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    commands: row.commands,
    diff: row.diff,
    rationale: row.rationale,
    verification: row.verification,
    successCount: row.successCount,
    failureCount: row.failureCount,
    distinctEnvCount: row.distinctEnvCount,
    distinctOwnerCount: row.distinctOwnerCount,
    lastConfirmedAt: row.lastConfirmedAt?.toISOString() ?? null,
    confidence: confidenceScore({
      successCount: row.successCount,
      failureCount: row.failureCount,
      partialCount: row.partialCount,
      distinctEnvCount: row.distinctEnvCount,
      distinctOwnerCount: row.distinctOwnerCount,
    }),
  };
}

/** Best available evidence on a problem, used to score the problem as a whole. */
function bestSolutionSignals(solutions: SolutionRow[]): { confidence: number; freshness: number } {
  let bestConfidence = 0;
  let bestFreshness = 0;

  for (const s of solutions) {
    bestConfidence = Math.max(
      bestConfidence,
      confidenceScore({
        successCount: s.successCount,
        failureCount: s.failureCount,
        partialCount: s.partialCount,
        distinctEnvCount: s.distinctEnvCount,
        distinctOwnerCount: s.distinctOwnerCount,
      }),
    );
    bestFreshness = Math.max(bestFreshness, freshness(s.lastConfirmedAt));
  }

  return { confidence: bestConfidence, freshness: bestFreshness };
}

async function loadSolutions(ctx: AppContext, problemIds: string[]): Promise<Map<string, SolutionRow[]>> {
  const grouped = new Map<string, SolutionRow[]>();
  if (problemIds.length === 0) return grouped;

  const rows = await ctx.db
    .select()
    .from(schema.solution)
    .where(and(inArray(schema.solution.problemId, problemIds), eq(schema.solution.status, 'active')));

  for (const row of rows) {
    const list = grouped.get(row.problemId) ?? [];
    list.push(row);
    grouped.set(row.problemId, list);
  }

  // Strongest evidence first, so an agent reading only the first solution reads
  // the best-supported one.
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const ca = confidenceScore({ ...a });
      const cb = confidenceScore({ ...b });
      return cb - ca || b.successCount - a.successCount;
    });
  }

  return grouped;
}

async function ftsCandidates(ctx: AppContext, text: string): Promise<string[]> {
  const tsQuery = buildTsQuery(text);
  // No usable terms means skipping FTS entirely — running it with an empty
  // string would error rather than return nothing.
  if (!tsQuery) return [];

  const rows = (await ctx.db.execute(sql`
    SELECT p.id::text AS id
    FROM ${schema.problem} p, to_tsquery('english', ${tsQuery}) AS q
    WHERE p.status = 'active' AND p.search_doc @@ q
    ORDER BY ts_rank_cd(p.search_doc, q) DESC
    LIMIT ${FTS_DEPTH}
  `)) as unknown as { id: string }[];

  return rows.map((r) => r.id);
}

async function vectorCandidates(
  ctx: AppContext,
  embedInput: string,
): Promise<{ ids: string[]; available: boolean; cached: boolean }> {
  const { vector, cached } = await ctx.embedder.embedWithMeta(embedInput);
  if (!vector) return { ids: [], available: false, cached };

  const literal = `[${vector.join(',')}]`;
  const rows = (await ctx.db.execute(sql`
    SELECT p.id::text AS id
    FROM ${schema.problem} p
    WHERE p.status = 'active'
      AND p.embedding IS NOT NULL
      AND (p.embedding <=> ${literal}::vector) < ${VECTOR_MAX_DISTANCE}
    ORDER BY p.embedding <=> ${literal}::vector
    LIMIT ${VECTOR_DEPTH}
  `)) as unknown as { id: string }[];

  return { ids: rows.map((r) => r.id), available: true, cached };
}

export async function runSearch(
  ctx: AppContext,
  request: SearchRequest,
  actor: Actor,
  environmentId: string | null,
  callerEnvironment: EnvironmentInput | undefined,
): Promise<SearchResponse> {
  const startedAt = Date.now();
  const normalized = normalize(request.error);
  const degraded: string[] = [];

  // ---- Tier 0: exact signature -------------------------------------------
  const [exact] = await ctx.db
    .select(PROBLEM_COLUMNS)
    .from(schema.problem)
    .where(
      and(
        eq(schema.problem.signature, normalized.signature),
        eq(schema.problem.normalizerVersion, NORMALIZER_VERSION),
        eq(schema.problem.status, 'active'),
      ),
    )
    .limit(1);

  if (exact) {
    const solutions = (await loadSolutions(ctx, [exact.id])).get(exact.id) ?? [];
    if (solutions.length > 0) {
      const hit: SearchHit = {
        problemId: exact.id,
        title: exact.title,
        statement: exact.statement,
        tags: exact.tags,
        score: 1,
        matchedBy: ['signature'],
        solutions: solutions.map(toSolutionSummary),
      };

      const traceId = await recordTrace(ctx, {
        querySignature: normalized.signature,
        normalizedQuery: normalized.canonical,
        tier: 'signature',
        actor,
        environmentId,
        candidates: [
          {
            problemId: exact.id,
            ftsRank: null,
            vectorRank: null,
            rrfScore: 1,
            finalScore: 1,
            preconditionStatus: null,
          },
        ],
        returned: [exact.id],
        latencyMs: Date.now() - startedAt,
        embeddingCacheHit: null,
      });

      return {
        tier: 'signature',
        querySignature: normalized.signature,
        hits: [hit],
        traceId,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  // ---- Tier 1: hybrid -----------------------------------------------------
  // The core plus caller context, not the full canonical text: the core is the
  // part that identifies the error, and the tail of a long trace is noise.
  const queryText = [normalized.core, request.context ?? ''].filter(Boolean).join('\n\n');

  const [ftsIds, vectorResult] = await Promise.all([
    ftsCandidates(ctx, queryText),
    vectorCandidates(ctx, queryText),
  ]);

  if (!vectorResult.available) {
    degraded.push(ctx.embeddingsEnabled ? 'vector-search-failed' : 'vector-search-disabled');
  }

  const lists: Partial<Record<MatchSource, readonly string[]>> = { fts: ftsIds };
  if (vectorResult.available) lists.vector = vectorResult.ids;

  const fused = reciprocalRankFusion(lists).slice(0, FUSED_DEPTH);
  const rrfNormalized = normalizeRrfScores(fused);

  const candidateIds = fused.map((c) => c.id);
  const problems =
    candidateIds.length === 0
      ? []
      : await ctx.db.select(PROBLEM_COLUMNS).from(schema.problem).where(inArray(schema.problem.id, candidateIds));

  const problemsById = new Map<string, ProblemRow>(problems.map((p) => [p.id, p]));
  const solutionsByProblem = await loadSolutions(ctx, candidateIds);

  const scored = fused
    .map((candidate) => {
      const problem = problemsById.get(candidate.id);
      if (!problem) return null;

      const solutions = solutionsByProblem.get(problem.id) ?? [];
      const signals = bestSolutionSignals(solutions);

      const score =
        W_RELEVANCE * (rrfNormalized.get(candidate.id) ?? 0) +
        W_CONFIDENCE * signals.confidence +
        W_FRESHNESS * signals.freshness;

      return { candidate, problem, solutions, score };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // A problem with no solutions is a question with no answer — useless to an
    // agent that came here for a fix.
    .filter((x) => x.solutions.length > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, request.limit);

  const traceId = await recordTrace(ctx, {
    querySignature: normalized.signature,
    normalizedQuery: normalized.canonical,
    tier: 'hybrid',
    actor,
    environmentId,
    candidates: scored.map((s) => ({
      problemId: s.problem.id,
      ftsRank: s.candidate.ranks.fts ?? null,
      vectorRank: s.candidate.ranks.vector ?? null,
      rrfScore: s.candidate.rrfScore,
      finalScore: s.score,
      preconditionStatus: null,
    })),
    returned: top.map((s) => s.problem.id),
    latencyMs: Date.now() - startedAt,
    embeddingCacheHit: vectorResult.cached,
  });

  return {
    tier: 'hybrid',
    querySignature: normalized.signature,
    hits: top.map(({ problem, solutions, candidate, score }) => ({
      problemId: problem.id,
      title: problem.title,
      statement: problem.statement,
      tags: problem.tags,
      score,
      matchedBy: candidate.matchedBy,
      solutions: solutions.map(toSolutionSummary),
    })),
    traceId,
    latencyMs: Date.now() - startedAt,
    ...(degraded.length > 0 ? { degraded } : {}),
  };
}

interface TraceInput {
  querySignature: string;
  normalizedQuery: string;
  tier: 'signature' | 'hybrid';
  actor: Actor;
  environmentId: string | null;
  candidates: {
    problemId: string;
    ftsRank: number | null;
    vectorRank: number | null;
    rrfScore: number;
    finalScore: number | null;
    preconditionStatus: null;
  }[];
  returned: string[];
  latencyMs: number;
  embeddingCacheHit: boolean | null;
}

/**
 * Writes the retrieval trace (§3.11).
 *
 * Failures here are swallowed: losing a log line is bad, failing the agent's
 * search because logging broke is worse.
 */
async function recordTrace(ctx: AppContext, input: TraceInput): Promise<string> {
  try {
    const [row] = await ctx.db
      .insert(schema.retrievalTrace)
      .values({
        querySignature: input.querySignature,
        normalizedQuery: input.normalizedQuery,
        tier: input.tier,
        agentIdentityId: input.actor.agentIdentityId,
        accountId: input.actor.accountId,
        environmentId: input.environmentId,
        candidates: input.candidates,
        returned: input.returned,
        candidateCount: input.candidates.length,
        latencyMs: input.latencyMs,
        embeddingCacheHit: input.embeddingCacheHit,
      })
      .returning({ id: schema.retrievalTrace.id });

    if (row) return row.id;
  } catch (error) {
    console.warn('[trace] failed to record retrieval trace', error);
  }

  return '00000000-0000-0000-0000-000000000000';
}
