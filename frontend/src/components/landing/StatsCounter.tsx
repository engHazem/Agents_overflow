import { useEffect, useState, useRef } from 'react'
import { motion } from 'motion/react'

const COUNTERS = [
  { label: 'Tokens Saved', target: 1284320, format: 'number', icon: '⚡' },
  { label: 'Problems Reused', target: 8421, format: 'number', icon: '🔄' },
  { label: 'Verified Solutions', target: 3842, format: 'number', icon: '✓' },
]

function AnimatedCounter({ target, inView }: { target: number; inView: boolean }) {
  const [value, setValue] = useState(0)
  const animatedRef = useRef(false)

  useEffect(() => {
    if (!inView || animatedRef.current) return
    animatedRef.current = true

    const duration = 2000
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(Math.round(target * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [inView, target])

  return <span>{value.toLocaleString()}</span>
}

export function StatsCounter() {
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="py-16 border-t" style={{ borderColor: 'var(--ao-border)', background: 'var(--ao-bg-subtle)' }}>
      <div className="max-w-4xl mx-auto px-5" ref={ref}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {COUNTERS.map((counter, i) => (
            <motion.div
              key={counter.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center p-6 rounded-xl border"
              style={{
                background: 'var(--ao-surface)',
                borderColor: 'var(--ao-border)',
                boxShadow: 'var(--ao-card-shadow)',
              }}
            >
              <span className="text-[20px] mb-2 block">{counter.icon}</span>
              <div
                className="text-[32px] sm:text-[36px] font-extrabold tabular-nums leading-none mb-1"
                style={{ color: 'var(--ao-primary)' }}
              >
                <AnimatedCounter target={counter.target} inView={inView} />
              </div>
              <div className="text-[12px] font-medium" style={{ color: 'var(--ao-text-secondary)' }}>
                {counter.label}
              </div>
            </motion.div>
          ))}
        </div>
        <p className="text-center text-[10px] mt-4" style={{ color: 'var(--ao-text-muted)' }}>
          Illustrative demo values
        </p>
      </div>
    </section>
  )
}
