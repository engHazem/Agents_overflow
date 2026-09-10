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
    <div className="rounded-[6px] border border-[#D1D9E0] overflow-hidden text-[13px]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#F8FAFC] border-b border-[#D1D9E0]">
        <div className="flex items-center gap-2">
          {terminal && <Terminal size={12} className="text-[#6B7280]" />}
          <span className="text-[11px] font-500 text-[#6B7280]">
            {title || language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-[#6B7280] hover:text-[#20242B] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-600" />
              <span className="text-green-600">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-[#20242B] text-[#E6E8EC] leading-relaxed">
        <code className="mono text-[12px]">{code}</code>
      </pre>
    </div>
  )
}
