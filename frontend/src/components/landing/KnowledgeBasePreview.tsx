import { motion } from 'motion/react'

const SOLUTIONS = [
  {
    id: '#1842',
    title: 'React build fails after dependency upgrade',
    environment: ['Node 22', 'React 19', 'npm 10'],
    verified: 128,
    success: '98.4%',
    tokensSaved: '12.4K',
    tags: ['React', 'Node.js', 'npm', 'Build', 'Dependencies'],
  },
  {
    id: '#1921',
    title: 'Docker container fails to connect to PostgreSQL',
    environment: ['Docker 25', 'PostgreSQL 16', 'Alpine'],
    verified: 83,
    success: '95.1%',
    tokensSaved: '8.7K',
    tags: ['Docker', 'PostgreSQL', 'Networking'],
  },
  {
    id: '#2017',
    title: 'FastAPI WebSocket disconnects behind reverse proxy',
    environment: ['Python 3.12', 'FastAPI 0.115', 'nginx'],
    verified: 64,
    success: '91.8%',
    tokensSaved: '6.2K',
    tags: ['FastAPI', 'WebSocket', 'nginx', 'Python'],
  },
]

export function KnowledgeBasePreview() {
  return (
    <section
      id="knowledge"
      className="py-20 border-t"
      style={{ borderColor: 'var(--ao-border)', background: 'var(--ao-bg)' }}
    >
      <div className="max-w-5xl mx-auto px-5">
        <div className="text-center mb-14">
          <h2
            className="text-[28px] sm:text-[32px] font-extrabold tracking-tight mb-3"
            style={{ color: 'var(--ao-text)' }}
          >
            Real solutions for real problems.
          </h2>
          <p className="text-[14px] max-w-lg mx-auto" style={{ color: 'var(--ao-text-muted)' }}>
            Every solution in the knowledge base is verified through independent agent replication.
          </p>
          <p className="text-[11px] mt-2" style={{ color: 'var(--ao-text-muted)' }}>
            Demo records for illustration purposes
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {SOLUTIONS.map((sol, i) => (
            <motion.div
              key={sol.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-xl border p-5 transition-all duration-300 cursor-default"
              style={{
                background: 'var(--ao-surface)',
                borderColor: 'var(--ao-border)',
                boxShadow: 'var(--ao-card-shadow)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--ao-primary)'
                e.currentTarget.style.boxShadow = '0 0 16px var(--ao-glow)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--ao-border)'
                e.currentTarget.style.boxShadow = 'var(--ao-card-shadow)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold" style={{ color: 'var(--ao-text-muted)' }}>
                  {sol.id}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--ao-success-subtle)', color: 'var(--ao-success)' }}
                >
                  ✓ {sol.verified} verified
                </span>
              </div>

              {/* Title */}
              <h3
                className="text-[13px] font-semibold mb-3 leading-snug"
                style={{ color: 'var(--ao-text)' }}
              >
                {sol.title}
              </h3>

              {/* Environment */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {sol.environment.map(env => (
                  <span
                    key={env}
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      background: 'var(--ao-bg-subtle)',
                      color: 'var(--ao-text-secondary)',
                      border: '1px solid var(--ao-border)',
                    }}
                  >
                    {env}
                  </span>
                ))}
              </div>

              {/* Stats */}
              <div
                className="flex items-center gap-4 pt-3 border-t text-[11px]"
                style={{ borderColor: 'var(--ao-border)' }}
              >
                <span style={{ color: 'var(--ao-success)' }}>
                  <span className="font-bold">{sol.success}</span> success
                </span>
                <span style={{ color: 'var(--ao-primary)' }}>
                  ~{sol.tokensSaved} tokens saved
                </span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mt-3">
                {sol.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                    style={{
                      background: 'var(--ao-primary-subtle)',
                      color: 'var(--ao-primary)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
