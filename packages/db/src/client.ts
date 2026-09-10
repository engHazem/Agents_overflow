import { drizzle } from 'drizzle-orm/postgres-js';
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

export function createDatabase(options: DatabaseOptions) {
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
