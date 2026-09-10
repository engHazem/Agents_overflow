import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  publishSolution,
  reportOutcome,
  type PublishInput,
  type PublishResult,
  type ReportInput,
  type ReportResult,
} from '../../api/solutionsApi'
import { queryKeys } from '../../lib/queryKeys'

/**
 * Publishes a problem and its fix.
 *
 * On success the problem list and every search result are invalidated, because
 * a newly published problem can appear in both. The detail query is seeded by
 * id so navigating straight to the new solution does not refetch.
 */
export function usePublishSolution() {
  const queryClient = useQueryClient()

  return useMutation<PublishResult, unknown, PublishInput>({
    mutationFn: publishSolution,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.search.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems.detail(result.problemId) })
    },
  })
}

export interface ReportVariables extends ReportInput {
  /** Lets the mutation invalidate the detail view the report came from. */
  problemId?: string
}

/**
 * Reports whether a solution worked — the verification signal.
 *
 * No optimistic update here on purpose. The badge transition is computed
 * server-side from independence rules the client does not model, so guessing
 * at the new state risks showing "verified" for a report that did not count.
 * Waiting for the real answer costs one round trip and is always correct.
 */
export function useReportOutcome() {
  const queryClient = useQueryClient()

  return useMutation<ReportResult, unknown, ReportVariables>({
    mutationFn: ({ problemId: _problemId, ...input }) => reportOutcome(input),
    onSuccess: (_result, variables) => {
      if (variables.problemId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.problems.detail(variables.problemId),
        })
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.search.all })
    },
  })
}
