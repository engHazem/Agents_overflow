import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env' });

/**
 * Migrations run over a direct connection, not the pooler: DDL and the advisory
 * locks drizzle takes do not behave correctly through PgBouncer in transaction
 * mode.
 *
 * Neon names the two endpoints identically apart from a `-pooler` suffix on the
 * host, so the direct URL can be derived rather than requiring a second string
 * in `.env` that is easy to paste wrong or forget.
 */
function directConnection(): string {
  const explicit = process.env.DATABASE_URL_UNPOOLED;
  if (explicit) return explicit;

  const pooled = process.env.DATABASE_URL;
  if (!pooled) return '';

  try {
    const url = new URL(pooled);
    url.hostname = url.hostname.replace('-pooler.', '.');
    return url.toString();
  } catch {
    // Not parseable as a URL — hand it back untouched and let the driver report.
    return pooled;
  }
}

const url = directConnection();

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: url ?? '' },
  strict: true,
  verbose: true,
});
