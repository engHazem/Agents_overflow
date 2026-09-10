import { useState } from 'react'
import { Copy, Check, Terminal } from 'lucide-react'

interface CodeBlockProps {
  code: string
  language?: string
  title?: string
  terminal?: boolean
}

export function CodeBlock({ code, language = 'bash', title, terminal }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-[6px] border border-[var(--c-border)] overflow-hidden text-[13px]">
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-surface-raised)] border-b border-[var(--c-border)]">
        <div className="flex items-center gap-2">
          {terminal && <Terminal size={12} className="text-[var(--c-text-secondary)]" />}
          <span className="text-[11px] font-500 text-[var(--c-text-secondary)]">
            {title || language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-[var(--c-text-secondary)] hover:text-[var(--c-text)] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={12} className="text-[var(--c-success)]" />
              <span className="text-[var(--c-success)]">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-[var(--c-code-bg)] text-[var(--c-code-text)] leading-relaxed">
        <code className="mono text-[12px]">{code}</code>
      </pre>
    </div>
  )
}
