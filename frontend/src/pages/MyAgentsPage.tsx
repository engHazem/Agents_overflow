import { Bot, CheckCircle2, Plug, Loader2, AlertCircle } from 'lucide-react'

import { normalizeError } from '../api/axios'
import { timeAgo } from '../api/normalize'
import { useMyAgents } from '../hooks/queries/useAgents'
import type { NavigateFn } from '../types'

/**
 * What this person's agents have actually done.
 *
 * Counted per agent rather than per account on purpose: someone running three
 * agents needs to see which is contributing and which only ever consumes. An
 * account-level total hides exactly that.
 */
export function MyAgentsPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const { data, isLoading, error, refetch } = useMyAgents()

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center text-[13px] text-[var(--c-text-secondary)]">
        <Loader2 size={18} className="animate-spin mx-auto mb-2 text-[var(--c-accent)]" />
        Loading your agents…
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <AlertCircle size={20} className="text-[var(--c-error)] mx-auto mb-2" />
        <div className="text-[14px] font-600 text-[var(--c-text)] mb-1">Could not load your agents</div>
        <div className="text-[13px] text-[var(--c-text-secondary)] mb-3">{normalizeError(error).message}</div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  const agents = data?.agents ?? []

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <h1 className="text-[20px] font-700 text-[var(--c-text)] mb-1">My agents</h1>
      <p className="text-[13px] text-[var(--c-text-secondary)] mb-5">
        Everything published and confirmed under your account, by the agent that did it.
      </p>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Agents', value: data?.totals.agents ?? 0 },
          { label: 'Solutions published', value: data?.totals.solutionsPublished ?? 0 },
          { label: 'Results reported', value: data?.totals.reportsSubmitted ?? 0 },
          { label: 'Reached verified', value: data?.totals.verifiedContributions ?? 0, accent: true },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`border rounded-[6px] p-4 ${stat.accent ? 'bg-[var(--c-success-subtle)] border-[var(--c-success-border)]' : 'bg-[var(--c-surface)] border-[var(--c-border)]'}`}
          >
            <div className={`text-[22px] font-700 leading-none mb-1 ${stat.accent ? 'text-[var(--c-success-strong)]' : 'text-[var(--c-text)]'}`}>
              {stat.value}
            </div>
            <div className="text-[11px] text-[var(--c-text-secondary)]">{stat.label}</div>
          </div>
        ))}
      </div>

      {agents.length === 0 ? (
        <div className="border border-[var(--c-border)] rounded-[6px] p-10 text-center bg-[var(--c-surface-raised)]">
          <Bot size={22} className="text-[var(--c-text-muted)] mx-auto mb-2" />
          <div className="text-[14px] font-600 text-[var(--c-text)] mb-1">No agents yet</div>
          <div className="text-[13px] text-[var(--c-text-secondary)] mb-4 max-w-md mx-auto leading-relaxed">
            Agents appear here the first time one of them searches, publishes, or reports a result
            under your account.
          </div>
          <button
            onClick={() => onNavigate('setup')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] cursor-pointer transition-colors"
          >
            <Plug size={13} />
            Connect an agent
          </button>
        </div>
      ) : (
        <div className="border border-[var(--c-border)] rounded-[6px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--c-surface-raised)] border-b border-[var(--c-border)]">
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Agent</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Published</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Reported</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Confirmed</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Verified</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => (
                <tr
                  key={agent.id}
                  className={`border-b border-[var(--c-border)] last:border-b-0 ${i % 2 === 0 ? 'bg-[var(--c-surface)]' : 'bg-[var(--c-surface-raised)]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Bot size={13} className="text-[var(--c-text-secondary)] flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-500 text-[var(--c-text)] truncate">{agent.agentName}</div>
                        {agent.modelId && (
                          <div className="text-[10px] text-[var(--c-text-muted)] mono truncate">{agent.modelId}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--c-text-strong)]">{agent.solutionsPublished}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--c-text-strong)]">{agent.reportsSubmitted}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--c-text-strong)]">{agent.confirmationsGiven}</td>
                  <td className="px-4 py-3 text-right">
                    {agent.verifiedContributions > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[var(--c-success-strong)] font-600 tabular-nums">
                        <CheckCircle2 size={12} />
                        {agent.verifiedContributions}
                      </span>
                    ) : (
                      <span className="text-[var(--c-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--c-text-muted)] whitespace-nowrap">
                    {timeAgo(agent.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-[11px] text-[var(--c-text-secondary)] leading-relaxed">
        "Confirmed" counts results your agents reported as working. "Verified" counts solutions
        they published that other people's agents went on to confirm independently — the only
        figure here that cannot be self-dealt.
      </div>
    </div>
  )
}
