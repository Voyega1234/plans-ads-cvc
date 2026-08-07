'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'
import {
  Wand2, ArrowLeft, Loader2, AlertTriangle, ChevronRight,
  Calendar, Wallet, FileText, Save, CheckCircle2,
  ChevronDown, ChevronUp, X, Edit3, Plus, Download,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell,
} from 'recharts'
import type { CampaignMixItem, MediaPlanJson } from '@/types'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#22d3ee', '#34d399', '#fb923c', '#f472b6', '#a78bfa', '#fbbf24', '#f87171']

const BID_STRATEGIES = [
  'MAXIMIZE_CLICKS',
  'MAXIMIZE_CONVERSIONS',
  'TARGET_CPA',
  'TARGET_ROAS',
  'MAXIMIZE_CONVERSION_VALUE',
  'TARGET_IMPRESSION_SHARE',
  'MANUAL_CPC',
]

// Plans saved from the generator may carry an empty bidStrategy — derive a sensible
// default from the campaign type/objective so the column is never blank.
function defaultBidStrategy(type?: string, objective?: string): string {
  const obj = (objective ?? '').toLowerCase()
  if (obj.includes('aware') || obj.includes('reach') || obj.includes('traffic') || obj.includes('view')) {
    return 'MAXIMIZE_CLICKS'
  }
  return 'MAXIMIZE_CONVERSIONS'
}

const MATCH_COLORS: Record<string, string> = {
  EXACT: 'bg-blue-100 text-blue-700',
  PHRASE: 'bg-purple-100 text-purple-700',
  BROAD: 'bg-orange-100 text-orange-700',
}

const COMP_COLORS: Record<string, string> = {
  LOW: 'text-emerald-600', MEDIUM: 'text-amber-600', HIGH: 'text-red-600',
}

const TYPE_COLOR: Record<string, string> = {
  SEARCH: 'bg-blue-100 text-blue-700',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-800',
  DISPLAY: 'bg-teal-100 text-teal-700',
  DEMAND_GEN: 'bg-pink-100 text-pink-700',
  VIDEO: 'bg-red-100 text-red-700',
  SHOPPING: 'bg-emerald-100 text-emerald-700',
}

// ─── Types ──────────────────────────────────────────────────────────────────────

interface KwRow {
  keyword: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
  avgMonthlySearches: number
  competition: 'LOW' | 'MEDIUM' | 'HIGH'
  suggestedCpc: number
  selected: boolean
  isNegative?: boolean
}

interface Campaign extends CampaignMixItem {
  keywords?: KwRow[]
  searchThemes?: string[]
  remarketing?: string[]
  inMarket?: string[]
  customIntent?: string[]
}

interface PlanRecord {
  id: string
  title: string
  objective: string
  monthlyBudget: number
  status: string
  createdAt: string
  planJson?: string
  brief?: {
    businessName?: string
    productService?: string
    targetLocation?: string
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const short: Record<string, string> = { PERFORMANCE_MAX: 'PMAX', DEMAND_GEN: 'DG' }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLOR[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {short[type] ?? type}
    </span>
  )
}

function AudienceChips({
  label, items, color, onRemove,
}: { label: string; items: string[]; color: string; onRemove: (i: number) => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 ${color}`}>
            {item}
            <button onClick={() => onRemove(i)} className="ml-0.5 opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Campaign Card ──────────────────────────────────────────────────────────────

function CampaignCard({
  campaign, index, totalBudget, onChange,
}: {
  campaign: Campaign
  index: number
  totalBudget: number
  onChange: (updated: Campaign) => void
}) {
  const [open, setOpen] = useState(false)
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal] = useState(campaign.campaignName)
  const [newKw, setNewKw] = useState('')

  const pct = totalBudget > 0 ? Math.round(campaign.monthlyBudget / totalBudget * 100) : campaign.budgetPercent
  const daily = campaign.dailyBudget ?? Math.round(campaign.monthlyBudget / 30)
  const isSearch = campaign.type === 'SEARCH'
  const isPmax = campaign.type === 'PERFORMANCE_MAX'

  function patch(data: Partial<Campaign>) { onChange({ ...campaign, ...data }) }

  function saveName() {
    if (nameVal.trim()) patch({ campaignName: nameVal.trim() })
    setEditName(false)
  }

  function setMonthly(v: number) {
    patch({ monthlyBudget: v, dailyBudget: Math.round(v / 30), budgetPercent: totalBudget > 0 ? Math.round(v / totalBudget * 100) : campaign.budgetPercent })
  }

  function toggleKw(i: number) {
    const kws = (campaign.keywords ?? []).map((k, j) => j === i ? { ...k, selected: !k.selected } : k)
    patch({ keywords: kws })
  }
  function removeKw(i: number) { patch({ keywords: (campaign.keywords ?? []).filter((_, j) => j !== i) }) }
  function setMatchType(i: number, mt: KwRow['matchType']) {
    patch({ keywords: (campaign.keywords ?? []).map((k, j) => j === i ? { ...k, matchType: mt } : k) })
  }
  function addKw() {
    if (!newKw.trim()) return
    const kw: KwRow = { keyword: newKw.trim(), matchType: 'PHRASE', avgMonthlySearches: 0, competition: 'MEDIUM', suggestedCpc: 0, selected: true }
    patch({ keywords: [...(campaign.keywords ?? []), kw] })
    setNewKw('')
  }
  function removeAudience(field: 'remarketing' | 'inMarket' | 'customIntent' | 'searchThemes', i: number) {
    patch({ [field]: (campaign[field] ?? []).filter((_: string, j: number) => j !== i) })
  }

  const selectedKw = (campaign.keywords ?? []).filter(k => k.selected)

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${open ? 'border-blue-200 shadow-sm' : 'border-neutral-200'}`}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: PIE_COLORS[index % PIE_COLORS.length] + '20', color: PIE_COLORS[index % PIE_COLORS.length] }}>
          {index + 1}
        </div>
        <TypeBadge type={campaign.type} />

        {/* Campaign name — editable inline */}
        <div className="flex-1" onClick={() => !open && setOpen(true)}>
          {editName ? (
            <input value={nameVal} onChange={e => setNameVal(e.target.value)}
              onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditName(false) }}
              autoFocus onClick={e => e.stopPropagation()}
              className="w-full text-sm font-semibold border border-blue-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          ) : (
            <p className="text-sm font-semibold text-neutral-800 break-all cursor-pointer leading-snug">{campaign.campaignName}</p>
          )}
          <p className="text-[10px] text-neutral-400 mt-0.5">
            {selectedKw.length > 0 ? `${selectedKw.length} keywords` : ''}
            {(campaign.remarketing ?? []).length > 0 ? ` · ${(campaign.remarketing ?? []).length} remarketing` : ''}
            {(campaign.searchThemes ?? []).length > 0 ? ` · ${(campaign.searchThemes ?? []).length} themes` : ''}
          </p>
        </div>

        {/* Budget inline edit */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <span className="text-[10px] text-neutral-400">฿</span>
          <input type="number" value={campaign.monthlyBudget}
            onChange={e => setMonthly(Number(e.target.value))}
            className="w-20 text-sm font-bold text-right border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200 tabular-nums"
          />
          <span className="text-[10px] text-neutral-400">/เดือน</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full`}
            style={{ background: PIE_COLORS[index % PIE_COLORS.length] + '20', color: PIE_COLORS[index % PIE_COLORS.length] }}>
            {pct}%
          </span>
          <button onClick={() => { setEditName(true); setOpen(true) }} className="p-1 text-neutral-300 hover:text-blue-500 rounded-lg"><Edit3 className="w-3.5 h-3.5" /></button>
          <button onClick={() => setOpen(o => !o)} className="p-1 text-neutral-400 rounded-lg">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Expanded content ── */}
      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50/40 p-4 space-y-5">
          {/* Budget & Bidding row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide block mb-1">Monthly Budget ฿</label>
              <input type="number" value={campaign.monthlyBudget}
                onChange={e => setMonthly(Number(e.target.value))}
                className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide block mb-1">Daily Budget ฿</label>
              <input type="number" value={daily}
                onChange={e => patch({ dailyBudget: Number(e.target.value), monthlyBudget: Number(e.target.value) * 30 })}
                className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide block mb-1">Bid Strategy</label>
              <select value={campaign.bidStrategy}
                onChange={e => patch({ bidStrategy: e.target.value })}
                className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                {BID_STRATEGIES.map(b => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide block mb-1">
                {campaign.bidStrategy === 'TARGET_CPA' ? 'Target CPA ฿' : campaign.bidStrategy === 'TARGET_ROAS' ? 'Target ROAS' : 'Max CPC ฿'}
              </label>
              <input type="number"
                value={campaign.bidStrategy === 'TARGET_CPA' ? (campaign.targetCPA ?? 0) : campaign.bidStrategy === 'TARGET_ROAS' ? (campaign.targetRoas ?? 0) : (campaign.maxCpc ?? 0)}
                onChange={e => {
                  if (campaign.bidStrategy === 'TARGET_CPA') patch({ targetCPA: Number(e.target.value) })
                  else if (campaign.bidStrategy === 'TARGET_ROAS') patch({ targetRoas: Number(e.target.value) })
                  else patch({ maxCpc: Number(e.target.value) })
                }}
                className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>

          {/* ── Keywords — SEARCH only ── */}
          {isSearch && (
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-2">🔍 Keywords</p>
              {(campaign.keywords ?? []).length > 0 ? (
                <div className="rounded-xl border border-neutral-100 overflow-hidden bg-white">
                  <div className="grid grid-cols-[auto_1fr_80px_60px_50px_60px_auto] gap-x-2 text-[10px] font-bold text-neutral-400 uppercase tracking-wide bg-neutral-50 px-3 py-2 border-b border-neutral-100">
                    <span></span><span>Keyword</span><span className="text-center">Match</span><span className="text-right">Vol/mo</span><span className="text-right">Comp</span><span className="text-right">CPC ฿</span><span></span>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-neutral-50">
                    {(campaign.keywords ?? []).map((k, i) => (
                      <div key={i} className={`grid grid-cols-[auto_1fr_80px_60px_50px_60px_auto] gap-x-2 items-center px-3 py-2 text-xs transition-colors ${k.selected ? 'bg-white' : 'bg-neutral-50 opacity-50'}`}>
                        <input type="checkbox" checked={k.selected} onChange={() => toggleKw(i)} className="w-3.5 h-3.5 cursor-pointer" />
                        <span className="font-medium text-neutral-800 truncate">{k.keyword}</span>
                        <div className="flex gap-0.5 justify-center">
                          {(['EXACT', 'PHRASE', 'BROAD'] as KwRow['matchType'][]).map(mt => (
                            <button key={mt} onClick={() => setMatchType(i, mt)}
                              className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${k.matchType === mt ? MATCH_COLORS[mt] : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'}`}>
                              {mt[0]}
                            </button>
                          ))}
                        </div>
                        <span className="text-right text-neutral-500 tabular-nums">{k.avgMonthlySearches > 0 ? k.avgMonthlySearches.toLocaleString() : '—'}</span>
                        <span className={`text-right font-bold tabular-nums text-[10px] ${COMP_COLORS[k.competition] ?? ''}`}>{k.competition?.[0] ?? '—'}</span>
                        <span className="text-right text-neutral-600 tabular-nums font-medium">{k.suggestedCpc > 0 ? k.suggestedCpc.toFixed(0) : '—'}</span>
                        <button onClick={() => removeKw(i)} className="text-neutral-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-neutral-50 px-3 py-1.5 border-t border-neutral-100 flex gap-4 text-[10px] text-neutral-400">
                    <span>{selectedKw.length}/{(campaign.keywords ?? []).length} เลือก</span>
                    {selectedKw.length > 0 && <>
                      <span>Avg Vol: {Math.round(selectedKw.reduce((s, k) => s + k.avgMonthlySearches, 0) / selectedKw.length).toLocaleString()}</span>
                      <span>Avg CPC: ฿{(selectedKw.reduce((s, k) => s + k.suggestedCpc, 0) / selectedKw.length).toFixed(0)}</span>
                    </>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">ยังไม่มี keywords — เพิ่มเองด้านล่าง หรือไปทำที่ Campaign Builder</p>
              )}
              {/* Add manual keyword */}
              <div className="flex gap-2 mt-2">
                <input value={newKw} onChange={e => setNewKw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addKw()}
                  placeholder="เพิ่ม keyword เอง แล้วกด Enter"
                  className="flex-1 text-sm border border-neutral-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                <button onClick={addKw} disabled={!newKw.trim()}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 rounded-xl">
                  <Plus className="w-3.5 h-3.5" /> เพิ่ม
                </button>
              </div>
            </div>
          )}

          {/* ── Search Themes — PMax ── */}
          {isPmax && (
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-2">🎯 Search Themes</p>
              <div className="flex flex-wrap gap-1.5">
                {(campaign.searchThemes ?? []).map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-100 rounded-full px-2.5 py-1">
                    {t}<button onClick={() => removeAudience('searchThemes', i)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {(campaign.searchThemes ?? []).length === 0 && <p className="text-xs text-neutral-400">ยังไม่มี Search Themes</p>}
              </div>
            </div>
          )}

          {/* ── Audiences ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">👥 Audiences</p>
            <AudienceChips label="Remarketing" items={campaign.remarketing ?? []}
              color="bg-purple-50 text-purple-700 border border-purple-100"
              onRemove={i => removeAudience('remarketing', i)} />
            <AudienceChips label="In-Market" items={campaign.inMarket ?? []}
              color="bg-emerald-50 text-emerald-700 border border-emerald-100"
              onRemove={i => removeAudience('inMarket', i)} />
            <AudienceChips label="Custom Intent" items={campaign.customIntent ?? []}
              color="bg-indigo-50 text-indigo-700 border border-indigo-100"
              onRemove={i => removeAudience('customIntent', i)} />
            {!(campaign.remarketing?.length) && !(campaign.inMarket?.length) && !(campaign.customIntent?.length) && (
              <p className="text-xs text-neutral-400">ยังไม่มี Audience — ไปเพิ่มที่ Campaign Builder &gt; Step 4</p>
            )}
          </div>

          {/* ── Objective & Targeting ── */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide block mb-1">Objective</label>
              <input value={campaign.objective} onChange={e => patch({ objective: e.target.value })}
                className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide block mb-1">Locations</label>
              <input value={(campaign.targeting?.locations ?? []).join(', ')}
                onChange={e => patch({ targeting: { ...campaign.targeting, locations: e.target.value.split(',').map(s => s.trim()) } })}
                className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function PlanPreviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [plan, setPlan] = useState<PlanRecord | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [rawJson, setRawJson] = useState<MediaPlanJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/media-plans/${id}`)
      .then(r => r.json())
      .then((data: PlanRecord) => {
        setPlan(data)
        if (data.planJson) {
          try {
            const parsed = JSON.parse(data.planJson) as MediaPlanJson
            setRawJson(parsed)
            setCampaigns((parsed.campaignMix ?? []).map(c => ({
              ...c,
              bidStrategy: c.bidStrategy || defaultBidStrategy(c.type, c.objective),
              keywords: (c as Campaign).keywords ?? [],
              searchThemes: (c as Campaign).searchThemes ?? [],
              remarketing: (c as Campaign).remarketing ?? [],
              inMarket: (c as Campaign).inMarket ?? [],
              customIntent: (c as Campaign).customIntent ?? [],
            })))
          } catch { /* ignore */ }
        }
      })
      .catch(() => setError('โหลดข้อมูลไม่ได้'))
      .finally(() => setLoading(false))
  }, [id])

  const totalBudget = campaigns.reduce((s, c) => s + c.monthlyBudget, 0)

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows: string[][] = []
    // Plan info
    rows.push(['Plan', plan?.title ?? ''])
    rows.push(['Objective', plan?.objective ?? ''])
    rows.push(['Monthly Budget', `฿${totalBudget.toLocaleString()}`])
    rows.push(['Campaigns', String(campaigns.length)])
    rows.push([])
    // Campaign Mix header
    rows.push(['Campaign Name', 'Type', 'Objective', 'Monthly ฿', 'Daily ฿', '%', 'Bid Strategy', 'Target CPA', 'Target ROAS'])
    campaigns.forEach(c => {
      const pct = totalBudget > 0 ? Math.round(c.monthlyBudget / totalBudget * 100) : c.budgetPercent
      const daily = c.dailyBudget ?? Math.round(c.monthlyBudget / 30)
      rows.push([
        c.campaignName, c.type, c.objective,
        String(c.monthlyBudget), String(daily), `${pct}%`,
        c.bidStrategy ?? '', String(c.targetCPA ?? ''), String(c.targetRoas ?? ''),
      ])
    })
    rows.push([])
    // Keywords
    rows.push(['--- KEYWORDS ---'])
    rows.push(['Campaign', 'Keyword', 'Match Type', 'Vol/mo', 'Competition', 'CPC ฿', 'Negative'])
    campaigns.forEach(c => {
      (c.keywords ?? []).forEach(k => {
        rows.push([c.campaignName, k.keyword, k.matchType, String(k.avgMonthlySearches), k.competition, String(k.suggestedCpc), k.isNegative ? 'YES' : ''])
      })
    })
    rows.push([])
    // Audiences
    rows.push(['--- AUDIENCES ---'])
    rows.push(['Campaign', 'Type', 'Value'])
    campaigns.forEach(c => {
      ;(c.searchThemes ?? []).forEach(t => rows.push([c.campaignName, 'Search Theme', t]))
      ;(c.remarketing ?? []).forEach(t => rows.push([c.campaignName, 'Remarketing', t]))
      ;(c.inMarket ?? []).forEach(t => rows.push([c.campaignName, 'In-Market', t]))
      ;(c.customIntent ?? []).forEach(t => rows.push([c.campaignName, 'Custom Intent', t]))
    })
    if (rawJson?.strategicRationale) {
      rows.push([])
      rows.push(['--- STRATEGIC RATIONALE ---'])
      rows.push([rawJson.strategicRationale])
    }
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `MediaPlan-${(plan?.title ?? 'plan').replace(/\s+/g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Export HTML ────────────────────────────────────────────────────────────
  function exportHTML() {
    const date = new Date(plan?.createdAt ?? '').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    const BAR_COLORS = ['#6366f1','#22d3ee','#34d399','#fb923c','#f472b6','#a78bfa','#fbbf24','#f87171']
    const matchBadge = (m: string) => {
      const map: Record<string, string> = { EXACT:'#dbeafe:#1d4ed8', PHRASE:'#ede9fe:#6d28d9', BROAD:'#fff7ed:#c2410c' }
      const [bg, fg] = (map[m] ?? '#f3f4f6:#374151').split(':')
      return `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;background:${bg};color:${fg}">${m[0]}</span>`
    }
    const compColor = (c: string) => ({ LOW:'#059669', MEDIUM:'#d97706', HIGH:'#dc2626' }[c] ?? '#374151')
    const chip = (s: string, bg: string, fg: string) =>
      `<span style="display:inline-block;margin:2px 3px;background:${bg};color:${fg};font-size:10px;padding:2px 9px;border-radius:20px;border:1px solid ${bg}88">${s}</span>`
    const typeLabel = (t: string) => t.replace('PERFORMANCE_MAX','PMAX').replace('DEMAND_GEN','DG')
    const typeColors: Record<string, string> = {
      SEARCH:'#dbeafe:#1d4ed8', PERFORMANCE_MAX:'#fff7ed:#c2410c',
      DISPLAY:'#d1fae5:#065f46', DEMAND_GEN:'#fce7f3:#9d174d',
      VIDEO:'#fee2e2:#991b1b', SHOPPING:'#d1fae5:#166534',
    }
    const typeBadge = (t: string) => {
      const [bg, fg] = (typeColors[t] ?? '#f3f4f6:#374151').split(':')
      return `<span style="font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;background:${bg};color:${fg}">${typeLabel(t)}</span>`
    }

    // SVG bar chart
    const maxBudget = Math.max(...campaigns.map(c => c.monthlyBudget), 1)
    const bW = 56; const bG = 20; const cH = 140; const lH = 24
    const svgW = campaigns.length * (bW + bG) + bG
    const barSvg = `<svg width="${svgW}" height="${cH+lH+4}" xmlns="http://www.w3.org/2000/svg">
      ${campaigns.map((c, i) => {
        const x = bG + i*(bW+bG); const h = Math.round((c.monthlyBudget/maxBudget)*cH)
        const y = cH-h; const col = BAR_COLORS[i%BAR_COLORS.length]
        const pct = totalBudget > 0 ? Math.round(c.monthlyBudget/totalBudget*100) : c.budgetPercent
        return `<rect x="${x}" y="${y}" width="${bW}" height="${h}" rx="5" fill="${col}"/>
        <text x="${x+bW/2}" y="${y-4}" text-anchor="middle" font-size="10" fill="#374151" font-weight="700">${pct}%</text>
        <text x="${x+bW/2}" y="${cH+lH}" text-anchor="middle" font-size="9" fill="#9ca3af">${typeLabel(c.type)}</text>`
      }).join('')}
    </svg>`

    // SVG donut chart
    const cx = 80; const cy = 80; const R = 62; const r = 36
    let ang = -Math.PI/2
    const tot = campaigns.reduce((s,c)=>s+c.monthlyBudget, 0) || 1
    const piePaths = campaigns.map((c, i) => {
      const a = (c.monthlyBudget/tot)*2*Math.PI; const ea = ang+a
      const x1=cx+R*Math.cos(ang); const y1=cy+R*Math.sin(ang)
      const x2=cx+R*Math.cos(ea); const y2=cy+R*Math.sin(ea)
      const ix1=cx+r*Math.cos(ang); const iy1=cy+r*Math.sin(ang)
      const ix2=cx+r*Math.cos(ea); const iy2=cy+r*Math.sin(ea)
      const lg=a>Math.PI?1:0; const col=BAR_COLORS[i%BAR_COLORS.length]
      ang=ea
      return `<path d="M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${lg},0 ${ix1},${iy1} Z" fill="${col}" stroke="white" stroke-width="2"/>`
    }).join('')
    const pieSvg = `<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg">${piePaths}</svg>`
    const legend = campaigns.map((c, i) =>
      `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;margin:2px 8px 2px 0">
        <span style="width:10px;height:10px;border-radius:50%;background:${BAR_COLORS[i%BAR_COLORS.length]};display:inline-block"></span>
        ${typeLabel(c.type)} ${totalBudget>0?Math.round(c.monthlyBudget/totalBudget*100):c.budgetPercent}%
      </span>`
    ).join('')

    const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>${plan?.title ?? 'Media Plan'}</title>
<style>
*{box-sizing:border-box}
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');body{font-family:'Noto Sans Thai',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#1f2937;padding:40px;max-width:1060px;margin:0 auto}
h1{font-size:22px;font-weight:800;margin:0 0 4px;color:#111827}
h2{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin:32px 0 12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb}
h3{font-size:13px;font-weight:700;margin:0 0 4px;color:#111827}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 12px;background:#f9fafb;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb}
td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top}
tr:last-child td{border-bottom:none}
.card{border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:14px}
.card-hd{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #f3f4f6}
.lbl{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.kw-tbl{width:100%;border-collapse:collapse;font-size:11px;border:1px solid #f3f4f6;border-radius:8px;overflow:hidden}
.kw-tbl th{padding:5px 10px;background:#f9fafb;font-size:10px;color:#9ca3af}
.kw-tbl td{padding:5px 10px;border-bottom:1px solid #f9fafb}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:0}
.mc{padding:12px 16px;border-right:1px solid #e5e7eb}
.mc:last-child{border-right:none}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.tfoot td{background:#f9fafb;font-weight:700;border-top:2px solid #e5e7eb}
.footer{margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
@media print{body{padding:20px}.card{break-inside:avoid}}
</style>
</head><body>

<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px">
  <div>
    <h1>${plan?.title ?? 'Media Plan'}</h1>
    <p style="color:#6b7280;font-size:12px;margin:4px 0 0">${plan?.objective ?? ''} | ${date}</p>
  </div>
  <div style="text-align:right;font-size:11px;color:#9ca3af">
    <div style="font-weight:700;color:#6366f1;font-size:13px">Convert Cake</div>
    <div>Agency OS</div>
  </div>
</div>

<h2>Summary</h2>
<div class="meta">
  <div class="mc"><div class="lbl">งบรวม/เดือน</div><div style="font-size:20px;font-weight:800;color:#111827">฿${totalBudget.toLocaleString()}</div></div>
  <div class="mc"><div class="lbl">Campaigns</div><div style="font-size:20px;font-weight:800;color:#111827">${campaigns.length}</div></div>
  <div class="mc"><div class="lbl">Daily Budget</div><div style="font-size:20px;font-weight:800;color:#111827">฿${campaigns.reduce((s,c)=>s+(c.dailyBudget??Math.round(c.monthlyBudget/30)),0).toLocaleString()}</div></div>
  <div class="mc"><div class="lbl">Keywords</div><div style="font-size:20px;font-weight:800;color:#111827">${campaigns.reduce((s,c)=>s+(c.keywords?.filter(k=>k.selected).length??0),0)}</div></div>
</div>

<h2>Budget Allocation & Split</h2>
<div class="grid2">
  <div class="card" style="margin-bottom:0">
    <div class="lbl">Budget Allocation</div>
    <div style="overflow-x:auto">${barSvg}</div>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="lbl">Budget Split</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      ${pieSvg}
      <div>${legend}</div>
    </div>
  </div>
</div>

<h2>Campaign Mix</h2>
<div class="card" style="padding:0;overflow:hidden">
<table>
  <thead><tr>
    <th>Campaign</th><th>Type</th><th>Objective</th>
    <th style="text-align:right">Monthly ฿</th><th style="text-align:right">Daily ฿</th>
    <th style="text-align:right">%</th><th>Bid Strategy</th>
  </tr></thead>
  <tbody>
  ${campaigns.map((c, i) => {
    const pct = totalBudget > 0 ? Math.round(c.monthlyBudget / totalBudget * 100) : c.budgetPercent
    const daily = c.dailyBudget ?? Math.round(c.monthlyBudget / 30)
    const col = BAR_COLORS[i % BAR_COLORS.length]
    return `<tr>
      <td><strong>${c.campaignName}</strong><br><span style="font-size:10px;color:#9ca3af">${c.objective}</span></td>
      <td>${typeBadge(c.type)}</td>
      <td style="color:#6b7280">${c.objective}</td>
      <td style="text-align:right;font-weight:700">฿${c.monthlyBudget.toLocaleString()}</td>
      <td style="text-align:right;color:#6b7280">฿${daily.toLocaleString()}</td>
      <td style="text-align:right">
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${col}18;color:${col}">${pct}%</span>
      </td>
      <td style="color:#6b7280;font-size:11px">${(c.bidStrategy??'').replace(/_/g,' ')}</td>
    </tr>`
  }).join('')}
  </tbody>
  <tfoot><tr class="tfoot">
    <td><strong>รวม (${campaigns.length})</strong></td><td colspan="2"></td>
    <td style="text-align:right">฿${totalBudget.toLocaleString()}</td>
    <td style="text-align:right;color:#6b7280">฿${campaigns.reduce((s,c)=>s+(c.dailyBudget??Math.round(c.monthlyBudget/30)),0).toLocaleString()}</td>
    <td style="text-align:right">100%</td><td></td>
  </tr></tfoot>
</table>
</div>

<h2>Campaign Details — Keywords & Audiences</h2>
${campaigns.map((c, i) => {
  const pct = totalBudget > 0 ? Math.round(c.monthlyBudget / totalBudget * 100) : c.budgetPercent
  const daily = c.dailyBudget ?? Math.round(c.monthlyBudget / 30)
  const kws = c.keywords ?? []
  const themes = c.searchThemes ?? []; const rem = c.remarketing ?? []
  const im = c.inMarket ?? []; const ci = c.customIntent ?? []
  const hasAud = themes.length + rem.length + im.length + ci.length > 0

  const kwSection = kws.length > 0 ? `
    <div style="margin-bottom:14px">
      <div class="lbl">Keywords (${kws.length})</div>
      <table class="kw-tbl">
        <thead><tr>
          <th style="text-align:left">Keyword</th>
          <th style="text-align:center">Match</th>
          <th style="text-align:right">Vol/mo</th>
          <th style="text-align:right">Comp</th>
          <th style="text-align:right">CPC ฿</th>
        </tr></thead>
        <tbody>
        ${kws.map(k=>`<tr>
          <td style="${k.isNegative?'text-decoration:line-through;color:#dc2626':''}">${k.isNegative?'−':''}${k.keyword}</td>
          <td style="text-align:center">${matchBadge(k.matchType)}</td>
          <td style="text-align:right;color:#6b7280">${k.avgMonthlySearches>0?k.avgMonthlySearches.toLocaleString():'—'}</td>
          <td style="text-align:right;font-weight:700;color:${compColor(k.competition)}">${k.competition}</td>
          <td style="text-align:right;font-weight:600">${k.suggestedCpc>0?k.suggestedCpc.toFixed(0):'—'}</td>
        </tr>`).join('')}
        ${kws.length>1?`<tr style="background:#f9fafb;font-size:10px;color:#9ca3af">
          <td colspan="2">${kws.length} keywords</td>
          <td style="text-align:right">avg ${Math.round(kws.reduce((s,k)=>s+k.avgMonthlySearches,0)/kws.length).toLocaleString()}</td>
          <td></td>
          <td style="text-align:right">avg ฿${(kws.reduce((s,k)=>s+k.suggestedCpc,0)/kws.length).toFixed(0)}</td>
        </tr>`:''}
        </tbody>
      </table>
    </div>` : ''

  const audSection = hasAud ? `
    <div>
      <div class="lbl">Audiences</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${themes.map(t=>chip(t,'#fff7ed','#c2410c')).join('')}
        ${rem.map(t=>chip(t,'#f5f3ff','#6d28d9')).join('')}
        ${im.map(t=>chip(t,'#f0fdf4','#166534')).join('')}
        ${ci.map(t=>chip(t,'#eff6ff','#1e40af')).join('')}
      </div>
    </div>` : ''

  const col = BAR_COLORS[i % BAR_COLORS.length]
  return `<div class="card">
    <div class="card-hd">
      ${typeBadge(c.type)}
      <h3 style="flex:1;margin:0">${c.campaignName}</h3>
      <span style="font-size:12px;color:#6b7280">฿${c.monthlyBudget.toLocaleString()}/เดือน</span>
      <span style="font-size:11px;font-weight:700;background:${col}18;color:${col};padding:2px 9px;border-radius:20px">${pct}%</span>
    </div>
    ${kwSection}${audSection}
    ${!kws.length && !hasAud ? '<p style="font-size:12px;color:#9ca3af">ยังไม่มีข้อมูล keyword/audience</p>' : ''}
    <div style="margin-top:12px;padding-top:10px;border-top:1px solid #f3f4f6;display:flex;gap:20px;font-size:11px;color:#6b7280">
      <span><strong style="color:#374151">Daily:</strong> ฿${daily.toLocaleString()}</span>
      <span><strong style="color:#374151">Bid:</strong> ${(c.bidStrategy??'').replace(/_/g,' ')}</span>
      ${c.targetCPA ? `<span><strong style="color:#374151">Target CPA:</strong> ฿${c.targetCPA}</span>` : ''}
      ${c.targetRoas ? `<span><strong style="color:#374151">Target ROAS:</strong> ${c.targetRoas}x</span>` : ''}
    </div>
  </div>`
}).join('')}

${rawJson?.strategicRationale ? `
<h2>Strategic Rationale</h2>
<div class="card"><p style="font-size:13px;line-height:1.8;color:#374151;margin:0">${rawJson.strategicRationale}</p></div>
` : ''}

${rawJson?.recommendations?.length ? `
<h2>Recommendations</h2>
<div class="card">
  <ul style="margin:0;padding-left:18px">
    ${rawJson.recommendations.map(r=>`<li style="font-size:12px;color:#374151;padding:3px 0">${r}</li>`).join('')}
  </ul>
</div>
` : ''}

<div class="footer">สร้างโดย Convert Cake — เอกสารนี้เป็นความลับ ห้ามเผยแพร่ | ${date}</div>
</body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `MediaPlan-${(plan?.title ?? 'plan').replace(/\s+/g, '-')}.html`
    a.click(); URL.revokeObjectURL(url)
  }

  const save = useCallback(async () => {
    if (!plan || !rawJson) return
    setSaving(true)
    try {
      const updatedJson: MediaPlanJson = {
        ...rawJson,
        campaignMix: campaigns.map(c => ({
          ...c,
          budgetPercent: totalBudget > 0 ? Math.round(c.monthlyBudget / totalBudget * 100) : c.budgetPercent,
        })),
      }
      await fetch(`/api/media-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planJson: JSON.stringify(updatedJson) }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }, [plan, rawJson, campaigns, id, totalBudget])

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
    </AppShell>
  )
  if (error || !plan) return (
    <AppShell>
      <div className="flex flex-col items-center gap-3 h-64 justify-center text-gray-500">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p>{error || 'ไม่พบ Plan นี้'}</p>
        <button onClick={() => router.push('/media-plans')} className="text-sm text-blue-600 underline">กลับ</button>
      </div>
    </AppShell>
  )

  const date = new Date(plan.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-5 pb-20">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/media-plans')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> All Plans
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-xl transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'บันทึกแล้ว' : 'บันทึก'}
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={exportHTML}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> HTML
            </button>
            <Link href={`/media-plans/${id}/build`}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
              <Wand2 className="w-4 h-4" /> Campaign Generator <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ── Plan header ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900">{plan.title}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{plan.objective}</p>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />฿{plan.monthlyBudget.toLocaleString()}/เดือน</span>
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{date}</span>
                {plan.brief?.businessName && <span className="font-semibold text-gray-700">{plan.brief.businessName}</span>}
                {plan.brief?.targetLocation && <span>{plan.brief.targetLocation}</span>}
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
              plan.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
              plan.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>{plan.status}</span>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="text-sm text-gray-500">ยังไม่มีข้อมูล Campaign — สร้างผ่าน Campaign Generator ก่อน</p>
            <Link href={`/media-plans/${id}/build`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl">
              Campaign Generator →
            </Link>
          </div>
        ) : (
          <>
            {/* ── Budget Summary ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'งบรวม/เดือน', value: `฿${totalBudget.toLocaleString()}` },
                { label: 'Campaigns', value: campaigns.length },
                { label: 'Daily Budget', value: `฿${campaigns.reduce((s, c) => s + (c.dailyBudget ?? Math.round(c.monthlyBudget/30)), 0).toLocaleString()}` },
                { label: 'Keywords', value: campaigns.reduce((s, c) => s + (c.keywords?.filter(k => k.selected).length ?? 0), 0) },
              ].map(k => (
                <div key={k.label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{k.label}</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{k.value}</p>
                </div>
              ))}
            </div>

            {/* ── Charts ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Budget Allocation</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={campaigns.map(c => ({
                      name: c.type.replace('PERFORMANCE_MAX','PMAX').replace('DEMAND_GEN','DG'),
                      pct: totalBudget > 0 ? Math.round(c.monthlyBudget / totalBudget * 100) : c.budgetPercent,
                    }))} barCategoryGap="30%">
                      <CartesianGrid vertical={false} stroke="#f5f5f5" />
                      <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip formatter={(v: number) => [`${v}%`, 'Budget']} />
                      <Bar dataKey="pct" radius={[6,6,0,0]}>
                        {campaigns.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Budget Split</p>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={campaigns.map(c => ({ name: c.type, value: c.monthlyBudget }))}
                        dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={3}>
                        {campaigns.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`฿${Number(v).toLocaleString()}`, 'Budget']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                  {campaigns.map((c, i) => (
                    <span key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {c.type.replace('PERFORMANCE_MAX','PMax')} {totalBudget > 0 ? Math.round(c.monthlyBudget / totalBudget * 100) : c.budgetPercent}%
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Campaign Mix Table ── */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Campaign Mix</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5 min-w-[280px]">Campaign</th>
                      <th className="text-left px-3 py-2.5">Type</th>
                      <th className="text-left px-3 py-2.5">Objective</th>
                      <th className="text-right px-3 py-2.5 whitespace-nowrap">Monthly ฿</th>
                      <th className="text-right px-3 py-2.5 whitespace-nowrap">Daily ฿</th>
                      <th className="text-right px-3 py-2.5">%</th>
                      <th className="text-left px-3 py-2.5">Bid Strategy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaigns.map((c, i) => {
                      const pct = totalBudget > 0 ? Math.round(c.monthlyBudget / totalBudget * 100) : c.budgetPercent
                      const daily = c.dailyBudget ?? Math.round(c.monthlyBudget / 30)
                      return (
                        <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 whitespace-normal">{c.campaignName}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{c.objective}</p>
                          </td>
                          <td className="px-3 py-3"><TypeBadge type={c.type} /></td>
                          <td className="px-3 py-3 text-xs text-gray-600">{c.objective}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-800">฿{c.monthlyBudget.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-500">฿{daily.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] + '18', color: PIE_COLORS[i % PIE_COLORS.length] }}>
                              {pct}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-[11px] text-gray-500 whitespace-nowrap">{c.bidStrategy?.replace(/_/g, ' ')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-bold text-sm border-t border-gray-200">
                      <td className="px-4 py-2.5 text-gray-700">รวม ({campaigns.length})</td>
                      <td colSpan={2} />
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">฿{totalBudget.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">฿{campaigns.reduce((s,c)=>s+(c.dailyBudget??Math.round(c.monthlyBudget/30)),0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-500">100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Campaign Cards (editable) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-700">Campaign Details</h2>
                <p className="text-xs text-gray-400">กดที่ campaign เพื่อแก้ไข budget, bidding, keyword และ audience</p>
              </div>
              {campaigns.map((c, i) => (
                <CampaignCard key={i} campaign={c} index={i} totalBudget={totalBudget}
                  onChange={updated => setCampaigns(prev => prev.map((x, j) => j === i ? updated : x))} />
              ))}
            </div>

            {/* ── Strategic Rationale ── */}
            {rawJson?.strategicRationale && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Strategic Rationale</p>
                <p className="text-sm leading-7 text-gray-700">{rawJson.strategicRationale}</p>
              </div>
            )}

            {/* ── Save + CTA ── */}
            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50 rounded-xl transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
                {saved ? 'บันทึกแล้ว' : 'บันทึกการเปลี่ยนแปลง'}
              </button>
              <Link href="/campaign-generator"
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
                <Wand2 className="w-4 h-4" /> สร้างแคมเปญ → Campaign Generator
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
