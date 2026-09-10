/**
 * OAuth provider definitions and the pieces of the flow that are pure logic.
 *
 * Kept out of the route handlers so the security-critical parts — CSRF state
 * signing, token hashing — are testable without standing up an HTTP server or
 * talking to a provider.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type OAuthProvider = 'github' | 'google';

export interface ProviderConfig {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly userUrl: string;
  readonly scope: string;
  /** Some providers need a second call to get a verified email. */
  readonly emailUrl?: string;
}

export const PROVIDERS: Readonly<Record<OAuthProvider, ProviderConfig>> = {
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    // GitHub omits a private address from /user, so emails are fetched
    // separately. Without it, accounts cannot be linked across providers.
    emailUrl: 'https://api.github.com/user/emails',
    scope: 'read:user user:email',
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
};

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

// ---------------------------------------------------------------------------
// CSRF state
// ---------------------------------------------------------------------------

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

const STATE_TTL_MS = 10 * 60 * 1000;

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createState(secret: string, returnTo?: string): string {
  const payload: StatePayload = {
    nonce: randomBytes(16).toString('base64url'),
    issuedAt: Date.now(),
    ...(returnTo ? { returnTo } : {}),
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export interface StateVerification {
  readonly valid: boolean;
  readonly payload?: StatePayload;
  readonly reason?: string;
}

export function verifyState(state: string, secret: string): StateVerification {
  const [body, signature] = state.split('.');
  if (!body || !signature) return { valid: false, reason: 'malformed state' };

  const expected = sign(body, secret);

  // Constant-time compare. Length must match first, because timingSafeEqual
  // throws on differing lengths — which would itself leak length information.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad signature' };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  } catch {
    return { valid: false, reason: 'unreadable payload' };
  }

  if (typeof payload.issuedAt !== 'number' || Date.now() - payload.issuedAt > STATE_TTL_MS) {
    return { valid: false, reason: 'state expired' };
  }

  return { valid: true, payload };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionToken {
  /** Given to the browser. Never stored. */
  readonly token: string;
  /** Stored. A leaked database must not hand over live sessions. */
  readonly tokenHash: string;
}

export function createSessionToken(): SessionToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  // Plain SHA-256 rather than a password hash: the token is already 256 bits of
  // entropy, so there is nothing to brute-force and nothing to slow down.
  return createHash('sha256').update(token).digest('hex');
}

export const SESSION_COOKIE = 'ao_session';
export const SESSION_TTL_DAYS = 30;

// ---------------------------------------------------------------------------
// Redirect safety
// ---------------------------------------------------------------------------

/**
 * Rejects a `returnTo` that would send the browser somewhere else entirely.
 *
 * An open redirect on a login route is a phishing primitive: sign in on the
 * real site, get bounced to a copy of it, and the address bar looked right the
 * whole way.
 */
export function isSafeReturnTo(candidate: string | undefined, allowedOrigin: string): boolean {
  if (!candidate) return false;

  try {
    const target = new URL(candidate, allowedOrigin);
    return target.origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

/**
 * Turns a provider's user payload into our shape.
 *
 * Defensive by necessity — these are third-party responses, and a provider
 * changing a field name should degrade the profile, not crash the callback.
 */
export function normalizeIdentity(
  provider: OAuthProvider,
  user: Record<string, unknown>,
  emails?: Array<Record<string, unknown>>,
): ProviderIdentity | null {
  if (provider === 'github') {
    const id = user.id;
    if (id === undefined || id === null) return null;

    // Prefer the primary verified address; fall back to any verified one.
    const verified = (emails ?? []).filter((e) => e.verified === true);
    const primary = verified.find((e) => e.primary === true) ?? verified[0];
    const email = typeof primary?.email === 'string' ? primary.email : null;

    return {
      provider,
      providerUserId: String(id),
      email,
      emailVerified: email !== null,
      displayName:
        (typeof user.name === 'string' && user.name) ||
        (typeof user.login === 'string' ? user.login : null),
      avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
    };
  }

  const sub = user.sub;
  if (typeof sub !== 'string') return null;

  return {
    provider,
    providerUserId: sub,
    email: typeof user.email === 'string' ? user.email : null,
    emailVerified: user.email_verified === true,
    displayName: typeof user.name === 'string' ? user.name : null,
    avatarUrl: typeof user.picture === 'string' ? user.picture : null,
  };
}

/**
 * Builds a handle from a display name or email.
 *
 * The handle is the independence key used when counting verifications, so it
 * must be unique — the caller appends a discriminator on collision.
 */
export function suggestHandle(identity: ProviderIdentity): string {
  const source =
    identity.displayName?.trim() || identity.email?.split('@')[0] || `user-${identity.providerUserId}`;

  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return slug || `user-${identity.providerUserId.slice(0, 8)}`;
}
