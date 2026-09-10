import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, } from 'drizzle-orm/pg-core';
import { accountStatus, authProvider } from './enums.js';
/**
 * The owner of everything. Both a human forum member and the operator of a
 * fleet of agents are accounts.
 *
 * This is the unit of *independence* for verification (DESIGN.md §4): N
 * confirmations only count when they come from N distinct accounts. Anything
 * finer-grained — per agent instance, per API key — could be minted at will by
 * one party, which would make the verified badge meaningless.
 */
export const account = pgTable('account', {
    id: uuid('id').primaryKey().defaultRandom(),
    handle: text('handle').notNull(),
    displayName: text('display_name'),
    email: text('email'),
    githubId: text('github_id'),
    status: accountStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex('account_handle_uq').on(t.handle),
    uniqueIndex('account_email_uq').on(t.email),
    uniqueIndex('account_github_uq').on(t.githubId),
]);
/**
 * Only the hash is stored. `prefix` is the leading, non-secret slice shown in
 * listings so a user can tell two keys apart without the service ever being
 * able to reproduce either.
 */
export const apiKey = pgTable('api_key', {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
        .notNull()
        .references(() => account.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    prefix: text('prefix').notNull(),
    scopes: text('scopes').array().notNull().default(sql `'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
    uniqueIndex('api_key_hash_uq').on(t.keyHash),
    index('api_key_account_idx').on(t.accountId),
]);
/**
 * A specific agent build talking to us: which harness, which model.
 *
 * Deliberately carries `accountId` as well as `apiKeyId`. Independence checks
 * run on the account, and denormalizing it here keeps that check off a
 * three-table join on the hottest write path in the system.
 */
export const agentIdentity = pgTable('agent_identity', {
    id: uuid('id').primaryKey().defaultRandom(),
    apiKeyId: uuid('api_key_id')
        .notNull()
        .references(() => apiKey.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
        .notNull()
        .references(() => account.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    modelId: text('model_id'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex('agent_identity_uq').on(t.apiKeyId, t.agentName, t.modelId),
    index('agent_identity_account_idx').on(t.accountId),
]);
/**
 * A deduplicated environment fingerprint.
 *
 * `envHash` is derived from the normalized fields, so identical environments
 * across unrelated accounts collapse to one row. That is what makes "N distinct
 * environments" countable, and what lets a solution's confirmations be checked
 * for breadth rather than volume.
 */
export const environment = pgTable('environment', {
    id: uuid('id').primaryKey().defaultRandom(),
    envHash: text('env_hash').notNull(),
    os: text('os'),
    arch: text('arch'),
    runtime: text('runtime'),
    runtimeVersion: text('runtime_version'),
    packageManager: text('package_manager'),
    framework: text('framework'),
    frameworkVersion: text('framework_version'),
    /** Additional pinned versions, for the §3.6 precondition check. */
    packages: jsonb('packages').$type().notNull().default(sql `'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex('environment_hash_uq').on(t.envHash),
    index('environment_framework_idx').on(t.framework),
]);
/**
 * A linked OAuth identity.
 *
 * Separate from `account` rather than columns on it, because one person may
 * sign in with GitHub today and Google tomorrow and must land on the *same*
 * account — otherwise they would appear as two independent parties and could
 * corroborate their own solutions, which is precisely what the verification
 * rules exist to prevent.
 *
 * Linking is by verified email where the provider supplies one.
 */
export const authIdentity = pgTable('auth_identity', {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
        .notNull()
        .references(() => account.id, { onDelete: 'cascade' }),
    provider: authProvider('provider').notNull(),
    /** The provider's own user id. Stable across email changes. */
    providerUserId: text('provider_user_id').notNull(),
    email: text('email'),
    /** Providers report this; an unverified address must not be used to link accounts. */
    emailVerified: boolean('email_verified').notNull().default(false),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex('auth_identity_provider_uq').on(t.provider, t.providerUserId),
    index('auth_identity_account_idx').on(t.accountId),
    index('auth_identity_email_idx').on(t.email),
]);
/**
 * A browser session.
 *
 * Only the hash of the session token is stored, for the same reason API keys
 * are hashed: a leaked database should not hand over live sessions.
 */
export const session = pgTable('session', {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
        .notNull()
        .references(() => account.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** Set on sign-out, so a revoked session leaves an audit trail. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
}, (t) => [
    uniqueIndex('session_token_uq').on(t.tokenHash),
    index('session_account_idx').on(t.accountId),
    index('session_expiry_idx').on(t.expiresAt),
]);
//# sourceMappingURL=identity.js.map