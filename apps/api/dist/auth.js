/**
 * Sign-in routes.
 *
 * The flow is the standard authorization-code exchange, with the two failure
 * modes that actually bite people defended explicitly: CSRF on the callback
 * (signed `state`) and open redirects (`returnTo` validated against our own
 * origin).
 *
 * Accounts are linked by *verified* email, so signing in with GitHub and later
 * with Google lands on one account rather than two. That matters beyond
 * convenience: two accounts for one person would count as two independent
 * parties, and independence is what the verified badge is built on.
 */
import { PROVIDERS, SESSION_COOKIE, SESSION_TTL_DAYS, createSessionToken, createState, hashSessionToken, isSafeReturnTo, normalizeIdentity, suggestHandle, verifyState, } from '@agents-overflow/core';
import { schema } from '@agents-overflow/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
function credentialsFor(ctx, provider) {
    const id = provider === 'github' ? ctx.config.githubClientId : ctx.config.googleClientId;
    const secret = provider === 'github' ? ctx.config.githubClientSecret : ctx.config.googleClientSecret;
    if (!id || !secret)
        return null;
    return { clientId: id, clientSecret: secret };
}
/**
 * Where the provider sends the browser back to.
 *
 * Built from the *public* base URL: this address is resolved by the user's
 * browser and must match the callback registered with the provider, so behind a
 * proxy the internal address is wrong on both counts. The provider also
 * re-checks it during the token exchange, so the same value has to be used in
 * both places or the exchange fails with a redirect_uri mismatch.
 */
function callbackUrl(ctx, provider) {
    return `${ctx.config.publicBaseUrl.replace(/\/+$/, '')}/v1/auth/${provider}/callback`;
}
/**
 * Exchanges the authorization code for an access token.
 *
 * GitHub returns form-encoded unless asked otherwise, which is a classic
 * silent failure — hence the explicit Accept header.
 */
async function exchangeCode(provider, code, credentials, redirectUri) {
    const config = PROVIDERS[provider];
    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!response.ok)
        return null;
    const payload = (await response.json());
    return typeof payload.access_token === 'string' ? payload.access_token : null;
}
async function fetchIdentity(provider, accessToken) {
    const config = PROVIDERS[provider];
    const headers = {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        // GitHub rejects requests without one.
        'user-agent': 'agents-overflow',
    };
    const userResponse = await fetch(config.userUrl, { headers });
    if (!userResponse.ok)
        return null;
    const user = (await userResponse.json());
    let emails;
    if (config.emailUrl) {
        const emailResponse = await fetch(config.emailUrl, { headers });
        if (emailResponse.ok) {
            emails = (await emailResponse.json());
        }
    }
    return normalizeIdentity(provider, user, emails);
}
/**
 * Finds or creates the account for a provider identity.
 *
 * Resolution order matters:
 *   1. This exact provider identity — a returning user.
 *   2. An existing account with the same **verified** email — the same person
 *      arriving through a second provider.
 *   3. A new account.
 *
 * Step 2 is skipped entirely when the address is unverified, because otherwise
 * signing up elsewhere with someone's address would hand over their account.
 */
async function resolveAccount(ctx, identity) {
    const [existing] = await ctx.db
        .select({ id: schema.authIdentity.id, accountId: schema.authIdentity.accountId })
        .from(schema.authIdentity)
        .where(and(eq(schema.authIdentity.provider, identity.provider), eq(schema.authIdentity.providerUserId, identity.providerUserId)))
        .limit(1);
    if (existing) {
        await ctx.db
            .update(schema.authIdentity)
            .set({
            lastLoginAt: new Date(),
            email: identity.email,
            emailVerified: identity.emailVerified,
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
        })
            .where(eq(schema.authIdentity.id, existing.id));
        return existing.accountId;
    }
    let accountId = null;
    if (identity.email && identity.emailVerified) {
        const [byEmail] = await ctx.db
            .select({ id: schema.account.id })
            .from(schema.account)
            .where(eq(schema.account.email, identity.email))
            .limit(1);
        if (byEmail)
            accountId = byEmail.id;
    }
    if (!accountId) {
        accountId = await createAccount(ctx, identity);
    }
    await ctx.db.insert(schema.authIdentity).values({
        accountId,
        provider: identity.provider,
        providerUserId: identity.providerUserId,
        email: identity.email,
        emailVerified: identity.emailVerified,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
    });
    return accountId;
}
/**
 * Creates an account, resolving handle collisions.
 *
 * The handle is the independence key, so it has to be unique. Two people called
 * "Ada Lovelace" must not share one.
 */
async function createAccount(ctx, identity) {
    const base = suggestHandle(identity);
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const handle = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
        const [created] = await ctx.db
            .insert(schema.account)
            .values({
            handle,
            displayName: identity.displayName ?? handle,
            email: identity.emailVerified ? identity.email : null,
        })
            .onConflictDoNothing()
            .returning({ id: schema.account.id });
        if (created)
            return created.id;
    }
    throw new Error('could not allocate a unique handle');
}
async function startSession(ctx, accountId, reply, userAgent) {
    const { token, tokenHash } = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await ctx.db.insert(schema.session).values({
        accountId,
        tokenHash,
        expiresAt,
        userAgent: userAgent ?? null,
    });
    reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: ctx.config.nodeEnv === 'production',
        path: '/',
        expires: expiresAt,
    });
}
/** Resolves the signed-in user, or null. Never throws. */
export async function currentUser(ctx, request) {
    const token = request.cookies[SESSION_COOKIE];
    if (!token)
        return null;
    const [row] = await ctx.db
        .select({
        accountId: schema.account.id,
        handle: schema.account.handle,
        displayName: schema.account.displayName,
        email: schema.account.email,
    })
        .from(schema.session)
        .innerJoin(schema.account, eq(schema.account.id, schema.session.accountId))
        .where(and(eq(schema.session.tokenHash, hashSessionToken(token)), isNull(schema.session.revokedAt), gt(schema.session.expiresAt, new Date())))
        .limit(1);
    if (!row)
        return null;
    const [identity] = await ctx.db
        .select({ avatarUrl: schema.authIdentity.avatarUrl })
        .from(schema.authIdentity)
        .where(eq(schema.authIdentity.accountId, row.accountId))
        .limit(1);
    return { ...row, avatarUrl: identity?.avatarUrl ?? null };
}
export async function registerAuthRoutes(app, ctx) {
    const providers = ['github', 'google'];
    /** Which sign-in buttons the UI should render. */
    app.get('/v1/auth/providers', async () => ({
        providers: providers.filter((p) => credentialsFor(ctx, p) !== null),
    }));
    for (const provider of providers) {
        app.get(`/v1/auth/${provider}`, async (request, reply) => {
            const credentials = credentialsFor(ctx, provider);
            if (!credentials) {
                return reply.status(503).send({
                    error: 'provider_unconfigured',
                    message: `${provider} sign-in is not configured on this server.`,
                });
            }
            const query = request.query;
            const returnTo = isSafeReturnTo(query.returnTo, ctx.config.authRedirectUrl)
                ? query.returnTo
                : undefined;
            const state = createState(ctx.config.sessionSecret, returnTo);
            const config = PROVIDERS[provider];
            const url = new URL(config.authorizeUrl);
            url.searchParams.set('client_id', credentials.clientId);
            url.searchParams.set('redirect_uri', callbackUrl(ctx, provider));
            url.searchParams.set('scope', config.scope);
            url.searchParams.set('state', state);
            url.searchParams.set('response_type', 'code');
            return reply.redirect(url.toString());
        });
        app.get(`/v1/auth/${provider}/callback`, async (request, reply) => {
            const query = request.query;
            // The user declined, or the provider refused. Not our failure.
            if (query.error) {
                return reply.redirect(`${ctx.config.authRedirectUrl}?auth_error=${encodeURIComponent(query.error)}`);
            }
            if (!query.code || !query.state) {
                return reply.redirect(`${ctx.config.authRedirectUrl}?auth_error=missing_code`);
            }
            // Anyone can send a browser to this URL. Without a state we signed, we
            // would happily log the visitor into whatever account the code belongs to.
            const state = verifyState(query.state, ctx.config.sessionSecret);
            if (!state.valid) {
                request.log.warn({ reason: state.reason }, 'rejected oauth callback state');
                return reply.redirect(`${ctx.config.authRedirectUrl}?auth_error=bad_state`);
            }
            const credentials = credentialsFor(ctx, provider);
            if (!credentials) {
                return reply.redirect(`${ctx.config.authRedirectUrl}?auth_error=provider_unconfigured`);
            }
            try {
                const accessToken = await exchangeCode(provider, query.code, credentials, callbackUrl(ctx, provider));
                if (!accessToken) {
                    return reply.redirect(`${ctx.config.authRedirectUrl}?auth_error=token_exchange_failed`);
                }
                const identity = await fetchIdentity(provider, accessToken);
                if (!identity) {
                    return reply.redirect(`${ctx.config.authRedirectUrl}?auth_error=profile_unavailable`);
                }
                const accountId = await resolveAccount(ctx, identity);
                await startSession(ctx, accountId, reply, request.headers['user-agent']);
                const destination = state.payload?.returnTo ?? ctx.config.authRedirectUrl;
                return reply.redirect(new URL(destination, ctx.config.authRedirectUrl).toString());
            }
            catch (error) {
                request.log.error({ err: error }, 'oauth callback failed');
                return reply.redirect(`${ctx.config.authRedirectUrl}?auth_error=unexpected`);
            }
        });
    }
    app.get('/v1/auth/me', async (request, reply) => {
        const user = await currentUser(ctx, request);
        if (!user)
            return reply.status(401).send({ error: 'unauthenticated', message: 'Not signed in.' });
        return reply.send({ user });
    });
    app.post('/v1/auth/logout', async (request, reply) => {
        const token = request.cookies[SESSION_COOKIE];
        if (token) {
            // Revoked rather than deleted, so sign-outs remain auditable.
            await ctx.db
                .update(schema.session)
                .set({ revokedAt: new Date() })
                .where(and(eq(schema.session.tokenHash, hashSessionToken(token)), isNull(schema.session.revokedAt)));
        }
        reply.clearCookie(SESSION_COOKIE, { path: '/' });
        return reply.send({ ok: true });
    });
    /** Housekeeping: drop sessions that expired long ago. */
    app.post('/v1/auth/prune-sessions', async (_request, reply) => {
        const result = await ctx.db.execute(sql `DELETE FROM ${schema.session} WHERE expires_at < now() - interval '30 days'`);
        return reply.send({ ok: true, deleted: result.count ?? 0 });
    });
}
//# sourceMappingURL=auth.js.map