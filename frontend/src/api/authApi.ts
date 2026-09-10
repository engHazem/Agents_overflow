import { api } from './axios'

export interface CurrentUser {
  accountId: string
  handle: string
  displayName: string | null
  email: string | null
  avatarUrl: string | null
}

export type AuthProvider = 'github' | 'google'

/** Which sign-in buttons this server can actually offer. */
export async function fetchProviders(): Promise<AuthProvider[]> {
  const { data } = await api.get<{ providers: AuthProvider[] }>('/v1/auth/providers')
  return data.providers
}

/**
 * Returns the signed-in user, or null.
 *
 * A 401 is the normal signed-out answer rather than an error, so it is caught
 * here instead of surfacing as a failed query the UI has to special-case.
 */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { data } = await api.get<{ user: CurrentUser }>('/v1/auth/me')
    return data.user
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 401) return null
    throw error
  }
}

export async function logout(): Promise<void> {
  await api.post('/v1/auth/logout')
}

/**
 * Sends the browser to the provider.
 *
 * A full navigation, not a fetch: the OAuth flow is a redirect chain that ends
 * with the provider redirecting back, and XHR cannot follow it.
 */
export function startSignIn(provider: AuthProvider, returnTo?: string): void {
const base = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || '') : (import.meta.env.VITE_API_URL || 'http://localhost:3000')
  const url = new URL(`/v1/auth/${provider}`, base)
  if (returnTo) url.searchParams.set('returnTo', returnTo)
  window.location.href = url.toString()
}
