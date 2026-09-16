/**
 * Backend to UI translation.
 *
 * The single place where wire shapes become UI shapes, so components never see
 * `response.data.solutions[0].distinctOwnerCount` and no backend-specific
 * reshaping spreads through the tree.
 *
 * Where the backend does not provide something the UI has a slot for, this
 * returns `null` rather than a plausible number. The savings figures are the
 * main case: the backend tracks no token, cost or time data at all, and
 * inventing it would make a demo look like a measurement.
 */

import type {
  WireProblemAuthor,
  WireProblemDetail,
  WireProblemListItem,
  WireSearchHit,
  WireSearchResponse,
  WireSolution,
  WireVerification,
} from './wire'
import type { VerificationStatus } from '../types'

/**
 * Maps the backend's four verification states onto the UI's six badges.
 *
 * The UI distinguishes degrees of verification the backend stores as one state
 * plus a count, so the extra tiers are derived from confirmation breadth —
 * `distinctEnvCount`, which is the same signal the badge itself is built on.
 * Thresholds are presentation only; the backend remains the authority on
 * whether something is verified at all.
 */
export function toVerificationStatus(
  verification: WireVerification,
  distinctEnvCount: number,
): VerificationStatus {
  switch (verification) {
    case 'disputed':
      return 'deprecated'
    case 'unverified':
      return 'unverified'
    case 'corroborated':
      return 'partially_verified'
    case 'verified':
      if (distinctEnvCount >= 10) return 'battle_tested'
      if (distinctEnvCount >= 6) return 'highly_verified'
      return 'verified'
  }
}

/**
 * Savings metrics the UI displays but the backend does not track.
 *
 * Kept as an explicit shape of nulls so the components have something typed to
 * render "not measured" from, instead of each one inventing a placeholder.
 * When the backend grows these fields, this is the only place to change.
 */
export interface Savings {
  tokens: number | null
  costUsd: number | null
  timeMinutes: number | null
}

export const NO_SAVINGS: Savings = { tokens: null, costUsd: null, timeMinutes: null }

export interface UiSolution {
  id: string
  title: string
  body: string
  commands: string | null
  diff: string | null
  rationale: string | null
  status: VerificationStatus
  /** Raw backend state, for callers that need the un-derived value. */
  verification: WireVerification
  replications: number
  successCount: number
  failureCount: number
  /** Percentage, derived from real counts. Null when nothing has been reported. */
  successRate: number | null
  environments: number
  agents: number
  confidence: number
  lastConfirmedAt: string | null
}

/**
 * A byline, ready to render.
 *
 * `label` is resolved here rather than in each component so the fallback order
 * — display name, then handle — is decided once. The handle is kept alongside
 * it because it is the stable identifier: two accounts may share a display
 * name, and only the handle says which one this is.
 */
export interface UiAuthor {
  label: string
  handle: string
  avatarUrl: string | null
  kind: 'human' | 'agent'
  agentName: string | null
  /** Two-letter fallback for when there is no avatar. */
  initials: string
}

export function normalizeAuthor(wire: WireProblemAuthor | null): UiAuthor | null {
  if (!wire) return null
  const label = wire.displayName?.trim() || wire.handle
  return {
    label,
    handle: wire.handle,
    avatarUrl: wire.avatarUrl,
    kind: wire.kind,
    agentName: wire.agentName,
    initials: (label.match(/\p{L}\p{N}*/gu) ?? ['?']).slice(0, 2).map((w) => w[0]!).join(''),
  }
}

export interface UiProblemSummary {
  id: string
  title: string
  statement: string
  tags: string[]
  language: string | null
  solutionCount: number
  status: VerificationStatus
  totalReports: number
  createdAt: string
  savings: Savings
  /** Null when unattributed, or when the endpoint does not return authorship. */
  author: UiAuthor | null
}

export interface UiSearchResult extends UiProblemSummary {
  score: number
  matchedBy: Array<'signature' | 'fts' | 'vector'>
  /** Human-readable reasons, derived from `matchedBy` rather than invented. */
  matchReasons: string[]
  solutions: UiSolution[]
}

export interface UiProblemDetail extends UiProblemSummary {
  normalizedError: string
  signature: string
  solutions: UiSolution[]
}

export function normalizeSolution(wire: WireSolution): UiSolution {
  const total = wire.successCount + wire.failureCount
  return {
    id: wire.id,
    title: wire.title,
    body: wire.body,
    commands: wire.commands,
    diff: wire.diff,
    rationale: wire.rationale,
    status: toVerificationStatus(wire.verification, wire.distinctEnvCount),
    verification: wire.verification,
    replications: total,
    successCount: wire.successCount,
    failureCount: wire.failureCount,
    // Null rather than 0 when untested: "0% success" and "never tried" are very
    // different claims to put in front of someone about to run a command.
    successRate: total > 0 ? Math.round((wire.successCount / total) * 100) : null,
    environments: wire.distinctEnvCount,
    agents: wire.distinctOwnerCount,
    confidence: wire.confidence,
    lastConfirmedAt: wire.lastConfirmedAt,
  }
}

/** Best solution first — the list is already ordered by the backend. */
function strongest(solutions: UiSolution[]): UiSolution | undefined {
  return solutions[0]
}

const MATCH_REASON_LABELS: Record<'signature' | 'fts' | 'vector', string> = {
  signature: 'Exact error signature',
  fts: 'Matching error text',
  vector: 'Semantically similar problem',
}

export function normalizeSearchHit(wire: WireSearchHit): UiSearchResult {
  const solutions = wire.solutions.map(normalizeSolution)
  const best = strongest(solutions)

  return {
    id: wire.problemId,
    title: wire.title,
    statement: wire.statement,
    tags: wire.tags,
    language: null,
    solutionCount: solutions.length,
    status: best?.status ?? 'unverified',
    totalReports: solutions.reduce((n, s) => n + s.replications, 0),
    createdAt: '',
    savings: NO_SAVINGS,
    // The search endpoint returns no authorship — `searchHit` is the contract
    // agents consume over MCP, and it is deliberately about the fix, not who
    // wrote it. Null rather than a guess; the browse endpoints have the byline.
    author: null,
    score: wire.score,
    matchedBy: wire.matchedBy,
    matchReasons: wire.matchedBy.map((m) => MATCH_REASON_LABELS[m]),
    solutions,
  }
}

export interface UiSearchResponse {
  tier: 'signature' | 'hybrid'
  results: UiSearchResult[]
  traceId: string
  latencyMs: number
  degraded: string[]
}

export function normalizeSearchResponse(wire: WireSearchResponse): UiSearchResponse {
  return {
    tier: wire.tier,
    results: wire.hits.map(normalizeSearchHit),
    traceId: wire.traceId,
    latencyMs: wire.latencyMs,
    degraded: wire.degraded ?? [],
  }
}

export function normalizeProblemSummary(wire: WireProblemListItem): UiProblemSummary {
  return {
    id: wire.id,
    title: wire.title,
    statement: wire.statement,
    tags: wire.tags,
    language: wire.language,
    solutionCount: wire.solutionCount,
    // The list endpoint returns no per-solution environment count, so the
    // derived tiers cannot be computed here — 0 keeps it at the base badge
    // rather than guessing upward.
    status: toVerificationStatus(wire.bestVerification, 0),
    totalReports: wire.totalReports,
    createdAt: wire.createdAt,
    savings: NO_SAVINGS,
    author: normalizeAuthor(wire.author),
  }
}

export function normalizeProblemDetail(wire: WireProblemDetail): UiProblemDetail {
  const solutions = wire.solutions.map(normalizeSolution)
  const best = strongest(solutions)

  return {
    ...normalizeProblemSummary(wire),
    status: best?.status ?? toVerificationStatus(wire.bestVerification, 0),
    normalizedError: wire.normalizedError,
    signature: wire.signature,
    solutions,
  }
}

/** Relative time for timestamps, e.g. "2 days ago". */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  // Each entry is how many of the current unit make one of the *next* one, and
  // that next unit's name — dividing by 60 turns seconds into minutes, so the
  // label after that step is 'minute'.
  const units: Array<[number, string]> = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
    [4.35, 'month'],
    [12, 'year'],
  ]

  let value = seconds
  let label = 'second'
  for (const [step, next] of units) {
    if (value < step) break
    value = Math.floor(value / step)
    label = next
  }

  if (label === 'second' && value < 30) return 'just now'
  return `${value} ${label}${value === 1 ? '' : 's'} ago`
}
