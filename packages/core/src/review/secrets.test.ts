import { describe, expect, it } from 'vitest';

import { redactSecrets, scanForSecrets, shannonEntropy } from './secrets.js';

/** Assembled at runtime so this file is not itself a credential-shaped string. */
const fakeAws = `AKIA${'Q7RJ2MNVXPLD4KE1'}`;
const fakeGithub = `ghp_${'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5'}`;
const fakeOpenAi = `sk-${'proj-'}${'kQ2mZ8xR4tV6yB1nD3fH5jL7pS9wA0cE2gI4'}`;

describe('scanForSecrets — blocks real credentials', () => {
  it('finds an AWS access key', () => {
    const result = scanForSecrets(`export AWS_ACCESS_KEY_ID=${fakeAws}`);
    expect(result.blocked).toBe(true);
    expect(result.findings[0]?.rule).toBe('aws_access_key');
  });

  it('finds a GitHub token', () => {
    expect(scanForSecrets(`token: ${fakeGithub}`).blocked).toBe(true);
  });

  it('finds an OpenAI-style key', () => {
    expect(scanForSecrets(`OPENAI_API_KEY=${fakeOpenAi}`).blocked).toBe(true);
  });

  it('finds a private key block', () => {
    expect(scanForSecrets('-----BEGIN RSA PRIVATE KEY-----').blocked).toBe(true);
  });

  it('finds a JWT', () => {
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${'eyJzdWIiOiIxMjM0NTY3ODkwIn0'}.${'SflKxwRJSMeKKF2QT4fwpMeJf36P'}`;
    expect(scanForSecrets(jwt).blocked).toBe(true);
  });

  it('finds a password inside a connection string', () => {
    const result = scanForSecrets('postgresql://admin:hunter2is9@db.example.com/app');
    expect(result.blocked).toBe(true);
    expect(result.findings.some((f) => f.rule === 'connection_string')).toBe(true);
  });

  it('finds an assigned secret', () => {
    expect(scanForSecrets(`api_key = "j3K9mQ2xR7tV4yB1"`).blocked).toBe(true);
  });

  it('never puts the secret itself in the finding', () => {
    const { findings } = scanForSecrets(`AWS_ACCESS_KEY_ID=${fakeAws}`);
    for (const finding of findings) {
      expect(finding.preview).not.toContain(fakeAws);
      expect(JSON.stringify(finding)).not.toContain(fakeAws);
    }
  });
});

describe('scanForSecrets — leaves ordinary text alone', () => {
  it('ignores a normal stack trace', () => {
    const trace = [
      "Error: Cannot find module 'lodash'",
      '    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)',
      '    at Module._load (node:internal/modules/cjs/loader:986:27)',
    ].join('\n');
    expect(scanForSecrets(trace).blocked).toBe(false);
  });

  it('ignores placeholders', () => {
    expect(scanForSecrets('OPENAI_API_KEY=sk-YOUR_KEY_HERE').blocked).toBe(false);
    expect(scanForSecrets('AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX').blocked).toBe(false);
    expect(scanForSecrets('password: "changeme"').blocked).toBe(false);
  });

  it('ignores environment variable references', () => {
    // A reference is the correct thing to publish, not a leak.
    expect(scanForSecrets('password: "process.env.DB_PASSWORD"').blocked).toBe(false);
  });

  it('ignores git SHAs and content hashes', () => {
    const sha = 'a'.repeat(0) + '9f2c1e7b4a6d8035f1c2b3e4d5a6b7c8d9e0f1a2';
    expect(scanForSecrets(`commit ${sha}`).blocked).toBe(false);
  });

  it('ignores a connection string with a placeholder password', () => {
    expect(scanForSecrets('postgresql://user:password@localhost:5432/db').blocked).toBe(false);
  });
});

describe('scanForSecrets — personal paths', () => {
  it('flags a real home directory but does not block', () => {
    const result = scanForSecrets('at C:\\Users\\ahmed\\projects\\app\\index.js');
    expect(result.blocked).toBe(false);
    expect(result.findings.some((f) => f.rule === 'home_directory')).toBe(true);
  });

  it('ignores service and CI account names', () => {
    // These identify a machine, not a person.
    for (const path of ['/home/runner/work', '/home/root/app', '/Users/admin/x']) {
      const result = scanForSecrets(path);
      expect(result.findings.some((f) => f.rule === 'home_directory')).toBe(false);
    }
  });
});

describe('redactSecrets', () => {
  it('replaces a finding with a marker', () => {
    const redacted = redactSecrets(`key=${fakeAws}`);
    expect(redacted).not.toContain(fakeAws);
    expect(redacted).toContain('<redacted:aws_access_key>');
  });

  it('leaves clean text untouched', () => {
    const clean = 'Error: Cannot find module';
    expect(redactSecrets(clean)).toBe(clean);
  });
});

describe('shannonEntropy', () => {
  it('rates random strings above English words', () => {
    expect(shannonEntropy('kQ2mZ8xR4tV6yB1nD3fH5jL7pS9wA0cE')).toBeGreaterThan(
      shannonEntropy('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
  });

  it('handles the empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });
});
