import { describe, expect, it } from 'vitest';

import { environmentHash, environmentSimilarity } from './environment.js';
import { normalizeRrfScores, reciprocalRankFusion } from './fusion.js';
import {
  confidenceScore,
  environmentsToVerified,
  verificationStateFor,
  wilsonLowerBound,
} from './verification.js';

describe('wilsonLowerBound', () => {
  it('ranks a large sample above a lucky small one', () => {
    // The whole reason for not using a raw success rate: 1/1 is 100%, 47/50 is
    // 94%, and ranking the first higher would float every untested guess.
    expect(wilsonLowerBound(47, 50)).toBeGreaterThan(wilsonLowerBound(1, 1));
  });

  it('grows as confirmations accumulate at the same rate', () => {
    expect(wilsonLowerBound(20, 20)).toBeGreaterThan(wilsonLowerBound(5, 5));
  });

  it('handles the empty case', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });
});

describe('confidenceScore', () => {
  it('rewards breadth over volume', () => {
    const narrow = confidenceScore({
      successCount: 10,
      failureCount: 0,
      partialCount: 0,
      distinctEnvCount: 1,
      distinctOwnerCount: 1,
    });
    const broad = confidenceScore({
      successCount: 3,
      failureCount: 0,
      partialCount: 0,
      distinctEnvCount: 3,
      distinctOwnerCount: 3,
    });

    // Ten successes on one machine says it works there; three across three
    // environments says it generalizes, which is what a fourth agent needs.
    expect(broad).toBeGreaterThan(narrow);
  });

  it('is zero with no reports', () => {
    expect(
      confidenceScore({
        successCount: 0,
        failureCount: 0,
        partialCount: 0,
        distinctEnvCount: 0,
        distinctOwnerCount: 0,
      }),
    ).toBe(0);
  });

  it('stays within 0..1', () => {
    const score = confidenceScore({
      successCount: 500,
      failureCount: 0,
      partialCount: 0,
      distinctEnvCount: 200,
      distinctOwnerCount: 200,
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('verificationStateFor', () => {
  const base = { successCount: 0, failureCount: 0, partialCount: 0, distinctEnvCount: 0, distinctOwnerCount: 0 };

  it('promotes through corroborated to verified', () => {
    expect(verificationStateFor({ ...base, successCount: 1, distinctEnvCount: 1, distinctOwnerCount: 1 })).toBe('unverified');
    expect(verificationStateFor({ ...base, successCount: 2, distinctEnvCount: 2, distinctOwnerCount: 2 })).toBe('corroborated');
    expect(verificationStateFor({ ...base, successCount: 3, distinctEnvCount: 3, distinctOwnerCount: 3 })).toBe('verified');
  });

  it('does not verify on environment breadth from a single account', () => {
    // One party spinning up three environments is one party's word, not
    // corroboration. Independence has to hold on both axes.
    expect(
      verificationStateFor({ ...base, successCount: 3, distinctEnvCount: 3, distinctOwnerCount: 1 }),
    ).toBe('unverified');
  });

  it('lets disputed override an earned badge', () => {
    // A solution that used to work and now fails is the most important thing to
    // surface, not something to hide behind a badge it earned earlier.
    expect(
      verificationStateFor({
        ...base,
        successCount: 3,
        failureCount: 6,
        distinctEnvCount: 3,
        distinctOwnerCount: 3,
      }),
    ).toBe('disputed');
  });

  it('reports how far a solution is from the badge', () => {
    expect(environmentsToVerified({ ...base, distinctEnvCount: 1, distinctOwnerCount: 1 })).toBe(2);
    expect(environmentsToVerified({ ...base, distinctEnvCount: 5, distinctOwnerCount: 5 })).toBe(0);
  });
});

describe('reciprocalRankFusion', () => {
  it('ranks agreement above a single strong hit', () => {
    // The defining property: `b` places 2nd and 3rd, `a` places 1st in one list
    // and nowhere in the other. Agreement between two judges that fail in
    // uncorrelated ways beats confidence from one.
    const fused = reciprocalRankFusion({
      fts: ['a', 'b', 'c'],
      vector: ['d', 'e', 'b'],
    });

    expect(fused[0]?.id).toBe('b');
    expect(fused[0]?.matchedBy).toEqual(['fts', 'vector']);
  });

  it('records the rank from each list', () => {
    const fused = reciprocalRankFusion({ fts: ['x'], vector: ['y', 'x'] });
    const x = fused.find((c) => c.id === 'x');
    expect(x?.ranks).toEqual({ fts: 1, vector: 2 });
  });

  it('tolerates a missing list, which is the vector-unavailable fallback', () => {
    const fused = reciprocalRankFusion({ fts: ['a', 'b'] });
    expect(fused.map((c) => c.id)).toEqual(['a', 'b']);
    expect(fused[0]?.matchedBy).toEqual(['fts']);
  });

  it('is deterministic when scores tie', () => {
    const first = reciprocalRankFusion({ fts: ['a'], vector: ['b'] });
    const second = reciprocalRankFusion({ fts: ['a'], vector: ['b'] });
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });

  it('normalizes scores into 0..1 without reordering', () => {
    const fused = reciprocalRankFusion({ fts: ['a', 'b'], vector: ['a'] });
    const normalized = normalizeRrfScores(fused);
    expect(normalized.get('a')).toBe(1);
    expect(normalized.get('b')!).toBeLessThan(1);
  });
});

describe('normalizeRrfScores', () => {
  it('uses the full 0..1 range, not just the top of it', () => {
    // Regression: dividing by the maximum left the whole set compressed into
    // roughly 0.76..1.0, which after the relevance weight was a smaller spread
    // than the confidence term could swing — so verification evidence outvoted
    // relevance rather than breaking ties within it.
    const fused = reciprocalRankFusion({
      fts: ['a', 'b', 'c', 'd', 'e'],
      vector: ['a', 'b', 'c', 'd', 'e'],
    });

    const values = [...normalizeRrfScores(fused).values()].sort((x, y) => y - x);

    expect(values[0]).toBe(1);
    expect(values[values.length - 1]).toBe(0);
  });

  it('preserves ordering', () => {
    const fused = reciprocalRankFusion({ fts: ['first', 'second', 'third'] });
    const scores = normalizeRrfScores(fused);

    expect(scores.get('first')!).toBeGreaterThan(scores.get('second')!);
    expect(scores.get('second')!).toBeGreaterThan(scores.get('third')!);
  });

  it('treats a single candidate as maximally relevant', () => {
    const fused = reciprocalRankFusion({ fts: ['only'] });
    expect(normalizeRrfScores(fused).get('only')).toBe(1);
  });
});

describe('environmentHash', () => {
  it('is independent of key order', () => {
    expect(environmentHash({ os: 'linux', runtime: 'node' })).toBe(
      environmentHash({ runtime: 'node', os: 'linux' }),
    );
  });

  it('ignores patch versions', () => {
    // Otherwise the badge could be farmed by bumping a patch version three times.
    expect(environmentHash({ runtime: 'node', runtimeVersion: '20.1.4' })).toBe(
      environmentHash({ runtime: 'node', runtimeVersion: '20.1.9' }),
    );
  });

  it('separates genuinely different environments', () => {
    expect(environmentHash({ os: 'linux' })).not.toBe(environmentHash({ os: 'windows' }));
    expect(environmentHash({ runtime: 'node', runtimeVersion: '20.1' })).not.toBe(
      environmentHash({ runtime: 'node', runtimeVersion: '22.1' }),
    );
  });

  it('is case and whitespace insensitive', () => {
    expect(environmentHash({ os: ' Linux ' })).toBe(environmentHash({ os: 'linux' }));
  });
});

describe('environmentSimilarity', () => {
  it('is 1 for identical known fields and 0 when nothing is known', () => {
    expect(environmentSimilarity({ os: 'linux' }, { os: 'linux' })).toBe(1);
    expect(environmentSimilarity({}, {})).toBe(0);
  });

  it('ignores fields neither side reported', () => {
    // Absent on both sides is not agreement, so it must not inflate the score.
    expect(environmentSimilarity({ os: 'linux' }, { os: 'windows' })).toBe(0);
  });

  it('scores partial overlap between the extremes', () => {
    const score = environmentSimilarity(
      { os: 'linux', runtime: 'node', framework: 'vite' },
      { os: 'linux', runtime: 'node', framework: 'next' },
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});
