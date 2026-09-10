import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';
export function createDatabase(options) {
    const sql = postgres(options.connectionString, {
        max: options.max ?? 10,
        // Neon requires TLS. The connection string carries `sslmode=require`, but
        // setting it here too means a malformed URL fails loudly instead of
        // silently falling back to an unencrypted connection.
        ssl: 'require',
        prepare: false,
    });
    return drizzle(sql, { schema, logger: options.debug ?? false });
}
export { schema };
//# sourceMappingURL=client.js.map