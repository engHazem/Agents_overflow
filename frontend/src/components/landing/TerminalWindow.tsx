import { useEffect, useState, useRef } from 'react'

interface TerminalLine {
  text: string
  color?: 'default' | 'error' | 'success' | 'muted' | 'primary' | 'warning'
  delay?: number
}

interface TerminalWindowProps {
  title?: string
  lines: TerminalLine[]
  /** If true, animates typing effect. If false, shows all at once. */
  animate?: boolean
  /** Called when all lines have been typed */
  onComplete?: () => void
  /** Reset trigger — increment to restart */
  resetKey?: number
  className?: string
}

const COLOR_MAP: Record<string, string> = {
  default: 'var(--ao-terminal-text)',
  error: 'var(--ao-error)',
  success: 'var(--ao-success)',
  muted: 'var(--ao-text-muted)',
  primary: 'var(--ao-primary)',
  warning: 'var(--ao-warning)',
}

export function TerminalWindow({
  title = 'Terminal',
  lines,
  animate = true,
  onComplete,
  resetKey = 0,
  className = '',
}: TerminalWindowProps) {
  const [visibleLines, setVisibleLines] = useState<number>(animate ? 0 : lines.length)
  const [typingIndex, setTypingIndex] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completedRef = useRef(false)

  // Reset when resetKey changes
  useEffect(() => {
    completedRef.current = false
    if (animate) {
      setVisibleLines(0)
      setTypingIndex(0)
      setCurrentText('')
    } else {
      setVisibleLines(lines.length)
    }
  }, [resetKey, animate, lines.length])

  // Typing animation
  useEffect(() => {
    if (!animate || visibleLines >= lines.length) {
      if (!completedRef.current && visibleLines >= lines.length) {
        completedRef.current = true
        onComplete?.()
      }
      return
    }

    const line = lines[visibleLines]
    if (!line) return
    const delay = line.delay ?? 40

    if (typingIndex <= line.text.length) {
      timeoutRef.current = setTimeout(() => {
        setCurrentText(line.text.slice(0, typingIndex))
        setTypingIndex(prev => prev + 1)
      }, typingIndex === 0 ? delay * 3 : delay)
    } else {
      // Line done, move to next
      timeoutRef.current = setTimeout(() => {
        setVisibleLines(prev => prev + 1)
        setTypingIndex(0)
        setCurrentText('')
      }, 100)
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [animate, visibleLines, typingIndex, lines, onComplete])

  return (
    <div
      className={`rounded-lg overflow-hidden border ${className}`}
      style={{
        background: 'var(--ao-terminal-bg)',
        borderColor: 'var(--ao-terminal-border)',
        boxShadow: 'var(--ao-card-shadow-lg)',
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderColor: 'var(--ao-terminal-border)' }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#27ca40]" />
        </div>
        <span className="text-[11px] font-medium ml-1" style={{ color: 'var(--ao-text-muted)' }}>
          {title}
        </span>
      </div>

      {/* Terminal content */}
      <div className="p-3 font-mono text-[12px] leading-relaxed min-h-[100px] max-h-[200px] overflow-hidden">
        {lines.slice(0, visibleLines).map((line, i) => (
          <div key={i} style={{ color: COLOR_MAP[line.color ?? 'default'] }}>
            {line.text}
          </div>
        ))}
        {/* Currently typing line */}
        {animate && visibleLines < lines.length && (
          <div style={{ color: COLOR_MAP[lines[visibleLines]?.color ?? 'default'] }}>
            {currentText}
            <span className="ao-cursor" style={{ color: 'var(--ao-primary)' }}>▊</span>
          </div>
        )}
      </div>
    </div>
  )
}
