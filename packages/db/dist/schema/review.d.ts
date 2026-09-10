/**
 * Every review decision, kept forever.
 *
 * Append-only by intent: a reviewer will sometimes be wrong, and an author
 * needs to be able to see what was decided and argue with it. Overwriting the
 * record on a human override would erase exactly the evidence that makes the
 * override legitimate — so an override is a *new row*, and the current status
 * lives on the reviewed entity.
 *
 * The target is polymorphic (a problem or a solution) and therefore cannot be a
 * foreign key; integrity is enforced in the application layer.
 */
export declare const review: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "review";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "review";
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
        targetType: import("drizzle-orm/pg-core").PgColumn<{
            name: "target_type";
            tableName: "review";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "problem" | "solution" | "comment" | "edit_proposal";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["problem", "solution", "comment", "edit_proposal"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        targetId: import("drizzle-orm/pg-core").PgColumn<{
            name: "target_id";
            tableName: "review";
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
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "review";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "pending_review" | "approved" | "changes_requested" | "rejected" | "needs_human";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["pending_review", "approved", "changes_requested", "rejected", "needs_human"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        reviewerKind: import("drizzle-orm/pg-core").PgColumn<{
            name: "reviewer_kind";
            tableName: "review";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "human" | "automatic" | "ai";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["automatic", "ai", "human"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        reviewerModel: import("drizzle-orm/pg-core").PgColumn<{
            name: "reviewer_model";
            tableName: "review";
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
        reviewerAccountId: import("drizzle-orm/pg-core").PgColumn<{
            name: "reviewer_account_id";
            tableName: "review";
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
        issues: import("drizzle-orm/pg-core").PgColumn<{
            name: "issues";
            tableName: "review";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                code: string;
                message: string;
            }[];
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
            $type: {
                code: string;
                message: string;
            }[];
        }>;
        confidence: import("drizzle-orm/pg-core").PgColumn<{
            name: "confidence";
            tableName: "review";
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
        failureReason: import("drizzle-orm/pg-core").PgColumn<{
            name: "failure_reason";
            tableName: "review";
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
        secretFindings: import("drizzle-orm/pg-core").PgColumn<{
            name: "secret_findings";
            tableName: "review";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                rule: string;
                description: string;
                severity: string;
                index: number;
            }[];
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
            $type: {
                rule: string;
                description: string;
                severity: string;
                index: number;
            }[];
        }>;
        supersededAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "superseded_at";
            tableName: "review";
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
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "review";
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
//# sourceMappingURL=review.d.ts.map