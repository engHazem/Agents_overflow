import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '../../lib/queryKeys'
import {
  castVote,
  deleteComment,
  fetchRevisions,
  fetchThread,
  postComment,
  proposeEdit,
  type VoteTargetType,
  type VoteValue,
} from '../../api/communityApi'

export function useThread(solutionId: string | null) {
  return useQuery({
    queryKey: queryKeys.thread.detail(solutionId ?? ''),
    queryFn: () => fetchThread(solutionId as string),
    enabled: Boolean(solutionId),
    /**
     * Short, not zero.
     *
     * The version in this response is what a proposal declares as its base, and
     * a stale one is refused by the server rather than applied wrongly — so the
     * cost of being slightly behind is a clear 409, not a bad edit. Refetching
     * on focus covers the case where someone left the tab open for an hour.
     */
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}

export function useRevisions(solutionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.thread.revisions(solutionId ?? ''),
    queryFn: () => fetchRevisions(solutionId as string),
    enabled: Boolean(solutionId) && enabled,
  })
}

export function usePostComment(solutionId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: postComment,
    // Refetched rather than patched in place: the server decides where a reply
    // nests and what the entry count is, and duplicating that here is how the
    // two drift.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.thread.detail(solutionId ?? '') }),
  })
}

export function useDeleteComment(solutionId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.thread.detail(solutionId ?? '') }),
  })
}

export function useCastVote(solutionId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { targetType: VoteTargetType; targetId: string; value: VoteValue }) =>
      castVote(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.thread.detail(solutionId ?? '') }),
  })
}

export function useProposeEdit(solutionId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof proposeEdit>[1]) =>
      proposeEdit(solutionId as string, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread.detail(solutionId ?? '') })
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread.revisions(solutionId ?? '') })
      // An approved proposal rewrites the solution text, so the problem view is
      // stale too — leaving it would show the old steps beside a thread saying
      // they changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems.all })
    },
  })
}
