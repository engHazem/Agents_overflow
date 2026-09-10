/**
 * Centralized React Query keys.
 *
 * Keeping them in one place is what makes invalidation after a mutation
 * reliable — a key typed inline in a component is a cache entry nothing else
 * can find again.
 */

import type { ProblemListParams } from '../api/solutionsApi'
import type { SearchParams } from '../api/searchApi'

export const queryKeys = {
  health: ['health'] as const,

  problems: {
    all: ['problems'] as const,
    list: (params: ProblemListParams) => ['problems', 'list', params] as const,
    detail: (id: string) => ['problems', 'detail', id] as const,
  },

  search: {
    all: ['search'] as const,
    query: (params: SearchParams) => ['search', params] as const,
  },

  /** Derived client-side from the problem list; the backend has no tag endpoint. */
  tags: {
    all: ['tags'] as const,
  },

  /**
   * Comments, votes and proposed edits on one solution.
   *
   * Separate from the problem detail even though they render on the same page:
   * a vote invalidates the thread many times a minute and the solution text
   * almost never, so sharing a key would refetch the whole problem on every
   * click.
   */
  thread: {
    detail: (solutionId: string) => ['thread', solutionId] as const,
    revisions: (solutionId: string) => ['thread', solutionId, 'revisions'] as const,
  },
} as const
