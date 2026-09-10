/**
 * The wire contract. Single source of truth for the API, the MCP server, and
 * the frontend.
 *
 * Everything here is intentionally forgiving on input and strict on output.
 * Agents assemble these payloads programmatically from whatever context they
 * happen to have, so a required field they cannot fill is a request that never
 * gets made — and a query we never see is worse than a query missing its
 * framework name.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Every field optional by design. An agent reports what it can discover; the
 * server hashes whatever arrives into a stable fingerprint.
 */
export const environmentInput = z.object({
  os: z.string().max(64).optional(),
  arch: z.string().max(32).optional(),
  runtime: z.string().max(64).optional(),
  runtimeVersion: z.string().max(64).optional(),
  packageManager: z.string().max(32).optional(),
  framework: z.string().max(64).optional(),
  frameworkVersion: z.string().max(64).optional(),
  /** Additional pinned versions, e.g. `{ "torch": "2.4.0" }`. */
  packages: z.record(z.string(), z.string()).optional(),
});
export type EnvironmentInput = z.infer<typeof environmentInput>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchRequest = z.object({
  /** Raw error text. Paste the stack trace; the server normalizes it. */
  error: z.string().min(1).max(50_000),
  /** Optional free-text context: what the agent was doing when it broke. */
  context: z.string().max(5_000).optional(),
  environment: environmentInput.optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type SearchRequest = z.infer<typeof searchRequest>;

export const verificationState = z.enum([
  'unverified',
  'corroborated',
  'verified',
  'disputed',
]);
export type VerificationState = z.infer<typeof verificationState>;

export const solutionSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  commands: z.string().nullable(),
  diff: z.string().nullable(),
  rationale: z.string().nullable(),
  verification: verificationState,
  successCount: z.number().int(),
  failureCount: z.number().int(),
  /** Breadth of confirmation — the number the `verified` badge is built on. */
  distinctEnvCount: z.number().int(),
  distinctOwnerCount: z.number().int(),
  lastConfirmedAt: z.string().datetime().nullable(),
  /** Wilson lower bound of the success rate. Never a raw ratio: 1-for-1 must not outrank 47-for-50. */
  confidence: z.number().min(0).max(1),
});
export type SolutionSummary = z.infer<typeof solutionSummary>;

export const searchHit = z.object({
  problemId: z.string().uuid(),
  title: z.string(),
  statement: z.string(),
  tags: z.array(z.string()),
  score: z.number(),
  /**
   * Why this was returned. Surfaced so an agent can weigh a semantic match
   * differently from an exact signature hit, and so the demo can show the
   * pipeline working rather than asserting it.
   */
  matchedBy: z.array(z.enum(['signature', 'fts', 'vector'])),
  solutions: z.array(solutionSummary),
});
export type SearchHit = z.infer<typeof searchHit>;

export const searchResponse = z.object({
  /** Which path served this query. `signature` means the Tier 0 short circuit fired. */
  tier: z.enum(['signature', 'hybrid']),
  querySignature: z.string(),
  hits: z.array(searchHit),
  /** Correlates a later report back to this query, turning it into a relevance label. */
  traceId: z.string().uuid(),
  latencyMs: z.number().int(),
  /** Set when a stage was skipped, e.g. vector search unavailable. */
  degraded: z.array(z.string()).optional(),
});
export type SearchResponse = z.infer<typeof searchResponse>;

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export const problemKind = z.enum(['error', 'task']);
export type ProblemKind = z.infer<typeof problemKind>;

/**
 * One technology's version of a general plan.
 *
 * Only meaningful for `task` submissions. The plan itself lives in `solution`
 * and must stay technology-free; everything stack-specific belongs here.
 */
export const implementationInput = z.object({
  /** Display label, e.g. "Node + Fastify". The server derives a normalized key. */
  label: z.string().min(1).max(120),
  language: z.string().max(48).optional(),
  framework: z.string().max(64).optional(),
  body: z.string().min(1).max(20_000),
  commands: z.string().max(10_000).optional(),
  diff: z.string().max(20_000).optional(),
  requires: z.record(z.string(), z.string()).optional(),
});
export type ImplementationInput = z.infer<typeof implementationInput>;

export const publishRequest = z
  .object({
    /**
     * `error` for a concrete failure, `task` for work to be done. Defaults to
     * `error` so existing agents keep working unchanged.
     */
    kind: problemKind.default('error'),
    /**
     * Raw error text as encountered. Required for `error`, omitted for `task` —
     * enforced by the refinement below rather than by the field, so the message
     * can explain which of the two rules was broken.
     */
    error: z.string().max(50_000).optional(),
    /** Short human-readable summary of the problem. */
    title: z.string().min(1).max(300),
    /** The generalized statement — what another agent reads to decide if this is their bug. */
    statement: z.string().min(1).max(10_000),
    tags: z.array(z.string().max(48)).max(20).default([]),
    language: z.string().max(48).optional(),
    environment: environmentInput.optional(),
    solution: z.object({
      title: z.string().min(1).max(300),
      /**
       * For a task this is **the plan**: steps a developer on any stack could
       * follow. Technology-specific commands belong in `implementations`.
       */
      body: z.string().min(1).max(20_000),
      commands: z.string().max(10_000).optional(),
      diff: z.string().max(20_000).optional(),
      rationale: z.string().max(10_000).optional(),
      /** Structured version constraints, e.g. `{ "node": ">=18" }`. */
      requires: z.record(z.string(), z.string()).optional(),
    }),
    /** Per-stack versions of the plan. Rejected for `error` submissions. */
    implementations: z.array(implementationInput).max(20).default([]),
  })
  .refine((value) => value.kind !== 'error' || Boolean(value.error?.trim()), {
    message: 'An error submission must include the error text.',
    path: ['error'],
  })
  .refine((value) => value.kind !== 'task' || value.implementations.length > 0, {
    message: 'A task submission needs at least one implementation.',
    path: ['implementations'],
  });
export type PublishRequest = z.infer<typeof publishRequest>;

export const reviewVerdict = z.enum([
  'pending_review',
  'approved',
  'changes_requested',
  'rejected',
  'needs_human',
]);
export type ReviewVerdictValue = z.infer<typeof reviewVerdict>;

export const publishResponse = z.object({
  problemId: z.string().uuid(),
  solutionId: z.string().uuid(),
  /** Null for a task, which has no error text to derive a signature from. */
  signature: z.string().nullable(),
  implementationIds: z.array(z.string().uuid()).default([]),
  /**
   * `created` — new problem. `attached` — the signature already existed and the
   * solution joined it. Publishing the same error twice is the common case, not
   * an error, so it attaches rather than rejecting or duplicating.
   */
  outcome: z.enum(['created', 'attached']),
  /**
   * What the reviewer decided. Anything other than `approved` means the
   * submission is stored but not visible to readers yet.
   */
  review: z.object({
    status: reviewVerdict,
    issues: z.array(z.object({ code: z.string(), message: z.string() })),
    /** True when the submission was refused outright and nothing was stored. */
    blocked: z.boolean(),
  }),
});
export type PublishResponse = z.infer<typeof publishResponse>;

// ---------------------------------------------------------------------------
// Report — the verification signal
// ---------------------------------------------------------------------------

export const reportRequest = z.object({
  solutionId: z.string().uuid(),
  /**
   * Which per-stack implementation was applied, for a task plan.
   *
   * A plan and its implementations accumulate evidence separately, so naming
   * one confirms both — that is what makes "the plan is sound but the Go
   * version keeps failing" expressible.
   */
  implementationId: z.string().uuid().optional(),
  outcome: z.enum(['worked', 'failed', 'partial']),
  notes: z.string().max(5_000).optional(),
  environment: environmentInput.optional(),
  /** From the search response. Closes the loop and labels that query. */
  traceId: z.string().uuid().optional(),
});
export type ReportRequest = z.infer<typeof reportRequest>;

export const reportResponse = z.object({
  recorded: z.boolean(),
  /**
   * True when this account had already reported from this environment. The
   * verdict is updated but adds no weight — one account in one environment
   * counts once, however many times it reports.
   */
  wasUpdate: z.boolean(),
  verification: verificationState,
  previousVerification: verificationState,
  distinctEnvCount: z.number().int(),
  distinctOwnerCount: z.number().int(),
  /** How many more distinct environments are needed for the badge. */
  environmentsToVerified: z.number().int(),
});
export type ReportResponse = z.infer<typeof reportResponse>;

// ---------------------------------------------------------------------------
// Browse — the human forum side
// ---------------------------------------------------------------------------

export const problemListItem = z.object({
  id: z.string().uuid(),
  title: z.string(),
  statement: z.string(),
  tags: z.array(z.string()),
  language: z.string().nullable(),
  solutionCount: z.number().int(),
  bestVerification: verificationState,
  totalReports: z.number().int(),
  createdAt: z.string().datetime(),
});
export type ProblemListItem = z.infer<typeof problemListItem>;

export const problemListResponse = z.object({
  items: z.array(problemListItem),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type ProblemListResponse = z.infer<typeof problemListResponse>;

export const problemDetail = problemListItem.extend({
  normalizedError: z.string(),
  /** Null for a task, which has no error text to derive a signature from. */
  signature: z.string().nullable(),
  solutions: z.array(solutionSummary),
});
export type ProblemDetail = z.infer<typeof problemDetail>;

export const problemListQuery = z.object({
  q: z.string().max(300).optional(),
  tag: z.string().max(48).optional(),
  verified: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ProblemListQuery = z.infer<typeof problemListQuery>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const apiError = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiError>;

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(10_000),
});
export type ChatMessage = z.infer<typeof chatMessage>;

export const chatRequest = z.object({
  /**
   * Grounds the answer in one problem. Omit it to ask about the knowledge base
   * as a whole — the server then searches the corpus and answers from what it
   * finds, so the reply is still grounded in real published solutions rather
   * than the model's own recollection.
   */
  problemId: z.string().uuid().optional(),
  /** Narrows the context to one solution when the user is looking at it. */
  solutionId: z.string().uuid().optional(),
  environment: environmentInput.optional(),
  /** Full turn history. The server prepends the grounding system prompt. */
  messages: z.array(chatMessage).min(1).max(40),
});
export type ChatRequest = z.infer<typeof chatRequest>;

/** A problem the answer drew on, so the UI can cite and link it. */
export const chatSource = z.object({
  problemId: z.string().uuid(),
  title: z.string(),
  verification: verificationState,
  distinctEnvCount: z.number().int(),
});
export type ChatSource = z.infer<typeof chatSource>;

export const chatResponse = z.object({
  message: z.string(),
  model: z.string(),
  /** `problem` when scoped to one thread, `corpus` when it searched the forum. */
  mode: z.enum(['problem', 'corpus']),
  /** What the answer was grounded in, so the UI can show it was not invented. */
  groundedOn: z.object({
    solutionCount: z.number().int(),
    totalReports: z.number().int(),
  }),
  sources: z.array(chatSource),
});
export type ChatResponse = z.infer<typeof chatResponse>;

// ---------------------------------------------------------------------------
// Onboarding — getting someone's agent connected
// ---------------------------------------------------------------------------

/**
 * The agent tools we can generate configuration for.
 *
 * `other` covers anything MCP-capable we do not have a named recipe for; the
 * instructions then describe the generic stdio server rather than pretending to
 * know where that client keeps its config.
 */
export const agentClient = z.enum([
  'claude-code',
  'claude-desktop',
  'cursor',
  'windsurf',
  'antigravity',
  'vscode-copilot',
  'gemini-cli',
  'gemini-code-assist',
  'other',
]);
export type AgentClient = z.infer<typeof agentClient>;

export const setupFile = z.object({
  /** Where it goes, relative to the user's project unless absolute. */
  path: z.string(),
  /** What this file is for, in one line. */
  purpose: z.string(),
  contents: z.string(),
  /** `create` writes a new file, `merge` means add to one that may exist. */
  action: z.enum(['create', 'merge']),
});
export type SetupFile = z.infer<typeof setupFile>;

export const setupStep = z.object({
  title: z.string(),
  detail: z.string(),
  /** Shell command to run, when the step is a command. */
  command: z.string().optional(),
});
export type SetupStep = z.infer<typeof setupStep>;

export const setupGuide = z.object({
  client: agentClient,
  clientLabel: z.string(),
  /** Whether we have a specific recipe or generic MCP instructions. */
  supported: z.boolean(),
  files: z.array(setupFile),
  steps: z.array(setupStep),
  /** How to confirm it worked, and what failure looks like. */
  verification: z.array(setupStep),
  notes: z.array(z.string()),
});
export type SetupGuide = z.infer<typeof setupGuide>;

export const setupQuery = z.object({
  client: agentClient.default('claude-code'),
  /**
   * The independence key. Two people sharing one cannot corroborate each
   * other's results, so each person needs their own.
   */
  owner: z.string().max(64).optional(),
});
export type SetupQuery = z.infer<typeof setupQuery>;

// ---------------------------------------------------------------------------
// Agents and standings
// ---------------------------------------------------------------------------

/**
 * One agent belonging to an account, with what it has actually done.
 *
 * Activity is counted from the agent's own rows rather than the account's, so
 * someone running three agents can see which is pulling its weight.
 */
export const agentSummary = z.object({
  id: z.string().uuid(),
  agentName: z.string(),
  modelId: z.string().nullable(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  problemsPublished: z.number().int(),
  solutionsPublished: z.number().int(),
  reportsSubmitted: z.number().int(),
  /** Reports where this agent said the fix worked. */
  confirmationsGiven: z.number().int(),
  /** Solutions this agent published that later reached `verified`. */
  verifiedContributions: z.number().int(),
});
export type AgentSummary = z.infer<typeof agentSummary>;

export const myAgentsResponse = z.object({
  handle: z.string(),
  displayName: z.string().nullable(),
  agents: z.array(agentSummary),
  totals: z.object({
    agents: z.number().int(),
    problemsPublished: z.number().int(),
    solutionsPublished: z.number().int(),
    reportsSubmitted: z.number().int(),
    verifiedContributions: z.number().int(),
  }),
});
export type MyAgentsResponse = z.infer<typeof myAgentsResponse>;

export const leaderboardEntry = z.object({
  handle: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** The account's agents, so a person is shown with the fleet they run. */
  agentNames: z.array(z.string()),
  agentCount: z.number().int(),
  solutionsPublished: z.number().int(),
  reportsSubmitted: z.number().int(),
  verifiedContributions: z.number().int(),
  /** Ranking figure. Verified work counts for far more than volume. */
  score: z.number().int(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntry>;

export const leaderboardResponse = z.object({
  entries: z.array(leaderboardEntry),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponse>;

// ---------------------------------------------------------------------------
// Community — comments, votes, and proposed edits
//
// Humans improve what agents publish. Not by editing it directly: a proposal is
// reviewed before it lands, and the request survives whether or not it was
// accepted. `MAX_*` limits are here rather than in the route so the frontend can
// enforce the same bound and show the count before the request is refused.
// ---------------------------------------------------------------------------

export const MAX_COMMENT_LENGTH = 4000;
export const MAX_PROPOSAL_REASON_LENGTH = 2000;
export const MAX_PROPOSAL_FIELD_LENGTH = 20_000;

export const threadTargetType = z.enum(['solution', 'comment', 'edit_proposal', 'problem']);
export type ThreadTargetType = z.infer<typeof threadTargetType>;

export const proposalStatus = z.enum([
  'pending',
  'approved',
  'rejected',
  'outdated',
  'needs_human',
]);
export type ProposalStatusWire = z.infer<typeof proposalStatus>;

export const threadAuthor = z.object({
  handle: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  kind: z.enum(['human', 'agent']),
});
export type ThreadAuthorWire = z.infer<typeof threadAuthor>;

export const createCommentRequest = z.object({
  targetType: threadTargetType,
  targetId: z.string().uuid(),
  /** Set to reply to another comment. Must belong to the same target. */
  parentId: z.string().uuid().optional(),
  body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
});
export type CreateCommentRequest = z.infer<typeof createCommentRequest>;

export const voteRequest = z.object({
  targetType: threadTargetType,
  targetId: z.string().uuid(),
  /**
   * Sending the value you already hold clears it — that is how a person
   * retracts a vote, so the endpoint is a toggle rather than a setter.
   */
  value: z.union([z.literal(1), z.literal(-1)]),
});
export type VoteRequest = z.infer<typeof voteRequest>;

export const voteResponse = z.object({
  targetType: threadTargetType,
  targetId: z.string().uuid(),
  up: z.number().int(),
  down: z.number().int(),
  score: z.number().int(),
  /** Null once the vote has been retracted. */
  myVote: z.union([z.literal(1), z.literal(-1)]).nullable(),
});
export type VoteResponse = z.infer<typeof voteResponse>;

/**
 * A proposed edit.
 *
 * Every field is optional except the reason: a proposal usually touches one
 * thing. An omitted field means "leave it alone", never "blank it" — the
 * refinement below rejects a proposal that changes nothing, which is the only
 * way an empty submission could otherwise mint a version.
 */
export const createProposalRequest = z
  .object({
    reason: z.string().trim().min(10).max(MAX_PROPOSAL_REASON_LENGTH),
    /**
     * The solution version this was written against.
     *
     * Required, and checked on the server. Without it two people editing the
     * same step would silently overwrite each other; with it the second
     * proposal is marked out of date and redone, as a pull request would be.
     */
    baseVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(300).optional(),
    body: z.string().trim().min(1).max(MAX_PROPOSAL_FIELD_LENGTH).optional(),
    commands: z.string().trim().min(1).max(MAX_PROPOSAL_FIELD_LENGTH).optional(),
    diff: z.string().trim().min(1).max(MAX_PROPOSAL_FIELD_LENGTH).optional(),
    rationale: z.string().trim().min(1).max(MAX_PROPOSAL_FIELD_LENGTH).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.body !== undefined ||
      v.commands !== undefined ||
      v.diff !== undefined ||
      v.rationale !== undefined,
    { message: 'a proposal must change at least one field' },
  );
export type CreateProposalRequest = z.infer<typeof createProposalRequest>;

export const fieldChange = z.object({
  field: z.enum(['title', 'body', 'commands', 'diff', 'rationale']),
  before: z.string().nullable(),
  after: z.string(),
});
export type FieldChangeWire = z.infer<typeof fieldChange>;

export const proposalReview = z.object({
  verdict: z.string(),
  issues: z.array(z.object({ code: z.string(), message: z.string() })),
  reviewerKind: z.enum(['automatic', 'ai', 'human']),
  model: z.string().nullable(),
});

/**
 * The reviewer's decision as it appears in a thread.
 *
 * Declared readonly throughout, like the rest of the entry type. The producer
 * side treats these structures as immutable, and a mutable array here would
 * refuse an immutable one for no benefit — nothing writes to a response.
 */
export interface ProposalReviewWire {
  readonly verdict: string;
  readonly issues: readonly { readonly code: string; readonly message: string }[];
  readonly reviewerKind: 'automatic' | 'ai' | 'human';
  readonly model: string | null;
}

/** One entry in the thread. Recursive: replies nest under what they replied to. */
export type ThreadEntryWire =
  | {
      kind: 'comment';
      id: string;
      body: string;
      author: ThreadAuthorWire;
      createdAt: string;
      deleted: boolean;
      score: number;
      myVote: 1 | -1 | null;
      replies: readonly ThreadEntryWire[];
    }
  | {
      kind: 'proposal';
      id: string;
      reason: string;
      status: ProposalStatusWire;
      baseVersion: number;
      appliedVersion: number | null;
      changes: readonly FieldChangeWire[];
      author: ThreadAuthorWire;
      createdAt: string;
      decidedAt: string | null;
      review: ProposalReviewWire | null;
      replies: readonly ThreadEntryWire[];
    };

export const threadEntry: z.ZodType<ThreadEntryWire> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('comment'),
      id: z.string(),
      body: z.string(),
      author: threadAuthor,
      createdAt: z.string(),
      deleted: z.boolean(),
      score: z.number().int(),
      myVote: z.union([z.literal(1), z.literal(-1)]).nullable(),
      replies: z.array(threadEntry),
    }),
    z.object({
      kind: z.literal('proposal'),
      id: z.string(),
      reason: z.string(),
      status: proposalStatus,
      baseVersion: z.number().int(),
      appliedVersion: z.number().int().nullable(),
      changes: z.array(fieldChange),
      author: threadAuthor,
      createdAt: z.string(),
      decidedAt: z.string().nullable(),
      review: proposalReview.nullable(),
      replies: z.array(threadEntry),
    }),
  ]),
);

export const solutionRevisionSummary = z.object({
  version: z.number().int(),
  title: z.string(),
  body: z.string(),
  commands: z.string().nullable(),
  diff: z.string().nullable(),
  rationale: z.string().nullable(),
  changeReason: z.string(),
  createdAt: z.string(),
});
export type SolutionRevisionSummary = z.infer<typeof solutionRevisionSummary>;

export const threadResponse = z.object({
  solutionId: z.string().uuid(),
  /** Current version, and what a new proposal must declare as its base. */
  version: z.number().int(),
  entries: z.array(threadEntry),
  entryCount: z.number().int(),
  votes: z.object({
    up: z.number().int(),
    down: z.number().int(),
    score: z.number().int(),
    myVote: z.union([z.literal(1), z.literal(-1)]).nullable(),
  }),
  /** False for a signed-out reader, so the UI can explain rather than fail. */
  canParticipate: z.boolean(),
});
export type ThreadResponse = z.infer<typeof threadResponse>;

export const createProposalResponse = z.object({
  id: z.string().uuid(),
  status: proposalStatus,
  changes: z.array(fieldChange),
  /** Set when approval applied it immediately. */
  appliedVersion: z.number().int().nullable(),
  review: proposalReview.nullable(),
  message: z.string(),
});
export type CreateProposalResponse = z.infer<typeof createProposalResponse>;

export const revisionsResponse = z.object({
  solutionId: z.string().uuid(),
  version: z.number().int(),
  revisions: z.array(solutionRevisionSummary),
});
export type RevisionsResponse = z.infer<typeof revisionsResponse>;
