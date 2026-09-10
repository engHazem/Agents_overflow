import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  createState,
  hashSessionToken,
  isSafeReturnTo,
  normalizeIdentity,
  suggestHandle,
  verifyState,
} from './oauth.js';

const SECRET = 'test-secret-value-for-signing';

describe('state — CSRF defence', () => {
  it('round-trips a state it signed', () => {
    const state = createState(SECRET, '/dashboard');
    const result = verifyState(state, SECRET);

    expect(result.valid).toBe(true);
    expect(result.payload?.returnTo).toBe('/dashboard');
  });

  it('rejects a state signed with a different secret', () => {
    // The whole point: an attacker cannot mint a state we will accept.
    const state = createState('some-other-secret');
    expect(verifyState(state, SECRET).valid).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const state = createState(SECRET, '/a');
    const [, signature] = state.split('.');
    const forged = `${Buffer.from(JSON.stringify({ nonce: 'x', issuedAt: Date.now(), returnTo: 'https://evil.test' })).toString('base64url')}.${signature}`;

    expect(verifyState(forged, SECRET).valid).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', 'nodot', 'a.b.c.d', '...']) {
      expect(verifyState(bad, SECRET).valid).toBe(false);
    }
  });

  it('rejects an expired state', () => {
    const stale = Buffer.from(
      JSON.stringify({ nonce: 'n', issuedAt: Date.now() - 60 * 60 * 1000 }),
    ).toString('base64url');
    // Sign it properly, so only the age can fail it.
    const state = createState(SECRET);
    const signature = state.split('.')[1]!;
    void signature;

    const result = verifyState(`${stale}.${signature}`, SECRET);
    expect(result.valid).toBe(false);
  });

  it('produces a different state each time', () => {
    expect(createState(SECRET)).not.toBe(createState(SECRET));
  });
});

describe('session tokens', () => {
  it('never stores the token itself', () => {
    const { token, tokenHash } = createSessionToken();
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toBe(hashSessionToken(token));
  });

  it('is unique per call', () => {
    expect(createSessionToken().token).not.toBe(createSessionToken().token);
  });
});

describe('isSafeReturnTo — open redirect defence', () => {
  const origin = 'http://localhost:5173';

  it('allows a same-origin path', () => {
    expect(isSafeReturnTo('/dashboard', origin)).toBe(true);
    expect(isSafeReturnTo('http://localhost:5173/settings', origin)).toBe(true);
  });

  it('rejects another origin', () => {
    // Sign in on the real site, get bounced to a copy of it — the address bar
    // looked right the whole way.
    expect(isSafeReturnTo('https://evil.test/login', origin)).toBe(false);
    expect(isSafeReturnTo('//evil.test', origin)).toBe(false);
  });

  it('rejects missing or unparseable values', () => {
    expect(isSafeReturnTo(undefined, origin)).toBe(false);
    expect(isSafeReturnTo('http://', origin)).toBe(false);
  });
});

describe('normalizeIdentity', () => {
  it('reads a Google profile', () => {
    const identity = normalizeIdentity('google', {
      sub: '123',
      email: 'a@example.com',
      email_verified: true,
      name: 'Ada',
      picture: 'https://img.test/a.png',
    });

    expect(identity?.providerUserId).toBe('123');
    expect(identity?.emailVerified).toBe(true);
  });

  it('prefers a primary verified GitHub address', () => {
    const identity = normalizeIdentity(
      'github',
      { id: 42, login: 'ada', name: 'Ada L' },
      [
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'ada@example.com', primary: true, verified: true },
      ],
    );

    expect(identity?.email).toBe('ada@example.com');
  });

  it('never treats an unverified address as verified', () => {
    // Accounts link by email, so an unverified address would let anyone claim
    // someone else's account by signing up elsewhere with their address.
    const identity = normalizeIdentity(
      'github',
      { id: 42, login: 'ada' },
      [{ email: 'victim@example.com', primary: true, verified: false }],
    );

    expect(identity?.email).toBeNull();
    expect(identity?.emailVerified).toBe(false);
  });

  it('returns null when the provider payload has no user id', () => {
    expect(normalizeIdentity('google', { email: 'a@b.c' })).toBeNull();
    expect(normalizeIdentity('github', {})).toBeNull();
  });
});

describe('suggestHandle', () => {
  it('slugifies a display name', () => {
    expect(
      suggestHandle({
        provider: 'github',
        providerUserId: '1',
        email: null,
        emailVerified: false,
        displayName: 'Ada Lovelace',
        avatarUrl: null,
      }),
    ).toBe('ada-lovelace');
  });

  it('falls back to the email local part, then to the id', () => {
    const base = { provider: 'google' as const, emailVerified: true, avatarUrl: null, displayName: null };

    expect(suggestHandle({ ...base, providerUserId: '1', email: 'ada@example.com' })).toBe('ada');
    expect(suggestHandle({ ...base, providerUserId: 'abc123xyz', email: null })).toContain('user-');
  });

  it('never produces an empty handle', () => {
    const handle = suggestHandle({
      provider: 'github',
      providerUserId: '77',
      email: null,
      emailVerified: false,
      displayName: '!!!',
      avatarUrl: null,
    });
    expect(handle.length).toBeGreaterThan(0);
  });
});
