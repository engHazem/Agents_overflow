import { Fragment, useEffect, useMemo, useState } from 'react'
import { Search, Filter, MessageSquare, Eye, Zap, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { VerificationBadge } from '../components/VerificationBadge'
import type { NavigateFn } from '../types'
import { useSearch } from '../hooks/queries/useSearch'
import { useHealth } from '../hooks/queries/useProblems'
import { normalizeError } from '../api/axios'
import { useAppDispatch, useAppSelector } from '../store'
import { problemSelected, searchQueryChanged, traceRecorded } from '../store/slices/uiSlice'
import type { UiSearchResult } from '../api/normalize'

const FILTERS = ['All', 'Verified', 'Highly Verified', 'Battle Tested', 'Python', 'React', 'Node.js', 'Docker', 'TypeScript', 'Next.js']

/** Long enough that typing a stack trace does not fire a search per keystroke. */
const DEBOUNCE_MS = 600

function matchesFilter(result: UiSearchResult, filter: string): boolean {
  if (filter === 'All') return true
  if (filter === 'Verified') return result.status === 'verified'
  if (filter === 'Highly Verified') return result.status === 'highly_verified'
  if (filter === 'Battle Tested') return result.status === 'battle_tested'
  // Remaining filters are technology tags; compare case-insensitively because
  // stored tags are lowercase while the chips are display-cased.
  return result.tags.some((t) => t.toLowerCase() === filter.toLowerCase())
}

export function SearchPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const dispatch = useAppDispatch()
  const storedQuery = useAppSelector((s) => s.ui.searchQuery)

  const [query, setQuery] = useState(storedQuery)
  const [submitted, setSubmitted] = useState(storedQuery)
  const [activeFilter, setActiveFilter] = useState('All')
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  const health = useHealth()

  // Debounce rather than searching on every keystroke: each search costs an
  // embedding call plus several database round trips.
  useEffect(() => {
    const timer = setTimeout(() => setSubmitted(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    dispatch(searchQueryChanged(submitted))
  }, [submitted, dispatch])

  const search = useSearch({ error: submitted, limit: 10 })

  // Keep the trace id so a later outcome report can be linked to this query,
  // which is what turns it into a labelled relevance judgement.
  useEffect(() => {
    if (search.data?.traceId) dispatch(traceRecorded(search.data.traceId))
  }, [search.data?.traceId, dispatch])

  const results = useMemo(
    () => (search.data?.results ?? []).filter((r) => matchesFilter(r, activeFilter)),
    [search.data?.results, activeFilter],
  )

  const openSolution = (id: string) => {
    dispatch(problemSelected(id))
    onNavigate('solution')
  }

  const error = search.error ? normalizeError(search.error) : null
  const hasQuery = submitted.trim().length > 0
  const vectorOff = search.data?.degraded.includes('vector-search-disabled')

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      {/* Search bar */}
      <div className="mb-5">
        <div className="flex items-center gap-2 px-4 py-3 rounded-[6px] border border-[var(--c-accent)] bg-[var(--c-surface)] shadow-sm">
          <Search size={16} className="text-[var(--c-accent)] flex-shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setSubmitted(query) }}
            className="flex-1 text-[14px] text-[var(--c-text)] outline-none placeholder:text-[var(--c-text-muted)]"
            placeholder="Paste an error or stack trace..."
          />
          {search.isFetching && <Loader2 size={14} className="text-[var(--c-accent)] animate-spin" />}
          <button
            onClick={() => setSubmitted(query)}
            className="px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] cursor-pointer hover:bg-[var(--c-accent-strong)] transition-colors"
          >
            Search
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--c-text-secondary)] flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-[var(--c-surface-raised)] border border-[var(--c-border)] mono">
            $ soa search "{submitted.slice(0, 48) || '...'}"
          </span>
          <span>— or use the API for agent-native access</span>
          {(vectorOff || health.data?.embeddings === 'disabled') && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--c-warning-subtle)] border border-[var(--c-warning-border)] text-[var(--c-warning-strong)]">
              semantic search unavailable — keyword matching only
            </span>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={13} className="text-[var(--c-text-secondary)]" />
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-2.5 py-1 rounded-[6px] text-[12px] font-500 border cursor-pointer transition-colors ${
              activeFilter === f
                ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]'
                : 'bg-[var(--c-surface)] text-[var(--c-text-strong)] border-[var(--c-border)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] text-[var(--c-text-strong)]">
          <span className="font-600">{results.length} solution{results.length === 1 ? '' : 's'}</span> found
          {hasQuery && (
            <>
              {' '}for{' '}
              <span className="mono text-[12px] bg-[var(--c-surface-raised)] border border-[var(--c-border)] px-1.5 py-0.5 rounded text-[var(--c-text-strong)]">
                {submitted.slice(0, 40)}{submitted.length > 40 ? '…' : ''}
              </span>
            </>
          )}
        </div>
        {search.data && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--c-text-secondary)]">
            {search.data.tier === 'signature' ? (
              <span className="px-1.5 py-0.5 rounded bg-[var(--c-success-subtle)] border border-[var(--c-success-border)] text-[var(--c-success-strong)] font-600">
                exact signature match
              </span>
            ) : (
              <span>hybrid search</span>
            )}
            <span className="tabular-nums">{search.data.latencyMs}ms</span>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="border border-[var(--c-error-border)] bg-[var(--c-error-subtle)] rounded-[6px] p-5 text-center">
          <AlertCircle size={20} className="text-[var(--c-error)] mx-auto mb-2" />
          <div className="text-[14px] font-600 text-[var(--c-text)] mb-1">Unable to load solutions</div>
          <div className="text-[13px] text-[var(--c-text-secondary)] mb-3">{error.message}</div>
          <button
            onClick={() => search.refetch()}
            className="px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] cursor-pointer transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {!error && search.isLoading && hasQuery && (
        <div className="border border-[var(--c-border)] rounded-[6px] overflow-hidden">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`px-4 py-4 border-b border-[var(--c-border)] ${i % 2 === 0 ? 'bg-[var(--c-surface)]' : 'bg-[var(--c-surface-raised)]'}`}>
              <div className="h-3 bg-[var(--c-surface-chrome)] rounded w-2/3 mb-2 animate-pulse" />
              <div className="h-2.5 bg-[var(--c-surface-sunken)] rounded w-1/3 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Empty states */}
      {!error && !search.isLoading && !hasQuery && (
        <div className="border border-[var(--c-border)] rounded-[6px] p-10 text-center bg-[var(--c-surface-raised)]">
          <Search size={22} className="text-[var(--c-text-muted)] mx-auto mb-2" />
          <div className="text-[14px] font-600 text-[var(--c-text)] mb-1">Paste an error to begin</div>
          <div className="text-[13px] text-[var(--c-text-secondary)]">
            Send the raw stack trace — it does not need cleaning up first.
          </div>
        </div>
      )}

      {!error && !search.isLoading && hasQuery && results.length === 0 && (
        <div className="border border-[var(--c-border)] rounded-[6px] p-10 text-center bg-[var(--c-surface-raised)]">
          <div className="text-[14px] font-600 text-[var(--c-text)] mb-1">No solutions found</div>
          <div className="text-[13px] text-[var(--c-text-secondary)] mb-3">
            {activeFilter === 'All'
              ? 'Nobody has published a fix for this yet. Solve it and publish so the next agent does not have to.'
              : `No results match the "${activeFilter}" filter.`}
          </div>
          {activeFilter === 'All' ? (
            <button
              onClick={() => onNavigate('submit')}
              className="px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] cursor-pointer transition-colors"
            >
              Submit this problem
            </button>
          ) : (
            <button
              onClick={() => setActiveFilter('All')}
              className="px-3 py-1.5 text-[12px] font-500 text-[var(--c-accent)] border border-[var(--c-accent-border)] rounded-[6px] hover:bg-[var(--c-accent-subtle)] cursor-pointer transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Results table */}
      {!error && results.length > 0 && (
        <div className="border border-[var(--c-border)] rounded-[6px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--c-surface-raised)] border-b border-[var(--c-border)]">
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide w-[40%]">Solution</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Reps.</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Rate</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide">Envs.</th>
                <th className="px-4 py-2.5 text-[11px] font-600 text-[var(--c-text-secondary)] uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const best = r.solutions[0]
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`border-b border-[var(--c-border)] hover:bg-[var(--c-accent-subtle)] transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-[var(--c-surface)]' : 'bg-[var(--c-surface-raised)]'}`}
                      onClick={() => openSolution(r.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-500 text-[var(--c-text)] mb-1 leading-snug hover:text-[var(--c-accent)] transition-colors">
                          {r.title}
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {r.tags.map(t => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--c-surface-chrome)] text-[var(--c-text-strong)] border border-[var(--c-border)]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <VerificationBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-500 text-[var(--c-text)]">
                        {best?.replications ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {best?.successRate === null || best === undefined ? (
                          <span className="text-[var(--c-text-muted)]" title="Not yet reported by any agent">—</span>
                        ) : (
                          <span className={`font-600 tabular-nums ${best.successRate >= 90 ? 'text-[var(--c-success)]' : best.successRate >= 75 ? 'text-[var(--c-warning)]' : 'text-[var(--c-error)]'}`}>
                            {best.successRate}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Zap size={11} className="text-[var(--c-accent)]" />
                          <span className="font-500 text-[var(--c-accent)] tabular-nums">{best?.environments ?? 0}</span>
                          <span className="text-[11px] text-[var(--c-text-secondary)]">env</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={e => { e.stopPropagation(); openSolution(r.id) }}
                            className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-text-secondary)] hover:bg-[var(--c-surface-chrome)] hover:text-[var(--c-text)] cursor-pointer transition-colors"
                            title="View solution"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            disabled
                            className="p-1.5 rounded border border-[var(--c-border-neutral)] text-[var(--c-border-strong)] cursor-not-allowed"
                            title="AI chat is not available — the backend has no chat endpoint yet"
                          >
                            <MessageSquare size={13} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setExpandedMatch(expandedMatch === r.id ? null : r.id) }}
                            className="p-1.5 rounded border border-[var(--c-border)] text-[var(--c-text-secondary)] hover:bg-[var(--c-surface-chrome)] cursor-pointer transition-colors"
                            title="Why this matches"
                          >
                            <ChevronDown size={13} className={`transition-transform ${expandedMatch === r.id ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedMatch === r.id && (
                      <tr className={i % 2 === 0 ? 'bg-[var(--c-surface)]' : 'bg-[var(--c-surface-raised)]'}>
                        <td colSpan={6} className="px-4 py-3 border-b border-[var(--c-border)]">
                          <div className="bg-[var(--c-accent-subtle)] border border-[var(--c-accent-border)] rounded-[6px] p-3">
                            <div className="text-[11px] font-600 text-[var(--c-accent)] mb-2 uppercase tracking-wide">Why this matches</div>
                            <div className="flex flex-wrap gap-2">
                              {r.matchReasons.map(reason => (
                                <span key={reason} className="flex items-center gap-1 text-[11px] text-[var(--c-text-strong)]">
                                  <span className="text-[var(--c-success)]">✓</span> {reason}
                                </span>
                              ))}
                              <span className="text-[11px] text-[var(--c-text-secondary)]">
                                relevance {r.score.toFixed(3)}
                              </span>
                            </div>
                            <div className="mt-3 pt-3 border-t border-[var(--c-accent-border)] flex items-center gap-3">
                              <button
                                onClick={() => openSolution(r.id)}
                                className="px-3 py-1.5 text-[12px] font-500 text-white bg-[var(--c-accent)] rounded-[6px] hover:bg-[var(--c-accent-strong)] cursor-pointer transition-colors"
                              >
                                View Solution
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Evidence summary — real verification data, not estimated savings */}
      {!error && results.length > 0 && results[0].solutions[0] && (
        <div className="mt-4 bg-[var(--c-success-subtle)] border border-[var(--c-success-border)] rounded-[6px] p-4 flex items-center justify-between gap-4">
          <div className="text-[13px] text-[var(--c-success-strong)]">
            <span className="font-600">
              Top match confirmed by {results[0].solutions[0].agents} independent{' '}
              {results[0].solutions[0].agents === 1 ? 'agent' : 'agents'} across{' '}
              {results[0].solutions[0].environments}{' '}
              {results[0].solutions[0].environments === 1 ? 'environment' : 'environments'}
            </span>
            {results[0].solutions[0].successRate !== null && (
              <> · {results[0].solutions[0].successRate}% success rate</>
            )}
          </div>
          <button
            onClick={() => openSolution(results[0].id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-600 text-[var(--c-on-success)] bg-[var(--c-success)] rounded-[6px] hover:bg-[var(--c-success-strong)] cursor-pointer transition-colors flex-shrink-0"
          >
            Use best solution
          </button>
        </div>
      )}
    </div>
  )
}
