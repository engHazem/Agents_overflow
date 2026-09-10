import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'

import App from './App'
import './index.css'
import { setUnauthorizedHandler } from './api/axios'
import { store } from './store'
import { ThemeProvider } from './theme/ThemeProvider'
import { signedOut } from './store/slices/authSlice'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Searches are expensive server-side; refetching because a window
      // regained focus would burn an embedding call for no new information.
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status
        // 4xx will fail identically on retry; 5xx and network errors may not.
        if (status && status < 500 && status !== 429) return false
        return failureCount < 2
      },
    },
    mutations: { retry: false },
  },
})

// Centralised 401 handling: clear the session rather than leaving the UI
// believing it is signed in while every request fails.
setUnauthorizedHandler(() => {
  store.dispatch(signedOut())
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
)
