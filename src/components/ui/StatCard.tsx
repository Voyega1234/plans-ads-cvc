'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

// ── Delta badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ delta, pill = false }: { delta: number; pill?: boolean }) {
  const up = delta >= 0
  if (pill) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
        up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
      )}>
        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {up ? '+' : ''}{delta.toFixed(1)}%
      </span>
    )
  }
  return (
    <span className={cn('text-xs font-semibold', up ? 'text-green-600' : 'text-red-500')}>
      {up ? '+' : ''}{delta.toFixed(2)}%
    </span>
  )
}

// ── Variant 1: Simple — label + big value + inline delta (top-right) ──────────
// e.g. "Profit  +8.32%  \n $287,654"

export interface SimpleStatProps {
  label: string
  value: string
  delta?: number       // % change, positive = good
  className?: string
}

export function SimpleStat({ label, value, delta, className }: SimpleStatProps) {
  return (
    <div className={cn('px-6 py-5', className)}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-gray-500">{label}</p>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
    </div>
  )
}

// ── Variant 2: Inline — big value + "from X" + pill badge  ───────────────────
// e.g. "128,456  from 115,789  [+10.9%]"

export interface InlineStatProps {
  label: string
  value: string
  from?: string
  delta?: number
  className?: string
}

export function InlineStat({ label, value, from, delta, className }: InlineStatProps) {
  return (
    <div className={cn('px-6 py-5', className)}>
      <p className="text-sm text-gray-600 mb-1.5">{label}</p>
      <div className="flex items-center flex-wrap gap-2">
        <span className="text-2xl font-bold text-gray-900 tracking-tight">{value}</span>
        {from && <span className="text-sm text-gray-400">from {from}</span>}
        {delta !== undefined && <DeltaBadge delta={delta} pill />}
      </div>
    </div>
  )
}

// ── Variant 3: Card — bordered box, label top-left, delta top-right ───────────
// e.g. standalone metric card with rounded corners

export interface StatCardProps {
  label: string
  value: string
  delta?: number
  sub?: string           // small text below value
  href?: string          // "View more →" link
  className?: string
}

export function StatCard({ label, value, delta, sub, href, className }: StatCardProps) {
  return (
    <div className={cn('bg-white border border-gray-200 rounded-2xl p-5', className)}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{label}</p>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <p className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
      {href && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <a href={href} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            View more →
          </a>
        </div>
      )}
    </div>
  )
}

// ── Variant 4: Progress bar card  ─────────────────────────────────────────────
// e.g. "Requests  996  [====   ] 9.96%  996 of 10,000"

export interface ProgressStatProps {
  label: string
  value: string
  used: number
  total: number
  usedLabel?: string
  totalLabel?: string
  className?: string
}

export function ProgressStat({ label, value, used, total, usedLabel, totalLabel, className }: ProgressStatProps) {
  const pct = Math.min(100, (used / total) * 100)
  return (
    <div className={cn('bg-white border border-gray-200 rounded-2xl p-5', className)}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tracking-tight mb-3">{value}</p>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5">
        <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{pct.toFixed(2)}%</span>
        <span>{usedLabel ?? used.toLocaleString()} of {totalLabel ?? total.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ── Variant 5: Donut / ring progress ─────────────────────────────────────────

export interface RingStatProps {
  pct: number           // 0–100
  color?: string        // tailwind stroke color hex
  valueLabel: string    // e.g. "$250 / $1,000"
  subLabel: string      // e.g. "Budget HR"
  href?: string
  className?: string
}

export function RingStat({ pct, color = '#F97316', valueLabel, subLabel, href, className }: RingStatProps) {
  const r = 28
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className={cn('bg-white border border-gray-200 rounded-2xl p-5', className)}>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0 w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} fill="none" stroke="#E5E7EB" strokeWidth="5" />
            <circle
              cx="32" cy="32" r={r} fill="none"
              stroke={color} strokeWidth="5"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-800">
            {Math.round(pct)}%
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{valueLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5">{subLabel}</p>
        </div>
      </div>
      {href && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <a href={href} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">View more →</a>
        </div>
      )}
    </div>
  )
}

// ── StatRow: horizontal bar of SimpleStat, divided by vertical lines ──────────
// matches the "Profit | Late payments | ..." design

export function StatRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'bg-white border border-gray-200 rounded-2xl overflow-hidden',
      'grid divide-x divide-gray-200',
      className
    )}>
      {children}
    </div>
  )
}
