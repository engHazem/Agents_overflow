import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'

import authReducer from './slices/authSlice'
import uiReducer from './slices/uiSlice'
import { setRequestOwner } from '../api/axios'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

/** Typed hooks, so components never re-annotate state shape. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()

/**
 * Keeps the Axios owner header in step with the session.
 *
 * Subscribing here rather than reading the store from inside the interceptor
 * avoids a circular import between the store and the API layer, and means the
 * header updates the moment a sign-in lands.
 */
function syncOwnerHeader(): void {
  const handle = store.getState().auth.user?.handle ?? null
  setRequestOwner(handle)
}

syncOwnerHeader()
store.subscribe(syncOwnerHeader)
