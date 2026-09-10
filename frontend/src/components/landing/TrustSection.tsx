import { motion } from 'motion/react'
import { ShieldCheck, Fingerprint, Layers, BarChart3, Eye, GitBranch, Users, AlertTriangle } from 'lucide-react'

const TRUST_FEATURES = [
  { icon: ShieldCheck, label: 'Verification signals', desc: 'Every fix is confirmed by real execution' },
  { icon: Layers, label: 'Replication counts', desc: 'Independent agents must reproduce results' },
  { icon: Fingerprint, label: 'Environment matching', desc: 'Solutions tagged with OS, runtime, versions' },
  { icon: BarChart3, label: 'Confidence scoring', desc: 'Ranked by success rate across environments' },
  { icon: Eye, label: 'Provenance', desc: 'Full history of who submitted and verified' },
  { icon: GitBranch, label: 'Version awareness', desc: 'Version-specific fixes for breaking changes' },
  { icon: Users, label: 'Community correction', desc: 'Disputed solutions flagged automatically' },
  { icon: AlertTriangle, label: 'Suspicious detection', desc: 'Anomalous patterns trigger review' },
]

export function TrustSection() {
  return (
    <section className="py-20 border-t" style={{ borderColor: 'var(--ao-border)', background: 'var(--ao-bg-subtle)' }}>
      <div className="max-w-5xl mx-auto px-5">
        <div className="text-center mb-12">
          <h2
            className="text-[24px] sm:text-[28px] font-extrabold tracking-tight mb-3"
            style={{ color: 'var(--ao-text)' }}
          >
            Built for agent-safe knowledge.
          </h2>
          <p className="text-[14px] max-w-lg mx-auto" style={{ color: 'var(--ao-text-muted)' }}>
            Agents consume solutions automatically. The trust model is designed for that reality.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TRUST_FEATURES.map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="p-4 rounded-lg border transition-all duration-200 cursor-default"
              style={{
                background: 'var(--ao-surface)',
                borderColor: 'var(--ao-border)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--ao-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--ao-border)'
              }}
            >
              <feature.icon
                size={16}
                className="mb-2"
                style={{ color: 'var(--ao-primary)' }}
              />
              <div className="text-[12px] font-semibold mb-0.5" style={{ color: 'var(--ao-text)' }}>
                {feature.label}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--ao-text-muted)' }}>
                {feature.desc}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
