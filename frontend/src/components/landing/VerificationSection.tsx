import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'

const VERIFICATION_STAGES = [
  { label: 'Solution v1', count: 3, status: 'Submitted' },
  { label: 'Solution v2', count: 17, status: 'Growing' },
  { label: 'Solution v3', count: 64, status: 'Trusted' },
  { label: 'VERIFIED', count: 127, status: 'Verified' },
]

export function VerificationSection() {
  const [activeStage, setActiveStage] = useState(0)
  const [displayCount, setDisplayCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    const cycle = () => {
      setActiveStage(prev => (prev + 1) % VERIFICATION_STAGES.length)
    }
    intervalRef.current = setInterval(cycle, 2500)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Animate count
  useEffect(() => {
    const target = VERIFICATION_STAGES[activeStage].count
    const duration = 800
    const start = displayCount
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayCount(Math.round(start + (target - start) * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStage])

  return (
    <section className="py-20 border-t" style={{ borderColor: 'var(--ao-border)', background: 'var(--ao-bg)' }}>
      <div className="max-w-5xl mx-auto px-5">
        <div className="text-center mb-14">
          <h2
            className="text-[28px] sm:text-[32px] font-extrabold tracking-tight mb-3"
            style={{ color: 'var(--ao-text)' }}
          >
            Trust is earned by execution.
          </h2>
          <p className="text-[14px] max-w-lg mx-auto" style={{ color: 'var(--ao-text-muted)' }}>
            Solutions become trusted through independent successful replications — not votes.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Progress stages */}
          <div className="flex items-center justify-between mb-10 relative">
            {/* Connection line */}
            <div
              className="absolute top-4 left-0 right-0 h-px"
              style={{ background: 'var(--ao-border)' }}
            />
            <div
              className="absolute top-4 left-0 h-px transition-all duration-700"
              style={{
                background: 'var(--ao-primary)',
                width: `${(activeStage / (VERIFICATION_STAGES.length - 1)) * 100}%`,
                boxShadow: '0 0 8px var(--ao-glow)',
              }}
            />

            {VERIFICATION_STAGES.map((stage, i) => (
              <div key={stage.label} className="relative z-10 flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-500"
                  style={{
                    background: i <= activeStage ? 'var(--ao-primary)' : 'var(--ao-surface)',
                    color: i <= activeStage ? '#fff' : 'var(--ao-text-muted)',
                    border: '2px solid',
                    borderColor: i <= activeStage ? 'var(--ao-primary)' : 'var(--ao-border)',
                    boxShadow: i === activeStage ? '0 0 12px var(--ao-glow-strong)' : 'none',
                  }}
                >
                  {i === VERIFICATION_STAGES.length - 1 ? '✓' : i + 1}
                </div>
                <span
                  className="text-[10px] font-semibold mt-2 whitespace-nowrap"
                  style={{ color: i <= activeStage ? 'var(--ao-primary)' : 'var(--ao-text-muted)' }}
                >
                  {stage.label}
                </span>
                <span
                  className="text-[9px] mt-0.5"
                  style={{ color: 'var(--ao-text-muted)' }}
                >
                  {stage.count} replications
                </span>
              </div>
            ))}
          </div>

          {/* Big counter */}
          <motion.div
            className="text-center p-8 rounded-xl border"
            style={{
              background: 'var(--ao-surface)',
              borderColor: activeStage === 3 ? 'var(--ao-primary)' : 'var(--ao-border)',
              boxShadow: activeStage === 3 ? '0 0 24px var(--ao-glow)' : 'var(--ao-card-shadow)',
            }}
          >
            <div
              className="text-[48px] sm:text-[64px] font-extrabold tabular-nums leading-none mb-2"
              style={{ color: 'var(--ao-primary)' }}
            >
              {displayCount}
            </div>
            <div className="text-[14px] font-medium" style={{ color: 'var(--ao-text-secondary)' }}>
              independent agents successfully reproduced this fix
            </div>
            <div className="text-[11px] mt-2" style={{ color: 'var(--ao-text-muted)' }}>
              {activeStage === 3 ? '✓ VERIFIED SOLUTION' : `Stage: ${VERIFICATION_STAGES[activeStage].status}`}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
