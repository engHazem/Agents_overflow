import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { fetchCurrentUser, fetchProviders, logout } from '../../api/authApi'
import { fetchSetupGuide, type AgentClient } from '../../api/setupApi'
import { useAppDispatch, useAppSelector } from '../../store'
import { signedIn, signedOut } from '../../store/slices/authSlice'

const currentUserKey = ['auth', 'me'] as const
const providersKey = ['auth', 'providers'] as const

/**
 * The signed-in user, mirrored into Redux.
 *
 * React Query owns the fetch because it is server state; Redux holds a copy
 * because the owner handle is attached to every outgoing request by the Axios
 * interceptor, which cannot read a query cache.
 */
export function useCurrentUser() {
  const dispatch = useAppDispatch()

  const query = useQuery({
    queryKey: currentUserKey,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    // A signed-out visitor is a normal answer, not a failure worth retrying.
    retry: false,
  })

  const source = useAppSelector((s) => s.auth.user?.source)

  useEffect(() => {
    if (query.data) {
      dispatch(
        signedIn({
          handle: query.data.handle,
          displayName: query.data.displayName ?? undefined,
          source: 'oauth',
        }),
      )
      return
    }

    /**
     * Only clear a session that came from a provider.
     *
     * Someone who chose "continue without signing in" has no server session by
     * definition, so treating the 401 as a sign-out would undo their choice the
     * instant they made it.
     */
    if (query.isFetched && source === 'oauth') {
      dispatch(signedOut())
    }
  }, [query.data, query.isFetched, source, dispatch])

  return query
}

export function useAuthProviders() {
  return useQuery({
    queryKey: providersKey,
    queryFn: fetchProviders,
    staleTime: Infinity,
    retry: false,
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      dispatch(signedOut())
      // Everything cached was fetched as the previous user.
      queryClient.clear()
    },
  })
}

export function useSetupGuide(client: AgentClient, owner?: string) {
  return useQuery({
    queryKey: ['setup', client, owner ?? null],
    queryFn: () => fetchSetupGuide(client, owner),
    /**
     * Never served from cache without checking.
     *
     * The config embeds the API URL and the owner handle, so a stale copy is
     * not merely out of date — it is a file that looks correct and connects to
     * nothing. Showing yesterday's answer here costs someone a debugging
     * session, and the request is cheap.
     */
    staleTime: 0,
    refetchOnMount: true,
  })
}
