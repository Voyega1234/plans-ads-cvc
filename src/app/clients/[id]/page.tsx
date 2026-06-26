'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'
import {
  ArrowLeft, RefreshCw, ExternalLink, Sparkles, TrendingUp, TrendingDown,
  Play, Pause, AlertCircle, CheckCircle2, BarChart2, Users, Target,
  Eye, MousePointer, Zap, Calendar, Search, FileText, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatNumber, formatConversions, metricValueColor, pctChangeColor } from '@/lib/utils'

interface CampaignChange {
  spend: number | null; impressions: number | null; clicks: number | null
  conversions: number | null; ctr: number | null; cpc: number | null
  cpa: number | null; convRate: number | null
}

interface CampaignDetail {
  id: string; name: string; status: 'ENABLED' | 'PAUSED' | 'REMOVED'
  biddingStrategy: string; budget: number; spend: number
  impressions: number; clicks: number; conversions: number
  ctr: number; cpc: number; cpa: number; convRate: number; roas: number
  startDate: string; endDate: string | null
  changes: CampaignChange
}

interface ClientData {
  customerId: string; dateRange: string
  campaigns: CampaignDetail[]
  summary: {
    totalSpend: number; totalConversions: number; totalClicks: number; totalImpressions: number
    blendedCPA: number; blendedCTR: number; activeCampaigns: number; pausedCampaigns: number
    changes?: {
      spend: number | null; conversions: number | null; clicks: number | null
      impressions: number | null; blendedCPA: number | null; blendedCTR: number | null
    }
  }
  mock: boolean
}

const DATE_RANGES = [
  { value: 'LAST_7_DAYS',  label: '7 วัน' },
  { value: 'LAST_30_DAYS', label: '30 วัน' },
  { value: 'LAST_90_DAYS', label: '90 วัน' },
  { value: 'THIS_MONTH',   label: 'เดือนนี้' },
]

const BIDDING_LABEL: Record<string, string> = {
  TARGET_CPA:   'tCPA',
  TARGET_ROAS:  'tROAS',
  MAXIMIZE_CONVERSIONS: 'Max Conv',
  MAXIMIZE_CONVERSION_VALUE: 'Max Conv Val',
  MANUAL_CPC:   'Manual CPC',
  ENHANCED_CPC: 'eCPC',
  TARGET_IMPRESSION_SHARE: 'Target IS',
  MAXIMIZE_CLICKS: 'Max Clicks',
}

const ECOMMERCE_BIDDING = new Set(['MAXIMIZE_CONVERSION_VALUE', 'TARGET_ROAS'])
function isEcommerce(biddingStrategy: string) { return ECOMMERCE_BIDDING.has(biddingStrategy) }

// Inline % change badge — green/red based on metric polarity
function ChangeBadge({ metricKey, value }: { metricKey: string; value: number | null | undefined }) {
  if (value === null || value === undefined) return null
  const colorCls = pctChangeColor(metricKey, value)
  const isGood   = colorCls.includes('emerald')
  const sign     = value > 0 ? '+' : ''
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold whitespace-nowrap', colorCls)}>
      {isGood
        ? <TrendingUp className="w-2.5 h-2.5" />
        : <TrendingDown className="w-2.5 h-2.5" />}
      {sign}{value}%
    </span>
  )
}

function StatusBadge({ status }: { status: CampaignDetail['status'] }) {
  if (status === 'ENABLED') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
      <Play className="w-2.5 h-2.5" />Active
    </span>
  )
  if (status === 'PAUSED') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
      <Pause className="w-2.5 h-2.5" />Paused
    </span>
  )
  return <span className="text-[10px] text-gray-400">Removed</span>
}

function MetricCard({ icon: Icon, label, value, sub, color = 'blue', changeKey, changeValue }: {
  icon: React.ComponentType<{ className?: string }>
  label: string; value: string; sub?: string; color?: 'blue'|'green'|'amber'|'purple'|'red'
  changeKey?: string; changeValue?: number | null
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    green:  'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber:  'bg-amber-50 text-amber-600 border-amber-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    red:    'bg-red-50 text-red-600 border-red-100',
  }
  return (
    <div className={cn('rounded-xl border p-4', colors[color])}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium opacity-80">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-xl font-bold">{value}</p>
        {changeKey && <ChangeBadge metricKey={changeKey} value={changeValue} />}
      </div>
      {sub && <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ClientDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData]           = useState<ClientData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('LAST_30_DAYS')
  const [sortCol, setSortCol]     = useState<keyof CampaignDetail>('spend')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')
  interface AnalysisReport {
    verdict: string
    score: number
    winners: { name: string; reason: string }[]
    problems: { name: string; issue: string; checkpoints?: string[]; fix: string }[]
    urgent: string[]
    ctr_advice?: string
    conv_advice?: string
    strategy: string
  }
  const [aiAnalysis, setAiAnalysis]   = useState<AnalysisReport | string>('')
  const [aiLoading, setAiLoading]     = useState(false)

  const loadAI = async (campaigns: CampaignDetail[], range: string) => {
    if (!campaigns.length) return
    setAiLoading(true)
    setAiAnalysis('')
    try {
      // Sort by spend desc (active first), send top 15 to keep payload small
      const sorted = [...campaigns].sort((a, b) => b.spend - a.spend || (b.status === 'ENABLED' ? 1 : -1))
      const top15  = sorted.slice(0, 15)
      const res = await fetch(`/api/clients/${id}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaigns: top15, totalCampaigns: campaigns.length, dateRange: range }),
      })
      const json = await res.json() as { analysis: AnalysisReport | string; structured?: boolean; error?: string }
      if (res.ok && json.analysis) {
        setAiAnalysis(json.analysis)
      } else {
        setAiAnalysis(json.error ?? 'AI วิเคราะห์ไม่สำเร็จ กรุณาลอง refresh')
      }
    } catch (e) {
      setAiAnalysis('เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAiLoading(false)
    }
  }

  const load = async (range = dateRange) => {
    setLoading(true); setError(null); setAiAnalysis(''); setAiLoading(false)
    try {
      const res = await fetch(`/api/clients/${id}/campaigns?dateRange=${range}`)
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json() as ClientData
      setData(json)
      // Load AI analysis separately after campaigns arrive
      loadAI(json.campaigns, range)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const onRangeChange = (r: string) => { setDateRange(r); load(r) }

  const sort = (col: keyof CampaignDetail) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = data ? [...data.campaigns].sort((a, b) => {
    const va = a[sortCol]; const vb = b[sortCol]
    const n = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? n : -n
  }) : []

  const s = data?.summary

  function SortTh({ col, label }: { col: keyof CampaignDetail; label: string }) {
    const active = sortCol === col
    return (
      <th onClick={() => sort(col)} className={cn(
        'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors',
        active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
      )}>
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <AppShell>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/clients" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-3.5 h-3.5" />My Clients
          </Link>
          <span className="text-gray-200">/</span>
          <span className="text-sm font-semibold text-gray-900 font-mono">{id}</span>
          {data?.mock && (
            <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Mock data</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* Date range */}
            <select value={dateRange} onChange={(e) => onRangeChange(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white outline-none">
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={() => load()} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />Refresh
            </button>
            <a href={`https://ads.google.com/aw/overview?ocid=${id.replace(/-/g, '')}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50">
              <ExternalLink className="w-3 h-3" />Google Ads
            </a>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            <div className="h-28 bg-blue-50 rounded-xl animate-pulse" />
            <div className="h-64 bg-white border border-gray-100 rounded-xl animate-pulse" />
          </div>
        ) : s && (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={BarChart2}    label="Total Spend"   value={formatCurrency(s.totalSpend)}          sub={DATE_RANGES.find((r) => r.value === dateRange)?.label} color="blue"   changeKey="spend"       changeValue={s.changes?.spend} />
              <MetricCard icon={Target}       label="Conversions"   value={formatConversions(s.totalConversions)} sub={`CPA ${s.blendedCPA > 0 ? formatCurrency(s.blendedCPA) : '—'}`}     color="green"  changeKey="conversions" changeValue={s.changes?.conversions} />
              <MetricCard icon={MousePointer} label="Clicks"        value={formatNumber(s.totalClicks)}           sub={`CTR ${s.blendedCTR.toFixed(2)}%`}                   color="purple" changeKey="clicks"      changeValue={s.changes?.clicks} />
              <MetricCard icon={Users}        label="Active/Paused" value={`${s.activeCampaigns} / ${s.pausedCampaigns}`} sub="campaigns"                                   color="amber" />
            </div>

            {/* AI Media Buyer Analysis — structured report */}
            <div className="bg-white border border-indigo-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-indigo-50 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center gap-2">
                <Sparkles className={cn('w-4 h-4 text-indigo-500', aiLoading && 'animate-pulse')} />
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                  Strategic Analysis · {DATE_RANGES.find((r) => r.value === dateRange)?.label}
                </span>
                <span className="text-[10px] text-indigo-300 ml-auto">READ ONLY · ไม่มีการปรับแก้ account จริง</span>
              </div>
              <div className="p-4">
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-indigo-400 py-4">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    กำลังวิเคราะห์เชิง strategic...
                  </div>
                ) : !aiAnalysis ? (
                  <p className="text-sm text-gray-400 py-2">ไม่มีข้อมูลเพียงพอสำหรับการวิเคราะห์</p>
                ) : typeof aiAnalysis === 'string' ? (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{aiAnalysis}</p>
                ) : (
                  <div className="space-y-4">
                    {/* Verdict + Score */}
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold border',
                        aiAnalysis.score >= 7 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        aiAnalysis.score >= 4 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      )}>
                        {aiAnalysis.score}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{aiAnalysis.verdict}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Account Health Score / 10</p>
                      </div>
                    </div>

                    {/* Urgent actions */}
                    {aiAnalysis.urgent?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />ต้องทำทันที
                        </p>
                        <ol className="space-y-1.5">
                          {aiAnalysis.urgent.map((u, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-800 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                              <span className="font-bold text-red-500 flex-shrink-0">#{i+1}</span>
                              {u}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Winners */}
                    {aiAnalysis.winners?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />Campaign ที่ Perform ดี
                        </p>
                        <div className="space-y-1.5">
                          {aiAnalysis.winners.map((w, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                              <div><span className="font-semibold text-gray-900">{w.name}</span><span className="text-gray-500"> — {w.reason}</span></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Problems */}
                    {aiAnalysis.problems?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />ต้องปรับปรุง
                        </p>
                        <div className="space-y-2">
                          {aiAnalysis.problems.map((p, i) => (
                            <div key={i} className="text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 space-y-1.5">
                              <p className="font-semibold text-gray-900">{p.name}</p>
                              <p className="text-gray-600"><span className="text-amber-700 font-medium">ปัญหา:</span> {p.issue}</p>
                              {p.checkpoints && p.checkpoints.length > 0 && (
                                <div className="bg-white rounded border border-amber-100 px-2 py-1.5 space-y-1">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                    <Search className="w-3 h-3" />จุดที่ควรไปตรวจ
                                  </p>
                                  {p.checkpoints.map((cp, ci) => (
                                    <div key={ci} className="flex items-start gap-1.5 text-gray-700">
                                      <ChevronRight className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                                      <span>{cp}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <p className="text-gray-800 bg-blue-50 rounded px-2 py-1 border border-blue-100">
                                <span className="text-blue-700 font-medium">แนะนำ:</span> {p.fix}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CTR & Conv advice */}
                    {(aiAnalysis.ctr_advice || aiAnalysis.conv_advice) && (
                      <div className="grid grid-cols-1 gap-2">
                        {aiAnalysis.ctr_advice && aiAnalysis.ctr_advice !== 'N/A' && (
                          <div className="bg-sky-50 border border-sky-100 rounded-lg px-3 py-2.5">
                            <p className="text-[10px] font-bold text-sky-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                              <Eye className="w-3 h-3" />CTR ต่ำ — สิ่งที่ควรตรวจ
                            </p>
                            <p className="text-xs text-gray-700 leading-relaxed">{aiAnalysis.ctr_advice}</p>
                          </div>
                        )}
                        {aiAnalysis.conv_advice && aiAnalysis.conv_advice !== 'N/A' && (
                          <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2.5">
                            <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                              <Zap className="w-3 h-3" />Conversion — สิ่งที่ควรดู
                            </p>
                            <p className="text-xs text-gray-700 leading-relaxed">{aiAnalysis.conv_advice}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Strategy insight */}
                    {aiAnalysis.strategy && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
                        <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-1.5">Strategic Insight</p>
                        <p className="text-xs text-gray-700 leading-relaxed">{aiAnalysis.strategy}</p>
                      </div>
                    )}

                    {/* ปุ่มดูรายงานเต็ม */}
                    <div className="pt-1 border-t border-indigo-100">
                      <Link
                        href={`/reports?customerId=${id}&dateRange=${dateRange}`}
                        className="flex items-center justify-center gap-2 w-full py-2 px-4 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        ดูรายงานเต็ม — Search Terms, Keywords, Text Ads
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Campaign table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Campaigns ({data?.campaigns.length ?? 0})</span>
                <span className="text-xs text-gray-400">Click column to sort · Read-only view</span>
              </div>
              {sorted.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูล campaign</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <SortTh col="name"        label="Campaign" />
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Bidding</th>
                        <SortTh col="spend"       label="Spend" />
                        <SortTh col="impressions" label="Impr." />
                        <SortTh col="clicks"      label="Clicks" />
                        <SortTh col="conversions" label="Conv." />
                        <SortTh col="ctr"         label="CTR" />
                        <SortTh col="cpc"         label="CPC" />
                        <SortTh col="cpa"         label="CPA" />
                        <SortTh col="roas"        label="ROAS" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sorted.map((c) => {
                        const isProblematic = c.status === 'ENABLED' && c.clicks > 50 && c.conversions === 0
                        const isGood        = c.conversions > 0 && c.cpa < 500
                        return (
                          <tr key={c.id} className={cn(
                            'hover:bg-gray-50 transition-colors',
                            isProblematic && 'bg-amber-50/40',
                            isGood && 'bg-emerald-50/20',
                          )}>
                            <td className="px-3 py-3 max-w-[200px]">
                              <div className="flex items-start gap-1.5">
                                {isProblematic && <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />}
                                {isGood && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />}
                                <div>
                                  <span className="text-xs font-medium text-gray-900 break-words leading-tight">{c.name}</span>
                                  {isEcommerce(c.biddingStrategy) && (
                                    <span className="ml-1.5 text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded uppercase tracking-wide">ecom</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                            <td className="px-3 py-3">
                              <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded font-mono',
                                isEcommerce(c.biddingStrategy) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                              )}>
                                {BIDDING_LABEL[c.biddingStrategy] ?? c.biddingStrategy}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-xs font-semibold text-gray-900">{formatCurrency(c.spend)}</p>
                              <ChangeBadge metricKey="spend" value={c.changes?.spend} />
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-xs text-gray-600">{formatNumber(c.impressions)}</p>
                              <ChangeBadge metricKey="impressions" value={c.changes?.impressions} />
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-xs text-gray-600">{formatNumber(c.clicks)}</p>
                              <ChangeBadge metricKey="clicks" value={c.changes?.clicks} />
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-xs font-semibold text-emerald-600">{c.conversions > 0 ? formatConversions(c.conversions) : <span className="text-gray-300">0.00</span>}</p>
                              <ChangeBadge metricKey="conversions" value={c.changes?.conversions} />
                            </td>
                            <td className="px-3 py-3">
                              <p className={cn('text-xs font-semibold', metricValueColor('ctr', c.ctr))}>{c.ctr.toFixed(2)}%</p>
                              <ChangeBadge metricKey="ctr" value={c.changes?.ctr} />
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-xs text-gray-600">{c.cpc > 0 ? formatCurrency(c.cpc) : '—'}</p>
                              <ChangeBadge metricKey="cpc" value={c.changes?.cpc} />
                            </td>
                            <td className="px-3 py-3">
                              {isEcommerce(c.biddingStrategy) ? (
                                <span className="text-gray-300 text-xs">—</span>
                              ) : c.cpa > 0 ? (
                                <><p className={cn('text-xs font-semibold', c.cpa > (s.blendedCPA || 1000) * 1.3 ? 'text-red-500' : c.cpa < (s.blendedCPA || 1000) * 0.8 ? 'text-emerald-600' : 'text-gray-700')}>{formatCurrency(c.cpa)}</p><ChangeBadge metricKey="cpa" value={c.changes?.cpa} /></>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {isEcommerce(c.biddingStrategy) ? (
                                c.roas > 0
                                  ? <p className={cn('text-xs font-semibold', c.roas >= 3 ? 'text-emerald-600' : c.roas >= 1 ? 'text-amber-600' : 'text-red-500')}>{c.roas.toFixed(2)}x</p>
                                  : <span className="text-gray-300 text-xs">—</span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-500">รวม</td>
                        <td className="px-3 py-2.5 text-xs font-bold">{formatCurrency(s.totalSpend)}</td>
                        <td className="px-3 py-2.5 text-xs font-bold">{formatNumber(s.totalImpressions)}</td>
                        <td className="px-3 py-2.5 text-xs font-bold">{formatNumber(s.totalClicks)}</td>
                        <td className="px-3 py-2.5 text-xs font-bold text-emerald-600">{formatConversions(s.totalConversions)}</td>
                        <td className={cn('px-3 py-2.5 text-xs font-bold', metricValueColor('ctr', s.blendedCTR))}>{s.blendedCTR.toFixed(2)}%</td>
                        <td />
                        <td className="px-3 py-2.5 text-xs font-bold">{s.blendedCPA > 0 ? formatCurrency(s.blendedCPA) : '—'}</td>
                        <td className="px-3 py-2.5 text-xs font-bold">
                          {(() => {
                            const ecomCamps = sorted.filter(c => isEcommerce(c.biddingStrategy) && c.roas > 0)
                            if (ecomCamps.length === 0) return <span className="text-gray-300">—</span>
                            const totalSpendEcom = ecomCamps.reduce((sum, c) => sum + c.spend, 0)
                            const blendedRoas = ecomCamps.reduce((sum, c) => sum + c.roas * c.spend, 0) / (totalSpendEcom || 1)
                            return <span className={cn(blendedRoas >= 3 ? 'text-emerald-600' : blendedRoas >= 1 ? 'text-amber-600' : 'text-red-500')}>{blendedRoas.toFixed(2)}x</span>
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* What to do panel */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />สิ่งที่ควรทำ
              </h3>
              <div className="space-y-2">
                {sorted.filter((c) => c.status === 'ENABLED' && c.clicks > 100 && c.conversions === 0).map((c) => (
                  <div key={c.id} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{c.name}</span>: {c.clicks} clicks ไม่มี conversion — ตรวจสอบ landing page, conversion tracking, และ keyword relevance
                    </div>
                  </div>
                ))}
                {sorted.filter((c) => c.status === 'ENABLED' && c.impressions > 500 && c.ctr < 1).map((c) => (
                  <div key={`ctr-${c.id}`} className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs">
                    <TrendingDown className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{c.name}</span>: CTR ต่ำ ({c.ctr.toFixed(2)}%) — ปรับ headline ให้ตรง search intent มากขึ้น
                    </div>
                  </div>
                ))}
                {sorted.filter((c) => c.status === 'ENABLED' && c.cpa > 1000).map((c) => (
                  <div key={`cpa-${c.id}`} className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-xs">
                    <TrendingUp className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{c.name}</span>: CPA สูง (฿{c.cpa.toFixed(0)}) — พิจารณาลด tCPA หรือ pause keyword ที่ไม่ convert
                    </div>
                  </div>
                ))}
                {sorted.filter((c) => c.conversions > 0).sort((a, b) => a.cpa - b.cpa).slice(0, 2).map((c) => (
                  <div key={`good-${c.id}`} className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{c.name}</span>: Perform ดี (CPA ฿{c.cpa.toFixed(0)}) — พิจารณาเพิ่ม budget เพื่อ scale
                    </div>
                  </div>
                ))}
                {sorted.every((c) => c.status === 'PAUSED') && (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600">
                    <Calendar className="w-3.5 h-3.5" />
                    Campaign ทั้งหมดถูก pause — ตรวจสอบว่า enable campaign ใดก่อนหน้านี้หรือเปล่า
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-300 mt-3">⚠ หน้านี้แสดงผลการวิเคราะห์เท่านั้น ไม่มีการปรับแก้ account จริงในช่วงทดลอง</p>
            </div>

            {/* Quick nav */}
            <div className="flex gap-3 flex-wrap">
              <Link href={`/reports?customerId=${id}`}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                <BarChart2 className="w-3.5 h-3.5" />ดู Full Report
              </Link>
              <Link href={`/clients/${id}/memory`}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                <Eye className="w-3.5 h-3.5" />Client Memory
              </Link>
              <Link href={`/tracking-setup`}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                <Target className="w-3.5 h-3.5" />Tracking Setup
              </Link>
            </div>

          </>
        )}
      </div>
    </AppShell>
  )
}
