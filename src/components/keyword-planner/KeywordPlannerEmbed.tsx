'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Sparkles, RefreshCw, Plus, X, Check, Trash2, Target, AlertTriangle,
  BarChart3, Loader2, ChevronRight, Building2,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import { cn } from '@/lib/utils'
import { AccountSelect } from '@/components/ui/AccountSelect'
import type { ResearchKeyword as BaseResearchKeyword } from '@/app/api/keyword-research/generate/route'

type ResearchKeyword = Omit<BaseResearchKeyword, 'group'> & {
  group: BaseResearchKeyword['group'] | 'negative'
}

type Group = 'all' | 'brand' | 'product' | 'service' | 'generic' | 'competitor' | 'negative'

const GROUP_LABELS: Record<Group, string> = {
  all: 'ทั้งหมด', brand: 'Brand', product: 'Product',
  service: 'Service', generic: 'Generic', competitor: 'Competitor', negative: 'Negative',
}
const GROUP_COLORS: Record<string, string> = {
  brand: 'bg-blue-100 text-blue-700', product: 'bg-emerald-100 text-emerald-700',
  service: 'bg-violet-100 text-violet-700', generic: 'bg-yellow-100 text-yellow-700',
  competitor: 'bg-purple-100 text-purple-700', negative: 'bg-red-100 text-red-600',
}
const MATCH_COLORS: Record<string, string> = {
  PHRASE: 'bg-blue-50 text-blue-600', BROAD: 'bg-orange-50 text-orange-600',
  EXACT: 'bg-red-50 text-red-500',
}
const COMP_COLORS: Record<string, string> = {
  LOW: 'text-emerald-600', MEDIUM: 'text-yellow-600', HIGH: 'text-red-500',
}

// sparkline 12 เดือนแบบตาราง GKP — SVG ล้วน ไม่ต้องพึ่ง chart lib ต่อแถว
function TrendSparkline({ data }: { data?: number[] }) {
  if (!data || data.length < 2) return null
  const W = 64, H = 20, P = 2
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2)
    const y = H - P - ((v - min) / range) * (H - P * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width={W} height={H} className="inline-block align-middle" aria-hidden>
      <polyline points={`${P},${H - P} ${pts.join(' ')} ${W - P},${H - P}`}
        fill="#dbeafe" stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke="#3b82f6" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// %change แบบ GKP: เขียว = ขึ้น แดง = ลง เทา = 0
function PctChange({ v }: { v?: number }) {
  if (v === undefined) return <span className="text-xs text-gray-300">—</span>
  const cls = v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-gray-400'
  return <span className={cn('text-xs font-medium', cls)}>{v > 0 ? '+' : ''}{v}%</span>
}

function fmtVolume(n: number): string {
  if (n === 0)       return '0'
  if (n < 10)        return '< 10'
  if (n < 100)       return '10–100'
  if (n < 1000)      return '100–1K'
  if (n < 100_000)   return `${Math.round(n / 1000)}K`
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmbedCampaign {
  id:   string
  name: string
  type: string
}

export interface EmbedKeywordResult {
  keyword:            string
  matchType:          'EXACT' | 'PHRASE' | 'BROAD'
  avgMonthlySearches: number
  competition:        'LOW' | 'MEDIUM' | 'HIGH'
  suggestedCpc:       number
  selected:           boolean
  /** กลุ่มของคำ (brand/service/...) — เก็บไว้เพื่อไม่ให้กลายเป็น service หมดตอนโหลดกลับ */
  group?:             string
}

const PMAX_SEARCH_THEME_LIMIT = 25

interface Props {
  campaigns:    EmbedCampaign[]
  brief: {
    businessName?:   string
    productService?: string
    targetLocation?: string
    objective?:      string
  } | null
  // Keywords already on the plan (per campaign id) — pre-loaded so the user doesn't re-research
  initialApplied?: Record<string, EmbedKeywordResult[]>
  onApply:      (campaignId: string, keywords: EmbedKeywordResult[], searchThemes?: string[]) => void
  onSkipPmax:   (campaignId: string) => void
  onNext:       () => void
  allDone:      boolean
}

// Convert a plan keyword into the research-workspace shape so it can be displayed
// (เดิม hardcode group เป็น 'service' หมด → พอโหลดกลับมาทุกคำกลายเป็น Service
//  ตอนนี้ใช้ group ที่บันทึกไว้ก่อน ถ้าไม่มีค่อยเดาจากชื่อธุรกิจ)
function embedToResearch(k: EmbedKeywordResult, businessName?: string): ResearchKeyword {
  let group = k.group
  if (!group && businessName) {
    const nk = k.keyword.toLowerCase().replace(/\s+/g, '')
    const brandTokens = businessName.split(/[\s,/]+/).map(t => t.toLowerCase().replace(/\s+/g, '')).filter(t => t.length >= 3)
    if (brandTokens.some(t => nk.includes(t))) group = 'brand'
  }
  return {
    keyword:     k.keyword,
    matchType:   k.matchType,
    group:       (group ?? 'service') as ResearchKeyword['group'],
    intent:      'high',
    volume:      'กลาง',
    competition: k.competition,
    cpcEst:      k.suggestedCpc,
    selected:    k.selected,
    dataSource:  'ai_estimate',
  } as ResearchKeyword
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KeywordPlannerEmbed({ campaigns, brief, initialApplied, onApply, onSkipPmax, onNext, allDone }: Props) {
  const [activeCampaignId, setActiveCampaignId] = useState<string>(campaigns[0]?.id ?? '')

  // Form
  const [businessName,   setBusinessName]   = useState(brief?.businessName ?? '')
  const [productService, setProductService] = useState(brief?.productService ?? '')
  const [location,       setLocation]       = useState(brief?.targetLocation ?? 'กรุงเทพมหานคร')
  const [objective,      setObjective]      = useState(brief?.objective ?? 'leads')
  const [competitors,    setCompetitors]    = useState('')
  const [selectedCid,    setSelectedCid]    = useState('')
  const [accounts,       setAccounts]       = useState<Array<{ id: string; descriptiveName: string }>>([])
  // กลุ่ม keyword ที่ผู้ใช้อยากได้จากการ gen — ค่าเริ่มต้นเลือกทุกกลุ่ม (พฤติกรรมเดิม)
  const [focusGroups,    setFocusGroups]    = useState<Set<string>>(
    () => new Set(['brand', 'product', 'service', 'generic', 'competitor'])
  )
  function toggleFocusGroup(g: string) {
    setFocusGroups(prev => {
      const next = new Set(Array.from(prev))
      if (next.has(g)) { if (next.size > 1) next.delete(g) } else { next.add(g) }
      return next
    })
  }

  // Landing page (เหมือน "เริ่มต้นด้วยเว็บไซต์" ใน Google Keyword Planner)
  const [landingUrl,   setLandingUrl]   = useState('')
  const [landingScope, setLandingScope] = useState<'page' | 'site'>('page')
  // Do / Don't (ไม่บังคับ)
  const [doNotes,   setDoNotes]   = useState('')
  const [dontNotes, setDontNotes] = useState('')
  // feedback ตอนกด "วิเคราะห์ใหม่" — ถูกเก็บเป็น system learning ใน DB ด้วย
  const [refineFeedback, setRefineFeedback] = useState('')
  const [showRefine,     setShowRefine]     = useState(false)

  // Results
  const [keywords,  setKeywords]  = useState<ResearchKeyword[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [activeTab, setActiveTab] = useState<Group>('all')

  // Manual add
  const [newKw,      setNewKw]      = useState('')
  const [newKwGroup, setNewKwGroup] = useState<Group>('service')
  const [showManual, setShowManual] = useState(false)
  const manualRef = useRef<HTMLInputElement>(null)

  // Budget for forecast
  const [dailyBudgetStr, setDailyBudgetStr] = useState('500')

  // Track which campaigns have had keywords applied + what keywords.
  // Seed from the plan's keywords so already-researched campaigns show as done.
  const [appliedSet,      setAppliedSet]      = useState<Set<string>>(
    () => new Set(Object.entries(initialApplied ?? {}).filter(([, v]) => v.length > 0).map(([k]) => k))
  )
  const [appliedKeywords, setAppliedKeywords] = useState<Record<string, EmbedKeywordResult[]>>(
    () => initialApplied ?? {}
  )

  // Show the active campaign's existing keywords in the workspace (no re-research needed)
  const loadedForRef = useRef<string | null>(null)
  useEffect(() => {
    const applied = appliedKeywords[activeCampaignId]
    if (applied?.length && loadedForRef.current !== activeCampaignId) {
      setKeywords(applied.map(k => embedToResearch(k, brief?.businessName)))
      loadedForRef.current = activeCampaignId
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaignId, appliedKeywords])

  const hasResults = keywords.length > 0

  // Load Google Ads accounts
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json() as Promise<{ accounts: Array<{ id: string; descriptiveName: string; manager?: boolean }> }>)
      .then(d => {
        const accs = (d.accounts ?? []).filter(a => !a.manager)
        setAccounts(accs)
        if (accs.length > 0) setSelectedCid(accs[0].id)
      })
      .catch(() => {})
  }, [])

  // ── Generate ──────────────────────────────────────────────────────────────

  async function generate(feedbackText?: string) {
    if (!businessName.trim() || !productService.trim()) return
    setLoading(true)
    setError('')
    setKeywords([])
    setActiveTab('all')
    try {
      const res = await fetch('/api/keyword-research/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, productService, location, objective, competitors, customerId: selectedCid,
          // ส่งเฉพาะตอนผู้ใช้ "ตัดบางกลุ่มออก" — เลือกครบทุกกลุ่ม = พฤติกรรมเดิม
          ...(focusGroups.size < 5 ? { focusGroups: Array.from(focusGroups) } : {}),
          ...(landingUrl.trim() ? { landingPageUrl: landingUrl.trim(), landingPageScope: landingScope } : {}),
          ...(doNotes.trim() ? { doNotes: doNotes.trim() } : {}),
          ...(dontNotes.trim() ? { dontNotes: dontNotes.trim() } : {}),
          // feedback ถูกบันทึกเป็น learning ฝั่ง server แล้วมีผลกับรอบนี้ทันที
          ...(feedbackText?.trim() ? { feedback: feedbackText.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generate failed')
      setKeywords(data.keywords as ResearchKeyword[])
      setShowRefine(false)
      setRefineFeedback('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  // ── Keyword ops ───────────────────────────────────────────────────────────

  function toggle(idx: number) {
    setKeywords(prev => prev.map((k, i) => i === idx ? { ...k, selected: !k.selected } : k))
  }

  function toggleAll() {
    const visible = filtered
    const allSel  = visible.every(k => k.selected)
    const visSet  = new Set(visible.map(k => keywords.indexOf(k)))
    setKeywords(prev => prev.map((k, i) => visSet.has(i) ? { ...k, selected: !allSel } : k))
  }

  function changeMatchType(idx: number, mt: ResearchKeyword['matchType']) {
    setKeywords(prev => prev.map((k, i) => i === idx ? { ...k, matchType: mt } : k))
  }

  function moveToNegative(idx: number) {
    setKeywords(prev => prev.map((k, i) => i === idx ? { ...k, group: 'negative', selected: true } : k))
  }

  function removeKeyword(idx: number) {
    setKeywords(prev => prev.filter((_, i) => i !== idx))
  }

  // Add keyword from the unselected pool by clicking a chip
  function selectFromPool(idx: number) {
    setKeywords(prev => prev.map((k, i) => i === idx ? { ...k, selected: true } : k))
  }

  // Manual add from text input
  function addManualKeyword() {
    const kw = newKw.trim()
    if (!kw) return
    const grp = (newKwGroup === 'all' ? 'service' : newKwGroup) as Exclude<Group, 'all'>
    setKeywords(prev => [...prev, {
      keyword:    kw,
      matchType:  'PHRASE',
      group:      grp,
      intent:     'high',
      volume:     'ต่ำ',
      competition: 'MEDIUM',
      cpcEst:     0,
      selected:   true,
      dataSource: 'ai_estimate',
    } as ResearchKeyword])
    setNewKw('')
    manualRef.current?.focus()
  }

  // Apply selected keywords — PMax uses search themes (max 25), SEARCH uses keywords
  function applyToCampaign() {
    const pos = keywords.filter(k => k.selected && k.group !== 'negative')
    if (!pos.length || !activeCampaignId) return
    const isPmax = activeCampaign?.type === 'PERFORMANCE_MAX'
    const limited = isPmax ? pos.slice(0, PMAX_SEARCH_THEME_LIMIT) : pos

    const result: EmbedKeywordResult[] = limited.map(k => ({
      keyword:            k.keyword,
      matchType:          k.matchType,
      avgMonthlySearches: k.avgMonthlySearches ?? 0,
      competition:        k.competition,
      suggestedCpc:       k.cpcEst ?? 0,
      selected:           true,
      group:              k.group,
    }))
    const searchThemes = isPmax ? limited.map(k => k.keyword) : undefined
    onApply(activeCampaignId, result, searchThemes)
    setAppliedSet(prev => new Set(Array.from(prev).concat(activeCampaignId)))
    setAppliedKeywords(prev => ({ ...prev, [activeCampaignId]: result }))
  }

  // ลบ keyword รายตัวออกจากแคมเปญหลังใส่ไปแล้ว — sync กลับเข้าแผนทันที
  function removeAppliedKeyword(campaignId: string, idx: number) {
    const current = appliedKeywords[campaignId] ?? []
    const next = current.filter((_, i) => i !== idx)
    const isPmax = campaigns.find(c => c.id === campaignId)?.type === 'PERFORMANCE_MAX'
    onApply(campaignId, next, isPmax ? next.map(k => k.keyword) : undefined)
    setAppliedKeywords(prev => ({ ...prev, [campaignId]: next }))
    if (next.length === 0) {
      setAppliedSet(prev => {
        const s = new Set(Array.from(prev))
        s.delete(campaignId)
        return s
      })
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const filtered = activeTab === 'all' ? keywords : keywords.filter(k => k.group === activeTab)

  const counts = Object.fromEntries(
    (['all', 'brand', 'product', 'service', 'generic', 'competitor', 'negative'] as Group[]).map(g => [
      g, g === 'all' ? keywords.length : keywords.filter(k => k.group === g).length,
    ])
  )

  const selectedNonNeg = keywords.filter(k => k.selected && k.group !== 'negative')
  const selectedNeg    = keywords.filter(k => k.selected && k.group === 'negative')
  const unselectedPool = keywords.filter(k => !k.selected && k.group !== 'negative')
  const avgCPCEst      = selectedNonNeg.length > 0
    ? selectedNonNeg.reduce((a, k) => a + k.cpcEst, 0) / selectedNonNeg.length : 0

  const dailyBudget = Math.max(1, Number(dailyBudgetStr) || 1)

  const forecast = useMemo(() => {
    if (selectedNonNeg.length === 0) return null
    const cpc = avgCPCEst > 0 ? avgCPCEst : 25
    const VOL_FALLBACK: Record<string, number> = { สูง: 1500, กลาง: 400, ต่ำ: 80 }
    const COMP_CTR: Record<string, number>     = { LOW: 0.07, MEDIUM: 0.05, HIGH: 0.035 }
    const MATCH_MULT: Record<string, number>   = { EXACT: 1, PHRASE: 1.4, BROAD: 2.2 }

    let monthlyImpressions = 0, monthlyClicks = 0
    for (const kw of selectedNonNeg) {
      const base = kw.avgMonthlySearches ?? VOL_FALLBACK[kw.volume] ?? 200
      const imp  = base * (MATCH_MULT[kw.matchType] ?? 1)
      monthlyImpressions += imp
      monthlyClicks      += imp * (COMP_CTR[kw.competition] ?? 0.05)
    }
    const monthlyBudget     = dailyBudget * 30
    const maxClicksByBudget = monthlyBudget / cpc
    const actualClicks      = Math.min(monthlyClicks, maxClicksByBudget)
    const ctr               = monthlyImpressions > 0 ? (actualClicks / monthlyImpressions) * 100 : 0
    const budgetCurve = [50,100,200,300,400,500,700,1000,1500,2000].map(b => {
      const capClicks = Math.min(monthlyClicks, (b * 30) / cpc)
      return { budget: b, clicks: Math.round(capClicks) }
    })
    return {
      dailyBudget, monthlyBudget,
      monthlyImpressions: Math.round(monthlyImpressions),
      monthlyClicks:      Math.round(actualClicks),
      cpc:                Math.round(cpc),
      ctr:                ctr.toFixed(2),
      actualSpend:        Math.round(actualClicks * cpc),
      budgetCurve,
    }
  }, [selectedNonNeg, avgCPCEst, dailyBudget])

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId)
  const isApplied      = appliedSet.has(activeCampaignId)

  const isPmaxActive   = activeCampaign?.type === 'PERFORMANCE_MAX'
  const isSearchActive = activeCampaign?.type === 'SEARCH'

  // PMax: max 25 search themes. SEARCH: 10-15 recommended.
  const LIMIT_MAX   = isPmaxActive ? PMAX_SEARCH_THEME_LIMIT : 15
  const LIMIT_MIN   = isPmaxActive ? 5 : 10
  const LIMIT_LABEL = isPmaxActive
    ? `Search Themes — max ${PMAX_SEARCH_THEME_LIMIT}`
    : 'แนะนำ 10-15 keywords'

  // Group unselected pool by group for suggestion panel
  const poolByGroup = (['brand', 'product', 'service', 'generic', 'competitor'] as const)
    .map(g => ({ group: g, items: unselectedPool.filter(k => k.group === g) }))
    .filter(g => g.items.length > 0)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Keyword Research</h2>
        <p className="text-sm text-gray-500 mt-0.5">วิเคราะห์ keyword ด้วย Google Ads Keyword Planner แล้วเลือกใส่ campaign</p>
      </div>

      {/* ── Campaign tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {campaigns.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCampaignId(c.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
              activeCampaignId === c.id
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            )}
          >
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              c.type === 'SEARCH'          ? 'bg-blue-100 text-blue-700' :
              c.type === 'PERFORMANCE_MAX' ? 'bg-orange-100 text-orange-700' :
              'bg-purple-100 text-purple-700'
            )}>
              {c.type === 'SEARCH' ? 'Search' : c.type === 'PERFORMANCE_MAX' ? 'PMax' : c.type}
            </span>
            <span className="truncate max-w-[160px]">{c.name}</span>
            {appliedSet.has(c.id) && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
          </button>
        ))}
      </div>

      {/* ── Active campaign banner + applied keywords ─────────────────────── */}
      {activeCampaign && (
        <div className="border border-blue-200 rounded-xl overflow-hidden">
          {/* Banner row */}
          {/* Banner row */}
          <div className={cn('flex items-center gap-3 px-4 py-3',
            isPmaxActive ? 'bg-orange-50' : 'bg-blue-50')}>
            <Target className={cn('w-4 h-4 shrink-0', isPmaxActive ? 'text-orange-500' : 'text-blue-600')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={cn('text-xs font-semibold uppercase tracking-wide',
                  isPmaxActive ? 'text-orange-500' : 'text-blue-500')}>
                  Campaign ที่เลือก
                </p>
                {isPmaxActive && (
                  <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                    PMax — Search Themes
                  </span>
                )}
                {isSearchActive && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                    บังคับ
                  </span>
                )}
              </div>
              <p className={cn('text-sm font-medium truncate',
                isPmaxActive ? 'text-orange-800' : 'text-blue-800')}>
                {activeCampaign.name}
              </p>
              {isPmaxActive && (
                <p className="text-[11px] text-orange-500 mt-0.5">
                  เลือก keyword ที่ต้องการ → ใส่เป็น Search Theme (max {PMAX_SEARCH_THEME_LIMIT}) · ไม่ใช้ match type
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Skip button for PMax */}
              {isPmaxActive && !isApplied && (
                <button
                  onClick={() => { onSkipPmax(activeCampaignId); setAppliedSet(prev => new Set(Array.from(prev).concat(activeCampaignId))) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-orange-200 text-orange-600 hover:bg-orange-50 transition-all"
                >
                  ข้ามได้
                </button>
              )}
              {hasResults && (
                <button
                  onClick={applyToCampaign}
                  disabled={selectedNonNeg.length === 0}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                    isPmaxActive
                      ? 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {/* ใส่แล้วก็ยังกดซ้ำได้ = อัปเดตทับของเดิม (เลือกเพิ่ม/เอาออกแล้วกดใหม่) */}
                  {isApplied
                    ? <><RefreshCw className="w-4 h-4" />อัปเดต ({selectedNonNeg.length})</>
                    : isPmaxActive
                      ? <><Plus className="w-4 h-4" />ใส่ {Math.min(selectedNonNeg.length, PMAX_SEARCH_THEME_LIMIT)} Search Themes</>
                      : <><Plus className="w-4 h-4" />ใส่ {selectedNonNeg.length} keywords</>
                  }
                </button>
              )}
            </div>
          </div>

          {/* Applied keywords / search themes for this campaign */}
          {appliedKeywords[activeCampaignId]?.length > 0 && (
            <div className="bg-white border-t border-blue-100 px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {isPmaxActive ? 'Search Themes' : 'Keywords'} ใน Campaign นี้ ({appliedKeywords[activeCampaignId].length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {appliedKeywords[activeCampaignId].map((kw, i) => (
                  <span key={i} className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium group/chip',
                    isPmaxActive
                      ? 'bg-orange-100 text-orange-700'
                      : (MATCH_COLORS[kw.matchType] ?? 'bg-gray-100 text-gray-600')
                  )}>
                    {kw.keyword}
                    {!isPmaxActive && <span className="opacity-50 text-[10px]">{kw.matchType}</span>}
                    {/* ลบออกจากแคมเปญ — sync เข้าแผนทันที ไม่ต้อง research ใหม่ */}
                    <button onClick={() => removeAppliedKeyword(activeCampaignId, i)}
                      className="ml-0.5 -mr-0.5 p-0.5 rounded-full opacity-40 hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
                      title="ลบออกจาก campaign">
                      <X className="w-3 h-3"/>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Input form ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {accounts.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Google Ads Account</label>
            <AccountSelect
              accounts={accounts}
              value={selectedCid}
              onChange={setSelectedCid}
              className="flex-1 max-w-xs px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">ชื่อธุรกิจ / แบรนด์ *</label>
            <p className="text-[11px] text-gray-400 mb-1.5">ชื่อที่ลูกค้ารู้จัก — ใช้สร้าง brand keywords</p>
            <input value={businessName} onChange={e => setBusinessName(e.target.value)}
              placeholder="เช่น ชื่อธุรกิจของคุณ"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">บริการ / สินค้าหลัก *</label>
            <p className="text-[11px] text-gray-400 mb-1.5">สิ่งที่ต้องการให้คนค้นหา — ยิ่งเจาะจงยิ่งดี</p>
            <input value={productService} onChange={e => setProductService(e.target.value)}
              placeholder="เช่น ประกันรถยนต์ชั้น 1, ติดตั้งโซลาร์เซลล์"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">พื้นที่ / Location</label>
            <p className="text-[11px] text-gray-400 mb-1.5">จังหวัด หรือ ทั่วประเทศไทย</p>
            <input value={location} onChange={e => setLocation(e.target.value)}
              placeholder="กรุงเทพมหานคร"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Objective</label>
            <p className="text-[11px] text-gray-400 mb-1.5">ส่งผลต่อ match type และ keyword intent</p>
            <select value={objective} onChange={e => setObjective(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white">
              <optgroup label="─ Direct Response ─">
                <option value="leads">Leads / สอบถาม / ลงทะเบียน</option>
                <option value="sales">Sales / ซื้อสินค้า Online</option>
                <option value="calls">Phone Calls / โทรหาธุรกิจ</option>
                <option value="store_visit">Store Visit / เข้าร้าน</option>
                <option value="quote">ขอใบเสนอราคา / Request Quote</option>
              </optgroup>
              <optgroup label="─ E-commerce ─">
                <option value="ecomm_purchase">E-commerce Purchase</option>
                <option value="ecomm_cart">Add to Cart / Checkout</option>
                <option value="ecomm_remarketing">Remarketing / Cart Abandon</option>
              </optgroup>
              <optgroup label="─ Brand & Awareness ─">
                <option value="awareness">Awareness / การรับรู้แบรนด์</option>
                <option value="brand_search">Brand Search Volume</option>
                <option value="consideration">Consideration / ค้นหาข้อมูล</option>
              </optgroup>
              <optgroup label="─ App & Digital ─">
                <option value="app">App Install / Download</option>
                <option value="app_engage">App Engagement / Re-engage</option>
                <option value="video_view">Video Views / YouTube</option>
              </optgroup>
              <optgroup label="─ Local & Service ─">
                <option value="local_service">Local Service / บริการท้องถิ่น</option>
                <option value="appointment">นัดหมาย / Booking</option>
                <option value="real_estate">อสังหาริมทรัพย์</option>
                <option value="education">ลงทะเบียนเรียน / Education</option>
                <option value="healthcare">นัดแพทย์ / Healthcare</option>
                <option value="finance">สมัครสินเชื่อ / บัตร / Finance</option>
                <option value="travel">จองท่องเที่ยว / Travel</option>
                <option value="automotive">ทดลองขับ / Automotive</option>
              </optgroup>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">คู่แข่ง (คั่นด้วย ,)</label>
            <p className="text-[11px] text-gray-400 mb-1.5">ถ้าไม่ใส่ AI จะหาให้เองจากอุตสาหกรรม</p>
            <input value={competitors} onChange={e => setCompetitors(e.target.value)}
              placeholder="เว้นว่างให้ AI หาให้อัตโนมัติ"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </div>

          {/* Landing page — เหมือน "เริ่มต้นด้วยเว็บไซต์" ใน Google Keyword Planner */}
          <div className="md:col-span-2 lg:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Landing Page (ไม่บังคับ)</label>
            <p className="text-[11px] text-gray-400 mb-1.5">ใส่ URL แล้วระบบจะหา keyword จากหน้าเว็บจริง (Google Keyword Planner + AI อ่านหน้าเว็บประกอบ)</p>
            <div className="flex flex-wrap items-center gap-2">
              <input value={landingUrl} onChange={e => setLandingUrl(e.target.value)}
                placeholder="https://domain.com/page"
                className="flex-1 min-w-[220px] px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="radio" checked={landingScope === 'page'} onChange={() => setLandingScope('page')} className="text-blue-600"/>
                ใช้หน้านี้เท่านั้น
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="radio" checked={landingScope === 'site'} onChange={() => setLandingScope('site')} className="text-blue-600"/>
                ใช้ทั้งเว็บไซต์
              </label>
            </div>
          </div>

          {/* กลุ่ม keyword ที่อยากได้ */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">กลุ่ม Keyword ที่อยากได้</label>
            <p className="text-[11px] text-gray-400 mb-1.5">ติ๊กเฉพาะกลุ่มที่ต้องการ — ระบบจะ gen เฉพาะกลุ่มนั้น</p>
            <div className="flex flex-wrap gap-1.5">
              {(['brand', 'product', 'service', 'generic', 'competitor'] as const).map(g => (
                <button key={g} type="button" onClick={() => toggleFocusGroup(g)}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                    focusGroups.has(g)
                      ? (GROUP_COLORS[g] ?? 'bg-blue-100 text-blue-700') + ' border-transparent'
                      : 'bg-white text-gray-400 border-gray-200 line-through')}>
                  {GROUP_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          {/* Do / Don't (ไม่บังคับ) */}
          <div>
            <label className="block text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Do — อยากให้เน้นอะไร (ไม่บังคับ)</label>
            <textarea value={doNotes} onChange={e => setDoNotes(e.target.value)} rows={2}
              placeholder="เช่น โฟกัส painpoint ปวดหลังจากนั่งทำงาน, เน้นคำที่มี intent ซื้อ"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-red-500 uppercase tracking-wide mb-0.5">Don&apos;t — ไม่เอาอะไร (ไม่บังคับ)</label>
            <textarea value={dontNotes} onChange={e => setDontNotes(e.target.value)} rows={2}
              placeholder="เช่น ไม่เอา kw ที่ซ้ำกับแคมเปญ Brand, ไม่เอาคำเกี่ยวกับมือสอง"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button onClick={() => generate()}
            disabled={loading || !businessName.trim() || !productService.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังวิเคราะห์...</>
              : <><Sparkles className="w-4 h-4" />วิเคราะห์ Keyword</>}
          </button>
          {hasResults && (
            <button onClick={() => setShowRefine(v => !v)} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors">
              <RefreshCw className="w-4 h-4" />วิเคราะห์ใหม่
            </button>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* ยังไม่ถูกใจ → บอกได้ว่าเพราะอะไร — ระบบเก็บเป็น learning ใน DB
            แล้วเอามาปรับทั้งรอบนี้และทุกรอบถัดไปของธุรกิจนี้ */}
        {showRefine && (
          <div className="mt-3 p-3 border border-amber-200 bg-amber-50/50 rounded-xl">
            <label className="block text-xs font-semibold text-amber-700 mb-1.5">
              ยังไม่ถูกใจตรงไหน? (ระบบจะจำไว้ใช้ทุกรอบถัดไปของธุรกิจนี้)
            </label>
            <div className="flex items-center gap-2">
              <input value={refineFeedback} onChange={e => setRefineFeedback(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !loading) generate(refineFeedback) }}
                placeholder="เช่น คำกว้างไป เอาเฉพาะที่มี intent ซื้อ / ไม่เอาคำเกี่ยวกับเช่า"
                className="flex-1 px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white focus:outline-none focus:border-amber-400" />
              <button onClick={() => generate(refineFeedback)} disabled={loading}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors shrink-0">
                วิเคราะห์ใหม่
              </button>
              <button onClick={() => generate()} disabled={loading}
                className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 shrink-0"
                title="วิเคราะห์ใหม่โดยไม่ใส่ feedback">
                ข้าม
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Keyword Table ─────────────────────────────────────────────────── */}
      {hasResults && (
        <div className="space-y-4">
          {/* Counter + warning */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Google Ads Keyword Planner</span>
            </div>
            <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
              selectedNonNeg.length > LIMIT_MAX ? 'bg-red-100 text-red-700' :
              selectedNonNeg.length >= LIMIT_MIN ? 'bg-emerald-100 text-emerald-700' :
              'bg-gray-100 text-gray-600')}>
              {selectedNonNeg.length > LIMIT_MAX && <AlertTriangle className="w-3 h-3" />}
              เลือกแล้ว {selectedNonNeg.length} / {LIMIT_LABEL}
            </div>
          </div>

          {selectedNonNeg.length > LIMIT_MAX && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {isPmaxActive
                ? `เกิน ${PMAX_SEARCH_THEME_LIMIT} Search Themes — Google Ads รองรับสูงสุด ${PMAX_SEARCH_THEME_LIMIT} themes · จะใช้แค่ ${PMAX_SEARCH_THEME_LIMIT} อันดับแรก`
                : 'เลือก keyword มากเกินไป — แนะนำไม่เกิน 15 keyword ต่อ campaign เพื่อ quality score ที่ดี'}
            </div>
          )}

          {/* Group tabs + table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center gap-0 border-b border-gray-100 px-1 pt-1 overflow-x-auto">
              {(['all', 'brand', 'product', 'service', 'generic', 'competitor', 'negative'] as Group[]).map(g => (
                <button key={g} onClick={() => setActiveTab(g)}
                  className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                    activeTab === g ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                  {GROUP_LABELS[g]}
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                    activeTab === g ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}>
                    {counts[g]}
                  </span>
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="py-3 px-4 w-10">
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(k => k.selected)}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    </th>
                    <th className="text-left py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Keyword</th>
                    <th className="text-center py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Match Type</th>
                    <th className="text-center py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide hidden md:table-cell">กลุ่ม</th>
                    <th className="text-center py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Avg. Monthly</th>
                    <th className="text-right py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide hidden lg:table-cell">Bid ต่ำ (฿)</th>
                    <th className="text-right py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide hidden lg:table-cell">Bid สูง (฿)</th>
                    <th className="text-right py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide hidden lg:table-cell">3 เดือน</th>
                    <th className="text-right py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide hidden lg:table-cell">YoY</th>
                    <th className="text-center py-3 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide hidden md:table-cell">Competition</th>
                    <th className="py-3 px-4 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((kw) => {
                    const realIdx = keywords.indexOf(kw)
                    return (
                      <tr key={realIdx} className={cn('border-b border-gray-50 transition-colors',
                        kw.selected ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 opacity-60 hover:opacity-80')}>
                        <td className="py-3 px-4">
                          <input type="checkbox" checked={kw.selected} onChange={() => toggle(realIdx)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        </td>
                        <td className="py-3 px-3 font-medium text-gray-900">{kw.keyword}</td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => {
                              const cycle: ResearchKeyword['matchType'][] = ['PHRASE', 'BROAD']
                              const cur = cycle.indexOf(kw.matchType as 'PHRASE' | 'BROAD')
                              changeMatchType(realIdx, cycle[(cur < 0 ? 0 : cur + 1) % 2])
                            }}
                            className={cn('px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:opacity-80', MATCH_COLORS[kw.matchType])}
                            title="คลิกเพื่อเปลี่ยน match type">
                            {kw.matchType}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-center hidden md:table-cell">
                          {/* คลิกเพื่อเปลี่ยนกลุ่ม — แก้เคสที่ AI จัดกลุ่มผิด (เช่น brand โดนตีเป็น service) */}
                          <button
                            onClick={() => {
                              if (kw.group === 'negative') return
                              const cycle: Group[] = ['brand', 'product', 'service', 'generic', 'competitor']
                              const cur = cycle.indexOf(kw.group as Group)
                              const next = cycle[(cur < 0 ? 0 : cur + 1) % cycle.length]
                              setKeywords(prev => prev.map((k, i) => i === realIdx ? { ...k, group: next } as ResearchKeyword : k))
                            }}
                            className={cn('px-2 py-0.5 rounded text-xs font-medium',
                              kw.group !== 'negative' && 'cursor-pointer hover:opacity-75',
                              GROUP_COLORS[kw.group] ?? 'bg-gray-100 text-gray-600')}
                            title={kw.group === 'negative' ? undefined : 'คลิกเพื่อเปลี่ยนกลุ่ม'}>
                            {GROUP_LABELS[kw.group as Group] ?? kw.group}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {kw.group === 'negative' ? <span className="text-xs text-gray-300">—</span> :
                           kw.avgMonthlySearches !== undefined && kw.dataSource === 'google_ads'
                            ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-900">{fmtVolume(kw.avgMonthlySearches)}</span>
                                <TrendSparkline data={kw.monthlyVolumes}/>
                              </span>
                            )
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-xs hidden lg:table-cell">
                          {kw.group !== 'negative' && kw.lowTopBid !== undefined && kw.dataSource === 'google_ads' && kw.lowTopBid > 0
                            ? <span className="font-semibold text-gray-900">฿{kw.lowTopBid.toLocaleString()}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-xs hidden lg:table-cell">
                          {kw.group !== 'negative' && kw.highTopBid !== undefined && kw.dataSource === 'google_ads' && kw.highTopBid > 0
                            ? <span className="font-semibold text-gray-900">฿{kw.highTopBid.toLocaleString()}</span>
                            : kw.group !== 'negative' && kw.cpcEst > 0 ? <span className="text-gray-400">฿{kw.cpcEst}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 px-3 text-right hidden lg:table-cell">
                          {kw.group === 'negative' ? <span className="text-xs text-gray-300">—</span> : <PctChange v={kw.threeMonthChange}/>}
                        </td>
                        <td className="py-3 px-3 text-right hidden lg:table-cell">
                          {kw.group === 'negative' ? <span className="text-xs text-gray-300">—</span> : <PctChange v={kw.yoyChange}/>}
                        </td>
                        <td className="py-3 px-3 text-center hidden md:table-cell">
                          {kw.group === 'negative' ? <span className="text-xs text-gray-300">—</span> :
                           kw.competitionIndex !== undefined && kw.dataSource === 'google_ads' ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full',
                                  kw.competitionIndex >= 67 ? 'bg-red-400' : kw.competitionIndex >= 34 ? 'bg-amber-400' : 'bg-emerald-400')}
                                  style={{ width: `${kw.competitionIndex}%` }} />
                              </div>
                              <span className={cn('text-[11px] font-medium', COMP_COLORS[kw.competition])}>{kw.competition}</span>
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1 justify-end">
                            {kw.group !== 'negative' && (
                              <button onClick={() => moveToNegative(realIdx)} title="ย้ายไป Negative"
                                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => removeKeyword(realIdx)} title="ลบออก"
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Keyword suggestion pool ──────────────────────────────────── */}
          {(unselectedPool.length > 0 || showManual) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  เพิ่ม Keyword เข้า Campaign
                </p>
                <button
                  onClick={() => { setShowManual(v => !v); setTimeout(() => manualRef.current?.focus(), 50) }}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />พิมพ์เพิ่มเอง
                </button>
              </div>

              {/* Manual add input */}
              {showManual && (
                <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2">
                  <input
                    ref={manualRef}
                    value={newKw}
                    onChange={e => setNewKw(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addManualKeyword(); if (e.key === 'Escape') setShowManual(false) }}
                    placeholder="พิมพ์ keyword แล้วกด Enter..."
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                  <select value={newKwGroup} onChange={e => setNewKwGroup(e.target.value as Group)}
                    className="px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none">
                    {(['brand', 'product', 'service', 'generic', 'competitor', 'negative'] as Group[]).map(g => (
                      <option key={g} value={g}>{GROUP_LABELS[g]}</option>
                    ))}
                  </select>
                  <button onClick={addManualKeyword}
                    className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setShowManual(false)}
                    className="p-1 rounded text-gray-400 hover:bg-gray-100">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Grouped chips from unselected pool */}
              {poolByGroup.map(({ group, items }) => (
                <div key={group} className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{GROUP_LABELS[group]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(kw => {
                      const realIdx = keywords.indexOf(kw)
                      return (
                        <button
                          key={realIdx}
                          onClick={() => selectFromPool(realIdx)}
                          title={kw.avgMonthlySearches ? `${fmtVolume(kw.avgMonthlySearches)} searches/mo` : undefined}
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:scale-105',
                            GROUP_COLORS[group] ?? 'bg-gray-100 text-gray-600',
                            'border-transparent hover:border-current hover:shadow-sm'
                          )}
                        >
                          <Plus className="w-3 h-3 opacity-60" />
                          {kw.keyword}
                          {kw.avgMonthlySearches !== undefined && kw.dataSource === 'google_ads' && (
                            <span className="opacity-50 text-[10px] ml-0.5">{fmtVolume(kw.avgMonthlySearches)}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {unselectedPool.length === 0 && !showManual && (
                <p className="text-xs text-gray-400 text-center py-1">ทุก keyword ถูกเลือกแล้ว — พิมพ์เพิ่มเองได้</p>
              )}
            </div>
          )}

          {/* Forecast */}
          {forecast && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  <h3 className="font-semibold text-gray-900">Forecast</h3>
                  <span className="text-xs text-gray-400">{selectedNonNeg.length} keywords selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">งบ/วัน</label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                    <span className="px-3 py-1.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-200">฿</span>
                    <input type="number" value={dailyBudgetStr}
                      onChange={e => setDailyBudgetStr(e.target.value)}
                      onBlur={e => setDailyBudgetStr(String(Math.max(1, Number(e.target.value) || 1)))}
                      className="w-24 px-3 py-1.5 text-sm text-gray-800 font-medium focus:outline-none"
                      step={100} min={1} />
                  </div>
                  <span className="text-xs text-gray-400">= ฿{(dailyBudget * 30).toLocaleString()}/เดือน</span>
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-5 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Impressions', value: forecast.monthlyImpressions >= 1000 ? `${(forecast.monthlyImpressions / 1000).toFixed(1)}K` : String(forecast.monthlyImpressions), sub: 'ต่อเดือน' },
                  { label: 'Clicks',      value: forecast.monthlyClicks.toLocaleString(), sub: 'ต่อเดือน' },
                  { label: 'CTR',         value: `${forecast.ctr}%`, sub: 'avg. click-through rate' },
                  { label: 'Avg. CPC',    value: `฿${forecast.cpc.toLocaleString()}`, sub: 'ต่อคลิก' },
                  { label: 'Keywords',    value: String(selectedNonNeg.length), sub: `${selectedNeg.length} negatives` },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="px-4 py-3">
                    <p className="text-[11px] text-gray-400 mb-1">{label}</p>
                    <p className="text-lg font-bold text-gray-900 leading-none">{value}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              <div className="px-5 pt-4 pb-3">
                <p className="text-xs font-semibold text-gray-500 mb-3">Clicks vs. Daily Budget</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={forecast.budgetCurve} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="budget" tickFormatter={v => `฿${v}`} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Clicks']} labelFormatter={(l: number) => `฿${l}/วัน`}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <ReferenceDot x={dailyBudget} y={forecast.monthlyClicks} r={4} fill="#3b82f6" stroke="white" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Bottom action bar */}
          <div className={cn('rounded-xl px-5 py-4 flex items-center justify-between gap-4',
            isPmaxActive ? 'bg-orange-900' : 'bg-gray-900')}>
            <div>
              <p className="text-white font-medium text-sm">
                {isPmaxActive ? 'Search Themes สำหรับ PMax' : 'พร้อมใส่ Campaign'}
              </p>
              <p className="text-gray-300 text-xs mt-0.5">
                {isPmaxActive
                  ? `เลือกแล้ว ${selectedNonNeg.length} / max ${PMAX_SEARCH_THEME_LIMIT} · ไม่ใช้ match type · ไม่มี negative`
                  : `${selectedNonNeg.length} keywords · ${selectedNeg.length} negatives · avg CPC ฿${avgCPCEst.toFixed(0)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPmaxActive && !isApplied && (
                <button
                  onClick={() => { onSkipPmax(activeCampaignId); setAppliedSet(prev => new Set(Array.from(prev).concat(activeCampaignId))) }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border border-orange-300/40 text-orange-200 hover:bg-orange-800/50 transition-all"
                >
                  ข้ามได้
                </button>
              )}
              <button
                onClick={applyToCampaign}
                disabled={selectedNonNeg.length === 0 || !activeCampaignId}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  isPmaxActive
                    ? 'bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed'
                )}>
                {isApplied
                  ? <><RefreshCw className="w-4 h-4" />อัปเดตใน Campaign ({selectedNonNeg.length})</>
                  : isPmaxActive
                    ? <><Plus className="w-4 h-4" />ใส่ {Math.min(selectedNonNeg.length, PMAX_SEARCH_THEME_LIMIT)} Search Themes</>
                    : <><Plus className="w-4 h-4" />ใส่ใน &quot;{activeCampaign?.name ?? '...'}&quot;</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Next step ─────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center pt-2">
        <div className="text-sm text-gray-500">
          {appliedSet.size}/{campaigns.length} campaigns มี keywords แล้ว
        </div>
        <button
          onClick={onNext}
          disabled={!allDone && appliedSet.size === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ต่อไป: Audience Research
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
