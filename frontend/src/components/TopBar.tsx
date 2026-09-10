import { Search, Bell, HelpCircle, CheckCircle2 } from 'lucide-react'
import type { NavigateFn } from '../types'
import { useProblems } from '../hooks/queries/useProblems'

interface TopBarProps {
  onNavigate: NavigateFn
  onSearch: () => void
}

export function TopBar({ onSearch }: TopBarProps) {
  const problems = useProblems({ limit: 1 })

  return (
    <header className="h-[60px] flex items-center gap-3 px-6 bg-white border-b border-[#D1D9E0] flex-shrink-0">
      <div className="flex-1 max-w-xl">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-[6px] border border-[#D1D9E0] bg-[#F8FAFC] cursor-text hover:border-[#2563EB] transition-colors"
          onClick={onSearch}
        >
          <Search size={14} className="text-[#9CA3AF] flex-shrink-0" />
          <span className="text-[13px] text-[#9CA3AF] flex-1">
            Search solutions, errors, packages...
          </span>
          <kbd className="text-[10px] text-[#9CA3AF] border border-[#D1D9E0] rounded px-1.5 py-0.5 bg-white font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB]">
          {/* Real corpus size. Token savings are not tracked by the backend. */}
          <CheckCircle2 size={12} />
          <span className="text-[11px] font-600">
            {problems.data ? `${problems.data.total} problems` : '…'}
          </span>
        </div>

        <button className="w-8 h-8 flex items-center justify-center rounded-[6px] text-[#6B7280] hover:bg-[#EEF2F7] relative cursor-pointer">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
        </button>
        <button className="w-8 h-8 flex items-center justify-center rounded-[6px] text-[#6B7280] hover:bg-[#EEF2F7] cursor-pointer">
          <HelpCircle size={15} />
        </button>
      </div>
    </header>
  )
}
