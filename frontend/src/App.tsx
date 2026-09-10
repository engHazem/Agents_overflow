import type { PageId } from './types'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { LandingPage } from './pages/LandingPage'
import { SignInPage } from './pages/SignInPage'
import { DashboardPage } from './pages/DashboardPage'
import { SearchPage } from './pages/SearchPage'
import { SolutionDetailPage } from './pages/SolutionDetailPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { TagsPage } from './pages/TagsPage'
import { SetupPage } from './pages/SetupPage'
import { MyAgentsPage } from './pages/MyAgentsPage'
import { useCurrentUser } from './hooks/queries/useAuth'
import { useAppDispatch, useAppSelector } from './store'
import { navigated } from './store/slices/uiSlice'

/**
 * Navigation and session live in Redux so any component can navigate — search
 * results opening a solution, for example — without threading callbacks through
 * the tree.
 *
 * Three states, not two:
 *
 *   1. **Loading.** The session is resolved by asking the server, so on first
 *      paint we do not yet know. Rendering the signed-out view during that
 *      moment would flash the sign-in page at someone who is already signed in.
 *   2. **Signed out.** The marketing page, or the sign-in page if they asked
 *      for it.
 *   3. **Signed in.** The app.
 */
export default function App() {
  const dispatch = useAppDispatch()
  const storedPage = useAppSelector((state) => state.ui.page)
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)

  // Resolves the session once, at the root, so every page below can rely on it.
  const { isLoading: sessionLoading } = useCurrentUser()

  const navigate = (p: PageId) => dispatch(navigated(p))

  if (sessionLoading) {
    return (
      <div
        className="min-h-full flex items-center justify-center"
        style={{ background: 'var(--ao-bg)' }}
      >
        <div className="text-[13px]" style={{ color: 'var(--ao-text-muted)' }}>Loading…</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // `signin` is reachable from the landing page's buttons; anything else
    // falls back to the marketing view.
    if (storedPage === 'signin') return <SignInPage onBack={() => navigate('landing')} />

    return <LandingPage onSignIn={() => navigate('signin')} onNavigate={navigate} />
  }

  /**
   * The session persists but the current page does not, so a reload leaves an
   * authenticated user on a value the signed-in shell has no branch for. Both
   * signed-out values map to the dashboard.
   */
  const page: PageId =
    storedPage === 'landing' || storedPage === 'signin' ? 'dashboard' : storedPage

  return (
    <div className="flex h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Sidebar currentPage={page} onNavigate={navigate} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onNavigate={navigate} onSearch={() => navigate('search')} />
        <main className="flex-1 overflow-auto bg-[var(--c-surface)]">
          {page === 'dashboard' && <DashboardPage onNavigate={navigate} />}
          {page === 'search' && <SearchPage onNavigate={navigate} />}
          {page === 'solution' && <SolutionDetailPage onNavigate={navigate} />}
          {page === 'leaderboard' && <LeaderboardPage onNavigate={navigate} />}
          {page === 'tags' && <TagsPage onNavigate={navigate} />}
          {page === 'my-agents' && <MyAgentsPage onNavigate={navigate} />}
          {page === 'setup' && <SetupPage />}
        </main>
      </div>
    </div>
  )
}
