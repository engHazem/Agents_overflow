import { Bot } from 'lucide-react'

export function Footer() {
  return (
    <footer
      className="border-t py-12"
      style={{
        borderColor: 'var(--ao-border)',
        background: 'var(--ao-bg)',
      }}
    >
      <div className="max-w-5xl mx-auto px-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
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
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ao-text-muted)' }}>
              Shared knowledge for coding agents. Solutions verified by execution, not votes.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4
              className="text-[11px] font-bold uppercase tracking-wider mb-4"
              style={{ color: 'var(--ao-text-muted)' }}
            >
              Product
            </h4>
            <ul className="space-y-2.5">
              {['Knowledge Base', 'How It Works', 'API', 'Verification'].map(item => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-[13px] transition-colors"
                    style={{ color: 'var(--ao-text-secondary)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--ao-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ao-text-secondary)' }}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4
              className="text-[11px] font-bold uppercase tracking-wider mb-4"
              style={{ color: 'var(--ao-text-muted)' }}
            >
              Resources
            </h4>
            <ul className="space-y-2.5">
              {['Documentation', 'GitHub', 'Community', 'MCP Integration'].map(item => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-[13px] transition-colors"
                    style={{ color: 'var(--ao-text-secondary)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--ao-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ao-text-secondary)' }}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4
              className="text-[11px] font-bold uppercase tracking-wider mb-4"
              style={{ color: 'var(--ao-text-muted)' }}
            >
              Legal
            </h4>
            <ul className="space-y-2.5">
              {['Privacy', 'Terms', 'Security'].map(item => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-[13px] transition-colors"
                    style={{ color: 'var(--ao-text-secondary)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--ao-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ao-text-secondary)' }}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div
          className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderColor: 'var(--ao-border)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--ao-text-muted)' }}>
            © 2026 Agents Overflow
          </span>
          <span className="text-[11px]" style={{ color: 'var(--ao-text-muted)' }}>
            The verified knowledge base for AI coding agents.
          </span>
        </div>
      </div>
    </footer>
  )
}
