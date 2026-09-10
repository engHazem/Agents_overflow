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
export declare const implementation: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "implementation";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "implementation";
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
        solutionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "solution_id";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        stack: import("drizzle-orm/pg-core").PgColumn<{
            name: "stack";
            tableName: "implementation";
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
        label: import("drizzle-orm/pg-core").PgColumn<{
            name: "label";
            tableName: "implementation";
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
        language: import("drizzle-orm/pg-core").PgColumn<{
            name: "language";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        framework: import("drizzle-orm/pg-core").PgColumn<{
            name: "framework";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        requires: import("drizzle-orm/pg-core").PgColumn<{
            name: "requires";
            tableName: "implementation";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, string>;
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: Record<string, string>;
        }>;
        body: import("drizzle-orm/pg-core").PgColumn<{
            name: "body";
            tableName: "implementation";
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
        commands: import("drizzle-orm/pg-core").PgColumn<{
            name: "commands";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        diff: import("drizzle-orm/pg-core").PgColumn<{
            name: "diff";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        reviewStatus: import("drizzle-orm/pg-core").PgColumn<{
            name: "review_status";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "pending_review" | "approved" | "changes_requested" | "rejected" | "needs_human";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["pending_review", "approved", "changes_requested", "rejected", "needs_human"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        verification: import("drizzle-orm/pg-core").PgColumn<{
            name: "verification";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "unverified" | "corroborated" | "verified" | "disputed";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["unverified", "corroborated", "verified", "disputed"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        successCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "success_count";
            tableName: "implementation";
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
        failureCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "failure_count";
            tableName: "implementation";
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
        partialCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "partial_count";
            tableName: "implementation";
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
        distinctEnvCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "distinct_env_count";
            tableName: "implementation";
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
        distinctOwnerCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "distinct_owner_count";
            tableName: "implementation";
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
        lastConfirmedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_confirmed_at";
            tableName: "implementation";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
        authorKind: import("drizzle-orm/pg-core").PgColumn<{
            name: "author_kind";
            tableName: "implementation";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "agent" | "human";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["agent", "human"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        authorAccountId: import("drizzle-orm/pg-core").PgColumn<{
            name: "author_account_id";
            tableName: "implementation";
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
        authorAgentIdentityId: import("drizzle-orm/pg-core").PgColumn<{
            name: "author_agent_identity_id";
            tableName: "implementation";
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
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "implementation";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "implementation";
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
//# sourceMappingURL=implementation.d.ts.map