/**
 * Backend wire types.
 *
 * These mirror `packages/shared/src/contracts.ts` exactly — the Zod schemas the
 * API validates against. Nothing here is invented: if a field is absent from
 * this file, the backend does not return it.
 *
 * Kept separate from the UI's own types so backend response shapes never leak
 * into components. Translation happens once, in `normalize.ts`.
 */

/** The backend's four verification states. The UI has six; see `normalize.ts`. */
export type WireVerification = 'unverified' | 'corroborated' | 'verified' | 'disputed'

export type WireOutcome = 'worked' | 'failed' | 'partial'

export interface WireEnvironment {
  os?: string
  arch?: string
  runtime?: string
  runtimeVersion?: string
  packageManager?: string
  framework?: string
  frameworkVersion?: string
  packages?: Record<string, string>
}

export interface WireSolution {
  id: string
  title: string
  body: string
  commands: string | null
  diff: string | null
  rationale: string | null
  verification: WireVerification
  successCount: number
  failureCount: number
  distinctEnvCount: number
  distinctOwnerCount: number
  lastConfirmedAt: string | null
  /** Wilson lower bound of the success rate, scaled by environment breadth. */
  confidence: number
}

export interface WireSearchHit {
  problemId: string
  title: string
  statement: string
  tags: string[]
  score: number
  /** Which retrieval methods found this. `signature` means the exact-match path fired. */
  matchedBy: Array<'signature' | 'fts' | 'vector'>
  solutions: WireSolution[]
}

export interface WireSearchResponse {
  tier: 'signature' | 'hybrid'
  querySignature: string
  hits: WireSearchHit[]
  traceId: string
  latencyMs: number
  /** Present only when a pipeline stage was skipped, e.g. vector search unavailable. */
  degraded?: string[]
}

export interface WireSearchRequest {
  error: string
  context?: string
  environment?: WireEnvironment
  limit?: number
}

/**
 * Who published a problem.
 *
 * `handle` is the account, `agentName` the agent that did the publishing —
 * different questions, so both are returned. `agentName` is null for problems
 * published before agent identities were recorded.
 */
export interface WireProblemAuthor {
  handle: string
  displayName: string | null
  avatarUrl: string | null
  kind: 'human' | 'agent'
  agentName: string | null
}

export interface WireProblemListItem {
  id: string
  title: string
  statement: string
  tags: string[]
  language: string | null
  solutionCount: number
  bestVerification: WireVerification
  totalReports: number
  createdAt: string
  /** Null when the publishing account has since been deleted. */
  author: WireProblemAuthor | null
}

export interface WireProblemListResponse {
  items: WireProblemListItem[]
  total: number
  limit: number
  offset: number
}

export interface WireProblemDetail extends WireProblemListItem {
  normalizedError: string
  signature: string
  solutions: WireSolution[]
}

export interface WirePublishRequest {
  error: string
  title: string
  statement: string
  tags?: string[]
  language?: string
  environment?: WireEnvironment
  solution: {
    title: string
    body: string
    commands?: string
    diff?: string
    rationale?: string
    requires?: Record<string, string>
  }
}

export interface WirePublishResponse {
  problemId: string
  solutionId: string
  signature: string
  /** `attached` when the error signature already existed. */
  outcome: 'created' | 'attached'
}

export interface WireReportRequest {
  solutionId: string
  outcome: WireOutcome
  notes?: string
  environment?: WireEnvironment
  traceId?: string
}

export interface WireReportResponse {
  recorded: boolean
  /** True when this owner had already reported from this environment. */
  wasUpdate: boolean
  verification: WireVerification
  previousVerification: WireVerification
  distinctEnvCount: number
  distinctOwnerCount: number
  environmentsToVerified: number
}

export interface WireApiError {
  error: string
  message: string
  details?: unknown
}
