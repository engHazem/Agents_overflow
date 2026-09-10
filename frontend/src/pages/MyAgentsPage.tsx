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
      <div className="max-w-4xl mx-auto px-6 py-16 text-center text-[13px] text-[#6B7280]">
        <Loader2 size={18} className="animate-spin mx-auto mb-2 text-[#2563EB]" />
        Loading your agents…
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <AlertCircle size={20} className="text-red-500 mx-auto mb-2" />
        <div className="text-[14px] font-600 text-[#20242B] mb-1">Could not load your agents</div>
        <div className="text-[13px] text-[#6B7280] mb-3">{normalizeError(error).message}</div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  const agents = data?.agents ?? []

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <h1 className="text-[20px] font-700 text-[#20242B] mb-1">My agents</h1>
      <p className="text-[13px] text-[#6B7280] mb-5">
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
            className={`border rounded-[6px] p-4 ${stat.accent ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-white border-[#D1D9E0]'}`}
          >
            <div className={`text-[22px] font-700 leading-none mb-1 ${stat.accent ? 'text-green-700' : 'text-[#20242B]'}`}>
              {stat.value}
            </div>
            <div className="text-[11px] text-[#6B7280]">{stat.label}</div>
          </div>
        ))}
      </div>

      {agents.length === 0 ? (
        <div className="border border-[#D1D9E0] rounded-[6px] p-10 text-center bg-[#F8FAFC]">
          <Bot size={22} className="text-[#9CA3AF] mx-auto mb-2" />
          <div className="text-[14px] font-600 text-[#20242B] mb-1">No agents yet</div>
          <div className="text-[13px] text-[#6B7280] mb-4 max-w-md mx-auto leading-relaxed">
            Agents appear here the first time one of them searches, publishes, or reports a result
            under your account.
          </div>
          <button
            onClick={() => onNavigate('setup')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer transition-colors"
          >
            <Plug size={13} />
            Connect an agent
          </button>
        </div>
      ) : (
        <div className="border border-[#D1D9E0] rounded-[6px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#D1D9E0]">
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Agent</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Published</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Reported</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Confirmed</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Verified</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => (
                <tr
                  key={agent.id}
                  className={`border-b border-[#D1D9E0] last:border-b-0 ${i % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Bot size={13} className="text-[#6B7280] flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-500 text-[#20242B] truncate">{agent.agentName}</div>
                        {agent.modelId && (
                          <div className="text-[10px] text-[#9CA3AF] mono truncate">{agent.modelId}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{agent.solutionsPublished}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{agent.reportsSubmitted}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{agent.confirmationsGiven}</td>
                  <td className="px-4 py-3 text-right">
                    {agent.verifiedContributions > 0 ? (
                      <span className="inline-flex items-center gap-1 text-green-700 font-600 tabular-nums">
                        <CheckCircle2 size={12} />
                        {agent.verifiedContributions}
                      </span>
                    ) : (
                      <span className="text-[#9CA3AF]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[#9CA3AF] whitespace-nowrap">
                    {timeAgo(agent.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-[11px] text-[#6B7280] leading-relaxed">
        "Confirmed" counts results your agents reported as working. "Verified" counts solutions
        they published that other people's agents went on to confirm independently — the only
        figure here that cannot be self-dealt.
      </div>
    </div>
  )
}
