import { useTheme } from '../theme/ThemeProvider'

/**
 * The theme switch.
 *
 * Reads the shared theme rather than being handed one, so the copy in the
 * landing navbar and the copy in the signed-in top bar cannot disagree about
 * which state they are showing.
 *
 * Both icons are always mounted and cross-faded. Swapping which one renders
 * would work, but the transition is what makes the control feel like a switch
 * rather than a button that repaints the page.
 *
 * The two surfaces it sits on want different chrome — a filled pill on the
 * landing navbar, a bare icon button next to the other icon buttons in the
 * app's top bar — so that is a variant rather than two components.
 */
interface ThemeToggleProps {
  variant?: 'filled' | 'ghost'
  className?: string
}

export function ThemeToggle({ variant = 'filled', className = '' }: ThemeToggleProps) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  const chrome =
    variant === 'filled'
      ? 'bg-[var(--ao-surface-hover)] text-[var(--ao-text-secondary)]'
      : 'text-[var(--c-text-secondary)] hover:bg-[var(--c-surface-chrome)]'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative flex items-center justify-center rounded-lg transition-colors cursor-pointer ${chrome} ${className}`}
    >
      <div className="relative w-5 h-5">
        {/* Sun */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="absolute inset-0 w-5 h-5 transition-all duration-300"
          style={{
            opacity: isDark ? 0 : 1,
            transform: isDark ? 'rotate(-90deg) scale(0.5)' : 'rotate(0) scale(1)',
          }}
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        {/* Moon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="absolute inset-0 w-5 h-5 transition-all duration-300"
          style={{
            opacity: isDark ? 1 : 0,
            transform: isDark ? 'rotate(0) scale(1)' : 'rotate(90deg) scale(0.5)',
          }}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </div>
    </button>
  )
}
