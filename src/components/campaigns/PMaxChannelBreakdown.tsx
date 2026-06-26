'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { cn, formatCurrency } from '@/lib/utils'
import { Layers, TrendingUp, MousePointer, Target, AlertCircle } from 'lucide-react'

interface AssetGroup {
  channel: string
  label: string
  cost: number
  clicks: number
  impressions: number
  conversions: number
  conversionValue: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
  costShare: number
}

interface ApiResponse {
  channels: AssetGroup[]
  totals: {
    cost: number
    clicks: number
    impressions: number
    conversions: number
    conversionValue: number
    roas: number
    cpa: number
    ctr: number
  }
  source?: string
}

const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#8b5cf6', '#ef4444',
  '#14b8a6', '#f59e0b', '#ec4899', '#6366f1',
]

interface Props {
  customerId: string
  campaignId: string
  campaignName: string
  days?: number
}

export default function PMaxChannelBreakdown({ customerId, campaignId, campaignName, days = 30 }: Props) {
  const [data,    setData]    = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const { data: session } = useSession()
  const accessToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

  useEffect(() => {
    setLoading(true)
    setError(null)
    const headers: Record<string, string> = {}
    if (accessToken) headers['x-access-token'] = accessToken
    fetch(`/api/performance/pmax-channels?customerId=${customerId}&campaignId=${campaignId}&days=${days}`, { headers })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [customerId, campaignId, days, accessToken])

  const groups = data?.channels ?? []
  const activeGroups = groups.filter(g => g.cost > 0 || g.clicks > 0)
  const hasMultiple = activeGroups.length > 1

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-5 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-700">Asset Group Performance</span>
        <span className="text-xs text-gray-400">— {campaignName} · {days} วัน</span>
        <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium">PMax</span>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI summary row */}
          {(() => {
            const hasValue = data.totals.conversionValue > 0
            const cards = [
              { icon: TrendingUp,   label: 'Cost',        value: formatCurrency(data.totals.cost),                  color: 'text-gray-900' },
              { icon: MousePointer, label: 'Clicks',       value: data.totals.clicks.toLocaleString(),               color: 'text-blue-700' },
              { icon: Target,       label: 'Conversions',  value: data.totals.conversions.toFixed(1),                color: 'text-emerald-700' },
              ...(hasValue
                ? [
                    { icon: TrendingUp, label: 'Conv. Value', value: formatCurrency(data.totals.conversionValue), color: 'text-emerald-700' },
                    { icon: TrendingUp, label: 'ROAS',        value: `${data.totals.roas.toFixed(2)}x`,           color: data.totals.roas >= 3 ? 'text-emerald-600' : data.totals.roas >= 1 ? 'text-yellow-600' : 'text-red-600' },
                  ]
                : [
                    { icon: TrendingUp, label: 'CPA', value: data.totals.cpa > 0 ? formatCurrency(data.totals.cpa) : '—', color: 'text-gray-900' },
                  ]
              ),
            ]
            return (
              <div className={cn('grid gap-3', hasValue ? 'grid-cols-5' : 'grid-cols-4')}>
                {cards.map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className={cn('text-base font-bold tabular-nums mt-0.5', color)}>{value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Single active group — simple notice */}
          {!hasMultiple && activeGroups.length === 1 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">Asset Group ที่ active: <span className="font-bold">{activeGroups[0].label}</span></p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Campaign นี้มี 1 asset group ที่รับ traffic — asset group อื่นอยู่ในสถานะ PAUSED
                </p>
              </div>
            </div>
          )}

          {/* Multi asset group bar chart */}
          {hasMultiple && (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-2">Cost Distribution by Asset Group</p>
              {/* Stacked bar */}
              <div className="flex h-8 rounded-lg overflow-hidden gap-px">
                {activeGroups.map((g, i) => (
                  <div
                    key={g.label}
                    style={{ width: `${g.costShare}%`, backgroundColor: COLOR_PALETTE[i % COLOR_PALETTE.length] }}
                    title={`${g.label}: ${g.costShare.toFixed(1)}%`}
                    className="transition-all"
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {activeGroups.map((g, i) => (
                  <div key={g.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLOR_PALETTE[i % COLOR_PALETTE.length] }} />
                    <span className="truncate max-w-[120px]" title={g.label}>{g.label}</span>
                    <span className="text-gray-400">{g.costShare.toFixed(0)}%</span>
                  </div>
                ))}
              </div>

              {/* Clicks bar chart */}
              <p className="text-xs text-gray-400 font-medium mb-2 mt-4">Clicks by Asset Group</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={activeGroups} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: number) => [v.toLocaleString(), 'Clicks']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="clicks" radius={[4,4,0,0]}>
                    {activeGroups.map((_, i) => (
                      <Cell key={i} fill={COLOR_PALETTE[i % COLOR_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table — always shown */}
          {(() => {
            const hasValue = data.totals.conversionValue > 0
            const headers = ['Asset Group', 'Cost', 'Clicks', 'Impr.', 'Conv.', ...(hasValue ? ['Conv. Value', 'ROAS'] : ['CPA']), 'Cost %']
            const colCount = headers.length
            return (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {headers.map(h => (
                        <th key={h} className={cn(
                          'py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-gray-400',
                          h === 'Asset Group' ? 'text-left' : 'text-right'
                        )}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="py-8 text-center text-gray-400 text-sm">
                          ไม่พบข้อมูล Asset Group ในช่วงเวลานี้
                        </td>
                      </tr>
                    ) : groups.map((g, i) => {
                      const isActive = g.cost > 0 || g.clicks > 0
                      return (
                        <tr key={g.label} className={cn('border-b border-gray-50 transition-colors', isActive ? 'hover:bg-gray-50' : 'opacity-40')}>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: isActive ? COLOR_PALETTE[i % COLOR_PALETTE.length] : '#d1d5db' }} />
                              <span className={cn('font-medium truncate max-w-[180px]', isActive ? 'text-gray-900' : 'text-gray-400')} title={g.label}>{g.label}</span>
                              {!isActive && <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5 shrink-0">PAUSED</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums font-medium text-gray-900">{g.cost > 0 ? formatCurrency(g.cost) : '—'}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-gray-700">{g.clicks > 0 ? g.clicks.toLocaleString() : '—'}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-gray-500 text-xs">{g.impressions > 0 ? g.impressions.toLocaleString() : '—'}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-gray-700">{g.conversions > 0 ? g.conversions.toFixed(1) : '—'}</td>
                          {hasValue ? (
                            <>
                              <td className="py-2.5 px-4 text-right tabular-nums text-gray-700">{g.conversionValue > 0 ? formatCurrency(g.conversionValue) : '—'}</td>
                              <td className="py-2.5 px-4 text-right">
                                {g.roas > 0
                                  ? <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums', g.roas >= 3 ? 'bg-emerald-100 text-emerald-700' : g.roas >= 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600')}>
                                      {g.roas.toFixed(2)}x
                                    </span>
                                  : <span className="text-gray-300">—</span>
                                }
                              </td>
                            </>
                          ) : (
                            <td className="py-2.5 px-4 text-right tabular-nums text-gray-700">{g.cpa > 0 ? formatCurrency(g.cpa) : '—'}</td>
                          )}
                          <td className="py-2.5 px-4 text-right">
                            {g.costShare > 0
                              ? <span className="inline-block bg-blue-50 text-blue-700 text-xs font-medium rounded px-1.5 py-0.5 tabular-nums">{g.costShare.toFixed(1)}%</span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {data.totals.cost > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td className="py-2.5 px-4 text-xs font-bold text-gray-700">รวม</td>
                        <td className="py-2.5 px-4 text-right font-bold text-gray-900 tabular-nums">{formatCurrency(data.totals.cost)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-gray-900 tabular-nums">{data.totals.clicks.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-gray-900 tabular-nums">{data.totals.impressions.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-gray-900 tabular-nums">{data.totals.conversions.toFixed(1)}</td>
                        {hasValue ? (
                          <>
                            <td className="py-2.5 px-4 text-right font-bold text-gray-900 tabular-nums">{formatCurrency(data.totals.conversionValue)}</td>
                            <td className="py-2.5 px-4 text-right">
                              <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-bold tabular-nums', data.totals.roas >= 3 ? 'bg-emerald-100 text-emerald-700' : data.totals.roas >= 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600')}>
                                {data.totals.roas.toFixed(2)}x
                              </span>
                            </td>
                          </>
                        ) : (
                          <td className="py-2.5 px-4 text-right font-bold text-gray-900 tabular-nums">{data.totals.cpa > 0 ? formatCurrency(data.totals.cpa) : '—'}</td>
                        )}
                        <td className="py-2.5 px-4 text-right font-bold text-gray-900">100%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )
          })()}

          {/* Note about PMax limitation */}
          <p className="text-[10px] text-gray-400">
            * PMax ไม่เปิด channel breakdown (Search/Display/YouTube) ผ่าน API — Google ซ่อนข้อมูลนี้ไว้ใน UI เท่านั้น ข้อมูลนี้แสดงตาม Asset Group แทน
          </p>
        </>
      )}
    </div>
  )
}
