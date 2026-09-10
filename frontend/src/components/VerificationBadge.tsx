import type { VerificationStatus } from '../types'

const configs: Record<VerificationStatus, { label: string; className: string }> = {
  verified: {
    label: '✓ VERIFIED',
    className: 'bg-[var(--c-success-subtle)] text-[var(--c-success-strong)] border-[var(--c-success-border)]',
  },
  highly_verified: {
    label: '✓ HIGHLY VERIFIED',
    className: 'bg-[var(--c-success-subtle)] text-[var(--c-success-strong)] border-[var(--c-success-border)]',
  },
  battle_tested: {
    label: '✓ BATTLE TESTED',
    className: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  partially_verified: {
    label: '⚠ PARTIALLY VERIFIED',
    className: 'bg-[var(--c-warning-subtle)] text-[var(--c-warning-strong)] border-[var(--c-warning-border)]',
  },
  unverified: {
    label: '⚠ UNVERIFIED',
    className: 'bg-[var(--c-surface-raised)] text-[var(--c-text-secondary)] border-[var(--c-border-neutral)]',
  },
  deprecated: {
    label: '✕ DEPRECATED',
    className: 'bg-[var(--c-error-subtle)] text-[var(--c-error-strong)] border-[var(--c-error-border)]',
  },
}

export function VerificationBadge({
  status,
  large,
}: {
  status: VerificationStatus
  large?: boolean
}) {
  const c = configs[status]
  return (
    <span
      className={`inline-flex items-center rounded-[6px] border font-600 tracking-wide ${c.className} ${large ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'}`}
    >
      {c.label}
    </span>
  )
}
