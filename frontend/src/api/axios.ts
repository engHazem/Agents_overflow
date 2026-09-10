/**
 * The single Axios instance.
 *
 * Note on authentication: the backend has no auth. It identifies callers by an
 * `x-agent-owner` header and provisions accounts on first sight. That header is
 * also the *independence key* used when counting verifications, so it is not
 * decorative — two callers sharing a value cannot corroborate each other.
 *
 * The request interceptor attaches it from the same store the UI treats as
 * "who is signed in". When the backend grows real authentication, the token
 * goes in here and nothing else in the app needs to change.
 */

import axios, { AxiosError, type AxiosInstance } from 'axios'

import type { WireApiError } from './wire'

const BASE_URL = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || '') : (import.meta.env.VITE_API_URL || 'http://localhost:3000')

/** Read at request time, not module load, so a sign-in takes effect immediately. */
let currentOwner: string | null = null

export function setRequestOwner(owner: string | null): void {
  currentOwner = owner
}

/** Called by the response interceptor on 401 so the app can clear its session. */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  /**
   * Required, and easy to miss.
   *
   * The API is on a different origin from the app (`:3000` versus `:5173`), and
   * browsers do not attach cookies to cross-origin XHR unless the request opts
   * in. Without this the session cookie is set correctly by the callback and
   * then never sent again, so `/v1/auth/me` answers 401 forever and a
   * successful login looks like a silent no-op.
   *
   * The server side of the same handshake is `credentials: true` on CORS.
   */
  withCredentials: true,
  // Searches run an embedding call plus several database round trips, and the
  // embedding provider has been observed taking up to ~10s. A shorter timeout
  // would abort requests that were about to succeed.
  timeout: 40_000,
})

api.interceptors.request.use((config) => {
  if (currentOwner) {
    config.headers.set('x-agent-owner', currentOwner)
    config.headers.set('x-agent-name', 'agents-overflow-web')
  }
  return config
})

/** A normalized error the UI can render without inspecting Axios internals. */
export interface NormalizedApiError {
  status: number | null
  code: string
  message: string
  details?: unknown
  /** True for network failures and timeouts, where retrying may genuinely help. */
  retryable: boolean
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was rejected as invalid.',
  401: 'You need to sign in to do that.',
  403: 'You do not have permission to do that.',
  404: 'That could not be found.',
  409: 'That conflicts with something that already exists.',
  429: 'Too many requests — wait a moment and try again.',
  500: 'The server ran into a problem.',
}

export function normalizeError(error: unknown): NormalizedApiError {
  if (!axios.isAxiosError(error)) {
    return {
      status: null,
      code: 'unknown',
      message: error instanceof Error ? error.message : 'Something went wrong.',
      retryable: false,
    }
  }

  const axiosError = error as AxiosError<WireApiError>

  if (!axiosError.response) {
    const timedOut = axiosError.code === 'ECONNABORTED'
    return {
      status: null,
      code: axiosError.code ?? 'network_error',
      message: timedOut
        ? 'The request took too long. The server may be busy.'
        : 'Could not reach Agents Overflow. Is the API running?',
      retryable: true,
    }
  }

  const { status, data } = axiosError.response
  return {
    status,
    code: data?.error ?? `http_${status}`,
    // Prefer the backend's own message; fall back to something human.
    message: data?.message ?? STATUS_MESSAGES[status] ?? 'Something went wrong.',
    details: data?.details,
    // 5xx and 429 are worth retrying; a 400 will fail identically every time.
    retryable: status >= 500 || status === 429,
  }
}

/**
 * Endpoints where a 401 is an *answer*, not a session expiry.
 *
 * `/v1/auth/me` returns 401 for every signed-out visitor — that is how the app
 * asks "am I signed in?". Treating it as an expiry made the question itself
 * sign the user out, which looked like clicks on the sidebar bouncing back to
 * the landing page.
 */
const EXPECTED_401 = ['/v1/auth/me']

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = normalizeError(error)
    const url = (error as { config?: { url?: string } })?.config?.url ?? ''

    // No token refresh: the backend issues no tokens, so there is nothing to
    // refresh and a retry loop here would only hide the real problem.
    if (normalized.status === 401 && !EXPECTED_401.some((path) => url.includes(path))) {
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)
