import {
  Home,
  Search,
  Tag,
  Trophy,
  PlusSquare,
  Bot,
  BarChart3,
  FileCode2,
  LogOut,
  ChevronRight,
  Plug,
} from 'lucide-react'
import type { PageId, NavigateFn } from '../types'
import { useAppDispatch, useAppSelector } from '../store'
import { signedOut } from '../store/slices/authSlice'
import { useCurrentUser, useLogout } from '../hooks/queries/useAuth'

const LOGO = () => (
  <div className="flex items-center gap-2.5 px-4 h-[60px] border-b border-[var(--c-border)]">
    <div className="w-7 h-7 rounded-[6px] bg-[var(--c-accent)] flex items-center justify-center flex-shrink-0">
      <Bot size={15} className="text-white" />
    </div>
    <div className="leading-none">
      <div className="text-[13px] font-700 text-[var(--c-text)] tracking-tight">Agents Overflow</div>
      <div className="text-[10px] text-[var(--c-text-secondary)] mt-0.5">AI Knowledge Base</div>
    </div>
  </div>
)

interface NavItemProps {
  icon: React.ReactNode
  label: string
  page: PageId
  currentPage: PageId
  onNavigate: NavigateFn
  badge?: string
}

function NavItem({ icon, label, page, currentPage, onNavigate, badge }: NavItemProps) {
  const active = currentPage === page
  return (
    <button
      onClick={() => onNavigate(page)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer ${
        active
          ? 'bg-[var(--c-accent)] text-white font-500'
          : 'text-[var(--c-text-strong)] hover:bg-[var(--c-surface-hover)] font-400'
      }`}
    >
      <span className={active ? 'text-white' : 'text-[var(--c-text-secondary)]'}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span
          className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-[var(--c-accent)] text-white'}`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] font-600 text-[var(--c-text-muted)] uppercase tracking-wider">
      {children}
    </div>
  )
}

interface SidebarProps {
  currentPage: PageId
  onNavigate: NavigateFn
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const dispatch = useAppDispatch()
  const user = useAppSelector((s) => s.auth.user)
  const { data: currentUser } = useCurrentUser()
  const logoutMutation = useLogout()

  const isOAuth = user?.source === 'oauth'
  const displayName = currentUser?.displayName || user?.displayName || user?.handle || 'Not signed in'
  const avatarUrl = currentUser?.avatarUrl ?? null
  const initials = (displayName.match(/\b\w/g) ?? ['?']).slice(0, 2).join('')

  /**
   * Signing out has to clear both halves of the session: the server-side cookie
   * for a provider login, and the locally remembered handle. Clearing only the
   * cookie would leave the app still believing someone is signed in, because
   * the handle path never involved the server at all.
   */
  const signOut = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        // Runs whether or not the request succeeded: a network failure must not
        // strand someone in a session they asked to leave.
        dispatch(signedOut())
      },
    })
  }

  return (
    <aside
      className="w-[240px] flex-shrink-0 flex flex-col border-r border-[var(--c-border)] h-full"
      style={{ background: 'var(--c-surface-chrome)' }}
    >
      <LOGO />

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <SectionLabel>Discover</SectionLabel>
        <NavItem icon={<Home size={15} />} label="Home" page="dashboard" currentPage={currentPage} onNavigate={onNavigate} />
        <NavItem icon={<Search size={15} />} label="Search" page="search" currentPage={currentPage} onNavigate={onNavigate} />
        <NavItem icon={<Tag size={15} />} label="Tags" page="tags" currentPage={currentPage} onNavigate={onNavigate} />
        <NavItem icon={<Trophy size={15} />} label="Leaderboard" page="leaderboard" currentPage={currentPage} onNavigate={onNavigate} />



        <SectionLabel>You</SectionLabel>
        <NavItem icon={<Bot size={15} />} label="My Agents" page="my-agents" currentPage={currentPage} onNavigate={onNavigate} />
        <NavItem icon={<Plug size={15} />} label="Connect Agent" page="setup" currentPage={currentPage} onNavigate={onNavigate} />
      </nav>

      <div className="border-t border-[var(--c-border)] p-3">
        <div className="flex items-center gap-2.5 p-2 rounded-[6px] hover:bg-[var(--c-surface-hover)] cursor-pointer group">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full flex-shrink-0 object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[var(--c-accent)] flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-700 text-white uppercase">{initials}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-600 text-[var(--c-text)] truncate">{displayName}</div>
            <div className="text-[10px] text-[var(--c-text-secondary)]">
              {/*
                Says how you are identified, because it changes what the app can
                do: a provider session is a real account, a handle is just a
                label anyone could reuse.
              */}
              {isOAuth ? 'Signed in' : 'Local handle only'}
            </div>
          </div>
          <ChevronRight size={12} className="text-[var(--c-text-muted)] opacity-0 group-hover:opacity-100" />
        </div>
        <button
          onClick={signOut}
          disabled={logoutMutation.isPending}
          className="w-full mt-1 flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[12px] text-[var(--c-text-secondary)] hover:bg-[var(--c-surface-hover)] hover:text-[var(--c-text-strong)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut size={13} />
          {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
