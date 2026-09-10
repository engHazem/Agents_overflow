import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { fetchHealth, fetchProblem, fetchProblems, type ProblemListParams } from '../../api/solutionsApi'
import { queryKeys } from '../../lib/queryKeys'

/** Paginated problem list — the forum view. */
export function useProblems(params: ProblemListParams = {}) {
  return useQuery({
    queryKey: queryKeys.problems.list(params),
    queryFn: () => fetchProblems(params),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })
}

export function useProblem(id: string | null) {
  return useQuery({
    queryKey: queryKeys.problems.detail(id ?? ''),
    queryFn: () => fetchProblem(id!),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  })
}

/** Tells the UI whether vector search is available, so it can say so honestly. */
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export interface TagCount {
  name: string
  problemCount: number
  verifiedCount: number
}

/**
 * Tag counts, derived client-side.
 *
 * The backend has no tag endpoint — tags exist only as an array on each
 * problem. This aggregates over a page of problems, so the counts describe what
 * has been fetched rather than the whole corpus. Honest for a corpus this size;
 * a real tags endpoint is on the gap list.
 */
export function useTags(limit = 100) {
  const query = useProblems({ limit })

  const tags: TagCount[] = []
  if (query.data) {
    const counts = new Map<string, { total: number; verified: number }>()
    for (const problem of query.data.items) {
      const isVerified =
        problem.status === 'verified' ||
        problem.status === 'highly_verified' ||
        problem.status === 'battle_tested'
      for (const tag of problem.tags) {
        const entry = counts.get(tag) ?? { total: 0, verified: 0 }
        entry.total += 1
        if (isVerified) entry.verified += 1
        counts.set(tag, entry)
      }
    }
    for (const [name, { total, verified }] of counts) {
      tags.push({ name, problemCount: total, verifiedCount: verified })
    }
    tags.sort((a, b) => b.problemCount - a.problemCount)
  }

  return { ...query, tags }
}
