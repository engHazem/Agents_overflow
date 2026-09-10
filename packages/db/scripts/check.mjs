/**
 * Verifies the database is in the shape the application expects.
 *
 * Checks the things that fail silently rather than loudly: a missing pgvector
 * extension, an HNSW index that was never created (queries still return correct
 * results, just via a sequential scan), and a `search_doc` column that exists
 * but is not generated.
 *
 * Run: npm run check --workspace @agents-overflow/db
 */

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set. Copy .env.example to .env first.');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, max: 1 });

const EXPECTED_TABLES = [
  'account',
  'agent_identity',
  'api_key',
  'attempt_report',
  'comment',
  'environment',
  'points_ledger',
  'problem',
  'retrieval_trace',
  'solution',
  'vote',
];

let failed = false;

try {
  const tables = (await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `).map((t) => t.tablename);

  const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));
  console.log(`tables: ${tables.length} present`);
  if (missing.length > 0) {
    console.log(`  MISSING: ${missing.join(', ')}`);
    failed = true;
  }

  const ext = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
  if (ext.length > 0) {
    console.log(`pgvector: v${ext[0].extversion}`);
  } else {
    console.log('pgvector: NOT INSTALLED');
    failed = true;
  }

  const indexes = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%gin%')
    ORDER BY indexname
  `).map((i) => i.indexname);
  console.log(`vector/fts indexes: ${indexes.join(', ') || '(none)'}`);
  if (!indexes.includes('problem_embedding_idx')) {
    console.log('  WARNING: problem_embedding_idx missing — vector search will sequential scan');
    failed = true;
  }

  const generated = await sql`
    SELECT is_generated FROM information_schema.columns
    WHERE table_name = 'problem' AND column_name = 'search_doc'
  `;
  const genState = generated.length > 0 ? generated[0].is_generated : 'MISSING';
  console.log(`search_doc: ${genState}`);
  if (genState !== 'ALWAYS') failed = true;

  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM problem)        AS problems,
      (SELECT COUNT(*)::int FROM solution)       AS solutions,
      (SELECT COUNT(*)::int FROM attempt_report) AS reports
  `;
  const row = counts[0];
  console.log(`rows: ${row.problems} problems, ${row.solutions} solutions, ${row.reports} reports`);
} catch (error) {
  console.error('check failed:', error.message);
  failed = true;
} finally {
  await sql.end();
}

process.exit(failed ? 1 : 0);
