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
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from './context.js';
export interface SessionUser {
    readonly accountId: string;
    readonly handle: string;
    readonly displayName: string | null;
    readonly email: string | null;
    readonly avatarUrl: string | null;
}
/** Resolves the signed-in user, or null. Never throws. */
export declare function currentUser(ctx: AppContext, request: FastifyRequest): Promise<SessionUser | null>;
export declare function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void>;
//# sourceMappingURL=auth.d.ts.map