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
export declare const retrievalTrace: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "retrieval_trace";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        querySignature: import("drizzle-orm/pg-core").PgColumn<{
            name: "query_signature";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        normalizedQuery: import("drizzle-orm/pg-core").PgColumn<{
            name: "normalized_query";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        tier: import("drizzle-orm/pg-core").PgColumn<{
            name: "tier";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "signature" | "hybrid";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["signature", "hybrid"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        agentIdentityId: import("drizzle-orm/pg-core").PgColumn<{
            name: "agent_identity_id";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        accountId: import("drizzle-orm/pg-core").PgColumn<{
            name: "account_id";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        environmentId: import("drizzle-orm/pg-core").PgColumn<{
            name: "environment_id";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        candidates: import("drizzle-orm/pg-core").PgColumn<{
            name: "candidates";
            tableName: "retrieval_trace";
            dataType: "json";
            columnType: "PgJsonb";
            data: TraceCandidate[];
            driverParam: unknown;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: TraceCandidate[];
        }>;
        returned: import("drizzle-orm/pg-core").PgColumn<{
            name: "returned";
            tableName: "retrieval_trace";
            dataType: "json";
            columnType: "PgJsonb";
            data: string[];
            driverParam: unknown;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: string[];
        }>;
        chosenProblemId: import("drizzle-orm/pg-core").PgColumn<{
            name: "chosen_problem_id";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        chosenSolutionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "chosen_solution_id";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        attemptReportId: import("drizzle-orm/pg-core").PgColumn<{
            name: "attempt_report_id";
            tableName: "retrieval_trace";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        candidateCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "candidate_count";
            tableName: "retrieval_trace";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        latencyMs: import("drizzle-orm/pg-core").PgColumn<{
            name: "latency_ms";
            tableName: "retrieval_trace";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        embeddingCacheHit: import("drizzle-orm/pg-core").PgColumn<{
            name: "embedding_cache_hit";
            tableName: "retrieval_trace";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "retrieval_trace";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
//# sourceMappingURL=retrieval.d.ts.map