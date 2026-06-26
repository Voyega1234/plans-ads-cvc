'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  RefreshCw, ChevronRight, Activity, Zap, FileText, Bot,
  TrendingUp, TrendingDown, Settings2, Check, BarChart3, ShoppingBag,
  Rocket, CheckCircle2, Circle, X,
} from 'lucide-react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { cn, formatConversions, metricValueColor } from '@/lib/utils'
import dynamic from 'next/dynamic'

const PMaxChannelBreakdown = dynamic(
  () => import('@/components/campaigns/PMaxChannelBreakdown'),
  { ssr: false, loading: () => <div className="px-5 py-4 text-sm text-gray-400">กำลังโหลด...</div> }
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account { id: string; name: string; currencyCode?: string }
interface Summary {
  cost: number; conversions: number; clicks: number
  impressions: number; cpa: number; ctr: number; cpc: number
  conversionRate?: number; roas?: number
}
interface Changes {
  cost: number | null; conversions: number | null; cpa: number | null
  clicks: number | null; impressions: number | null; ctr: number | null
  cpc: number | null; conversionRate?: number | null; roas?: number | null
}
interface Campaign {
  campaignId?: string
  campaignName: string; cost: number; impressions: number
  clicks: number; conversions: number; ctr: number; cpc: number; cpa: number
  conversionRate: number
}
interface AccountData {
  current: Summary; previous: Summary; changes: Changes; campaigns: Campaign[]
}
interface AccountRow extends Account { data: AccountData | null; loading: boolean }

// ── Metric definitions ────────────────────────────────────────────────────────

interface MetricDef {
  key:     string
  label:   string
  short:   string
  format:  (v: number) => string
  changeKey: keyof Changes
  inverse: boolean   // true = lower is better (CPA, CPC)
  defaultOn: boolean
}

const ALL_METRICS: MetricDef[] = [
  { key:'cost',           label:'Spend',           short:'Spend',  format:(v)=>`฿${fmt(v)}`,                changeKey:'cost',           inverse:false, defaultOn:true  },
  { key:'conversions',    label:'Conversions',      short:'Conv.',  format:(v)=>String(Math.round(v)),        changeKey:'conversions',    inverse:false, defaultOn:true  },
  { key:'cpa',            label:'CPA',              short:'CPA',    format:(v)=>v>0?`฿${fmt(v)}`:'—',        changeKey:'cpa',            inverse:true,  defaultOn:true  },
  { key:'clicks',         label:'Clicks',           short:'Clicks', format:(v)=>v.toLocaleString(),          changeKey:'clicks',         inverse:false, defaultOn:true  },
  { key:'impressions',    label:'Impressions',      short:'Imp.',   format:(v)=>v>=1000?`${(v/1000).toFixed(1)}K`:String(v), changeKey:'impressions', inverse:false, defaultOn:false },
  { key:'ctr',            label:'CTR',              short:'CTR',    format:(v)=>`${v.toFixed(2)}%`,          changeKey:'ctr',            inverse:false, defaultOn:true  },
  { key:'cpc',            label:'Avg. CPC',         short:'CPC',    format:(v)=>`฿${v.toFixed(2)}`,          changeKey:'cpc',            inverse:true,  defaultOn:true  },
  { key:'conversionRate', label:'Conv. Rate',       short:'CVR',    format:(v)=>`${v.toFixed(2)}%`,          changeKey:'conversionRate', inverse:false, defaultOn:false },
]

const DAY_TABS = [
  { label:'1 วัน',  value:'1'  },
  { label:'7 วัน',  value:'7'  },
  { label:'14 วัน', value:'14' },
  { label:'30 วัน', value:'30' },
]

function fmt(n: number) { return n.toLocaleString('th-TH', { maximumFractionDigits:0 }) }

function guessType(name: string) {
  const n = name.toLowerCase()
  if (n.includes('pmax')||n.includes('max'))       return { label:'PMax',    cls:'bg-orange-100 text-orange-700' }
  if (n.includes('display')||n.includes('gdn'))    return { label:'Display', cls:'bg-purple-100 text-purple-700' }
  if (n.includes('youtube')||n.includes('video'))  return { label:'Video',   cls:'bg-red-100 text-red-700' }
  if (n.includes('shopping'))                       return { label:'Shopping',cls:'bg-green-100 text-green-700' }
  return { label:'Search', cls:'bg-blue-100 text-blue-700' }
}

// ── Metric cell: value left-aligned, % right-aligned in same cell ─────────────

function MetricCell({
  value, pct, inverse = false,
}: { value: React.ReactNode; pct?: number | null; inverse?: boolean }) {
  const good = pct === null || pct === undefined ? null : (inverse ? pct <= 0 : pct >= 0)
  const big  = pct !== null && pct !== undefined && Math.abs(pct) >= 15

  let pctNode: React.ReactNode = null
  if (pct !== null && pct !== undefined) {
    const sign = pct > 0 ? '+' : ''
    const text = `${sign}${pct}%`
    pctNode = big ? (
      <span className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap',
        good ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
      )}>
        {good ? <TrendingUp className="w-2.5 h-2.5 flex-shrink-0"/> : <TrendingDown className="w-2.5 h-2.5 flex-shrink-0"/>}
        {text}
      </span>
    ) : (
      <span className={cn('text-[11px] whitespace-nowrap', good ? 'text-emerald-600' : 'text-red-500')}>
        {text}
      </span>
    )
  }

  return (
    <div className="flex items-baseline gap-1.5">
      <span className="flex-1 text-right font-medium text-gray-900 tabular-nums">{value}</span>
      <span className="w-20 flex-shrink-0">{pctNode}</span>
    </div>
  )
}

// ── Column picker popover ─────────────────────────────────────────────────────

function ColumnPicker({
  active, onChange,
}: { active: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  function toggle(key: string) {
    const next = new Set(active)
    next.has(key) ? next.delete(key) : next.add(key)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors',
          open ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        )}
      >
        <Settings2 className="w-3.5 h-3.5"/>
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-30 w-52 p-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1">เลือก Metrics</p>
          {ALL_METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <span className={cn(
                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                active.has(m.key) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              )}>
                {active.has(m.key) && <Check className="w-2.5 h-2.5 text-white"/>}
              </span>
              <span className="text-sm text-gray-700">{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [rows,            setRows]            = useState<AccountRow[]>([])
  const [days,            setDays]            = useState('30')
  const [selectedId,      setSelectedId]      = useState<string|null>(null)
  const [globalLoading,   setGlobalLoading]   = useState(false)
  const [activeMetrics,   setActiveMetrics]   = useState<Set<string>>(
    new Set(ALL_METRICS.filter(m => m.defaultOn).map(m => m.key))
  )
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set())
  const hasGoogleAds = rows.length > 0

  function toggleChannelExpand(key: string) {
    setExpandedChannels(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function isPMax(name: string) {
    const n = name.toLowerCase()
    return n.includes('pmax') || n.includes('performance max') || n.includes('max')
  }

  function isShopping(name: string) {
    return name.toLowerCase().includes('shopping')
  }

  const visibleMetrics = ALL_METRICS.filter(m => activeMetrics.has(m.key))

  const fetchAccountData = useCallback(async (id: string, d: string): Promise<AccountData|null> => {
    try {
      const res = await fetch(`/api/performance/account?customerId=${id}&days=${d}`)
      return await res.json()
    } catch { return null }
  }, [])

  const loadAll = useCallback(async (list: Account[], d: string) => {
    setGlobalLoading(true)
    setRows(list.map(a => ({ ...a, data:null, loading:true })))
    const results = await Promise.all(list.map(a => fetchAccountData(a.id, d)))
    setRows(list.map((a, i) => ({ ...a, data:results[i], loading:false })))
    setGlobalLoading(false)
  }, [fetchAccountData])

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => {
        const list: Account[] = (d.accounts ?? []).map((a: { id:string; descriptiveName?:string; name?:string; currencyCode?:string }) => ({
          id: a.id, name: a.descriptiveName ?? a.name ?? a.id, currencyCode: a.currencyCode,
        }))
        if (list.length > 0) { setSelectedId(list[0].id); loadAll(list, days) }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const list = rows.map(({ id, name, currencyCode }) => ({ id, name, currencyCode }))
    if (list.length > 0) loadAll(list, days)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const selected  = rows.find(r => r.id === selectedId) ?? null
  const campaigns = selected?.data?.campaigns ?? []

  // Aggregate across ALL accounts
  const totals = rows.reduce((acc, r) => {
    const c = r.data?.current
    if (!c) return acc
    return {
      cost:        acc.cost        + c.cost,
      conversions: acc.conversions + c.conversions,
      clicks:      acc.clicks      + c.clicks,
      impressions: acc.impressions + c.impressions,
    }
  }, { cost:0, conversions:0, clicks:0, impressions:0 })

  const totalCPA = totals.conversions > 0 ? totals.cost / totals.conversions : 0
  const totalCTR = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const totalCPC = totals.clicks > 0 ? totals.cost / totals.clicks : 0

  // Pie data: spend per account
  const pieData = rows
    .filter(r => r.data && r.data.current.cost > 0)
    .map((r, i) => ({
      name:  r.name,
      value: r.data!.current.cost,
      color: ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#06b6d4'][i % 6],
    }))

  // helper: get metric value from Summary
  function getVal(summary: Summary, key: string): number {
    return (summary as unknown as Record<string,number>)[key] ?? 0
  }
  function getChange(changes: Changes, key: keyof Changes): number|null {
    return changes[key] as number|null ?? null
  }

  return (
    <AppShell>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {globalLoading
                ? `กำลังโหลด ${rows.filter(r => !r.loading).length}/${rows.length} accounts...`
                : `${rows.length} accounts · ทุก account ใน ${DAY_TABS.find(t=>t.value===days)?.label}`
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {DAY_TABS.map(t => (
                <button key={t.value} onClick={() => setDays(t.value)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    days===t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                >{t.label}</button>
              ))}
            </div>
            <ColumnPicker active={activeMetrics} onChange={setActiveMetrics}/>
            <button onClick={() => { const l=rows.map(({id,name,currencyCode})=>({id,name,currencyCode})); if(l.length) loadAll(l,days) }}
              disabled={globalLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', globalLoading && 'animate-spin')}/>รีเฟรช
            </button>
          </div>
        </div>


        {/* ── Overview ── */}
        {totals.cost > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Overview — ทุก Account</h2>
            <div className="flex flex-col lg:flex-row gap-6">

              {/* Pie chart */}
              <div className="flex-shrink-0 w-full lg:w-64">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Spend by Account</p>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`฿${fmt(v)}`, 'Spend']} contentStyle={{ fontSize:12, borderRadius:8 }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="text-base font-bold text-gray-900">฿{fmt(totals.cost)}</p>
                  </div>
                </div>
                {/* Legend */}
                <div className="space-y-1.5 mt-1">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}/>
                        <span className="text-gray-600 truncate">{d.name}</span>
                      </div>
                      <span className="font-medium text-gray-800 ml-2 flex-shrink-0">
                        {Math.round((d.value / totals.cost) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metrics grid */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 content-start">
                {[
                  { label:'Total Spend',    value:`฿${fmt(totals.cost)}`,                                          sub:`${rows.filter(r=>r.data).length} accounts` },
                  { label:'Conversions',    value:formatConversions(totals.conversions),                          sub:'ทุก account รวมกัน' },
                  { label:'Blended CPA',    value:totalCPA > 0 ? `฿${fmt(totalCPA)}` : '—',                       sub:'cost / conversions' },
                  { label:'Clicks',         value:totals.clicks.toLocaleString(),                                  sub:'ทุก account รวมกัน' },
                  { label:'Impressions',    value:totals.impressions >= 1000 ? `${(totals.impressions/1000).toFixed(1)}K` : String(totals.impressions), sub:'ทุก account รวมกัน' },
                  { label:'Blended CTR',    value:`${totalCTR.toFixed(2)}%`,                                       sub:'clicks / impressions' },
                  { label:'Avg. CPC',       value:`฿${totalCPC.toFixed(2)}`,                                       sub:'cost / clicks' },
                  { label:'Conv. Rate',     value:totals.clicks > 0 ? `${((totals.conversions/totals.clicks)*100).toFixed(2)}%` : '—', sub:'conv / clicks' },
                  { label:'Accounts Active',value:String(rows.filter(r => r.data && r.data.current.cost > 0).length), sub:`จาก ${rows.length} accounts` },
                ].map((m, i) => {
                  const isCTR  = m.label === 'Blended CTR'
                  const isCVR  = m.label === 'Conv. Rate'
                  const numVal = isCTR ? totalCTR : isCVR && totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : null
                  const valCls = isCTR ? metricValueColor('ctr', totalCTR) : isCVR && numVal !== null ? metricValueColor('conversionRate', numVal) : 'text-gray-900'
                  return (
                    <div key={i} className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-400 font-medium">{m.label}</p>
                      <p className={cn('text-lg font-bold mt-0.5 tabular-nums', valCls)}>{m.value}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{m.sub}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── All-accounts table ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">เปรียบเทียบทุก Account</h2>
            <p className="text-xs text-gray-400 mt-0.5">vs ช่วงก่อนหน้า {DAY_TABS.find(t=>t.value===days)?.label} · คลิกเลือก account เพื่อดู campaign</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Account</th>
                  {visibleMetrics.map(m => (
                    <th key={m.key} className="py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">
                      {/* header ชิดขวาตรงกับตัวเลข — เว้น w-20 ทางขวาสำหรับ % */}
                      <div className="flex items-baseline gap-1.5">
                        <span className="flex-1 text-right">{m.short}</span>
                        <span className="w-20 flex-shrink-0"/>
                      </div>
                    </th>
                  ))}
                  <th className="py-3 px-4 w-6"/>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={visibleMetrics.length+2} className="py-12 text-center text-gray-400 text-sm">
                    <Activity className="w-6 h-6 mx-auto mb-2 opacity-30"/>กำลังโหลด...
                  </td></tr>
                )}
                {rows.map(row => {
                  const isSelected = row.id === selectedId
                  const c  = row.data?.current
                  const ch = row.data?.changes
                  return (
                    <tr key={row.id} onClick={() => setSelectedId(row.id)}
                      className={cn('border-b border-gray-50 cursor-pointer transition-colors',
                        isSelected ? 'bg-blue-50 border-blue-100' : 'hover:bg-gray-50')}
                    >
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', isSelected ? 'bg-blue-500' : 'bg-gray-300')}/>
                          <div className="min-w-0">
                            <p className={cn('font-medium truncate', isSelected ? 'text-blue-700' : 'text-gray-900')}>{row.name}</p>
                            <p className="text-[11px] text-gray-400">{row.id}</p>
                          </div>
                        </div>
                      </td>
                      {visibleMetrics.map(m => (
                        <td key={m.key} className="py-4 px-4">
                          {row.loading
                            ? <div className="flex justify-end gap-2"><span className="inline-block w-16 h-4 bg-gray-100 rounded animate-pulse"/><span className="inline-block w-10 h-4 bg-gray-100 rounded animate-pulse"/></div>
                            : c
                              ? <MetricCell value={m.format(getVal(c, m.key))} pct={ch ? getChange(ch, m.changeKey as keyof Changes) : null} inverse={m.inverse}/>
                              : <div className="text-right text-gray-300">—</div>
                          }
                        </td>
                      ))}
                      <td className="py-4 px-4">
                        <ChevronRight className={cn('w-4 h-4', isSelected ? 'text-blue-400' : 'text-gray-300')}/>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Campaign breakdown ── */}
        {selected && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"/>
                  <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                  <span className="text-xs text-gray-400">{selected.id}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 ml-4">
                  Campaign breakdown · {DAY_TABS.find(t=>t.value===days)?.label}
                  {campaigns.length > 0 && ` · ${campaigns.length} campaigns`}
                </p>
              </div>
              {selected.loading && <RefreshCw className="w-4 h-4 text-gray-300 animate-spin"/>}
            </div>

            {selected.loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-40"/>กำลังโหลด...
              </div>
            ) : campaigns.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                <Activity className="w-6 h-6 mx-auto mb-2 opacity-30"/>ไม่พบข้อมูล campaign
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left py-3 px-5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Campaign</th>
                      <th className="text-left py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Type</th>
                      {visibleMetrics.map(m => (
                        <th key={m.key} className="py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">
                          <div className="flex items-baseline gap-1.5">
                            <span className="flex-1 text-right">{m.short}</span>
                            <span className="w-20 flex-shrink-0"/>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((camp, i) => {
                      const { label, cls } = guessType(camp.campaignName)
                      // campaign-level % vs account average (highlight outliers)
                      const acctAvgCPA = selected.data!.current.cpa
                      const campKey = `${selected.id}-${i}`
                      const channelExpanded = expandedChannels.has(campKey)
                      const showPMax     = isPMax(camp.campaignName)
                      const showShopping = isShopping(camp.campaignName) || showPMax
                      return (
                        <React.Fragment key={i}>
                          <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-5 max-w-[200px]">
                              <span className="truncate block font-medium text-gray-900">{camp.campaignName}</span>
                              {/* Action buttons */}
                              <div className="flex items-center gap-2 mt-1">
                                {showPMax && (
                                  <button
                                    onClick={() => toggleChannelExpand(campKey)}
                                    className={cn(
                                      'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-colors',
                                      channelExpanded
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600'
                                    )}
                                  >
                                    <BarChart3 className="w-3 h-3"/>
                                    Channel Breakdown
                                  </button>
                                )}
                                {showShopping && (
                                  <a
                                    href={`/shopping-products?campaignId=${i + 1}&customerId=${selected.id}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                                  >
                                    <ShoppingBag className="w-3 h-3"/>
                                    Product Performance
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className={cn('px-2 py-0.5 rounded text-xs font-medium', cls)}>{label}</span>
                            </td>
                            {visibleMetrics.map(m => {
                              const val = (camp as unknown as Record<string,number>)[m.key] ?? 0
                              let pct: number | null = null
                              let pctInverse = m.inverse
                              if (m.key === 'cpa' && acctAvgCPA > 0 && val > 0) {
                                pct = parseFloat(((val / acctAvgCPA - 1) * 100).toFixed(1))
                                pctInverse = true
                              } else if (m.key === 'cost' && selected.data!.current.cost > 0) {
                                pct = parseFloat(((val / selected.data!.current.cost) * 100).toFixed(1))
                                pctInverse = false
                              }
                              return (
                                <td key={m.key} className="py-3 px-4">
                                  <MetricCell value={m.format(val)} pct={pct} inverse={pctInverse}/>
                                </td>
                              )
                            })}
                          </tr>
                          {/* Expanded PMax channel breakdown */}
                          {showPMax && channelExpanded && (
                            <tr>
                              <td colSpan={visibleMetrics.length + 2} className="p-0">
                                <PMaxChannelBreakdown
                                  customerId={selected.id}
                                  campaignId={camp.campaignId ?? String(i + 1)}
                                  campaignName={camp.campaignName}
                                  days={parseInt(days, 10)}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  {selected.data?.current && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td className="py-3 px-5 font-semibold text-gray-700" colSpan={2}>รวมทั้งหมด</td>
                        {visibleMetrics.map(m => (
                          <td key={m.key} className="py-3 px-4">
                            <div className="text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                              {m.format(getVal(selected.data!.current, m.key))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Quick actions ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { href:'/brief/new?mode=media-plan', icon:<FileText className="w-5 h-5 text-blue-600"/>,   bg:'bg-blue-50 group-hover:bg-blue-100',   border:'hover:border-blue-300',   title:'สร้าง Media Plan',    sub:'Brief → Blueprint → Push' },
            { href:'/automation/run',             icon:<Zap className="w-5 h-5 text-purple-600"/>,      bg:'bg-purple-50 group-hover:bg-purple-100', border:'hover:border-purple-300', title:'Build Campaign',      sub:'AI สร้าง + QA + Push' },
            { href:'/reports',                    icon:<Bot className="w-5 h-5 text-emerald-600"/>,     bg:'bg-emerald-50 group-hover:bg-emerald-100',border:'hover:border-emerald-300',title:'AI Reports',          sub:'Performance + recommendations' },
          ].map(item => (
            <a key={item.href} href={item.href}
              className={cn('flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-all group', item.border)}
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors', item.bg)}>{item.icon}</div>
              <div><p className="font-medium text-gray-900 text-sm">{item.title}</p><p className="text-xs text-gray-400 mt-0.5">{item.sub}</p></div>
            </a>
          ))}
        </div>

      </div>
    </AppShell>
  )
}
