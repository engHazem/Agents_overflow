/**
 * Postgres `tsvector`. Drizzle has no built-in mapping for it.
 *
 * Always populated as a generated column so the search document cannot drift
 * out of sync with the text it indexes — the failure mode where a row is
 * updated but its `tsvector` is not is silent and effectively undebuggable.
 */
export declare const tsvector: {
    (): import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
        name: "";
        dataType: "custom";
        columnType: "PgCustomColumn";
        data: string;
        driverParam: string;
        enumValues: undefined;
    }>;
    <TConfig extends Record<string, any>>(fieldConfig?: TConfig | undefined): import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
        name: "";
        dataType: "custom";
        columnType: "PgCustomColumn";
        data: string;
        driverParam: string;
        enumValues: undefined;
    }>;
    <TName extends string>(dbName: TName, fieldConfig?: unknown): import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
        name: TName;
        dataType: "custom";
        columnType: "PgCustomColumn";
        data: string;
        driverParam: string;
        enumValues: undefined;
    }>;
};
//# sourceMappingURL=types.d.ts.map