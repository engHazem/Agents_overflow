/**
 * Client-only UI state: navigation, the selected problem, and the search query.
 *
 * Server data deliberately does not live here — React Query owns that. This
 * holds only what the UI needs to remember across components and what has no
 * server representation.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { PageId } from '../../types'

export interface UiState {
  page: PageId
  /** Which problem the detail page should show. */
  selectedProblemId: string | null
  /** Last executed search, kept so navigating back does not lose it. */
  searchQuery: string
  /** Ties a later outcome report back to the query that produced it. */
  lastTraceId: string | null
}

const initialState: UiState = {
  page: 'landing',
  selectedProblemId: null,
  searchQuery: '',
  lastTraceId: null,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    navigated(state, action: PayloadAction<PageId>) {
      state.page = action.payload
    },
    problemSelected(state, action: PayloadAction<string | null>) {
      state.selectedProblemId = action.payload
      if (action.payload) state.page = 'solution'
    },
    searchQueryChanged(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload
    },
    traceRecorded(state, action: PayloadAction<string | null>) {
      state.lastTraceId = action.payload
    },
  },
})

export const { navigated, problemSelected, searchQueryChanged, traceRecorded } = uiSlice.actions
export default uiSlice.reducer
