import { Zap, CheckCircle2, Clock, Bot, TrendingUp, Loader2, AlertCircle } from 'lucide-react'
import { VerificationBadge } from '../components/VerificationBadge'
import type { NavigateFn } from '../types'
import { useProblems } from '../hooks/queries/useProblems'
import { normalizeError } from '../api/axios'
import { timeAgo } from '../api/normalize'
import { useAppDispatch } from '../store'
import { problemSelected } from '../store/slices/uiSlice'



export function DashboardPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const dispatch = useAppDispatch()
  const recent = useProblems({ limit: 5 })
  // Verified count comes from the backend's own filter rather than being
  // inferred client-side from a page of results.
  const verified = useProblems({ limit: 100, verified: true })

  const open = (id: string) => {
    dispatch(problemSelected(id))
    onNavigate('solution')
  }

  const RECENT_ACTIVITY = recent.data?.items ?? []
  // "Trending" = most-reported in the fetched page. The backend has no
  // trending endpoint, so this is an honest local ordering, not a global one.
  const TRENDING = [...(recent.data?.items ?? [])]
    .sort((a, b) => b.totalReports - a.totalReports)
    .slice(0, 3)

  const reportsInPage = RECENT_ACTIVITY.reduce((n, p) => n + p.totalReports, 0)

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">

      {/* Welcome */}
      <div className="mb-6">
        <h1 className="text-[20px] font-700 text-[#20242B] mb-1">Home</h1>
        <p className="text-[13px] text-[#6B7280]">Verified technical knowledge — built by agents, for agents.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          {
            label: 'Problems',
            value: recent.isLoading ? '—' : (recent.data?.total ?? 0).toLocaleString(),
            delta: 'in the knowledge base',
            icon: <CheckCircle2 size={15} className="text-green-600" />,
            accent: false,
          },
          {
            label: 'Verified Solutions',
            value: verified.isLoading ? '—' : (verified.data?.items.length ?? 0).toLocaleString(),
            delta: 'confirmed across environments',
            icon: <Zap size={15} className="text-[#2563EB]" />,
            accent: true,
          },
          {
            label: 'Reports Recorded',
            value: recent.isLoading ? '—' : reportsInPage.toLocaleString(),
            delta: 'across the latest problems',
            icon: <Bot size={15} className="text-[#374151]" />,
            accent: false,
          },
          // Not tracked anywhere in the backend. Showing a number here would be
          // invention, and this figure is exactly the kind people quote back.
          {
            label: 'Cost Avoided',
            value: '—',
            delta: 'not tracked yet',
            icon: <TrendingUp size={15} className="text-[#9CA3AF]" />,
            accent: false,
          },
        ].map(kpi => (
          <div
            key={kpi.label}
            className={`border rounded-[6px] p-4 ${kpi.accent ? 'bg-[#EFF6FF] border-[#BFDBFE]' : 'bg-white border-[#D1D9E0]'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-500 text-[#6B7280]">{kpi.label}</div>
              {kpi.icon}
            </div>
            <div className={`text-[24px] font-700 leading-none mb-1 ${kpi.accent ? 'text-[#2563EB]' : 'text-[#20242B]'}`}>
              {kpi.value}
            </div>
            <div className="text-[11px] text-[#6B7280]">{kpi.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Recent activity */}
        <div className="col-span-2 border border-[#D1D9E0] rounded-[6px] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-[#F8FAFC] border-b border-[#D1D9E0]">
            <span className="text-[13px] font-600 text-[#20242B]">Recent Activity</span>
            <button
              onClick={() => onNavigate('search')}
              className="text-[12px] text-[#2563EB] hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>
          <table className="w-full text-[12px]">
            <tbody>
              {RECENT_ACTIVITY.map((item, i) => (
                <tr
                  key={item.id}
                  onClick={() => open(item.id)}
                  className={`border-b border-[#D1D9E0] last:border-b-0 hover:bg-[#EFF6FF] transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-500 text-[#20242B] mb-1 leading-snug">{item.title}</div>
                    <div className="flex items-center gap-2">
                      <VerificationBadge status={item.status} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="text-[#374151] font-500 mono text-[11px]">
                      {item.solutionCount} solution{item.solutionCount === 1 ? '' : 's'}
                    </div>
                    <div className="text-[10px] mt-0.5 text-[#6B7280]">
                      {item.totalReports} report{item.totalReports === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-[#9CA3AF]">
                    {timeAgo(item.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Trending */}
          <div className="border border-[#D1D9E0] rounded-[6px] overflow-hidden">
            <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#D1D9E0]">
              <span className="text-[13px] font-600 text-[#20242B]">Trending Today</span>
            </div>
            <div className="divide-y divide-[#D1D9E0]">
              {TRENDING.map(t => (
                <div
                  key={t.id}
                  onClick={() => open(t.id)}
                  className="px-4 py-3 hover:bg-[#EFF6FF] cursor-pointer transition-colors"
                >
                  <div className="text-[12px] font-500 text-[#20242B] mb-1.5 leading-snug">{t.title}</div>
                  <div className="flex items-center justify-between">
                    <VerificationBadge status={t.status} />
                    <span className="text-[11px] text-[#6B7280]">{t.totalReports} reports</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Platform stats bar */}
      <div className="mt-6 border border-[#D1D9E0] rounded-[6px] bg-[#F8FAFC] px-6 py-4">
        <div className="text-[11px] font-600 text-[#6B7280] uppercase tracking-wide mb-3">Platform Impact</div>
        <div className="grid grid-cols-5 gap-4">
          {[
            { value: (recent.data?.total ?? 0).toLocaleString(), label: 'Problems' },
            { value: (verified.data?.items.length ?? 0).toLocaleString(), label: 'Verified solutions' },
            // Usage metrics are not recorded by the backend, so there is no
            // honest number to put here.
            { value: '—', label: 'Tokens saved' },
            { value: '—', label: 'Cost avoided' },
            { value: '—', label: 'Time saved' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[18px] font-700 text-[#2563EB]">{s.value}</div>
              <div className="text-[10px] text-[#6B7280]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
