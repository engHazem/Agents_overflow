import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * The theme, for the whole app rather than one page.
 *
 * It lived inside the landing page before, as local state in a hook. That was
 * fine while the landing page was the only thing with a toggle, but it meant
 * the choice was owned by a component that unmounts on sign-in: the class
 * stayed on `<html>` and nothing was left holding the state, so the signed-in
 * shell had no way to read it or change it.
 *
 * Two things are deliberately outside React:
 *
 *   - The class lands on `document.documentElement`, not on a wrapper element,
 *     so `:root`-scoped tokens resolve for portals and for anything rendered
 *     outside the tree.
 *   - The first paint is handled by an inline script in `index.html`. React
 *     cannot run early enough to prevent a white flash, so this provider's job
 *     is only to keep agreeing with what that script already did.
 */

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'ao-theme'

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw === 'light' || raw === 'dark' ? raw : null
  } catch {
    // Private browsing, or storage blocked. Not an error worth surfacing —
    // the theme simply stops being remembered between visits.
    return null
  }
}

function initialTheme(): Theme {
  return storedTheme() ?? systemTheme()
}

/**
 * Also sets `color-scheme`, which the class alone does not: without it the
 * browser keeps painting scrollbars, form controls and the canvas behind the
 * page in light colours, which shows up as white edges during overscroll.
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

interface ThemeContextValue {
  theme: Theme
  /** True while the theme is following the OS because nothing was chosen. */
  isSystem: boolean
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [isSystem, setIsSystem] = useState<boolean>(() => storedTheme() === null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  /**
   * Follow the OS, but only for someone who has not chosen. Once there is a
   * stored preference, switching the OS to dark at sunset must not overrule it.
   */
  useEffect(() => {
    if (!isSystem || typeof window === 'undefined' || !window.matchMedia) return

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      setThemeState(event.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [isSystem])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    setIsSystem(false)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Same as above: the theme still applies for this session.
    }
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      setIsSystem(false)
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ theme, isSystem, setTheme, toggle }),
    [theme, isSystem, setTheme, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  // Throwing rather than falling back to a default: a silent default would
  // render a toggle that appears to work and changes nothing.
  if (!value) throw new Error('useTheme must be used within a ThemeProvider')
  return value
}
