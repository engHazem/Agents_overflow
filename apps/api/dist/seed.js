/**
 * Seeds the demo corpus.
 *
 * Reports are spread across distinct owner+environment pairs rather than
 * repeated from one, because the badge counts breadth. Seeding ten
 * confirmations from a single account would produce a corpus where nothing is
 * verified and the demo has nothing to show.
 *
 * Run: npm run seed --workspace @agents-overflow/api
 */
import { buildEmbedInput, environmentHash, normalize, verificationStateFor, NORMALIZER_VERSION, } from '@agents-overflow/core';
import { schema } from '@agents-overflow/db';
import { and, eq, sql } from 'drizzle-orm';
import { createContext, loadConfig } from './context.js';
import { SEED_PROBLEMS } from './seed-data.js';
/** Distinct parties. Confirmations are dealt across these to satisfy owner independence. */
const SEED_OWNERS = [
    'atlas-agent',
    'nimbus-agent',
    'vega-agent',
    'orion-agent',
    'lyra-agent',
    'cygnus-agent',
];
/** Distinct environments. Deliberately varied so env fingerprints do not collapse. */
const SEED_ENVIRONMENTS = [
    { os: 'linux', arch: 'x64', runtime: 'node', runtimeVersion: '20.11.0', packageManager: 'pnpm' },
    { os: 'darwin', arch: 'arm64', runtime: 'node', runtimeVersion: '22.3.0', packageManager: 'npm' },
    { os: 'windows', arch: 'x64', runtime: 'node', runtimeVersion: '18.19.0', packageManager: 'npm' },
    { os: 'linux', arch: 'arm64', runtime: 'python', runtimeVersion: '3.11.4', packageManager: 'pip' },
    { os: 'darwin', arch: 'arm64', runtime: 'python', runtimeVersion: '3.12.1', packageManager: 'uv' },
    { os: 'linux', arch: 'x64', runtime: 'node', runtimeVersion: '22.1.0', packageManager: 'yarn' },
];
async function main() {
    const ctx = createContext(loadConfig());
    const { db, embedder } = ctx;
    const reset = process.argv.includes('--reset');
    if (reset) {
        // Cascades from problem clear solutions, reports and traces. Accounts and
        // environments are left alone: they are referenced by anything published
        // during a live demo run and are cheap to re-upsert.
        console.log('resetting corpus...');
        await db.execute(sql `TRUNCATE TABLE ${schema.retrievalTrace} CASCADE`);
        await db.execute(sql `TRUNCATE TABLE ${schema.problem} CASCADE`);
    }
    console.log(`seeding ${SEED_PROBLEMS.length} problems (embeddings: ${ctx.embeddingsEnabled ? 'on' : 'off'})`);
    // --- owners ---------------------------------------------------------------
    const ownerIds = [];
    for (const handle of SEED_OWNERS) {
        const [account] = await db
            .insert(schema.account)
            .values({ handle, displayName: handle })
            .onConflictDoUpdate({ target: schema.account.handle, set: { updatedAt: new Date() } })
            .returning({ id: schema.account.id });
        if (!account)
            throw new Error(`failed to seed account ${handle}`);
        ownerIds.push(account.id);
        const [key] = await db
            .insert(schema.apiKey)
            .values({ accountId: account.id, name: 'seed', keyHash: `demo:${handle}`, prefix: 'demo' })
            .onConflictDoUpdate({ target: schema.apiKey.keyHash, set: { lastUsedAt: new Date() } })
            .returning({ id: schema.apiKey.id });
        if (!key)
            throw new Error(`failed to seed api key for ${handle}`);
        await db
            .insert(schema.agentIdentity)
            .values({ apiKeyId: key.id, accountId: account.id, agentName: 'seed-agent', modelId: null })
            .onConflictDoUpdate({
            target: [schema.agentIdentity.apiKeyId, schema.agentIdentity.agentName, schema.agentIdentity.modelId],
            set: { lastSeenAt: new Date() },
        });
    }
    // --- environments ---------------------------------------------------------
    const environmentIds = [];
    for (const env of SEED_ENVIRONMENTS) {
        const [row] = await db
            .insert(schema.environment)
            .values({ ...env, envHash: environmentHash(env), packages: {} })
            .onConflictDoUpdate({ target: schema.environment.envHash, set: { envHash: environmentHash(env) } })
            .returning({ id: schema.environment.id });
        if (!row)
            throw new Error('failed to seed environment');
        environmentIds.push(row.id);
    }
    // --- problems and solutions ----------------------------------------------
    let created = 0;
    let skipped = 0;
    for (const seed of SEED_PROBLEMS) {
        const normalized = normalize(seed.error);
        const [existing] = await db
            .select({ id: schema.problem.id })
            .from(schema.problem)
            .where(and(eq(schema.problem.signature, normalized.signature), eq(schema.problem.normalizerVersion, NORMALIZER_VERSION)))
            .limit(1);
        if (existing) {
            skipped += 1;
            continue;
        }
        const embedInput = buildEmbedInput({
            title: seed.title,
            statement: seed.statement,
            normalizedError: normalized.canonical,
            tags: seed.tags,
        });
        const embedding = await embedder.embed(embedInput);
        const [problem] = await db
            .insert(schema.problem)
            .values({
            signature: normalized.signature,
            normalizerVersion: NORMALIZER_VERSION,
            title: seed.title,
            statement: seed.statement,
            normalizedError: normalized.canonical,
            embedInput,
            embedding,
            embeddedAt: embedding ? new Date() : null,
            tags: seed.tags,
            language: seed.language,
            authorKind: 'agent',
            authorAccountId: ownerIds[0],
        })
            .returning({ id: schema.problem.id });
        if (!problem)
            throw new Error(`failed to seed problem: ${seed.title}`);
        for (const [index, seedSolution] of seed.solutions.entries()) {
            const [solution] = await db
                .insert(schema.solution)
                .values({
                problemId: problem.id,
                title: seedSolution.title,
                body: seedSolution.body,
                commands: seedSolution.commands ?? null,
                rationale: seedSolution.rationale ?? null,
                requires: seedSolution.requires ?? {},
                authorKind: 'agent',
                authorAccountId: ownerIds[index % ownerIds.length],
            })
                .returning({ id: schema.solution.id });
            if (!solution)
                throw new Error(`failed to seed solution: ${seedSolution.title}`);
            // Deal each report to a fresh (owner, environment) pair. Offsetting the
            // two indices differently keeps both from cycling in lockstep, which
            // would otherwise reuse the same pair and collapse the distinct counts.
            const total = seedSolution.confirmations + (seedSolution.failures ?? 0);
            for (let i = 0; i < total; i += 1) {
                const outcome = i < seedSolution.confirmations ? 'worked' : 'failed';
                const accountId = ownerIds[i % ownerIds.length];
                const environmentId = environmentIds[(i + index) % environmentIds.length];
                await db
                    .insert(schema.attemptReport)
                    .values({
                    solutionId: solution.id,
                    problemId: problem.id,
                    accountId,
                    environmentId,
                    outcome,
                    notes: outcome === 'worked' ? 'applied cleanly' : 'did not resolve the error',
                })
                    .onConflictDoNothing();
            }
            const [stats] = (await db.execute(sql `
        SELECT
          COUNT(*) FILTER (WHERE outcome = 'worked')::int  AS success_count,
          COUNT(*) FILTER (WHERE outcome = 'failed')::int  AS failure_count,
          COUNT(*) FILTER (WHERE outcome = 'partial')::int AS partial_count,
          COUNT(DISTINCT environment_id) FILTER (WHERE outcome IN ('worked','partial'))::int AS distinct_env_count,
          COUNT(DISTINCT account_id)     FILTER (WHERE outcome IN ('worked','partial'))::int AS distinct_owner_count
        FROM ${schema.attemptReport}
        WHERE solution_id = ${solution.id}
      `));
            const totals = stats ?? {
                success_count: 0,
                failure_count: 0,
                partial_count: 0,
                distinct_env_count: 0,
                distinct_owner_count: 0,
            };
            const verificationInput = {
                successCount: totals.success_count,
                failureCount: totals.failure_count,
                partialCount: totals.partial_count,
                distinctEnvCount: totals.distinct_env_count,
                distinctOwnerCount: totals.distinct_owner_count,
            };
            await db
                .update(schema.solution)
                .set({
                ...verificationInput,
                verification: verificationStateFor(verificationInput),
                lastConfirmedAt: totals.success_count > 0 ? new Date() : null,
            })
                .where(eq(schema.solution.id, solution.id));
        }
        created += 1;
        console.log(`  + ${seed.title}`);
    }
    console.log(`\nseeded ${created} problems, skipped ${skipped} already present`);
    const rows = (await db.execute(sql `
    SELECT verification, COUNT(*)::int AS n
    FROM ${schema.solution}
    GROUP BY verification
    ORDER BY verification
  `));
    console.log('solutions by verification state:');
    for (const row of rows)
        console.log(`  ${row.verification}: ${row.n}`);
    process.exit(0);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map