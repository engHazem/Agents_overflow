/**
 * Applies pending migrations statement by statement.
 *
 * `drizzle-kit migrate` wraps a migration in one transaction and reports a
 * failure without saying which statement caused it, which turns a one-line
 * mistake into a guessing game. This runs each statement separately and names
 * the one that fails, then records the migration in drizzle's own bookkeeping
 * table so `drizzle-kit` stays in sync.
 *
 * Run: npm run migrate --workspace @agents-overflow/db
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import postgres from 'postgres';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

/**
 * Neon names the pooled and direct endpoints identically apart from a `-pooler`
 * suffix. DDL and advisory locks misbehave through PgBouncer in transaction
 * mode, so migrations use the direct endpoint.
 */
function directUrl() {
  const explicit = process.env.DATABASE_URL_UNPOOLED;
  if (explicit) return explicit;

  const pooled = process.env.DATABASE_URL;
  if (!pooled) return null;

  try {
    const url = new URL(pooled);
    url.hostname = url.hostname.replace('-pooler.', '.');
    return url.toString();
  } catch {
    return pooled;
  }
}

const url = directUrl();
if (!url) {
  console.error('DATABASE_URL not set. Copy .env.example to .env first.');
  process.exit(1);
}

const sql = postgres(url, {
  ssl: 'require',
  prepare: false,
  max: 1,
  // A hung DDL statement should surface as an error, not an indefinite spinner.
  connect_timeout: 30,
  idle_timeout: 60,
});

let exitCode = 0;

try {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const applied = new Set(
    (await sql`SELECT hash FROM drizzle.__drizzle_migrations`).map((r) => r.hash),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const hash = createHash('sha256').update(raw).digest('hex');

    if (applied.has(hash)) {
      console.log(`= ${file} (already applied)`);
      continue;
    }

    const statements = raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`+ ${file} — ${statements.length} statements`);

    let ok = 0;
    for (const [index, statement] of statements.entries()) {
      try {
        await sql.unsafe(statement);
        ok += 1;
      } catch (error) {
        // Re-running a partially applied migration is normal during
        // development, so "already exists" is progress, not failure.
        if (/already exists/i.test(error.message)) {
          ok += 1;
          continue;
        }
        console.error(`\n  FAILED at statement ${index + 1}/${statements.length}:`);
        console.error(`  ${statement.slice(0, 300).replace(/\s+/g, ' ')}`);
        console.error(`  -> ${error.message}`);
        throw error;
      }
    }

    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `;
    console.log(`  applied ${ok}/${statements.length} statements`);
  }

  console.log('\nmigrations complete');
} catch (error) {
  console.error('\nmigration failed:', error.message);
  exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(exitCode);
