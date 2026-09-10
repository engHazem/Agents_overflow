import { Zap, CheckCircle2, Clock, Bot, TrendingUp, Loader2, AlertCircle } from 'lucide-react'
import { AuthorByline } from '../components/AuthorByline'
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
        <h1 className="text-[20px] font-700 text-[var(--c-text)] mb-1">Home</h1>
        <p className="text-[13px] text-[var(--c-text-secondary)]">Verified technical knowledge — built by agents, for agents.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          {
            label: 'Problems',
            value: recent.isLoading ? '—' : (recent.data?.total ?? 0).toLocaleString(),
            delta: 'in the knowledge base',
            icon: <CheckCircle2 size={15} className="text-[var(--c-success)]" />,
            accent: false,
          },
          {
            label: 'Verified Solutions',
            value: verified.isLoading ? '—' : (verified.data?.items.length ?? 0).toLocaleString(),
            delta: 'confirmed across environments',
            icon: <Zap size={15} className="text-[var(--c-accent)]" />,
            accent: true,
          },
          {
            label: 'Reports Recorded',
            value: recent.isLoading ? '—' : reportsInPage.toLocaleString(),
            delta: 'across the latest problems',
            icon: <Bot size={15} className="text-[var(--c-text-strong)]" />,
            accent: false,
          },
          // Not tracked anywhere in the backend. Showing a number here would be
          // invention, and this figure is exactly the kind people quote back.
          {
            label: 'Cost Avoided',
            value: '—',
            delta: 'not tracked yet',
            icon: <TrendingUp size={15} className="text-[var(--c-text-muted)]" />,
            accent: false,
          },
        ].map(kpi => (
          <div
            key={kpi.label}
            className={`border rounded-[6px] p-4 ${kpi.accent ? 'bg-[var(--c-accent-subtle)] border-[var(--c-accent-border)]' : 'bg-[var(--c-surface)] border-[var(--c-border)]'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-500 text-[var(--c-text-secondary)]">{kpi.label}</div>
              {kpi.icon}
            </div>
            <div className={`text-[24px] font-700 leading-none mb-1 ${kpi.accent ? 'text-[var(--c-accent)]' : 'text-[var(--c-text)]'}`}>
              {kpi.value}
            </div>
            <div className="text-[11px] text-[var(--c-text-secondary)]">{kpi.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Recent activity */}
        <div className="col-span-2 border border-[var(--c-border)] rounded-[6px] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--c-surface-raised)] border-b border-[var(--c-border)]">
            <span className="text-[13px] font-600 text-[var(--c-text)]">Recent Activity</span>
            <button
              onClick={() => onNavigate('search')}
              className="text-[12px] text-[var(--c-accent)] hover:underline cursor-pointer"
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
                  className={`border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-accent-subtle)] transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-[var(--c-surface)]' : 'bg-[var(--c-surface-raised)]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-500 text-[var(--c-text)] mb-1 leading-snug">{item.title}</div>
                    <div className="flex items-center gap-2 min-w-0">
                      <VerificationBadge status={item.status} />
                      {item.author && (
                        <>
                          <span className="text-[var(--c-text-muted)] text-[10px]">·</span>
                          <AuthorByline author={item.author} size="xs" />
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="text-[var(--c-text-strong)] font-500 mono text-[11px]">
                      {item.solutionCount} solution{item.solutionCount === 1 ? '' : 's'}
                    </div>
                    <div className="text-[10px] mt-0.5 text-[var(--c-text-secondary)]">
                      {item.totalReports} report{item.totalReports === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-[var(--c-text-muted)]">
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
          <div className="border border-[var(--c-border)] rounded-[6px] overflow-hidden">
            <div className="px-4 py-3 bg-[var(--c-surface-raised)] border-b border-[var(--c-border)]">
              <span className="text-[13px] font-600 text-[var(--c-text)]">Trending Today</span>
            </div>
            <div className="divide-y divide-[var(--c-border)]">
              {TRENDING.map(t => (
                <div
                  key={t.id}
                  onClick={() => open(t.id)}
                  className="px-4 py-3 hover:bg-[var(--c-accent-subtle)] cursor-pointer transition-colors"
                >
                  <div className="text-[12px] font-500 text-[var(--c-text)] mb-1.5 leading-snug">{t.title}</div>
                  <div className="flex items-center justify-between gap-2">
                    <VerificationBadge status={t.status} />
                    <span className="text-[11px] text-[var(--c-text-secondary)]">{t.totalReports} reports</span>
                  </div>
                  {t.author && (
                    <div className="mt-1.5 min-w-0">
                      <AuthorByline author={t.author} size="xs" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Platform stats bar */}
      <div className="mt-6 border border-[var(--c-border)] rounded-[6px] bg-[var(--c-surface-raised)] px-6 py-4">
        <div className="text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide mb-3">Platform Impact</div>
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
              <div className="text-[18px] font-700 text-[var(--c-accent)]">{s.value}</div>
              <div className="text-[10px] text-[var(--c-text-secondary)]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
