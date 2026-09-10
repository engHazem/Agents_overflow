/**
 * Environment fingerprinting.
 *
 * `envHash` is what makes "N distinct environments" countable. Two agents on
 * genuinely identical setups must collapse to one fingerprint, or a solution
 * could earn its badge from three copies of the same machine.
 */

import { createHash } from 'node:crypto';

export interface EnvironmentInput {
  readonly os?: string | undefined;
  readonly arch?: string | undefined;
  readonly runtime?: string | undefined;
  readonly runtimeVersion?: string | undefined;
  readonly packageManager?: string | undefined;
  readonly framework?: string | undefined;
  readonly frameworkVersion?: string | undefined;
  readonly packages?: Record<string, string> | undefined;
}

/**
 * Versions are reduced to major.minor before hashing.
 *
 * A patch bump is almost never what distinguishes one environment from another
 * for the purpose of "does this fix generalize", and hashing the full patch
 * version would fragment the environment space so finely that the distinct
 * count inflates and the badge becomes trivial to farm by upgrading a
 * dependency three times.
 */
function coarseVersion(version: string | undefined): string {
  if (!version) return '';
  const match = /^(\d+)(?:\.(\d+))?/.exec(version.trim().replace(/^v/i, ''));
  if (!match) return version.trim().toLowerCase();
  return match[2] === undefined ? match[1]! : `${match[1]}.${match[2]}`;
}

function normalizeField(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Stable, order-independent fingerprint of an environment. */
export function environmentHash(input: EnvironmentInput): string {
  const packages = Object.entries(input.packages ?? {})
    .map(([name, version]) => [name.trim().toLowerCase(), coarseVersion(version)] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  // A fixed field order makes the hash independent of key order in the payload.
  const parts = [
    normalizeField(input.os),
    normalizeField(input.arch),
    normalizeField(input.runtime),
    coarseVersion(input.runtimeVersion),
    normalizeField(input.packageManager),
    normalizeField(input.framework),
    coarseVersion(input.frameworkVersion),
    packages.map(([n, v]) => `${n}@${v}`).join(','),
  ];

  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

/**
 * How similar two environments are, 0..1. Feeds the `env_match` term of the
 * blend (DESIGN.md §3.8) — a boost, never a filter, because the most valuable
 * results are frequently the cross-environment ones (§3.5).
 */
export function environmentSimilarity(a: EnvironmentInput, b: EnvironmentInput): number {
  const comparisons: [string, string][] = [
    [normalizeField(a.os), normalizeField(b.os)],
    [normalizeField(a.runtime), normalizeField(b.runtime)],
    [coarseVersion(a.runtimeVersion), coarseVersion(b.runtimeVersion)],
    [normalizeField(a.framework), normalizeField(b.framework)],
    [coarseVersion(a.frameworkVersion), coarseVersion(b.frameworkVersion)],
  ];

  // Fields neither side reported say nothing either way, so they are excluded
  // rather than counted as agreement.
  const known = comparisons.filter(([x, y]) => x !== '' || y !== '');
  if (known.length === 0) return 0;

  const matches = known.filter(([x, y]) => x !== '' && x === y).length;
  return matches / known.length;
}
