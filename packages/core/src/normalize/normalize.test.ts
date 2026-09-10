import { describe, expect, it } from 'vitest';

import { extractCore, isStackFrame } from './frames.js';
import { normalize, signatureOf } from './index.js';
import { redact } from './redact.js';
import { extractVersions } from './versions.js';

describe('redact', () => {
  it('replaces the directory portion of paths but keeps the basename', () => {
    expect(redact('C:\\Users\\ahmed\\proj\\src\\index.ts').text).toBe('<path>/index.ts');
    expect(redact('/home/dana/proj/src/app.ts').text).toBe('<path>/app.ts');
  });

  it('keeps the package name in node_modules paths', () => {
    // The failing dependency is signal; where it happens to live on disk is not.
    const out = redact('/home/dana/app/node_modules/react-dom/index.js').text;
    expect(out).toContain('react-dom');
    expect(out).not.toContain('dana');
  });

  it('unwraps pnpm store paths', () => {
    const out = redact('/app/node_modules/.pnpm/vite@5.0.0/node_modules/vite/bin.js').text;
    expect(out).toContain('vite/bin.js');
    expect(out).not.toContain('.pnpm');
  });

  it('does not mistake bracketed log levels for ANSI codes', () => {
    // A naive ANSI pattern without the ESC prefix eats `[warn]`.
    expect(redact('[warn] something happened').text).toBe('[warn] something happened');
  });

  it('strips real ANSI colour codes', () => {
    expect(redact('\u001b[31merror\u001b[0m').text).toBe('error');
  });

  it('replaces URLs before treating their pathname as a path', () => {
    expect(redact('failed GET https://api.example.com/v1/users/42').text).toBe(
      'failed GET <url>',
    );
  });

  it('normalizes line and column references', () => {
    expect(redact('app.ts:42:17').text).toBe('app.ts:<line>:<col>');
  });

  it('replaces hex addresses, uuids, hashes and timestamps', () => {
    expect(redact('at 0x7ffee4b2').text).toBe('at <addr>');
    expect(redact('id 550e8400-e29b-41d4-a716-446655440000').text).toBe('id <uuid>');
    expect(redact('commit 9a94cc6f2b1').text).toBe('commit <hash>');
    expect(redact('2026-09-09T12:30:00Z started').text).toBe('<timestamp> started');
  });

  it('leaves hex-lettered words alone', () => {
    // `acceded` and `defaced` are made entirely of hex characters.
    expect(redact('the request acceded').text).toBe('the request acceded');
  });

  it('normalizes host ports', () => {
    expect(redact('connect ECONNREFUSED 127.0.0.1:5432').text).toBe(
      'connect ECONNREFUSED <ip>:<port>',
    );
  });

  it('counts what it replaced', () => {
    const { counts } = redact('/a/b/c.ts and /d/e/f.ts');
    expect(counts.posix_path).toBe(2);
  });
});

describe('extractVersions', () => {
  it('reads npm specifiers', () => {
    expect(extractVersions('react@18.2.0')).toContainEqual(
      expect.objectContaining({ subject: 'react', version: '18.2.0' }),
    );
  });

  it('reads python requirements', () => {
    expect(extractVersions('torch==2.4.0')).toContainEqual(
      expect.objectContaining({ subject: 'torch', version: '2.4.0' }),
    );
  });

  it('reads named runtimes', () => {
    expect(extractVersions('running on node v20.11.0')).toContainEqual(
      expect.objectContaining({ subject: 'node', version: '20.11.0' }),
    );
  });

  it('does not emit a bare duplicate of an already-attributed version', () => {
    const found = extractVersions('node v20.11.0');
    expect(found.filter((v) => v.version === '20.11.0')).toHaveLength(1);
  });
});

describe('frames', () => {
  it('recognises frames across ecosystems', () => {
    expect(isStackFrame('    at Module._compile (node:internal/modules)')).toBe(true);
    expect(isStackFrame('  File "/app/main.py", line 12, in <module>')).toBe(true);
    expect(isStackFrame('   3: core::panicking::panic_fmt')).toBe(true);
    expect(isStackFrame('TypeError: x is not a function')).toBe(false);
  });

  it('collapses runaway recursion into a single marker', () => {
    const trace = ['RangeError: Maximum call stack size exceeded', ...Array(500).fill('    at recurse (app.js)')].join('\n');
    const { canonical } = normalize(trace);
    expect(canonical).toContain('repeated frames');
    expect(canonical.split('\n').length).toBeLessThan(10);
  });

  it('finds the error line buried in a build log', () => {
    const core = extractCore(
      ['> build', 'transforming...', '✓ 41 modules', 'error TS2345: Argument of type X', '    at foo (bar.ts)'].join('\n'),
    );
    expect(core).toContain('TS2345');
    expect(core).not.toContain('transforming');
  });
});

describe('normalize', () => {
  it('produces the same signature for the same error on different machines', () => {
    // This is the property Tier 0 rests on. If it fails, the cache never hits.
    const windows = [
      "Error: Cannot find module 'lodash'",
      '    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)',
      '    at C:\\Users\\ahmed\\projects\\shop\\src\\index.ts:12:9',
    ].join('\n');

    const linux = [
      "Error: Cannot find module 'lodash'",
      '    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)',
      '    at /home/dana/work/storefront/src/index.ts:88:3',
    ].join('\n');

    expect(normalize(windows).signature).toBe(normalize(linux).signature);
  });

  it('matches a dependency stack frame across Windows and Linux', () => {
    // Regression: the node_modules rule stripped the prefix but left the
    // remainder with its original separators, so Linux produced
    // `ioredis/built/Redis.js` and Windows `ioredis\built\Redis.js`. Different
    // text, different hash — the fast path silently missed in exactly the
    // cross-platform case it exists for.
    const linux = [
      'Error: connect ETIMEDOUT 10.0.3.14:6379',
      '    at Socket.<anonymous> (/home/sam/svc/node_modules/ioredis/built/Redis.js:168:41)',
      '    at Socket.emit (node:events:519:28)',
    ].join('\n');

    const windows = [
      'Error: connect ETIMEDOUT 192.168.4.22:6379',
      '    at Socket.<anonymous> (C:\\Users\\dana\\projects\\svc\\node_modules\\ioredis\\built\\Redis.js:902:17)',
      '    at Socket.emit (node:events:519:28)',
    ].join('\n');

    expect(normalize(windows).signature).toBe(normalize(linux).signature);
    // The failing package must survive — it is the most identifying token here.
    expect(normalize(windows).canonical).toContain('ioredis');
  });

  it('keeps the full relative path under node_modules intact', () => {
    const { canonical } = normalize('at (/app/node_modules/ioredis/built/Redis.js:1:2)');
    expect(canonical).toContain('ioredis/built/Redis.js');
  });

  it('gives different errors different signatures', () => {
    expect(normalize("Error: Cannot find module 'lodash'").signature).not.toBe(
      normalize("Error: Cannot find module 'express'").signature,
    );
  });

  it('is stable against stack depth below the top frames', () => {
    const shallow = ['TypeError: x is not a function', '    at a (a.js)', '    at b (b.js)', '    at c (c.js)'].join('\n');
    const deep = [shallow, '    at d (d.js)', '    at e (e.js)', '    at f (f.js)'].join('\n');

    expect(normalize(shallow).signature).toBe(normalize(deep).signature);
  });

  it('is case-insensitive for the signature but preserves case in canonical', () => {
    expect(normalize('ENOENT: no such file').signature).toBe(
      normalize('enoent: No Such File').signature,
    );
    expect(normalize('ENOENT: no such file').canonical).toContain('ENOENT');
  });

  it('surfaces versions and redaction counts', () => {
    const result = normalize('torch==2.4.0 failed at /app/src/train.py:10:2');
    expect(result.versions).toContainEqual(
      expect.objectContaining({ subject: 'torch', version: '2.4.0' }),
    );
    expect(result.redactions.line_col).toBe(1);
  });

  it('truncates pathological input but still signs the head', () => {
    const huge = ['Error: boom', ...Array(5000).fill('filler line with distinct text')].join('\n');
    const result = normalize(huge);
    expect(result.truncated).toBe(true);
    // Truncation must not change the identity of the error at the top.
    expect(result.signature).toBe(normalize('Error: boom').signature);
  });

  it('handles empty and whitespace-only input without throwing', () => {
    expect(normalize('').signature).toBe(signatureOf(''));
    expect(normalize('   \n\n  ').core).toBe('');
  });
});
