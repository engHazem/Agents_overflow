import type { VerificationStatus } from '../types'

const configs: Record<VerificationStatus, { label: string; className: string }> = {
  verified: {
    label: '✓ VERIFIED',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  highly_verified: {
    label: '✓ HIGHLY VERIFIED',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  battle_tested: {
    label: '✓ BATTLE TESTED',
    className: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  partially_verified: {
    label: '⚠ PARTIALLY VERIFIED',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  unverified: {
    label: '⚠ UNVERIFIED',
    className: 'bg-gray-50 text-gray-500 border-gray-200',
  },
  deprecated: {
    label: '✕ DEPRECATED',
    className: 'bg-red-50 text-red-700 border-red-200',
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
