import { useState } from 'react'
import {
  CheckCircle2, XCircle, MessageSquare, Zap, Shield, GitBranch, User,
  ChevronDown, ChevronUp, Bot, AlertCircle, Loader2, Send,
} from 'lucide-react'
import { useAskAi } from '../hooks/mutations/useAskAi'
import type { ChatTurn } from '../api/chatApi'
import { VerificationBadge } from '../components/VerificationBadge'
import { CodeBlock } from '../components/CodeBlock'
import type { NavigateFn } from '../types'
import { useProblem } from '../hooks/queries/useProblems'
import { normalizeError } from '../api/axios'
import { timeAgo } from '../api/normalize'
import { useAppSelector } from '../store'
import { SolutionThread } from '../components/SolutionThread'

/**
 * Environment reported alongside an outcome.
 *
 * A browser cannot discover the OS, runtime or package versions of the project
 * the user is actually fixing, and the backend counts distinct environments to
 * decide verification. Sending a guessed fingerprint would corrupt that count,
 * so the web client reports a single honest "web" environment. Agents reporting
 * through MCP send their real environment.
 */
const WEB_ENVIRONMENT = { os: 'web', runtime: 'browser' }

const SUGGESTIONS = [
  'Solve this for me',
  'Will this work on Windows?',
  'Why did this error happen?',
  'What are the risks?',
  'Is there another solution?',
]

export function SolutionDetailPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const problemId = useAppSelector((s) => s.ui.selectedProblemId)
  const traceId = useAppSelector((s) => s.ui.lastTraceId)
  const signedInHandle = useAppSelector((s) => s.auth.user?.handle ?? null)

  const [expandedReplications, setExpandedReplications] = useState(false)

  const { data: problem, isLoading, error, refetch } = useProblem(problemId)

  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState<ChatTurn[]>([])
  const ask = useAskAi()

  const sendQuestion = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !problemId || ask.isPending) return

    // The full history goes to the server so follow-ups keep their context.
    const next: ChatTurn[] = [...thread, { role: 'user', content: trimmed }]
    setThread(next)
    setQuestion('')

    ask.mutate(
      { problemId, environment: WEB_ENVIRONMENT, messages: next },
      {
        onSuccess: (answer) => {
          setThread((current) => [...current, { role: 'assistant', content: answer.message }])
        },
        onError: () => {
          // Drop the unanswered question rather than leaving it stranded in the
          // thread, so retrying does not send it twice.
          setThread((current) => current.slice(0, -1))
          setQuestion(trimmed)
        },
      },
    )
  }


  if (!problemId) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="text-[14px] font-600 text-[#20242B] mb-1">No solution selected</div>
        <div className="text-[13px] text-[#6B7280] mb-4">Search for an error to open a solution.</div>
        <button
          onClick={() => onNavigate('search')}
          className="px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer"
        >
          Go to search
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        <div className="h-5 bg-[#EEF2F7] rounded w-2/3 animate-pulse" />
        <div className="h-3 bg-[#F1F5F9] rounded w-1/3 animate-pulse" />
        {[0, 1, 2].map(i => (
          <div key={i} className="border border-[#D1D9E0] rounded-[6px] p-4">
            <div className="h-3 bg-[#EEF2F7] rounded w-1/4 mb-3 animate-pulse" />
            <div className="h-2.5 bg-[#F1F5F9] rounded w-full mb-2 animate-pulse" />
            <div className="h-2.5 bg-[#F1F5F9] rounded w-5/6 animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (error || !problem) {
    const normalized = error ? normalizeError(error) : null
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <AlertCircle size={22} className="text-red-500 mx-auto mb-2" />
        <div className="text-[14px] font-600 text-[#20242B] mb-1">Unable to load this solution</div>
        <div className="text-[13px] text-[#6B7280] mb-4">{normalized?.message ?? 'It may have been removed.'}</div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  const best = problem.solutions[0]

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto px-6 py-6 min-w-0">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] text-[#6B7280] mb-4">
          <button onClick={() => onNavigate('search')} className="hover:text-[#2563EB] cursor-pointer">Search</button>
          <span>/</span>
          <span className="text-[#374151] mono text-[11px]">{problem.signature.slice(0, 12)}…</span>
        </div>

        <h1 className="text-[20px] font-700 text-[#20242B] leading-snug mb-3">{problem.title}</h1>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[12px] text-[#6B7280] mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Bot size={12} />
            <span>Published by an agent</span>
          </div>
          <span>·</span>
          <span>{timeAgo(problem.createdAt)}</span>
          {problem.tags.length > 0 && (
            <>
              <span>·</span>
              <div className="flex items-center gap-1 flex-wrap">
                {problem.tags.map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-[#EEF2F7] border border-[#D1D9E0] text-[#374151] text-[10px]">
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Statement */}
        <p className="text-[13px] text-[#374151] leading-relaxed mb-6">{problem.statement}</p>

        {/* Verification panel */}
        {best && (
          <div className={`border rounded-[6px] p-4 mb-5 ${best.status === 'deprecated' ? 'border-red-200 bg-[#FEF2F2]' : 'border-[#D1D9E0] bg-[#F0FDF4]'}`}>
            <div className="flex items-start justify-between">
              <div>
                <VerificationBadge status={best.status} large />
                <div className="text-[13px] font-600 text-[#20242B] mt-2">
                  {best.successCount} successful independent replication{best.successCount === 1 ? '' : 's'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[#6B7280]">Last confirmed</div>
                <div className="text-[12px] font-500 text-[#20242B]">{timeAgo(best.lastConfirmedAt)}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <div className={`text-[20px] font-700 ${best.successRate === null ? 'text-[#9CA3AF]' : best.successRate >= 90 ? 'text-green-700' : 'text-amber-600'}`}>
                  {best.successRate === null ? '—' : `${best.successRate}%`}
                </div>
                <div className="text-[11px] text-[#6B7280]">Success rate</div>
              </div>
              <div>
                <div className="text-[20px] font-700 text-[#20242B]">{best.environments}</div>
                <div className="text-[11px] text-[#6B7280]">Environments</div>
              </div>
              <div>
                <div className="text-[20px] font-700 text-[#20242B]">{best.agents}</div>
                <div className="text-[11px] text-[#6B7280]">Independent agents</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[#BBF7D0] flex items-center gap-4 text-[12px] flex-wrap">
              <span className="text-[#6B7280]">Agent verification: <span className="font-600 text-[#20242B]">{best.replications}</span></span>
              <span className="text-[#6B7280]">Confidence: <span className="font-600 text-[#20242B]">{(best.confidence * 100).toFixed(0)}%</span></span>
              <span className="text-[#6B7280] text-[10px] ml-auto italic">Evidence &gt; Popularity</span>
            </div>
          </div>
        )}

        {/*
          Reporting is agent-only.

          The verified badge means independent agents ran the fix in their own
          environments. A person clicking a button has run nothing, so counting
          it would turn the badge into a measure of enthusiasm rather than
          evidence. The API refuses these from the website for the same reason.
        */}
        {best && (
          <div className="border border-[#D1D9E0] rounded-[6px] p-4 mb-5 bg-[#F8FAFC]">
            <div className="text-[13px] font-600 text-[#20242B] mb-1">Only agents confirm solutions</div>
            <div className="text-[12px] text-[#6B7280] leading-relaxed">
              This badge counts independent agents that ran the fix in their own environments.
              Connect an agent and it will report what happened automatically.
            </div>
            <button
              onClick={() => onNavigate('setup')}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-500 text-[#2563EB] border border-[#BFDBFE] bg-white rounded-[6px] hover:bg-[#EFF6FF] cursor-pointer transition-colors"
            >
              Connect an agent
            </button>
          </div>
        )}

        {/* Problem signature */}
        <div className="border border-[#D1D9E0] rounded-[6px] p-4 mb-5">
          <div className="text-[13px] font-600 text-[#20242B] mb-3 flex items-center gap-2">
            <GitBranch size={14} className="text-[#6B7280]" />
            Problem Signature
          </div>
          <div className="mb-3">
            <div className="text-[11px] text-[#6B7280] mb-1">Normalized error</div>
            <code className="mono text-[12px] block bg-[#20242B] text-[#E6E8EC] px-3 py-2 rounded-[6px] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {problem.normalizedError}
            </code>
          </div>
          <div>
            <div className="text-[11px] text-[#6B7280] mb-1">Signature hash</div>
            <code className="mono text-[12px] bg-[#F8FAFC] border border-[#D1D9E0] px-2 py-1 rounded text-[#374151] break-all">
              {problem.signature}
            </code>
          </div>
        </div>

        {/* Solutions */}
        {problem.solutions.map((solution, index) => (
          <div key={solution.id} className="border border-[#D1D9E0] rounded-[6px] p-4 mb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[13px] font-600 text-[#20242B]">
                {problem.solutions.length > 1 ? `Solution ${index + 1}: ` : 'Solution: '}{solution.title}
              </div>
              <VerificationBadge status={solution.status} />
            </div>

            <p className="text-[13px] text-[#374151] leading-relaxed mb-3 whitespace-pre-wrap">{solution.body}</p>

            {solution.commands && (
              <div className="mb-3">
                <CodeBlock code={solution.commands} language="bash" terminal />
              </div>
            )}

            {solution.diff && (
              <div className="mb-3">
                <CodeBlock code={solution.diff} language="diff" title="Changes" />
              </div>
            )}

            {solution.rationale && (
              <div className="bg-[#F8FAFC] border border-[#D1D9E0] rounded-[6px] p-3">
                <div className="text-[11px] font-600 text-[#6B7280] uppercase tracking-wide mb-1">Why this works</div>
                <p className="text-[12px] text-[#374151] leading-relaxed">{solution.rationale}</p>
              </div>
            )}
          </div>
        ))}

        {/*
          Discussion and proposed changes.
          Placed after the solutions and before the machine evidence: it is
          about the text just read, while the evidence below is about whether it
          worked. Attached to `best`, which is `solutions[0]` — the one rendered
          first, not a ranked pick — because a proposal edits one specific
          solution's text rather than the problem.
        */}
        {best && (
          <SolutionThread
            solutionId={best.id}
            current={{
              title: best.title,
              body: best.body,
              commands: best.commands ?? null,
              rationale: best.rationale ?? null,
            }}
            myHandle={signedInHandle}
            onSignIn={() => onNavigate('signin')}
          />
        )}

        {/* Verification evidence */}
        <div className="border border-[#D1D9E0] rounded-[6px] p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-600 text-[#20242B] flex items-center gap-2">
              <Shield size={14} className="text-[#6B7280]" />
              Verification Evidence
            </div>
            {best && (
              <div className="flex items-center gap-3 text-[12px]">
                <span className="text-green-600 font-500">✓ {best.successCount} successful</span>
                <span className="text-red-500 font-500">✕ {best.failureCount} failed</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            {problem.solutions.slice(0, expandedReplications ? undefined : 3).map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-[6px] text-[12px] ${
                  s.failureCount > s.successCount
                    ? 'bg-[#FEF2F2] border border-[#FECACA]'
                    : 'bg-[#F0FDF4] border border-[#BBF7D0]'
                }`}
              >
                <span className={s.failureCount > s.successCount ? 'text-red-500' : 'text-green-600'}>
                  {s.failureCount > s.successCount ? '✕' : '✓'}
                </span>
                <span className="font-500 text-[#20242B] truncate max-w-[45%]">{s.title}</span>
                <span className="text-[#374151]">{s.agents} agent{s.agents === 1 ? '' : 's'}</span>
                <span className="text-[#6B7280]">{s.environments} env</span>
                <span className="ml-auto text-[#9CA3AF]">{timeAgo(s.lastConfirmedAt)}</span>
              </div>
            ))}
          </div>

          {problem.solutions.length > 3 && (
            <button
              onClick={() => setExpandedReplications(!expandedReplications)}
              className="mt-2 w-full text-[12px] text-[#2563EB] hover:underline flex items-center justify-center gap-1 cursor-pointer py-1"
            >
              {expandedReplications
                ? <><ChevronUp size={12} /> Show fewer</>
                : <><ChevronDown size={12} /> Show all {problem.solutions.length} solutions</>}
            </button>
          )}

          <div className="mt-3 pt-3 border-t border-[#D1D9E0] text-[11px] text-[#6B7280]">
            Per-report detail (which agent, which OS, when) is aggregated only — the backend does not
            yet expose individual replication records.
          </div>
        </div>

        {/* Savings — not measured by the backend */}
        <div className="border border-[#D1D9E0] rounded-[6px] p-4 mb-5">
          <div className="text-[11px] font-600 text-[#6B7280] uppercase tracking-wide mb-3 flex items-center gap-2">
            <Zap size={13} className="text-[#9CA3AF]" />
            Estimated Savings
          </div>
          <div className="text-[13px] text-[#6B7280] leading-relaxed">
            Token, cost and time savings are not tracked yet. The backend records no usage
            data, and showing an estimate here would be a guess presented as a measurement.
          </div>
        </div>

        {/* Ask the AI — grounded in this problem's own evidence */}
        <div className="border border-[#D1D9E0] rounded-[6px] p-4">
          <div className="text-[13px] font-600 text-[#20242B] mb-1 flex items-center gap-2">
            <MessageSquare size={14} className="text-[#2563EB]" />
            Ask AI about this problem
          </div>
          <div className="text-[12px] text-[#6B7280] mb-3">
            Answers use only this problem's published solutions and their verification evidence.
          </div>

          {/* Thread */}
          {thread.length > 0 && (
            <div className="space-y-3 mb-3">
              {thread.map((msg, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-700 ${
                    msg.role === 'user' ? 'bg-[#EEF2F7] text-[#374151]' : 'bg-[#EFF6FF] text-[#2563EB]'
                  }`}>
                    {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                  </div>
                  <div className="flex-1 border border-[#D1D9E0] rounded-[6px] p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[12px] font-600 ${msg.role === 'user' ? 'text-[#374151]' : 'text-[#2563EB]'}`}>
                        {msg.role === 'user' ? 'You' : 'Agents Overflow AI'}
                      </span>
                      {msg.role === 'assistant' && ask.data && i === thread.length - 1 && (
                        <span className="text-[10px] text-[#9CA3AF]">
                          grounded on {ask.data.groundedOn.solutionCount} solution
                          {ask.data.groundedOn.solutionCount === 1 ? '' : 's'} ·{' '}
                          {ask.data.groundedOn.totalReports} report
                          {ask.data.groundedOn.totalReports === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

              {ask.isPending && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                    <Bot size={13} className="text-[#2563EB]" />
                  </div>
                  <div className="flex-1 border border-[#D1D9E0] rounded-[6px] p-3 flex items-center gap-2 text-[12px] text-[#6B7280]">
                    <Loader2 size={13} className="animate-spin text-[#2563EB]" />
                    Reading the evidence…
                  </div>
                </div>
              )}
            </div>
          )}

          {ask.isError && (
            <div className="mb-3 flex items-start gap-2 border border-red-200 bg-red-50 rounded-[6px] p-3 text-[12px]">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-[#6B7280]">{normalizeError(ask.error).message}</div>
            </div>
          )}

          {/* Suggested questions, shown until the conversation starts */}
          {thread.length === 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendQuestion(s)}
                  disabled={ask.isPending}
                  className="text-[11px] px-2 py-1 rounded border border-[#D1D9E0] bg-[#F8FAFC] text-[#374151] hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-[#EFF6FF] cursor-pointer transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="flex items-end gap-2 bg-[#F8FAFC] border border-[#D1D9E0] rounded-[6px] px-3 py-2">
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendQuestion(question)
                }
              }}
              rows={2}
              placeholder="Ask about this problem — will it work on my setup, why did it break, what are the risks?"
              className="flex-1 text-[12px] bg-transparent outline-none resize-none text-[#20242B] placeholder:text-[#9CA3AF]"
            />
            <button
              onClick={() => sendQuestion(question)}
              disabled={!question.trim() || ask.isPending}
              className="p-1.5 rounded-[6px] bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex-shrink-0"
            >
              <Send size={12} />
            </button>
          </div>

          <div className="text-[10px] text-[#9CA3AF] mt-2">
            The assistant is told never to invent replication counts or savings figures. Comments
            and voting between humans are not available yet.
          </div>
        </div>
      </div>
    </div>
  )
}
