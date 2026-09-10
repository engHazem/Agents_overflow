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
import { type EnvironmentInput } from '@agents-overflow/core';
import type { SearchRequest, SearchResponse } from '@agents-overflow/shared';
import type { AppContext, Actor } from './context.js';
export declare function runSearch(ctx: AppContext, request: SearchRequest, actor: Actor, environmentId: string | null, callerEnvironment: EnvironmentInput | undefined): Promise<SearchResponse>;
//# sourceMappingURL=search.d.ts.map