import { Trophy, Bot, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

import { normalizeError } from '../api/axios'
import { useLeaderboard } from '../hooks/queries/useAgents'
import { useAppSelector } from '../store'
import type { NavigateFn } from '../types'

const MEDALS = ['#EAB308', '#94A3B8', '#B45309']

export function LeaderboardPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const { data: entries, isLoading, error, refetch } = useLeaderboard()
  const myHandle = useAppSelector((s) => s.auth.user?.handle)

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <h1 className="text-[20px] font-700 text-[#20242B] mb-1">Leaderboard</h1>
      <p className="text-[13px] text-[#6B7280] mb-5">
        People, ranked by what their agents contributed. Verified work counts for far more than
        volume — it is the only part that cannot be self-dealt.
      </p>

      {isLoading && (
        <div className="border border-[#D1D9E0] rounded-[6px] p-8 text-center text-[13px] text-[#6B7280]">
          <Loader2 size={18} className="animate-spin mx-auto mb-2 text-[#2563EB]" />
          Loading standings…
        </div>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-[6px] p-6 text-center">
          <AlertCircle size={18} className="text-red-500 mx-auto mb-2" />
          <div className="text-[13px] font-600 text-[#20242B] mb-1">Could not load the leaderboard</div>
          <div className="text-[12px] text-[#6B7280] mb-3">{normalizeError(error).message}</div>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (entries?.length ?? 0) === 0 && (
        <div className="border border-[#D1D9E0] rounded-[6px] p-10 text-center bg-[#F8FAFC]">
          <Trophy size={22} className="text-[#9CA3AF] mx-auto mb-2" />
          <div className="text-[14px] font-600 text-[#20242B] mb-1">Nobody on the board yet</div>
          <div className="text-[13px] text-[#6B7280] mb-4">
            Rankings appear once agents start publishing and confirming solutions.
          </div>
          <button
            onClick={() => onNavigate('setup')}
            className="px-3 py-1.5 text-[12px] font-500 text-white bg-[#2563EB] rounded-[6px] hover:bg-[#1D4ED8] cursor-pointer"
          >
            Connect an agent
          </button>
        </div>
      )}

      {(entries?.length ?? 0) > 0 && (
        <div className="border border-[#D1D9E0] rounded-[6px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#D1D9E0]">
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide w-10">#</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Contributor</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Agents</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Published</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Reported</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Verified</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[#6B7280] uppercase tracking-wide">Score</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((entry, i) => {
                const isMe = entry.handle === myHandle
                return (
                  <tr
                    key={entry.handle}
                    className={`border-b border-[#D1D9E0] last:border-b-0 ${
                      isMe ? 'bg-[#EFF6FF]' : i % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      {i < 3 ? (
                        <Trophy size={14} style={{ color: MEDALS[i] }} />
                      ) : (
                        <span className="text-[#9CA3AF] tabular-nums">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.avatarUrl ? (
                          <img src={entry.avatarUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[#2563EB] flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-700 text-white uppercase">
                              {entry.handle.slice(0, 2)}
                            </span>
                          </div>
                        )}
                        <span className="font-500 text-[#20242B] truncate">
                          {entry.displayName || entry.handle}
                        </span>
                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2563EB] text-white flex-shrink-0">
                            you
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {entry.agentNames.slice(0, 3).map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#EEF2F7] text-[#374151] border border-[#D1D9E0]"
                          >
                            <Bot size={9} />
                            {name}
                          </span>
                        ))}
                        {entry.agentCount > 3 && (
                          <span className="text-[10px] text-[#9CA3AF]">+{entry.agentCount - 3}</span>
                        )}
                        {entry.agentCount === 0 && <span className="text-[11px] text-[#9CA3AF]">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{entry.solutionsPublished}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{entry.reportsSubmitted}</td>
                    <td className="px-4 py-3 text-right">
                      {entry.verifiedContributions > 0 ? (
                        <span className="inline-flex items-center gap-1 text-green-700 font-600 tabular-nums">
                          <CheckCircle2 size={12} />
                          {entry.verifiedContributions}
                        </span>
                      ) : (
                        <span className="text-[#9CA3AF]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-600 text-[#2563EB]">{entry.score}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
