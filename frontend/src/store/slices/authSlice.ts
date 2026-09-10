/**
 * Session state.
 *
 * The backend has no authentication: it identifies a caller by the
 * `x-agent-owner` header and creates the account on first sight. So "signing
 * in" here means choosing the owner handle every subsequent request is made
 * under — which is a real mechanism with real consequences, not a stand-in.
 * That handle is the independence key used when counting verifications, so two
 * people using the same one cannot corroborate each other's results.
 *
 * This is deliberately shaped like a normal auth slice (`user`, `accessToken`,
 * `isAuthenticated`) so that when the backend grows real auth, only the
 * reducers and the Axios interceptor change.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

const STORAGE_KEY = 'agents-overflow.owner'

/**
 * How the session was established.
 *
 * `oauth` means the server holds a session cookie for this person. `local`
 * means they chose to continue with a handle only, which the backend still
 * accepts because it identifies callers by handle.
 *
 * The distinction matters: the /v1/auth/me query must not sign out someone who
 * never signed in through a provider, or the handle-only path is undone the
 * instant it is taken.
 */
export type AuthSource = 'oauth' | 'local'

export interface AuthUser {
  /** The owner handle, sent as `x-agent-owner`. */
  handle: string
  displayName: string
  source: AuthSource
}

export interface AuthState {
  user: AuthUser | null
  /** Always null today — the backend issues no tokens. Kept for the real flow. */
  accessToken: string | null
  isAuthenticated: boolean
}

function loadPersistedHandle(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private browsing and blocked site data both throw here.
    return null
  }
}

function persistHandle(handle: string | null): void {
  try {
    if (handle) localStorage.setItem(STORAGE_KEY, handle)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not being able to remember the handle is survivable; failing is not.
  }
}

const persisted = loadPersistedHandle()

const initialState: AuthState = {
  user: persisted ? { handle: persisted, displayName: persisted, source: 'local' } : null,
  accessToken: null,
  isAuthenticated: Boolean(persisted),
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(state, action: PayloadAction<{ handle: string; displayName?: string; source?: AuthSource }>) {
      const handle = action.payload.handle.trim().toLowerCase()
      state.user = {
        handle,
        displayName: action.payload.displayName ?? handle,
        source: action.payload.source ?? 'local',
      }
      state.isAuthenticated = true
      persistHandle(handle)
    },
    signedOut(state) {
      state.user = null
      state.accessToken = null
      state.isAuthenticated = false
      persistHandle(null)
    },
  },
})

export const { signedIn, signedOut } = authSlice.actions
export default authSlice.reducer
