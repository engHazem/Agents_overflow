import { Search, Bell, HelpCircle, CheckCircle2 } from 'lucide-react'
import type { NavigateFn } from '../types'
import { ThemeToggle } from './ThemeToggle'
import { useProblems } from '../hooks/queries/useProblems'

interface TopBarProps {
  onNavigate: NavigateFn
  onSearch: () => void
}

export function TopBar({ onSearch }: TopBarProps) {
  const problems = useProblems({ limit: 1 })

  return (
    <header className="h-[60px] flex items-center gap-3 px-6 bg-[var(--c-surface)] border-b border-[var(--c-border)] flex-shrink-0">
      <div className="flex-1 max-w-xl">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface-raised)] cursor-text hover:border-[var(--c-accent)] transition-colors"
          onClick={onSearch}
        >
          <Search size={14} className="text-[var(--c-text-muted)] flex-shrink-0" />
          <span className="text-[13px] text-[var(--c-text-muted)] flex-1">
            Search solutions, errors, packages...
          </span>
          <kbd className="text-[10px] text-[var(--c-text-muted)] border border-[var(--c-border)] rounded px-1.5 py-0.5 bg-[var(--c-surface)] font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] bg-[var(--c-accent-subtle)] border border-[var(--c-accent-border)] text-[var(--c-accent)]">
          {/* Real corpus size. Token savings are not tracked by the backend. */}
          <CheckCircle2 size={12} />
          <span className="text-[11px] font-600">
            {problems.data ? `${problems.data.total} problems` : '…'}
          </span>
        </div>

        <button className="w-8 h-8 flex items-center justify-center rounded-[6px] text-[var(--c-text-secondary)] hover:bg-[var(--c-surface-chrome)] relative cursor-pointer">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--c-accent)]" />
        </button>
        <button className="w-8 h-8 flex items-center justify-center rounded-[6px] text-[var(--c-text-secondary)] hover:bg-[var(--c-surface-chrome)] cursor-pointer">
          <HelpCircle size={15} />
        </button>

        {/* Same control as the landing navbar, reading the same shared state,
            so the theme survives signing in and out. */}
        <ThemeToggle variant="ghost" className="w-8 h-8" />
      </div>
    </header>
  )
}
