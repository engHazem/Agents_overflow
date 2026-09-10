import { useMutation } from '@tanstack/react-query'

import { askAi, type AskParams, type ChatAnswer } from '../../api/chatApi'

/**
 * Asks the site's assistant a question.
 *
 * A mutation rather than a query: each question is an action with a cost, and
 * caching answers by question text would return a stale reply after the
 * evidence underneath it changed — which is exactly when the answer should
 * change.
 */
export function useAskAi() {
  return useMutation<ChatAnswer, unknown, AskParams>({
    mutationFn: askAi,
  })
}
