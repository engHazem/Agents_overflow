import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { searchSolutions, type SearchParams } from '../../api/searchApi'
import { queryKeys } from '../../lib/queryKeys'

export interface UseSearchOptions extends SearchParams {
  /** Skip the request until the caller is ready — an empty box should not query. */
  enabled?: boolean
}

/**
 * Searches for a fix.
 *
 * A search is expensive on the backend — an embedding call plus several
 * database round trips — so results are cached generously and the previous
 * result stays on screen while a new one loads, rather than the table blanking
 * on every keystroke-triggered refetch.
 */
export function useSearch({ enabled = true, ...params }: UseSearchOptions) {
  return useQuery({
    queryKey: queryKeys.search.query(params),
    queryFn: () => searchSolutions(params),
    enabled: enabled && params.error.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    // A 400 means the payload is wrong and will be wrong again next time.
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status && status < 500 && status !== 429) return false
      return failureCount < 2
    },
  })
}
