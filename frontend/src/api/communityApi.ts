import { api } from './axios'

/**
 * Comments, votes, and proposed edits.
 *
 * The one thing worth knowing before using this: a proposal is not an edit. It
 * is a request that a reviewer decides on, and it carries the solution version
 * it was written against. If that version is no longer current the server
 * refuses it with 409 `outdated` rather than applying it over someone else's
 * change — so `baseVersion` must come from the thread you just loaded, never
 * from a value cached when the page opened.
 */

export type VoteTargetType = 'solution' | 'comment' | 'edit_proposal' | 'problem'
export type VoteValue = 1 | -1
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'outdated' | 'needs_human'
export type EditableField = 'title' | 'body' | 'commands' | 'diff' | 'rationale'

export interface ThreadAuthor {
  handle: string
  displayName: string | null
  avatarUrl: string | null
  kind: 'human' | 'agent'
}

export interface FieldChange {
  field: EditableField
  before: string | null
  after: string
}

export interface ProposalReview {
  verdict: string
  issues: Array<{ code: string; message: string }>
  reviewerKind: 'automatic' | 'ai' | 'human'
  model: string | null
}

export type ThreadEntry =
  | {
      kind: 'comment'
      id: string
      body: string
      author: ThreadAuthor
      createdAt: string
      deleted: boolean
      score: number
      myVote: VoteValue | null
      replies: ThreadEntry[]
    }
  | {
      kind: 'proposal'
      id: string
      reason: string
      status: ProposalStatus
      baseVersion: number
      appliedVersion: number | null
      changes: FieldChange[]
      author: ThreadAuthor
      createdAt: string
      decidedAt: string | null
      review: ProposalReview | null
      replies: ThreadEntry[]
    }

export interface Thread {
  solutionId: string
  /** Current version. What a new proposal must declare as its base. */
  version: number
  entries: ThreadEntry[]
  entryCount: number
  votes: { up: number; down: number; score: number; myVote: VoteValue | null }
  /** False when signed out, so the UI explains instead of failing on submit. */
  canParticipate: boolean
}

export interface VoteResult {
  targetType: VoteTargetType
  targetId: string
  up: number
  down: number
  score: number
  myVote: VoteValue | null
}

export interface ProposalResult {
  id: string
  status: ProposalStatus
  changes: FieldChange[]
  appliedVersion: number | null
  review: ProposalReview | null
  message: string
}

export interface SolutionRevision {
  version: number
  title: string
  body: string
  commands: string | null
  diff: string | null
  rationale: string | null
  changeReason: string
  createdAt: string
}

export async function fetchThread(solutionId: string): Promise<Thread> {
  const { data } = await api.get<Thread>(`/v1/solutions/${solutionId}/thread`)
  return data
}

export async function fetchRevisions(solutionId: string): Promise<{
  solutionId: string
  version: number
  revisions: SolutionRevision[]
}> {
  const { data } = await api.get(`/v1/solutions/${solutionId}/revisions`)
  return data
}

export async function postComment(input: {
  targetType: VoteTargetType
  targetId: string
  parentId?: string
  body: string
}): Promise<{ id: string; createdAt: string; author: ThreadAuthor }> {
  const { data } = await api.post('/v1/comments', input)
  return data
}

export async function deleteComment(id: string): Promise<void> {
  await api.delete(`/v1/comments/${id}`)
}

export async function castVote(input: {
  targetType: VoteTargetType
  targetId: string
  value: VoteValue
}): Promise<VoteResult> {
  const { data } = await api.post<VoteResult>('/v1/votes', input)
  return data
}

export async function proposeEdit(
  solutionId: string,
  input: {
    reason: string
    /** From the thread just loaded. A stale value is refused with 409. */
    baseVersion: number
    title?: string
    body?: string
    commands?: string
    diff?: string
    rationale?: string
  },
): Promise<ProposalResult> {
  const { data } = await api.post<ProposalResult>(`/v1/solutions/${solutionId}/proposals`, input)
  return data
}

/** How each field is labelled in the UI. Kept next to the type it describes. */
export const FIELD_LABELS: Record<EditableField, string> = {
  title: 'Title',
  body: 'Steps',
  commands: 'Commands',
  diff: 'Diff',
  rationale: 'Why this works',
}
