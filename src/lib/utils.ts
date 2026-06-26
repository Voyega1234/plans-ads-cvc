import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'THB'): string {
  if (currency === 'THB') {
    return `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatConversions(n: number): string {
  if (n >= 1000) {
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return n.toFixed(2)
}

export function formatNumber(n: number): string {
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1)}M`
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`
  }
  return n.toLocaleString()
}

export function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatPercent(n: number, decimals: number = 1): string {
  return `${n.toFixed(decimals)}%`
}

export function formatDateRelative(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'วันนี้'
  if (days === 1) return 'เมื่อวาน'
  if (days < 7) return `${days} วันที่แล้ว`
  if (days < 30) return `${Math.floor(days / 7)} สัปดาห์ที่แล้ว`
  return `${Math.floor(days / 30)} เดือนที่แล้ว`
}

export const DEMO_USER_ID = 'demo-user-1'

// ── Metric colour helpers ─────────────────────────────────────────────────────
// "inverse" metrics: lower = better (CPA, CPC, cost, bounce rate, cart abandon)
// "normal" metrics:  higher = better (clicks, impressions, CTR, conv, ROAS, CVR)

export type MetricPolarity = 'lower-better' | 'higher-better' | 'neutral'

const METRIC_POLARITY: Record<string, MetricPolarity> = {
  cpa:          'lower-better',
  cpc:          'lower-better',
  cost:         'neutral',          // spend itself is neutral — depends on context
  cart_abandon: 'lower-better',

  conversions:       'higher-better',
  clicks:            'higher-better',
  impressions:       'higher-better',
  ctr:               'higher-better',
  conv_rate:         'higher-better',
  conversionRate:    'higher-better',
  roas:              'higher-better',
  quality_score:     'higher-better',
  impression_share:  'higher-better',
}

export function metricPolarity(key: string): MetricPolarity {
  return METRIC_POLARITY[key.toLowerCase()] ?? 'neutral'
}

/**
 * Returns a Tailwind text-color class for a % change value given the metric key.
 * pctChange > 0 means the metric went up vs previous period.
 * e.g. CPA went up (+20%) → bad → red
 *       CTR went up (+5%)  → good → green
 */
export function pctChangeColor(metricKey: string, pctChange: number): string {
  const p = metricPolarity(metricKey)
  if (p === 'neutral') return 'text-gray-500'
  const good = p === 'lower-better' ? pctChange <= 0 : pctChange >= 0
  return good ? 'text-emerald-600' : 'text-red-500'
}

/**
 * Returns a Tailwind text-color class for an absolute metric value.
 * Uses thresholds that are sensible defaults for Google Ads.
 * Pass null to get neutral gray.
 */
export function metricValueColor(key: string, value: number | null): string {
  if (value === null) return 'text-gray-400'
  const k = key.toLowerCase()

  if (k === 'ctr') {
    if (value >= 5)  return 'text-emerald-600'
    if (value >= 2)  return 'text-gray-700'
    if (value >= 1)  return 'text-amber-600'
    return 'text-red-500'
  }
  if (k === 'quality_score') {
    if (value >= 8) return 'text-emerald-600'
    if (value >= 6) return 'text-amber-600'
    return 'text-red-500'
  }
  if (k === 'roas') {
    if (value >= 4)  return 'text-emerald-600'
    if (value >= 2)  return 'text-gray-700'
    if (value >= 1)  return 'text-amber-600'
    return 'text-red-500'
  }
  if (k === 'conv_rate' || k === 'conversionrate') {
    if (value >= 5)  return 'text-emerald-600'
    if (value >= 2)  return 'text-gray-700'
    return 'text-amber-600'
  }
  if (k === 'cart_abandon') {
    if (value <= 50) return 'text-emerald-600'
    if (value <= 70) return 'text-amber-600'
    return 'text-red-500'
  }
  return 'text-gray-700'
}
