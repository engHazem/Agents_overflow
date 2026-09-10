import { useState } from 'react'
import { Bot, Menu, X } from 'lucide-react'
import { ThemeToggle } from '../ThemeToggle'

interface NavbarProps {
  onSignIn: () => void
}

const NAV_LINKS = [
  { label: 'Knowledge', href: '#knowledge' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'API', href: '#api' },
]

export function Navbar({ onSignIn }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b transition-colors duration-300"
        style={{
          background: 'var(--ao-nav-bg)',
          borderColor: 'var(--ao-nav-border)',
        }}
      >
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: 'var(--ao-primary)' }}
            >
              <Bot size={14} className="text-white" />
            </div>
            <span
              className="text-[14px] font-bold tracking-tight"
              style={{ color: 'var(--ao-text)' }}
            >
              Agents Overflow
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <a
                key={link.label}
                href={link.href}
                className="px-3 py-1.5 text-[13px] rounded-md transition-colors"
                style={{ color: 'var(--ao-text-secondary)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--ao-surface-hover)'
                  e.currentTarget.style.color = 'var(--ao-text)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--ao-text-secondary)'
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle className="w-9 h-9" />

            <button
              onClick={onSignIn}
              className="hidden md:block px-3 py-1.5 text-[13px] rounded-md transition-colors cursor-pointer"
              style={{ color: 'var(--ao-text-secondary)' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--ao-surface-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Sign in
            </button>

            <button
              onClick={onSignIn}
              className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium text-white rounded-md transition-all cursor-pointer"
              style={{ background: 'var(--ao-primary)' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--ao-primary-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--ao-primary)'
              }}
            >
              Get Started
            </button>

            {/* Mobile menu button */}
            <button
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer"
              style={{ color: 'var(--ao-text-secondary)' }}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'var(--ao-bg)', paddingTop: 56 }}
        >
          <nav className="flex flex-col p-5 gap-1">
            {NAV_LINKS.map(link => (
              <a
                key={link.label}
                href={link.href}
                className="px-4 py-3 text-[15px] rounded-lg transition-colors"
                style={{ color: 'var(--ao-text)' }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="my-3 border-t" style={{ borderColor: 'var(--ao-border)' }} />
            <button
              onClick={() => { setMobileOpen(false); onSignIn() }}
              className="px-4 py-3 text-[15px] rounded-lg text-left cursor-pointer"
              style={{ color: 'var(--ao-text-secondary)' }}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMobileOpen(false); onSignIn() }}
              className="mt-2 px-4 py-3 text-[15px] font-medium text-white rounded-lg text-center cursor-pointer"
              style={{ background: 'var(--ao-primary)' }}
            >
              Get Started
            </button>
          </nav>
        </div>
      )}
    </>
  )
}
