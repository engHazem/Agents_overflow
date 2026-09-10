/**
 * OAuth provider definitions and the pieces of the flow that are pure logic.
 *
 * Kept out of the route handlers so the security-critical parts — CSRF state
 * signing, token hashing — are testable without standing up an HTTP server or
 * talking to a provider.
 */
export type OAuthProvider = 'github' | 'google';
export interface ProviderConfig {
    readonly authorizeUrl: string;
    readonly tokenUrl: string;
    readonly userUrl: string;
    readonly scope: string;
    /** Some providers need a second call to get a verified email. */
    readonly emailUrl?: string;
}
export declare const PROVIDERS: Readonly<Record<OAuthProvider, ProviderConfig>>;
/**
 * A normalized identity, whatever the provider called its fields.
 */
export interface ProviderIdentity {
    readonly provider: OAuthProvider;
    readonly providerUserId: string;
    readonly email: string | null;
    /**
     * Whether the provider says the address is verified.
     *
     * Load-bearing: accounts are linked across providers by email, so an
     * unverified address would let anyone claim someone else's account by
     * signing up elsewhere with their address.
     */
    readonly emailVerified: boolean;
    readonly displayName: string | null;
    readonly avatarUrl: string | null;
}
/**
 * The `state` parameter, signed rather than stored.
 *
 * OAuth callbacks are attacker-triggerable: anyone can send a victim's browser
 * to our callback URL with a code of their choosing, logging the victim into
 * the attacker's account. `state` defends against that, but only if we can tell
 * ours from a forgery — hence an HMAC rather than an opaque random string we
 * would otherwise have to persist and clean up.
 *
 * Encodes the issue time so a state cannot be replayed indefinitely.
 */
export interface StatePayload {
    readonly nonce: string;
    readonly issuedAt: number;
    /** Where to send the browser after success. Validated by the caller. */
    readonly returnTo?: string | undefined;
}
export declare function createState(secret: string, returnTo?: string): string;
export interface StateVerification {
    readonly valid: boolean;
    readonly payload?: StatePayload;
    readonly reason?: string;
}
export declare function verifyState(state: string, secret: string): StateVerification;
export interface SessionToken {
    /** Given to the browser. Never stored. */
    readonly token: string;
    /** Stored. A leaked database must not hand over live sessions. */
    readonly tokenHash: string;
}
export declare function createSessionToken(): SessionToken;
export declare function hashSessionToken(token: string): string;
export declare const SESSION_COOKIE = "ao_session";
export declare const SESSION_TTL_DAYS = 30;
/**
 * Rejects a `returnTo` that would send the browser somewhere else entirely.
 *
 * An open redirect on a login route is a phishing primitive: sign in on the
 * real site, get bounced to a copy of it, and the address bar looked right the
 * whole way.
 */
export declare function isSafeReturnTo(candidate: string | undefined, allowedOrigin: string): boolean;
/**
 * Turns a provider's user payload into our shape.
 *
 * Defensive by necessity — these are third-party responses, and a provider
 * changing a field name should degrade the profile, not crash the callback.
 */
export declare function normalizeIdentity(provider: OAuthProvider, user: Record<string, unknown>, emails?: Array<Record<string, unknown>>): ProviderIdentity | null;
/**
 * Builds a handle from a display name or email.
 *
 * The handle is the independence key used when counting verifications, so it
 * must be unique — the caller appends a discriminator on collision.
 */
export declare function suggestHandle(identity: ProviderIdentity): string;
//# sourceMappingURL=oauth.d.ts.map