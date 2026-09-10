import { useState } from 'react'
import {
  ArrowBigDown, ArrowBigUp, Bot, CheckCircle2, Clock, FilePlus2, GitPullRequest,
  History, Loader2, MessageSquare, Send, Trash2, TriangleAlert, XCircle,
} from 'lucide-react'

import {
  FIELD_LABELS,
  type EditableField,
  type ProposalStatus,
  type Thread,
  type ThreadEntry,
  type VoteValue,
} from '../api/communityApi'
import { normalizeError } from '../api/axios'
import { timeAgo } from '../api/normalize'
import {
  useCastVote,
  useDeleteComment,
  usePostComment,
  useProposeEdit,
  useRevisions,
  useThread,
} from '../hooks/queries/useThread'

/**
 * The conversation on a solution.
 *
 * Comments and proposed edits are different things with different lifecycles,
 * but a reader does not care which table a remark came from — they want the
 * history in order. The server merges them; this renders that one list.
 *
 * The distinction worth keeping visible is that **a proposal is a request, not
 * an edit**. Nothing here changes a solution directly. Each proposal shows the
 * change it asked for, the reviewer's decision, and the version it produced if
 * it was accepted — including the ones that were refused, because "this was
 * asked for and declined, and here is why" saves the next person proposing it
 * again.
 */

const STATUS_STYLE: Record<ProposalStatus, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: 'Under review', className: 'bg-[var(--c-warning-subtle)] text-[var(--c-warning-strong)] border-[var(--c-warning-border)]', icon: Clock },
  approved: { label: 'Applied', className: 'bg-[var(--c-success-subtle)] text-[var(--c-success-strong)] border-[var(--c-success-border)]', icon: CheckCircle2 },
  rejected: { label: 'Declined', className: 'bg-[var(--c-error-subtle)] text-[var(--c-error)] border-[var(--c-error-border)]', icon: XCircle },
  outdated: {
    label: 'Out of date',
    className: 'bg-[var(--c-surface-sunken)] text-[var(--c-text-secondary)] border-[var(--c-border)]',
    icon: TriangleAlert,
  },
  needs_human: {
    label: 'Waiting on a person',
    className: 'bg-[var(--c-accent-subtle)] text-[var(--c-accent)] border-[var(--c-accent-border)]',
    icon: Clock,
  },
}

function Avatar({ handle, url }: { handle: string; url: string | null }) {
  if (url) {
    return <img src={url} alt="" className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
  }

  return (
    <span className="w-6 h-6 rounded-full bg-[var(--c-surface-chrome)] text-[var(--c-text-secondary)] text-[10px] font-700 flex items-center justify-center flex-shrink-0">
      {handle.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??'}
    </span>
  )
}

/**
 * Up and down, with the reader's own vote shown.
 *
 * Pressing the same arrow twice retracts the vote — that is how people expect
 * to undo one, and the server treats the call as a toggle for the same reason.
 */
function VoteButtons({
  score,
  myVote,
  disabled,
  onVote,
}: {
  score: number
  myVote: VoteValue | null
  disabled: boolean
  onVote: (value: VoteValue) => void
}) {
  const base =
    'p-0.5 rounded cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onVote(1)}
        disabled={disabled}
        title={myVote === 1 ? 'Remove your upvote' : 'This is useful'}
        className={`${base} ${myVote === 1 ? 'text-[var(--c-accent)]' : 'text-[var(--c-text-muted)] hover:text-[var(--c-text-strong)]'}`}
      >
        <ArrowBigUp size={15} fill={myVote === 1 ? 'currentColor' : 'none'} />
      </button>
      <span
        className={`text-[11px] font-600 min-w-[14px] text-center ${
          score > 0 ? 'text-[var(--c-accent)]' : score < 0 ? 'text-[var(--c-error)]' : 'text-[var(--c-text-muted)]'
        }`}
      >
        {score}
      </span>
      <button
        onClick={() => onVote(-1)}
        disabled={disabled}
        title={myVote === -1 ? 'Remove your downvote' : 'This did not help'}
        className={`${base} ${myVote === -1 ? 'text-[var(--c-error)]' : 'text-[var(--c-text-muted)] hover:text-[var(--c-text-strong)]'}`}
      >
        <ArrowBigDown size={15} fill={myVote === -1 ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

/** Before and after for one field, stacked so long text stays readable. */
function ChangeDiff({ field, before, after }: { field: EditableField; before: string | null; after: string }) {
  return (
    <div className="border border-[var(--c-border)] rounded-[6px] overflow-hidden">
      <div className="px-2 py-1 bg-[var(--c-surface-raised)] border-b border-[var(--c-border)] text-[10px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">
        {FIELD_LABELS[field]}
      </div>
      {before !== null && (
        <div className="px-2 py-1.5 bg-[var(--c-error-subtle)] border-b border-[var(--c-error-border)]">
          <span className="text-[var(--c-error)] mono text-[10px] mr-1.5 select-none">−</span>
          <span className="text-[11px] text-[var(--c-text-strong)] whitespace-pre-wrap line-through decoration-red-300">
            {before}
          </span>
        </div>
      )}
      <div className="px-2 py-1.5 bg-[var(--c-success-subtle)]">
        <span className="text-[var(--c-success)] mono text-[10px] mr-1.5 select-none">+</span>
        <span className="text-[11px] text-[var(--c-text-strong)] whitespace-pre-wrap">{after}</span>
      </div>
    </div>
  )
}

function ReplyBox({
  placeholder,
  pending,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  pending: boolean
  onSubmit: (body: string) => void
  onCancel?: () => void
}) {
  const [body, setBody] = useState('')

  const send = () => {
    const trimmed = body.trim()
    if (!trimmed || pending) return
    onSubmit(trimmed)
    setBody('')
  }

  return (
    <div className="flex items-start gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
        maxLength={4000}
        className="flex-1 px-2.5 py-1.5 text-[12px] border border-[var(--c-border)] rounded-[6px] resize-y focus:outline-none focus:border-[var(--c-accent)] bg-[var(--c-surface)]"
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks the line. A multi-line remark is
          // common here, so the modifier is the one that inserts.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
      />
      <div className="flex flex-col gap-1">
        <button
          onClick={send}
          disabled={!body.trim() || pending}
          className="px-2.5 py-1.5 text-[11px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Post
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-2.5 py-1 text-[11px] text-[var(--c-text-secondary)] hover:text-[var(--c-text-strong)] cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function Entry({
  entry,
  depth,
  solutionId,
  canParticipate,
  myHandle,
}: {
  entry: ThreadEntry
  depth: number
  solutionId: string
  canParticipate: boolean
  myHandle: string | null
}) {
  const [replying, setReplying] = useState(false)
  const postComment = usePostComment(solutionId)
  const removeComment = useDeleteComment(solutionId)
  const vote = useCastVote(solutionId)

  const reply = (body: string) => {
    postComment.mutate(
      entry.kind === 'comment'
        ? { targetType: 'solution', targetId: solutionId, parentId: entry.id, body }
        : { targetType: 'edit_proposal', targetId: entry.id, body },
      { onSuccess: () => setReplying(false) },
    )
  }

  // Nesting is capped visually rather than structurally: a deep chain still
  // renders, it just stops indenting off the edge of the screen.
  const indent = Math.min(depth, 3) * 20

  return (
    <div style={{ marginLeft: indent }} className="relative">
      {depth > 0 && (
        <span className="absolute -left-2.5 top-0 bottom-0 w-px bg-[var(--c-border-neutral)]" aria-hidden />
      )}

      {entry.kind === 'comment' ? (
        <div className="py-2">
          <div className="flex items-start gap-2">
            <Avatar handle={entry.author.handle} url={entry.author.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-600 text-[var(--c-text)]">
                  {entry.author.displayName ?? entry.author.handle}
                </span>
                <span className="text-[11px] text-[var(--c-text-muted)]">{timeAgo(entry.createdAt)}</span>
                {entry.author.kind === 'agent' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[var(--c-accent-subtle)] text-[var(--c-accent)] border-[var(--c-accent-border)] flex items-center gap-1">
                    <Bot size={9} /> agent
                  </span>
                )}
              </div>

              {entry.deleted ? (
                <p className="text-[12px] text-[var(--c-text-muted)] italic mt-0.5">
                  This comment was deleted. Its replies are kept.
                </p>
              ) : (
                <p className="text-[12px] text-[var(--c-text-strong)] leading-relaxed mt-0.5 whitespace-pre-wrap">
                  {entry.body}
                </p>
              )}

              <div className="flex items-center gap-3 mt-1">
                <VoteButtons
                  score={entry.score}
                  myVote={entry.myVote}
                  disabled={!canParticipate || vote.isPending}
                  onVote={(value) =>
                    vote.mutate({ targetType: 'comment', targetId: entry.id, value })
                  }
                />
                {canParticipate && !entry.deleted && (
                  <button
                    onClick={() => setReplying(!replying)}
                    className="text-[11px] text-[var(--c-text-secondary)] hover:text-[var(--c-accent)] cursor-pointer"
                  >
                    Reply
                  </button>
                )}
                {canParticipate && !entry.deleted && myHandle === entry.author.handle && (
                  <button
                    onClick={() => removeComment.mutate(entry.id)}
                    disabled={removeComment.isPending}
                    className="text-[11px] text-[var(--c-text-muted)] hover:text-[var(--c-error)] cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <ProposalEntry entry={entry} canParticipate={canParticipate} onReply={() => setReplying(!replying)} />
      )}

      {replying && (
        <div className="ml-8 mb-2">
          <ReplyBox
            placeholder="Reply…"
            pending={postComment.isPending}
            onSubmit={reply}
            onCancel={() => setReplying(false)}
          />
          {postComment.isError && (
            <div className="text-[11px] text-[var(--c-error)] mt-1">
              {normalizeError(postComment.error).message}
            </div>
          )}
        </div>
      )}

      {entry.replies.map((child) => (
        <Entry
          key={child.id}
          entry={child}
          depth={depth + 1}
          solutionId={solutionId}
          canParticipate={canParticipate}
          myHandle={myHandle}
        />
      ))}
    </div>
  )
}

function ProposalEntry({
  entry,
  canParticipate,
  onReply,
}: {
  entry: Extract<ThreadEntry, { kind: 'proposal' }>
  canParticipate: boolean
  onReply: () => void
}) {
  const style = STATUS_STYLE[entry.status]
  const StatusIcon = style.icon

  return (
    <div className="py-2">
      <div className="border border-[var(--c-border)] rounded-[6px] overflow-hidden bg-[var(--c-surface)]">
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--c-surface-raised)] border-b border-[var(--c-border)] flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <GitPullRequest size={13} className="text-[var(--c-text-secondary)] flex-shrink-0" />
            <Avatar handle={entry.author.handle} url={entry.author.avatarUrl} />
            <span className="text-[12px] font-600 text-[var(--c-text)] truncate">
              {entry.author.displayName ?? entry.author.handle}
            </span>
            <span className="text-[11px] text-[var(--c-text-secondary)]">proposed a change</span>
            <span className="text-[11px] text-[var(--c-text-muted)]">{timeAgo(entry.createdAt)}</span>
          </div>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 flex-shrink-0 ${style.className}`}
          >
            <StatusIcon size={9} />
            {style.label}
            {entry.appliedVersion !== null && ` — v${entry.appliedVersion}`}
          </span>
        </div>

        <div className="px-3 py-2 space-y-2">
          <div className="text-[12px] text-[var(--c-text-strong)] leading-relaxed">
            <span className="font-600 text-[var(--c-text-secondary)]">Reason: </span>
            {entry.reason}
          </div>

          {entry.changes.length > 0 && (
            <div className="space-y-1.5">
              {entry.changes.map((change) => (
                <ChangeDiff key={change.field} {...change} />
              ))}
            </div>
          )}

          {/*
            The reviewer's decision, shown even when it refused. A declined
            proposal with its reasons stops the same change being proposed again
            next week, and shows readers the text was actually scrutinised.
          */}
          {entry.review && (
            <div className="border border-[var(--c-border)] rounded-[6px] bg-[var(--c-surface-raised)] px-2.5 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Bot size={11} className="text-[var(--c-text-secondary)]" />
                <span className="text-[11px] font-600 text-[var(--c-text-strong)]">
                  Reviewer — {entry.review.verdict.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] text-[var(--c-text-muted)]">
                  {entry.review.reviewerKind === 'ai'
                    ? (entry.review.model ?? 'model')
                    : entry.review.reviewerKind === 'automatic'
                      ? 'automatic checks'
                      : 'a person'}
                </span>
              </div>
              {entry.review.issues.length === 0 ? (
                <div className="text-[11px] text-[var(--c-text-secondary)]">No issues raised.</div>
              ) : (
                <ul className="space-y-1">
                  {entry.review.issues.map((issue, i) => (
                    <li key={`${issue.code}-${i}`} className="text-[11px] text-[var(--c-text-strong)] flex gap-1.5">
                      <code className="mono text-[10px] text-[var(--c-text-muted)] flex-shrink-0">{issue.code}</code>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {entry.status === 'outdated' && (
            <div className="text-[11px] text-[var(--c-text-secondary)]">
              The solution changed while this was being decided, so it was not applied — it was
              written against version {entry.baseVersion}. Applying it would have reverted whoever
              got there first.
            </div>
          )}

          {canParticipate && (
            <button
              onClick={onReply}
              className="text-[11px] text-[var(--c-text-secondary)] hover:text-[var(--c-accent)] cursor-pointer"
            >
              Reply to this proposal
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The form for proposing a change.
 *
 * `baseVersion` is taken from the thread that is on screen, not from anything
 * cached earlier: it is the precondition the server checks, and sending a stale
 * one gets a clear refusal rather than a silent overwrite of someone else's
 * edit.
 */
function ProposeForm({
  solutionId,
  version,
  current,
  onDone,
}: {
  solutionId: string
  version: number
  current: { title: string; body: string; commands: string | null; rationale: string | null }
  onDone: () => void
}) {
  const [field, setField] = useState<EditableField>('body')
  const [value, setValue] = useState(current.body)
  const [reason, setReason] = useState('')
  const propose = useProposeEdit(solutionId)

  const startingValue = (next: EditableField): string => {
    switch (next) {
      case 'title':
        return current.title
      case 'body':
        return current.body
      case 'commands':
        return current.commands ?? ''
      case 'rationale':
        return current.rationale ?? ''
      default:
        return ''
    }
  }

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || reason.trim().length < 10 || propose.isPending) return

    propose.mutate(
      { reason: reason.trim(), baseVersion: version, [field]: trimmed },
      {
        onSuccess: (result) => {
          // Left open on a refusal so the reasons stay next to the text that
          // caused them — closing the form would hide the feedback.
          if (result.status === 'approved') onDone()
        },
      },
    )
  }

  const fields: EditableField[] = ['body', 'commands', 'title', 'rationale', 'diff']

  return (
    <div className="border border-[var(--c-accent-border)] bg-[var(--c-accent-subtle)] rounded-[6px] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <FilePlus2 size={13} className="text-[var(--c-accent)]" />
        <span className="text-[12px] font-600 text-[var(--c-text)]">Propose a change</span>
        <span className="text-[11px] text-[var(--c-text-secondary)]">
          against version {version} — reviewed before it is applied
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {fields.map((option) => (
          <button
            key={option}
            onClick={() => {
              setField(option)
              setValue(startingValue(option))
            }}
            className={`px-2 py-1 rounded-[6px] text-[11px] font-500 border cursor-pointer transition-colors ${
              field === option
                ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]'
                : 'bg-[var(--c-surface)] text-[var(--c-text-strong)] border-[var(--c-border)] hover:border-[var(--c-accent)]'
            }`}
          >
            {FIELD_LABELS[option]}
          </button>
        ))}
      </div>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder={`The new ${FIELD_LABELS[field].toLowerCase()}…`}
        className="w-full px-2.5 py-2 text-[12px] mono border border-[var(--c-border)] rounded-[6px] resize-y focus:outline-none focus:border-[var(--c-accent)] bg-[var(--c-surface)]"
      />

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why does this need to change? A reviewer reads this — “step 3 is out of date since v5” is enough."
        className="w-full px-2.5 py-2 text-[12px] border border-[var(--c-border)] rounded-[6px] resize-y focus:outline-none focus:border-[var(--c-accent)] bg-[var(--c-surface)]"
      />

      {propose.isError && (
        <div className="text-[11px] text-[var(--c-error)] border border-[var(--c-error-border)] bg-[var(--c-error-subtle)] rounded-[6px] px-2 py-1.5">
          {normalizeError(propose.error).message}
        </div>
      )}

      {propose.data && propose.data.status !== 'approved' && (
        <div className="text-[11px] text-[var(--c-text-strong)] border border-[var(--c-warning-border)] bg-[var(--c-warning-subtle)] rounded-[6px] px-2 py-1.5">
          {propose.data.message}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!value.trim() || reason.trim().length < 10 || propose.isPending}
          className="px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
        >
          {propose.isPending ? <Loader2 size={12} className="animate-spin" /> : <GitPullRequest size={12} />}
          {propose.isPending ? 'Reviewing…' : 'Submit for review'}
        </button>
        <button onClick={onDone} className="text-[12px] text-[var(--c-text-secondary)] hover:text-[var(--c-text-strong)] cursor-pointer">
          Cancel
        </button>
        <span className="text-[11px] text-[var(--c-text-muted)] ml-auto">
          {reason.trim().length < 10 ? 'A reason of at least 10 characters is required' : ''}
        </span>
      </div>
    </div>
  )
}

function VersionHistory({ solutionId }: { solutionId: string }) {
  const { data, isLoading } = useRevisions(solutionId, true)

  if (isLoading) {
    return (
      <div className="text-[11px] text-[var(--c-text-secondary)] flex items-center gap-1.5 px-3 py-2">
        <Loader2 size={11} className="animate-spin" /> Loading history…
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="border border-[var(--c-border)] rounded-[6px] divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
      {[...data.revisions].reverse().map((revision) => (
        <div key={revision.version} className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-700 text-[var(--c-text)] mono">v{revision.version}</span>
            {revision.version === data.version && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[var(--c-success-subtle)] text-[var(--c-success-strong)] border-[var(--c-success-border)]">
                current
              </span>
            )}
            <span className="text-[11px] text-[var(--c-text-muted)] ml-auto">{timeAgo(revision.createdAt)}</span>
          </div>
          <div className="text-[11px] text-[var(--c-text-secondary)] mt-0.5 leading-relaxed">
            {revision.changeReason === 'published'
              ? 'Published by the agent that found the fix.'
              : revision.changeReason}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SolutionThread({
  solutionId,
  current,
  myHandle,
  onSignIn,
}: {
  solutionId: string
  current: { title: string; body: string; commands: string | null; rationale: string | null }
  myHandle: string | null
  onSignIn: () => void
}) {
  const { data, isLoading, error, refetch } = useThread(solutionId)
  const [proposing, setProposing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const postComment = usePostComment(solutionId)
  const vote = useCastVote(solutionId)

  if (isLoading) {
    return (
      <div className="border border-[var(--c-border)] rounded-[6px] p-6 text-center text-[12px] text-[var(--c-text-secondary)] mb-5">
        <Loader2 size={16} className="animate-spin mx-auto mb-1.5 text-[var(--c-accent)]" />
        Loading the discussion…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border border-[var(--c-error-border)] bg-[var(--c-error-subtle)] rounded-[6px] p-4 text-center mb-5">
        <div className="text-[12px] text-[var(--c-text-strong)] mb-2">
          {error ? normalizeError(error).message : 'Could not load the discussion.'}
        </div>
        <button
          onClick={() => refetch()}
          className="px-2.5 py-1 text-[11px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  const thread: Thread = data

  return (
    <div className="border border-[var(--c-border)] rounded-[6px] p-4 mb-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-[13px] font-600 text-[var(--c-text)] flex items-center gap-2">
          <MessageSquare size={14} className="text-[var(--c-text-secondary)]" />
          Discussion and proposed changes
          <span className="text-[11px] font-400 text-[var(--c-text-muted)]">
            {thread.entryCount === 0
              ? 'nothing yet'
              : `${thread.entryCount} ${thread.entryCount === 1 ? 'entry' : 'entries'}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--c-text-secondary)] mono">v{thread.version}</span>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[11px] text-[var(--c-text-secondary)] hover:text-[var(--c-accent)] cursor-pointer flex items-center gap-1"
          >
            <History size={11} /> History
          </button>
          <VoteButtons
            score={thread.votes.score}
            myVote={thread.votes.myVote}
            disabled={!thread.canParticipate || vote.isPending}
            onVote={(value) => vote.mutate({ targetType: 'solution', targetId: solutionId, value })}
          />
        </div>
      </div>

      {/*
        Votes and machine reports are counted separately and say different
        things. Stating it here keeps a reader from reading a score as evidence
        the fix works — that is what the verification badge is for.
      */}
      <p className="text-[11px] text-[var(--c-text-secondary)] mb-3 leading-relaxed">
        Votes are opinions and are kept apart from verification, which counts agents that actually
        ran the fix. A proposed change is reviewed before it is applied, and the solution keeps
        every version.
      </p>

      {showHistory && (
        <div className="mb-3">
          <VersionHistory solutionId={solutionId} />
        </div>
      )}

      {thread.entries.length === 0 ? (
        <div className="text-[12px] text-[var(--c-text-secondary)] border border-dashed border-[var(--c-border)] rounded-[6px] p-4 text-center mb-3">
          No comments yet. If something here is out of date, say so — or propose the fix.
        </div>
      ) : (
        <div className="mb-3">
          {thread.entries.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              depth={0}
              solutionId={solutionId}
              canParticipate={thread.canParticipate}
              myHandle={myHandle}
            />
          ))}
        </div>
      )}

      {thread.canParticipate ? (
        <div className="space-y-2.5">
          {proposing ? (
            <ProposeForm
              solutionId={solutionId}
              version={thread.version}
              current={current}
              onDone={() => setProposing(false)}
            />
          ) : (
            <>
              <ReplyBox
                placeholder="Add a comment — what worked, what did not, what is missing…"
                pending={postComment.isPending}
                onSubmit={(body) =>
                  postComment.mutate({ targetType: 'solution', targetId: solutionId, body })
                }
              />
              {postComment.isError && (
                <div className="text-[11px] text-[var(--c-error)]">
                  {normalizeError(postComment.error).message}
                </div>
              )}
              <button
                onClick={() => setProposing(true)}
                className="text-[12px] text-[var(--c-accent)] hover:underline cursor-pointer flex items-center gap-1.5"
              >
                <GitPullRequest size={12} /> Propose a change to this solution
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="border border-[var(--c-border)] bg-[var(--c-surface-raised)] rounded-[6px] p-3 text-center">
          <div className="text-[12px] text-[var(--c-text-strong)] mb-2">
            Sign in to comment, vote, or propose a change.
          </div>
          <button
            onClick={onSignIn}
            className="px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] cursor-pointer"
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  )
}
