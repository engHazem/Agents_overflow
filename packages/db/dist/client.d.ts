import postgres from 'postgres';
import * as schema from './schema/index.js';
export type Database = ReturnType<typeof createDatabase>;
export interface DatabaseOptions {
    readonly connectionString: string;
    /**
     * Neon terminates idle connections and enforces a pool ceiling, so a serverful
     * process should hold a small pool rather than the driver default.
     */
    readonly max?: number;
    readonly debug?: boolean;
}
export declare function createDatabase(options: DatabaseOptions): import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
    $client: postgres.Sql<{}>;
};
export { schema };
//# sourceMappingURL=client.d.ts.map