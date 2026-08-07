'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import CleanTable from '@/components/ui/CleanTable'
import LanguagePicker, { Language } from '@/components/ui/LanguagePicker'
import {
  CheckCircle2, AlertTriangle, XCircle, Send, Zap, Loader2,
  Copy, ExternalLink, RefreshCw, ChevronRight, Download,
  Search, Users, Sparkles, Plus, X, ChevronDown, ChevronUp, Edit3,
  FileText, Clock, ArrowRight,
} from 'lucide-react'
import AudienceSignalBuilder from '@/components/media-plan/AudienceSignalBuilder'
import type { PMaxSignal, CampaignMixItem } from '@/types'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Account { id: string; name: string; currencyCode?: string }

interface IntakeAnalysis {
  businessType: string
  businessTypeReason: string
  missingCritical: string[]
  canProceed: boolean
  proceedWithAssumptions: boolean
  assumptions: string[]
  questions: IntakeQuestion[]
  intakeMode: 'full' | 'quick' | 'launch'
}
interface IntakeQuestion {
  id: string; question: string; type: string; options: string[] | null; required: boolean; category: string
}

interface KwIdea {
  keyword: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
  avgMonthlySearches: number
  competition: 'LOW' | 'MEDIUM' | 'HIGH'
  suggestedCpc: number
  selected: boolean
  isNegative?: boolean
}

interface CampaignResearch {
  campaignName: string
  campaignType: 'SEARCH' | 'PMAX' | 'DISPLAY' | 'DEMAND_GEN' | 'VIDEO' | 'REMARKETING' | string
  keywords: KwIdea[]
  searchThemes: string[]
  pmaxSignal: PMaxSignal
  done: boolean
}

interface BudgetAlloc {
  campaignType: string; funnelStage: string; budgetPct: number
  monthlyBudget: number; dailyBudget: number; mainKpi: string; strategicRole: string
}
interface MediaPlanStrategy {
  businessType: string
  intakeSummary: {
    trackingStatus: string; remarketingReadiness: string; creativeReadiness: string
    keyAssumptions: string[]; mainConversion: string; monthlyBudget: number
  }
  recommendedStrategy: string
  budgetAllocation: BudgetAlloc[]
  campaignStructure: {
    search: { name: string; theme: string; adGroups: string[]; keywordThemes: string[]; monthlyBudget?: number; budgetPct?: number }[]
    pmax: { name: string; assetGroups: string[]; audienceSignals: string[]; monthlyBudget?: number; budgetPct?: number }[]
    remarketing: { name: string; audience: string; lookbackWindow: number; messageAngle: string; monthlyBudget?: number; budgetPct?: number }[]
    demandGen?: { name: string; audience: string; creativeAngle: string; funnelStage: string; monthlyBudget?: number; budgetPct?: number }[]
  }
  funnelMapping: { funnelStage: string; audience: string; campaignType: string; messageAngle: string; conversionGoal: string }[]
  measurementPlan: { primaryConversion: string; secondaryConversion: string; trackingRisks: string[] }
  creativeRequirements: { searchAds: string; pmaxAssets: string; extensions: string[] }
  optimizationPlan: { week1_2: string[]; week3_4: string[]; month2plus: string[] }
  risks: string[]
  executiveSummary: string
}

// แปลง risk ไม่ว่าจะเป็น string หรือ {risk, mitigation} object
function riskToString(r: unknown): string {
  if (typeof r === 'string') return r
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>
    const parts = [o.risk, o.mitigation].filter(Boolean)
    return parts.length > 0 ? parts.join(' — ') : JSON.stringify(r)
  }
  return String(r)
}

// ── Normalize plan — fill missing fields so components never crash ─────────────
function normalizePlan(raw: Partial<MediaPlanStrategy>): MediaPlanStrategy {
  return {
    businessType:        raw.businessType        ?? '',
    recommendedStrategy: raw.recommendedStrategy ?? '',
    executiveSummary:    raw.executiveSummary    ?? '',
    risks:               (raw.risks ?? []).map(riskToString),
    intakeSummary: {
      trackingStatus:      raw.intakeSummary?.trackingStatus      ?? 'unknown',
      remarketingReadiness:raw.intakeSummary?.remarketingReadiness ?? 'unknown',
      creativeReadiness:   raw.intakeSummary?.creativeReadiness   ?? 'unknown',
      keyAssumptions:      raw.intakeSummary?.keyAssumptions      ?? [],
      mainConversion:      raw.intakeSummary?.mainConversion      ?? '',
      monthlyBudget:       raw.intakeSummary?.monthlyBudget       ?? 0,
    },
    budgetAllocation: raw.budgetAllocation ?? [],
    campaignStructure: {
      search:      raw.campaignStructure?.search      ?? [],
      pmax:        raw.campaignStructure?.pmax        ?? [],
      remarketing: raw.campaignStructure?.remarketing ?? [],
      demandGen:   raw.campaignStructure?.demandGen   ?? [],
    },
    funnelMapping: raw.funnelMapping ?? [],
    measurementPlan: {
      primaryConversion:   raw.measurementPlan?.primaryConversion   ?? '',
      secondaryConversion: raw.measurementPlan?.secondaryConversion ?? '',
      trackingRisks:       raw.measurementPlan?.trackingRisks       ?? [],
    },
    creativeRequirements: {
      searchAds:  raw.creativeRequirements?.searchAds  ?? '',
      pmaxAssets: raw.creativeRequirements?.pmaxAssets ?? '',
      extensions: raw.creativeRequirements?.extensions ?? [],
    },
    optimizationPlan: {
      week1_2:   raw.optimizationPlan?.week1_2   ?? [],
      week3_4:   raw.optimizationPlan?.week3_4   ?? [],
      month2plus: raw.optimizationPlan?.month2plus ?? [],
    },
  }
}

// ── Step definitions ───────────────────────────────────────────────────────────

const PLAN_STEPS = [
  { key: 'brief',    label: '1. Brief Input',            status: 'Input' },
  { key: 'missing',  label: '2. Missing Info + Analysis', status: 'Analyze' },
  { key: 'strategy', label: '3. Strategy + Structure',   status: 'Build' },
  { key: 'research', label: '4. Keyword & Audience',     status: 'Research' },
  { key: 'output',   label: '5. Plan Preview',           status: 'Preview' },
  { key: 'review',   label: '6. Review',                  status: 'Approve' },
]

// ── Constants ──────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#22d3ee', '#34d399', '#fb923c', '#f472b6', '#a78bfa']

const OBJECTIVES = [
  { value: 'LEADS',       label: 'Lead Generation' },
  { value: 'SALES',       label: 'Sales / eCommerce' },
  { value: 'AWARENESS',   label: 'Brand Awareness' },
  { value: 'TRAFFIC',     label: 'Website Traffic' },
  { value: 'APP_INSTALLS',label: 'App Installs' },
]

// ── Shared UI ──────────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      {title && <div className="px-5 py-3 border-b border-neutral-100 text-sm font-semibold text-neutral-900">{title}</div>}
      <div className="p-5">{children}</div>
    </div>
  )
}

function Btn({ onClick, children, variant = 'primary', disabled = false, loading = false }: {
  onClick?: () => void; children: React.ReactNode
  variant?: 'primary' | 'outline' | 'ghost'; disabled?: boolean; loading?: boolean
}) {
  const base = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-40'
  const cls = variant === 'primary' ? 'bg-neutral-950 text-white hover:bg-neutral-800'
    : variant === 'outline' ? 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
    : 'text-neutral-600 hover:bg-neutral-100'
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${cls}`}>
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700',
    not_ready: 'bg-red-50 text-red-700', unknown: 'bg-neutral-100 text-neutral-600',
    small_audience: 'bg-amber-50 text-amber-700', not_applicable: 'bg-neutral-100 text-neutral-500',
  }
  const label: Record<string, string> = {
    ready: 'Ready', partial: 'Partial', not_ready: 'Not Ready', unknown: 'Unknown',
    small_audience: 'Small Audience', not_applicable: 'N/A',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-neutral-100 text-neutral-600'}`}>{label[status] ?? status}</span>
}

// ── Step 1: Brief Form ─────────────────────────────────────────────────────────

function StepBrief({
  onAnalyze,
  initialValues,
}: {
  onAnalyze: (brief: Record<string, string | number>) => void
  initialValues?: Record<string, string | number>
}) {
  const [f, setF] = useState({
    businessName:   String(initialValues?.businessName   ?? ''),
    websiteUrl:     String(initialValues?.websiteUrl     ?? ''),
    productService: String(initialValues?.productService ?? ''),
    objective:      String(initialValues?.objective      ?? 'LEADS'),
    monthlyBudget:  String(initialValues?.monthlyBudget  ?? ''),
    targetLocation: String(initialValues?.targetLocation ?? 'ประเทศไทย'),
    targetAudience: String(initialValues?.targetAudience ?? ''),
    conversionGoal: String(initialValues?.conversionGoal ?? ''),
    promotion:      String(initialValues?.promotion      ?? ''),
    brandTone:      String(initialValues?.brandTone      ?? ''),
    notes:          String(initialValues?.notes          ?? ''),
  })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function handle() {
    if (!f.businessName || !f.productService || !f.monthlyBudget || !f.targetAudience || !f.conversionGoal) {
      setErr('กรุณากรอก Business Name, Product/Service, Budget, Target Audience และ Conversion Goal')
      return
    }
    setErr(''); setLoading(true)
    onAnalyze({ ...f, monthlyBudget: Number(f.monthlyBudget) })
  }

  const field = (label: string, key: string, opts?: { type?: string; placeholder?: string; rows?: number }) => (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">{label}</label>
      {opts?.rows ? (
        <textarea value={(f as Record<string, string>)[key]} onChange={e => set(key, e.target.value)}
          rows={opts.rows} placeholder={opts?.placeholder}
          // resize-y: ลากขยายเองได้ (เดิม resize-none ทำให้ note ยาว ๆ อ่านไม่เห็น)
          className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 resize-y min-h-[60px] focus:outline-none focus:ring-2 focus:ring-neutral-200" />
      ) : (
        <input type={opts?.type ?? 'text'} value={(f as Record<string, string>)[key]}
          onChange={e => set(key, e.target.value)} placeholder={opts?.placeholder}
          className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200" />
      )}
    </div>
  )

  return (
    <SectionCard title="Client Brief">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {field('Business Name *', 'businessName', { placeholder: 'เช่น Convert Cake' })}
        {field('Website URL', 'websiteUrl', { placeholder: 'https://convertcake.com' })}
        <div className="md:col-span-2">
          {field('Product / Service *', 'productService', { placeholder: 'เช่น บริการทำโฆษณา Google Ads & Meta Ads สำหรับ SME ราคาเริ่มต้น 15,000 บาท/เดือน', rows: 2 })}
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Objective *</label>
          <select value={f.objective} onChange={e => set('objective', e.target.value)}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none">
            {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {field('Monthly Budget (THB) *', 'monthlyBudget', { type: 'number', placeholder: 'เช่น 80000' })}
        {field('Target Location', 'targetLocation', { placeholder: 'เช่น กรุงเทพฯ และปริมณฑล' })}
        {field('Target Audience *', 'targetAudience', { placeholder: 'เช่น เจ้าของธุรกิจ SME อายุ 30-50 มีงบโฆษณาออนไลน์' })}
        <div className="md:col-span-2">
          {field('Conversion Goal *', 'conversionGoal', { placeholder: 'เช่น Form ขอใบเสนอราคา, LINE OA, โทรหา' })}
        </div>
        {field('Promotion / Offer', 'promotion', { placeholder: 'เช่น ฟรี Audit โฆษณา + ทดลองใช้บริการ 1 เดือน' })}
        {field('Brand Tone', 'brandTone', { placeholder: 'เช่น Professional, Data-driven, เชื่อถือได้' })}
        <div className="md:col-span-2">
          {field('Additional Notes', 'notes', { rows: 5, placeholder: 'เช่น เน้น B2B, ไม่รับลูกค้าธุรกิจผิดกฎหมาย, เน้น conversion ไม่เน้น awareness' })}
        </div>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="flex gap-3 mt-5">
        <Btn onClick={handle} loading={loading}>
          <Zap size={13} /> Analyze Brief with AI
        </Btn>
      </div>
    </SectionCard>
  )
}

// ── Step 2: Missing Info + Analysis ───────────────────────────────────────────

function StepMissing({
  analysis, intakeAnswers, setIntakeAnswers, onGenerate, loading,
}: {
  analysis: IntakeAnalysis
  intakeAnswers: Record<string, string>
  setIntakeAnswers: (v: Record<string, string>) => void
  onGenerate: () => void
  loading: boolean
}) {
  function setAnswer(id: string, v: string) { setIntakeAnswers({ ...intakeAnswers, [id]: v }) }

  return (
    <div className="space-y-4">
      <SectionCard title="AI Analysis">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="px-3 py-1 bg-neutral-100 rounded-full text-xs font-semibold text-neutral-700">{analysis.businessType}</div>
            <p className="text-sm text-neutral-600">{analysis.businessTypeReason}</p>
          </div>
          {analysis.assumptions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-amber-800 mb-1.5">Assumptions ที่ระบบจะใช้</div>
              <ul className="space-y-1">{analysis.assumptions.map((a, i) => (
                <li key={i} className="text-xs text-amber-700 flex gap-1.5"><span className="text-amber-400 shrink-0">•</span>{a}</li>
              ))}</ul>
            </div>
          )}
          {analysis.missingCritical.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <XCircle size={12} className="shrink-0" />
              ข้อมูลที่ขาด: {analysis.missingCritical.join(', ')}
            </div>
          )}
        </div>
      </SectionCard>

      {analysis.questions.length > 0 && (
        <SectionCard title="คำถามเพิ่มเติม (ตอบให้ครบเพื่อผลลัพธ์ที่ดีขึ้น)">
          <div className="space-y-4">
            {analysis.questions.map(q => (
              <div key={q.id}>
                <label className="block text-sm text-neutral-700 mb-1.5">
                  {q.question}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {q.type === 'text' ? (
                  <input value={intakeAnswers[q.id] ?? ''} onChange={e => setAnswer(q.id, e.target.value)}
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200" />
                ) : q.type === 'yesno' ? (
                  <div className="flex gap-2">
                    {['ใช่', 'ไม่ใช่'].map(opt => (
                      <button key={opt} onClick={() => setAnswer(q.id, opt)}
                        className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${intakeAnswers[q.id] === opt ? 'bg-neutral-950 text-white border-neutral-950' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(q.options ?? []).map(opt => (
                      <button key={opt} onClick={() => setAnswer(q.id, opt)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${intakeAnswers[q.id] === opt ? 'bg-neutral-950 text-white border-neutral-950' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="flex gap-3">
        <Btn onClick={onGenerate} loading={loading}>
          <Zap size={13} /> Generate Google Ads Media Plan
        </Btn>
        {!analysis.canProceed && !loading && (
          <p className="text-xs text-amber-600 self-center">ข้อมูลยังไม่ครบ — ระบบจะใช้ assumptions แทน</p>
        )}
      </div>
    </div>
  )
}

// ── Budget Editor ──────────────────────────────────────────────────────────────

type CampaignBudgetRow = { key: string; type: string; name: string; funnel: string; kpi: string; monthly: number }

function BudgetEditor({ plan, onPlanChange }: { plan: MediaPlanStrategy; onPlanChange?: (p: MediaPlanStrategy) => void }) {
  const totalBudget = plan.intakeSummary.monthlyBudget
  const alloc = plan.budgetAllocation

  const lookup = (key: string) => {
    const k = key.toLowerCase()
    return alloc.find(a => a.campaignType.toLowerCase().includes(k) || k.includes(a.campaignType.toLowerCase()))
  }

  const buildRows = (): CampaignBudgetRow[] => {
    const rows: CampaignBudgetRow[] = []

    // Scale budgetAllocation to match actual totalBudget from Step 1
    const allocTotal = alloc.reduce((s, a) => s + a.monthlyBudget, 0)
    const scaleFactor = allocTotal > 0 ? totalBudget / allocTotal : 1

    const push = (
      campaigns: { name: string; funnelStage?: string; monthlyBudget?: number; budgetPct?: number }[],
      type: string, allocKeys: string[], fallbackPct: number, defaultFunnel: string, defaultKpi: string,
    ) => {
      if (campaigns.length === 0) return
      const a = allocKeys.reduce<BudgetAlloc | undefined>((found, k) => found ?? lookup(k), undefined)
      campaigns.forEach((c, i) => {
        // Scale alloc budget to match Step 1 total, or use fallback %
        const typeMonthly = a
          ? Math.round(a.monthlyBudget * scaleFactor)
          : Math.round(totalBudget * fallbackPct)

        // ใช้งบที่ user เคยแก้ไว้ก่อน (sync กลับมาจาก handleChange) — ค่อย fallback สูตรแบ่ง
        let monthly = (c.monthlyBudget ?? 0) > 0 ? c.monthlyBudget! : 0

        if (!monthly) {
          if (type === 'search' && campaigns.length > 1) {
            const themeField = (c as { theme?: string }).theme?.toLowerCase() ?? ''
            const nameLC = c.name.toLowerCase()
            const isBrand = themeField === 'brand' || nameLC.includes('brand') || nameLC.includes('| brand') || nameLC.includes('- brand')
            const brandCount = campaigns.filter(x => {
              const tf = (x as { theme?: string }).theme?.toLowerCase() ?? ''
              const nl = x.name.toLowerCase()
              return tf === 'brand' || nl.includes('brand') || nl.includes('| brand') || nl.includes('- brand')
            }).length
            const nonBrandCount = Math.max(campaigns.length - brandCount, 1)
            if (isBrand) {
              monthly = Math.round(typeMonthly * 0.3 / Math.max(brandCount, 1))
            } else {
              monthly = Math.round(typeMonthly * 0.7 / nonBrandCount)
            }
          } else {
            monthly = Math.round(typeMonthly / campaigns.length)
          }
        }
        rows.push({ key: `${type}-${i}`, type, name: c.name, funnel: c.funnelStage ?? a?.funnelStage ?? defaultFunnel, kpi: a?.mainKpi ?? defaultKpi, monthly })
      })
    }
    push(plan.campaignStructure.search, 'search', ['search'], 0.6, 'Conversion', 'CTR, CPA')
    push(plan.campaignStructure.pmax, 'pmax', ['performance', 'pmax', 'performance max'], 0.2, 'Full Funnel', 'ROAS, Conv.')
    push(plan.campaignStructure.remarketing, 'remarketing', ['remarketing', 'display'], 0.15, 'Retention', 'CTR, Conv. Rate')
    push(plan.campaignStructure.demandGen ?? [], 'demandGen', ['demand gen', 'demand_gen', 'video'], 0.1, 'Consideration', 'Views, Engagement')
    // Normalize: force rows to sum exactly to totalBudget
    if (rows.length > 0 && totalBudget > 0) {
      const rowTotal = rows.reduce((s, r) => s + r.monthly, 0)
      if (rowTotal > 0 && rowTotal !== totalBudget) {
        const factor = totalBudget / rowTotal
        rows.forEach(r => { r.monthly = Math.round(r.monthly * factor) })
        // Fix rounding leftover on last row
        const diff = totalBudget - rows.reduce((s, r) => s + r.monthly, 0)
        rows[rows.length - 1].monthly += diff
      }
    }
    return rows
  }

  const syncToplan = React.useCallback((computedRows: CampaignBudgetRow[]) => {
    if (!onPlanChange) return
    const updatedPlan = { ...plan, campaignStructure: { ...plan.campaignStructure } }
    computedRows.filter(r => r.type === 'search').forEach((r, i) => {
      if (updatedPlan.campaignStructure.search[i]) updatedPlan.campaignStructure.search[i] = { ...updatedPlan.campaignStructure.search[i], monthlyBudget: r.monthly }
    })
    computedRows.filter(r => r.type === 'pmax').forEach((r, i) => {
      if (updatedPlan.campaignStructure.pmax[i]) updatedPlan.campaignStructure.pmax[i] = { ...updatedPlan.campaignStructure.pmax[i], monthlyBudget: r.monthly }
    })
    computedRows.filter(r => r.type === 'remarketing').forEach((r, i) => {
      if (updatedPlan.campaignStructure.remarketing[i]) updatedPlan.campaignStructure.remarketing[i] = { ...updatedPlan.campaignStructure.remarketing[i], monthlyBudget: r.monthly }
    })
    computedRows.filter(r => r.type === 'demandGen').forEach((r, i) => {
      if (updatedPlan.campaignStructure.demandGen?.[i]) updatedPlan.campaignStructure.demandGen![i] = { ...updatedPlan.campaignStructure.demandGen![i], monthlyBudget: r.monthly }
    })
    onPlanChange(updatedPlan)
  }, [plan, onPlanChange])

  const initialRows = buildRows()
  const [rows, setRows] = useState<CampaignBudgetRow[]>(initialRows)

  // Sync computed budgets into plan on first render
  React.useEffect(() => { syncToplan(initialRows) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-init rows when plan prop changes from outside — ห้ามเรียก syncToplan ตรงนี้ จะ loop
  const prevPlanRef = React.useRef(plan)
  if (prevPlanRef.current !== plan) {
    prevPlanRef.current = plan
    const next = buildRows()
    if (JSON.stringify(next) !== JSON.stringify(rows)) {
      setRows(next)
    }
  }

  const handleChange = (key: string, value: number) => {
    const next = rows.map(r => r.key === key ? { ...r, monthly: value } : r)
    setRows(next)
    syncToplan(next)
  }

  if (rows.length === 0) {
    return <CleanTable headers={['Campaign Type', 'Funnel', 'Budget/Month', 'Daily', 'KPI']} rows={
      alloc.map(a => [a.campaignType, a.funnelStage, `฿${a.monthlyBudget.toLocaleString()}`, `฿${a.dailyBudget.toLocaleString()}`, a.mainKpi])
    } />
  }

  const totalUsed = rows.reduce((s, r) => s + r.monthly, 0)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="text-left py-2 px-2 text-neutral-400 font-medium">Campaign Name</th>
              <th className="text-left py-2 px-2 text-neutral-400 font-medium">Funnel</th>
              <th className="text-right py-2 px-2 text-neutral-400 font-medium">Budget/Month</th>
              <th className="text-right py-2 px-2 text-neutral-400 font-medium">Daily</th>
              <th className="text-left py-2 px-2 text-neutral-400 font-medium">KPI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-neutral-50">
                <td className="py-2 px-2 text-neutral-700 leading-tight">{r.name}</td>
                <td className="py-2 px-2 text-neutral-500">{r.funnel}</td>
                <td className="py-2 px-2 text-right">
                  {onPlanChange ? (
                    <input
                      type="number"
                      value={r.monthly}
                      onChange={e => handleChange(r.key, Math.max(0, Number(e.target.value)))}
                      className="w-24 text-right border border-neutral-200 rounded-lg px-2 py-1 text-xs font-semibold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <span className="font-semibold text-neutral-800">฿{r.monthly.toLocaleString()}</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right text-neutral-500">฿{Math.round(r.monthly / 30).toLocaleString()}</td>
                <td className="py-2 px-2 text-neutral-500">{r.kpi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`text-xs flex justify-between pt-1 ${totalUsed > totalBudget ? 'text-red-500' : 'text-neutral-400'}`}>
        <span>รวม ฿{totalUsed.toLocaleString()}</span>
        <span>งบทั้งหมด ฿{totalBudget.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ── Step 3: Strategy ───────────────────────────────────────────────────────────

// เพิ่มแคมเปญเองเมื่อ AI แนะนำมาไม่ครบ — งบของ type เดิมจะถูกแบ่งเฉลี่ยให้ตัวใหม่อัตโนมัติ
// (buildCampaignRows หาร typeMonthly ด้วยจำนวนแคมเปญใน type นั้นอยู่แล้ว)
function AddCampaignInline({ plan, onPlanChange }: { plan: MediaPlanStrategy; onPlanChange?: (p: MediaPlanStrategy) => void }) {
  const [type, setType] = useState<'search' | 'pmax' | 'remarketing' | 'demandGen'>('search')
  const [name, setName] = useState('')
  if (!onPlanChange) return null
  const add = () => {
    const n = name.trim()
    if (!n) return
    const cs = { ...plan.campaignStructure }
    if (type === 'search')           cs.search      = [...cs.search, { name: n, theme: 'Generic', adGroups: ['Ad Group 1'], keywordThemes: [] }]
    else if (type === 'pmax')        cs.pmax        = [...cs.pmax, { name: n, assetGroups: ['Asset Group 1'], audienceSignals: [] }]
    else if (type === 'remarketing') cs.remarketing = [...cs.remarketing, { name: n, audience: 'All Website Visitors (30d)', lookbackWindow: 30, messageAngle: 'กลับมาดูสินค้า/บริการอีกครั้ง' }]
    else                             cs.demandGen   = [...(cs.demandGen ?? []), { name: n, audience: 'In-Market ที่เกี่ยวข้อง', creativeAngle: 'Benefit-first', funnelStage: 'Consideration' }]
    onPlanChange({ ...plan, campaignStructure: cs })
    setName('')
  }
  return (
    <div className="border border-dashed border-neutral-300 rounded-xl p-3 mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-neutral-500">เพิ่มแคมเปญ (กรณี AI แนะนำมาไม่ครบ):</span>
        <select value={type} onChange={e => setType(e.target.value as typeof type)}
          className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
          <option value="search">Search</option>
          <option value="pmax">Performance Max</option>
          <option value="remarketing">Remarketing</option>
          <option value="demandGen">Demand Gen</option>
        </select>
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="ชื่อแคมเปญ เช่น SEM - Generic - กรุงเทพ"
          className="flex-1 min-w-[220px] text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-200" />
        <button onClick={add} disabled={!name.trim()}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-40">
          + เพิ่ม
        </button>
      </div>
      <p className="text-[10px] text-neutral-400 mt-1.5">งบของประเภทเดียวกันจะถูกแบ่งเฉลี่ยให้แคมเปญใหม่อัตโนมัติ — ปรับสัดส่วนได้ที่ Budget Details</p>
    </div>
  )
}

function StepStrategy({ plan, onPlanChange }: { plan: MediaPlanStrategy; onPlanChange?: (p: MediaPlanStrategy) => void }) {
  const alloc = plan.budgetAllocation

  return (
    <div className="space-y-4">
      <SectionCard title="Business Type & Strategy">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-3 py-1 bg-neutral-100 rounded-full text-xs font-semibold text-neutral-700">{plan.businessType}</span>
        </div>
        <p className="text-sm leading-7 text-neutral-600">{plan.recommendedStrategy}</p>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Budget Allocation">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alloc.map(a => ({ name: a.campaignType, pct: a.budgetPct }))}>
                <CartesianGrid vertical={false} stroke="#f5f5f5" />
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`, 'Budget']} />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                  {alloc.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Split">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={alloc.map(a => ({ name: a.campaignType, value: a.budgetPct }))}
                  dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {alloc.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v}%`, 'Budget']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center">
            {alloc.map((a, i) => (
              <span key={a.campaignType} className="flex items-center gap-1 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {a.campaignType} {a.budgetPct}%
              </span>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Campaign Structure — Google Ads">
        <div className="space-y-4">
          {plan.campaignStructure.search.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Search Campaigns</div>
              <CleanTable headers={['Campaign Name', 'Theme', 'Ad Groups', 'Keyword Themes']} rows={
                plan.campaignStructure.search.map(c => [c.name, c.theme, c.adGroups.join(', '), c.keywordThemes.join(', ')])
              } />
            </div>
          )}
          {plan.campaignStructure.pmax.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Performance Max</div>
              <CleanTable headers={['Campaign Name', 'Asset Groups', 'Audience Signals']} rows={
                plan.campaignStructure.pmax.map(c => [c.name, c.assetGroups.join(', '), c.audienceSignals.join(', ')])
              } />
            </div>
          )}
          {plan.campaignStructure.remarketing.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Remarketing</div>
              <CleanTable headers={['Campaign Name', 'Audience', 'Lookback', 'Message Angle']} rows={
                plan.campaignStructure.remarketing.map(c => [c.name, c.audience, `${c.lookbackWindow} วัน`, c.messageAngle])
              } />
            </div>
          )}
          {(plan.campaignStructure.demandGen ?? []).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Demand Gen</div>
              <CleanTable headers={['Campaign Name', 'Audience', 'Creative Angle', 'Funnel']} rows={
                (plan.campaignStructure.demandGen ?? []).map(c => [c.name, c.audience, c.creativeAngle, c.funnelStage])
              } />
            </div>
          )}
          <AddCampaignInline plan={plan} onPlanChange={onPlanChange} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Budget Details">
          <BudgetEditor plan={plan} onPlanChange={onPlanChange} />
        </SectionCard>
        <SectionCard title="Measurement Plan">
          <div className="space-y-2 text-sm">
            <div><span className="text-neutral-400 text-xs">Primary Conversion</span><p className="text-neutral-800 font-medium">{plan.measurementPlan.primaryConversion}</p></div>
            <div><span className="text-neutral-400 text-xs">Secondary</span><p className="text-neutral-700">{plan.measurementPlan.secondaryConversion}</p></div>
            <div className="flex items-center gap-1.5">
              <StatusBadge status={plan.intakeSummary.trackingStatus} />
              <span className="text-xs text-neutral-500">Tracking</span>
              <StatusBadge status={plan.intakeSummary.remarketingReadiness} />
              <span className="text-xs text-neutral-500">Remarketing</span>
            </div>
            {plan.measurementPlan.trackingRisks.length > 0 && (
              <ul className="space-y-1 pt-1">{plan.measurementPlan.trackingRisks.filter(Boolean).map((r, i) => (
                <li key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">{r}</li>
              ))}</ul>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Funnel Mapping">
        <CleanTable headers={['Funnel Stage', 'Audience', 'Campaign Type', 'Message Angle', 'Conversion Goal']} rows={
          plan.funnelMapping.map(f => [f.funnelStage, f.audience, f.campaignType, f.messageAngle, f.conversionGoal])
        } />
      </SectionCard>
    </div>
  )
}

// ── Step 5: Plan Preview ───────────────────────────────────────────────────────

const TYPE_BADGE_COLOR: Record<string, string> = {
  SEARCH:          'bg-blue-100 text-blue-700',
  PMAX:            'bg-orange-100 text-orange-800',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-800',
  REMARKETING:     'bg-purple-100 text-purple-700',
  DISPLAY:         'bg-teal-100 text-teal-700',
  DEMAND_GEN:      'bg-pink-100 text-pink-700',
  VIDEO:           'bg-red-100 text-red-700',
  SHOPPING:        'bg-emerald-100 text-emerald-700',
}

function PlanTypeBadge({ type }: { type: string }) {
  const cls = TYPE_BADGE_COLOR[type] ?? 'bg-gray-100 text-gray-600'
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{type}</span>
}

interface CampaignRow {
  name: string; type: string; monthly: number; daily: number; pct: number; kpi: string
  funnel: string; role: string
  keywords: KwIdea[]; searchThemes: string[]
  remarketing: string[]; inMarket: string[]; customIntent: string[]
}

// Build per-campaign rows merging strategy + research.
// Shared by the on-screen preview, the HTML/CSV export, and the save path so that
// what gets persisted (campaignMix) always matches what the user exported.
function buildCampaignRows(plan: MediaPlanStrategy, research: CampaignResearch[]): CampaignRow[] {
  const alloc = plan.budgetAllocation
  const totalBudget = plan.intakeSummary.monthlyBudget
  const rows: CampaignRow[] = []

  {
    const allocByType = (type: string) => {
      const t = type.toLowerCase()
      return alloc.find(a =>
        a.campaignType.toLowerCase().includes(t) ||
        t.includes(a.campaignType.toLowerCase())
      )
    }

    const researchFor = (name: string) => research.find(r => r.campaignName === name)

    // Helper: split type budget equally among N campaigns of the same type
    const pushGroup = (
      campaigns: { name: string; funnelStage?: string; keywordThemes?: string[]; monthlyBudget?: number; budgetPct?: number }[],
      type: string,
      allocKeys: string[],
      fallbackPct: number,
      defaultFunnel: string, defaultKpi: string, defaultRole: string,
      getAudienceData: (r: typeof research[0] | undefined) => {
        keywords: typeof rows[0]['keywords']
        searchThemes: string[]
        remarketing: string[]
        inMarket: string[]
        customIntent: string[]
      },
    ) => {
      if (campaigns.length === 0) return
      const a = allocKeys.reduce<BudgetAlloc | undefined>((found, k) => found ?? allocByType(k), undefined)
      const typeMonthly = a?.monthlyBudget ?? Math.round(totalBudget * fallbackPct)
      // ถ้า user แก้งบรายแคมเปญไว้ (BudgetEditor เขียน c.monthlyBudget) → ใช้เป็น "สัดส่วน"
      // เทียบกันเองในกลุ่ม แล้ว scale ให้รวมเท่า typeMonthly — เคารพ 14000/6000 ที่แก้ และไม่ double-scale
      const sumOwn = campaigns.reduce((t, x) => t + (x.monthlyBudget ?? 0), 0)
      campaigns.forEach(c => {
        const r = researchFor(c.name)
        const aud = getAudienceData(r)
        const monthly = sumOwn > 0
          ? Math.round(typeMonthly * ((c.monthlyBudget ?? 0) / sumOwn))
          : Math.round(typeMonthly / campaigns.length)
        const pct = c.budgetPct ?? Math.round(monthly / totalBudget * 100)
        rows.push({
          name: c.name, type,
          monthly,
          daily: Math.round(monthly / 30),
          pct,
          kpi: a?.mainKpi ?? defaultKpi,
          funnel: c.funnelStage ?? a?.funnelStage ?? defaultFunnel,
          role: a?.strategicRole ?? defaultRole,
          ...aud,
        })
      })
    }

    pushGroup(plan.campaignStructure.search, 'SEARCH', ['search'], 0.6, 'Conversion', 'CTR, CPA', 'Capture demand',
      r => ({
        keywords: r?.keywords.filter(k => k.selected) ?? [],
        searchThemes: [],
        remarketing: r?.pmaxSignal.audienceSignals.remarketing ?? [],
        inMarket: r?.pmaxSignal.audienceSignals.inMarket ?? [],
        customIntent: [],
      }))

    pushGroup(plan.campaignStructure.pmax, 'PMAX', ['performance', 'pmax', 'performance max'], 0.25, 'Full Funnel', 'ROAS, Conv.', 'Automated reach',
      r => ({
        keywords: [],
        searchThemes: r?.searchThemes ?? r?.pmaxSignal.audienceSignals.searchThemes ?? [],
        remarketing: r?.pmaxSignal.audienceSignals.remarketing ?? [],
        inMarket: r?.pmaxSignal.audienceSignals.inMarket ?? [],
        customIntent: r?.pmaxSignal.audienceSignals.customIntent ?? [],
      }))

    pushGroup(plan.campaignStructure.remarketing, 'REMARKETING', ['remarketing', 'display'], 0.15, 'Retention', 'CTR, Conv. Rate', 'Re-engage visitors',
      r => ({
        keywords: [],
        searchThemes: [],
        remarketing: r?.pmaxSignal.audienceSignals.remarketing ?? [],
        inMarket: r?.pmaxSignal.audienceSignals.inMarket ?? [],
        customIntent: [],
      }))

    pushGroup(plan.campaignStructure.demandGen ?? [], 'DEMAND_GEN', ['demand gen', 'demand_gen', 'video'], 0.1, 'Awareness', 'Reach, Engagement', 'Build demand',
      r => ({
        keywords: [],
        searchThemes: [],
        remarketing: r?.pmaxSignal.audienceSignals.remarketing ?? [],
        inMarket: r?.pmaxSignal.audienceSignals.inMarket ?? [],
        customIntent: [],
      }))

    // fallback: use budgetAllocation if no campaign structure
    if (rows.length === 0) {
      alloc.forEach(a => rows.push({
        name: a.campaignType, type: a.campaignType.toUpperCase(),
        monthly: a.monthlyBudget, daily: a.dailyBudget, pct: a.budgetPct,
        kpi: a.mainKpi, funnel: a.funnelStage, role: a.strategicRole,
        keywords: [], searchThemes: [], remarketing: [], inMarket: [], customIntent: [],
      }))
    }
    // Normalize: force rows to sum exactly to totalBudget
    if (rows.length > 0 && totalBudget > 0) {
      const rowTotal = rows.reduce((s, r) => s + r.monthly, 0)
      if (rowTotal > 0 && rowTotal !== totalBudget) {
        const factor = totalBudget / rowTotal
        rows.forEach(r => { r.monthly = Math.round(r.monthly * factor); r.daily = Math.round(r.monthly / 30) })
        const diff = totalBudget - rows.reduce((s, r) => s + r.monthly, 0)
        rows[rows.length - 1].monthly += diff
        rows[rows.length - 1].daily = Math.round(rows[rows.length - 1].monthly / 30)
      }
    }
    // Keep pct consistent with the final (normalized) monthly budget
    if (totalBudget > 0) {
      rows.forEach(r => { r.pct = Math.round(r.monthly / totalBudget * 100) })
    }
    return rows
  }
}

const MIX_TYPE_MAP: Record<string, CampaignMixItem['type']> = {
  SEARCH:      'SEARCH',
  PMAX:        'PERFORMANCE_MAX',
  REMARKETING: 'DISPLAY',
  DEMAND_GEN:  'DEMAND_GEN',
}

// Convert the strategy into the flat campaignMix[] shape that the saved plan
// (planJson) and the [id]/preview + [id]/build pages consume.
function buildCampaignMix(plan: MediaPlanStrategy, research: CampaignResearch[]): CampaignMixItem[] {
  return buildCampaignRows(plan, research).map(r => ({
    campaignName:        r.name,
    type:                MIX_TYPE_MAP[r.type] ?? 'SEARCH',
    monthlyBudget:       r.monthly,
    dailyBudget:         r.daily,
    budgetPercent:       r.pct,
    objective:           r.funnel,
    targetCPA:           0,
    expectedClicks:      0,
    expectedImpressions: 0,
    expectedConversions: 0,
    bidStrategy:         '',
    networks:            [],
    targeting:           { locations: [], languages: [], devices: [] },
    keywords:            r.keywords,
    searchThemes:        r.searchThemes,
    remarketing:         r.remarketing,
    inMarket:            r.inMarket,
    customIntent:        r.customIntent,
  }))
}

function StepOutput({ plan, research, lang, setLang }: {
  plan: MediaPlanStrategy
  research: CampaignResearch[]
  lang: Language
  setLang: (l: Language) => void
}) {
  const alloc = plan.budgetAllocation
  const totalBudget = plan.intakeSummary.monthlyBudget
  const [copied, setCopied] = useState(false)

  const campaignRows = buildCampaignRows(plan, research)

  function handleCopy() {
    const lines = [
      `Media Plan — ${plan.businessType}`,
      `งบประมาณ: ฿${totalBudget.toLocaleString()}/เดือน`,
      '',
      plan.executiveSummary,
      '',
      'Campaign Plan:',
      ...campaignRows.map(c => `• [${c.type}] ${c.name}: ฿${c.monthly.toLocaleString()}/เดือน (${c.pct}%) — ${c.kpi}`),
    ]
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  function handleExport() {
    const date = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

    // ── SVG bar chart (Budget Allocation) ──────────────────────────────────────
    const BAR_COLORS = ['#6366f1','#22d3ee','#f59e0b','#10b981','#ef4444','#8b5cf6']
    const maxPct = Math.max(...alloc.map(a => a.budgetPct), 1)
    const barW = 60; const barGap = 24; const chartH = 160; const labelH = 20
    const svgW = alloc.length * (barW + barGap) + barGap
    const barChartSvg = `<svg width="${svgW}" height="${chartH + labelH + 8}" xmlns="http://www.w3.org/2000/svg">
      ${alloc.map((a, i) => {
        const x = barGap + i * (barW + barGap)
        const h = Math.round((a.budgetPct / maxPct) * chartH)
        const y = chartH - h
        const col = BAR_COLORS[i % BAR_COLORS.length]
        return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${col}"/>
        <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#374151" font-weight="600">${a.budgetPct}%</text>
        <text x="${x + barW / 2}" y="${chartH + labelH}" text-anchor="middle" font-size="9" fill="#9ca3af">${a.campaignType}</text>`
      }).join('')}
    </svg>`

    // ── SVG donut chart (Split) ────────────────────────────────────────────────
    const cx = 90; const cy = 90; const R = 65; const r = 38
    let startAngle = -Math.PI / 2
    const totalPct = alloc.reduce((s, a) => s + a.budgetPct, 0) || 100
    const piePaths = alloc.map((a, i) => {
      const angle = (a.budgetPct / totalPct) * 2 * Math.PI
      const endAngle = startAngle + angle
      const x1 = cx + R * Math.cos(startAngle); const y1 = cy + R * Math.sin(startAngle)
      const x2 = cx + R * Math.cos(endAngle);   const y2 = cy + R * Math.sin(endAngle)
      const ix1 = cx + r * Math.cos(startAngle); const iy1 = cy + r * Math.sin(startAngle)
      const ix2 = cx + r * Math.cos(endAngle);   const iy2 = cy + r * Math.sin(endAngle)
      const large = angle > Math.PI ? 1 : 0
      const col = BAR_COLORS[i % BAR_COLORS.length]
      const d = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large},0 ${ix1},${iy1} Z`
      startAngle = endAngle
      return `<path d="${d}" fill="${col}" stroke="white" stroke-width="2"/>`
    }).join('')
    const legendItems = alloc.map((a, i) =>
      `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;color:#6b7280">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${BAR_COLORS[i % BAR_COLORS.length]}"></span>
        ${a.campaignType} ${a.budgetPct}%
      </span>`
    ).join('')
    const pieChartSvg = `<svg width="180" height="180" xmlns="http://www.w3.org/2000/svg">${piePaths}</svg>`

    // ── keyword table HTML ─────────────────────────────────────────────────────
    const matchBadge = (m: string) => {
      const colors: Record<string, string> = { EXACT: '#dbeafe:#1d4ed8', PHRASE: '#ede9fe:#6d28d9', BROAD: '#fff7ed:#c2410c' }
      const [bg, fg] = (colors[m] ?? '#f3f4f6:#374151').split(':')
      return `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;background:${bg};color:${fg}">${m[0]}</span>`
    }
    const compColor = (c: string) => ({ LOW: '#059669', MEDIUM: '#d97706', HIGH: '#dc2626' }[c] ?? '#374151')
    const chipHtml = (items: string[], bg: string, fg: string) =>
      items.map(s => `<span style="display:inline-block;margin:2px;background:${bg};color:${fg};font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid ${bg}">${s}</span>`).join('')

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>Media Plan — ${plan.businessType}</title>
<style>
  *{box-sizing:border-box}
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');body{font-family:'Noto Sans Thai',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:#1f2937;padding:40px;max-width:1040px;margin:0 auto;background:#fff}
  h1{font-size:24px;font-weight:800;margin:0 0 4px;color:#111827}
  h2{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin:36px 0 12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb}
  h3{font-size:13px;font-weight:700;margin:0 0 6px;color:#111827}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
  th{text-align:left;padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb}
  td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;color:#374151}
  tr:last-child td{border-bottom:none}
  .card{border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:14px;background:#fff}
  .card-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #f3f4f6}
  .badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;display:inline-block;white-space:nowrap}
  .badge-search{background:#dbeafe;color:#1d4ed8}
  .badge-pmax{background:#ede9fe;color:#6d28d9}
  .badge-display{background:#dcfce7;color:#166534}
  .badge-remarketing{background:#fae8ff;color:#86198f}
  .badge-demand_gen{background:#fff7ed;color:#c2410c}
  .badge-default{background:#f3f4f6;color:#374151}
  .section-label{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
  .chip-table{width:100%;border-collapse:collapse;font-size:11px}
  .chip-table th{padding:6px 10px;background:#f9fafb;font-size:10px}
  .chip-table td{padding:6px 10px;border-bottom:1px solid #f9fafb}
  .risk-box{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;font-size:12px;color:#92400e;margin-bottom:8px}
  .footer{margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
  .meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:0}
  .meta-cell{padding:12px 16px;border-right:1px solid #e5e7eb}
  .meta-cell:last-child{border-right:none}
  .meta-label{font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:4px}
  .meta-value{font-size:13px;font-weight:700;color:#111827}
  .tfoot-row td{background:#f9fafb;font-weight:700;border-top:2px solid #e5e7eb}
  .kw-neg{color:#dc2626;text-decoration:line-through}
  @media print{body{padding:20px}.card{break-inside:avoid}}
</style>
</head>
<body>

<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px">
  <div>
    <h1>Media Plan</h1>
    <p style="color:#6b7280;font-size:13px;margin:4px 0 0">${plan.businessType}  |  ${date}</p>
  </div>
  <div style="text-align:right;font-size:11px;color:#9ca3af">
    <div style="font-weight:700;color:#6366f1;font-size:13px">Convert Cake</div>
    <div>Agency OS</div>
  </div>
</div>

<h2>Executive Summary</h2>
<p style="line-height:1.9;font-size:13px;color:#374151;margin-bottom:20px">${plan.executiveSummary}</p>
<div class="meta-grid">
  <div class="meta-cell"><div class="meta-label">Business</div><div class="meta-value">${plan.businessType}</div></div>
  <div class="meta-cell"><div class="meta-label">งบ/เดือน</div><div class="meta-value">฿${totalBudget.toLocaleString()}</div></div>
  <div class="meta-cell"><div class="meta-label">Campaigns</div><div class="meta-value">${campaignRows.length}</div></div>
  <div class="meta-cell"><div class="meta-label">Strategy</div><div class="meta-value" style="font-size:11px;font-weight:600;line-height:1.4">${plan.recommendedStrategy}</div></div>
</div>

<h2>Budget Allocation & Split</h2>
<div class="grid2" style="align-items:start">
  <div class="card" style="margin-bottom:0">
    <div class="section-label">Budget Allocation</div>
    <div style="overflow-x:auto">${barChartSvg}</div>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="section-label">Split</div>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      ${pieChartSvg}
      <div style="flex:1">${legendItems}</div>
    </div>
  </div>
</div>

<h2>Budget Overview</h2>
<div class="card" style="padding:0;overflow:hidden">
<table>
  <thead><tr><th>Campaign</th><th>Type</th><th>Funnel</th><th>Role</th><th>Monthly</th><th>Daily</th><th>%</th><th>KPI</th></tr></thead>
  <tbody>
  ${campaignRows.map(c => {
    const bt = c.type.toLowerCase()
    const badgeCls = ['search','pmax','display','remarketing','demand_gen'].includes(bt) ? `badge-${bt}` : 'badge-default'
    const barPct = Math.min(c.pct, 100)
    return `<tr>
      <td><strong>${c.name}</strong></td>
      <td><span class="badge ${badgeCls}">${c.type}</span></td>
      <td>${c.funnel}</td>
      <td style="color:#6b7280;max-width:140px">${c.role}</td>
      <td style="font-weight:700">฿${c.monthly.toLocaleString()}</td>
      <td style="color:#6b7280">฿${c.daily.toLocaleString()}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:48px;height:6px;background:#f3f4f6;border-radius:4px;overflow:hidden">
            <div style="width:${barPct}%;height:100%;background:#6366f1;border-radius:4px"></div>
          </div>
          <span>${c.pct}%</span>
        </div>
      </td>
      <td style="color:#6b7280">${c.kpi}</td>
    </tr>`
  }).join('')}
  </tbody>
  <tfoot>
    <tr class="tfoot-row">
      <td colspan="4">รวม</td>
      <td>฿${campaignRows.reduce((s,c)=>s+c.monthly,0).toLocaleString()}</td>
      <td style="color:#6b7280">฿${campaignRows.reduce((s,c)=>s+c.daily,0).toLocaleString()}</td>
      <td>100%</td><td></td>
    </tr>
  </tfoot>
</table>
</div>

<h2>Campaign Details — Keywords & Audiences</h2>
${campaignRows.map(c => {
  const bt = c.type.toLowerCase()
  const badgeCls = ['search','pmax','display','remarketing','demand_gen'].includes(bt) ? `badge-${bt}` : 'badge-default'
  const kwTable = c.keywords.length > 0 ? `
    <div style="margin-bottom:16px">
      <div class="section-label">🔍 Keywords (${c.keywords.length})</div>
      <table class="chip-table" style="border:1px solid #f3f4f6;border-radius:10px;overflow:hidden">
        <thead><tr>
          <th style="text-align:left">Keyword</th>
          <th style="text-align:center">Match</th>
          <th style="text-align:right">Vol/mo</th>
          <th style="text-align:right">Comp</th>
          <th style="text-align:right">CPC ฿</th>
        </tr></thead>
        <tbody>
        ${c.keywords.map(k => `<tr>
          <td class="${k.isNegative ? 'kw-neg' : ''}">${k.isNegative ? '−' : ''}${k.keyword}</td>
          <td style="text-align:center">${matchBadge(k.matchType)}</td>
          <td style="text-align:right;color:#6b7280">${k.avgMonthlySearches > 0 ? k.avgMonthlySearches.toLocaleString() : '—'}</td>
          <td style="text-align:right;font-weight:700;color:${compColor(k.competition)}">${k.competition}</td>
          <td style="text-align:right;font-weight:600">${k.suggestedCpc > 0 ? k.suggestedCpc.toFixed(0) : '—'}</td>
        </tr>`).join('')}
        ${c.keywords.length > 1 ? `<tr style="background:#f9fafb;font-size:10px;color:#9ca3af">
          <td colspan="2">${c.keywords.length} keywords</td>
          <td style="text-align:right">avg ${Math.round(c.keywords.reduce((s,k)=>s+k.avgMonthlySearches,0)/c.keywords.length).toLocaleString()}</td>
          <td></td>
          <td style="text-align:right">avg ฿${(c.keywords.reduce((s,k)=>s+k.suggestedCpc,0)/c.keywords.length).toFixed(0)}</td>
        </tr>` : ''}
        </tbody>
      </table>
    </div>` : ''

  const audienceSection = (c.searchThemes.length + c.remarketing.length + c.inMarket.length + c.customIntent.length) > 0 ? `
    <div>
      <div class="section-label">👥 Audiences</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${chipHtml(c.searchThemes, '#fff7ed', '#c2410c')}
        ${chipHtml(c.remarketing, '#f5f3ff', '#6d28d9')}
        ${chipHtml(c.inMarket, '#f0fdf4', '#166534')}
        ${chipHtml(c.customIntent, '#eff6ff', '#1e40af')}
      </div>
    </div>` : ''

  return `<div class="card">
    <div class="card-header">
      <span class="badge ${badgeCls}">${c.type}</span>
      <h3 style="flex:1;margin:0">${c.name}</h3>
      <span style="font-size:12px;color:#6b7280">฿${c.monthly.toLocaleString()}/เดือน</span>
      <span style="font-size:11px;font-weight:700;background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:20px">${c.pct}%</span>
    </div>
    ${kwTable}
    ${audienceSection}
    ${!c.keywords.length && !(c.searchThemes.length + c.remarketing.length + c.inMarket.length + c.customIntent.length) ? '<p style="font-size:12px;color:#9ca3af">ยังไม่มีข้อมูล keyword/audience</p>' : ''}
    <div style="margin-top:12px;padding-top:10px;border-top:1px solid #f3f4f6;display:flex;gap:20px;font-size:11px;color:#6b7280">
      <span><strong style="color:#374151">Funnel:</strong> ${c.funnel}</span>
      <span><strong style="color:#374151">KPI:</strong> ${c.kpi}</span>
      <span><strong style="color:#374151">Role:</strong> ${c.role}</span>
    </div>
  </div>`
}).join('')}

<h2>Funnel Mapping</h2>
<div class="card" style="padding:0;overflow:hidden">
<table>
  <thead><tr><th>Funnel Stage</th><th>Audience</th><th>Campaign Type</th><th>Message Angle</th><th>Conversion Goal</th></tr></thead>
  <tbody>${plan.funnelMapping.map(f=>`<tr><td>${f.funnelStage}</td><td>${f.audience}</td><td>${f.campaignType}</td><td>${f.messageAngle}</td><td>${f.conversionGoal}</td></tr>`).join('')}</tbody>
</table>
</div>

<h2>Measurement Plan</h2>
<div class="grid2">
  <div class="card" style="margin-bottom:0">
    <div class="section-label">Primary Conversion</div>
    <p style="font-size:13px;font-weight:600;margin:0">${plan.measurementPlan.primaryConversion}</p>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="section-label">Secondary Conversion</div>
    <p style="font-size:13px;margin:0;color:#374151">${plan.measurementPlan.secondaryConversion}</p>
  </div>
</div>
${plan.measurementPlan.trackingRisks.filter(Boolean).length > 0 ? `
<div style="margin-top:12px">
  <div class="section-label" style="margin-bottom:8px">Tracking Risks</div>
  ${plan.measurementPlan.trackingRisks.filter(Boolean).map(r=>`<div class="risk-box">⚠ ${r}</div>`).join('')}
</div>` : ''}

<h2>Creative Requirements</h2>
<div class="card">
  <div class="grid2">
    <div>
      <div class="section-label">Search RSA</div>
      <p style="font-size:12px;color:#374151;margin:0">${plan.creativeRequirements.searchAds}</p>
    </div>
    <div>
      <div class="section-label">PMax Assets</div>
      <p style="font-size:12px;color:#374151;margin:0">${plan.creativeRequirements.pmaxAssets}</p>
    </div>
  </div>
  ${plan.creativeRequirements.extensions.length > 0 ? `
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid #f3f4f6">
    <div class="section-label">Extensions</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
      ${plan.creativeRequirements.extensions.map(e=>`<span style="font-size:11px;background:#f3f4f6;color:#374151;padding:3px 10px;border-radius:20px">${e}</span>`).join('')}
    </div>
  </div>` : ''}
</div>

<h2>Optimization Roadmap</h2>
<div class="grid3">
  ${[
    { label: 'Week 1–2', color: '#dbeafe:#1e40af', items: plan.optimizationPlan.week1_2 },
    { label: 'Week 3–4', color: '#ede9fe:#4c1d95', items: plan.optimizationPlan.week3_4 },
    { label: 'Month 2+', color: '#f3e8ff:#6d28d9', items: plan.optimizationPlan.month2plus },
  ].map(({ label, color, items }) => {
    const [bg, fg] = color.split(':')
    return `<div class="card" style="margin-bottom:0">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;background:${bg};color:${fg};padding:3px 10px;border-radius:20px;display:inline-block;margin-bottom:10px">${label}</div>
      <ul style="margin:0;padding-left:16px;list-style:none">
        ${items.map(i=>`<li style="font-size:12px;color:#374151;padding:3px 0;display:flex;gap:6px"><span style="color:#9ca3af;margin-top:2px">›</span>${i}</li>`).join('')}
      </ul>
    </div>`
  }).join('')}
</div>

${plan.risks.filter(Boolean).length > 0 ? `
<h2>Risks & Assumptions</h2>
${plan.risks.filter(Boolean).map(r=>`<div class="risk-box">⚠ ${riskToString(r)}</div>`).join('')}` : ''}

<div class="footer">สร้างโดย Convert Cake — เอกสารนี้เป็นความลับ ห้ามเผยแพร่ | ${date}</div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `MediaPlan-${plan.businessType.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalMonthly = campaignRows.reduce((s, c) => s + c.monthly, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-neutral-900">Plan Preview</h3>
        <LanguagePicker value={lang} onChange={setLang} />
      </div>

      {/* ─── Executive Summary ─── */}
      <SectionCard title="Executive Summary">
        <p className="text-[14px] leading-7 text-neutral-700">{plan.executiveSummary}</p>
        <div className="mt-3 flex flex-wrap gap-3 pt-3 border-t border-neutral-100">
          <div className="text-center px-4">
            <p className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wide">Business</p>
            <p className="text-sm font-bold text-neutral-800 mt-0.5">{plan.businessType}</p>
          </div>
          <div className="text-center px-4 border-l border-neutral-100">
            <p className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wide">งบ/เดือน</p>
            <p className="text-sm font-bold text-neutral-800 mt-0.5">฿{totalBudget.toLocaleString()}</p>
          </div>
          <div className="text-center px-4 border-l border-neutral-100">
            <p className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wide">Campaigns</p>
            <p className="text-sm font-bold text-neutral-800 mt-0.5">{campaignRows.length}</p>
          </div>
          <div className="px-4 border-l border-neutral-100 flex-1 min-w-0 text-left">
            <p className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wide">Strategy</p>
            <p className="text-sm font-bold text-neutral-800 mt-0.5 leading-snug whitespace-normal break-words">{plan.recommendedStrategy}</p>
          </div>
        </div>
      </SectionCard>

      {/* ─── Budget Charts (from Step 3) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Budget Allocation">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alloc.map(a => ({ name: a.campaignType, pct: a.budgetPct, monthly: a.monthlyBudget }))} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="#f5f5f5" />
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} unit="%" />
                <Tooltip formatter={(v: number, name: string) => name === 'pct' ? [`${v}%`, 'Budget %'] : [`฿${v.toLocaleString()}`, 'Monthly']} />
                <Bar dataKey="pct" radius={[6,6,0,0]}>
                  {alloc.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Split">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={alloc.map(a => ({ name: a.campaignType, value: a.budgetPct }))}
                  dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={3}>
                  {alloc.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v}%`, 'Budget']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center">
            {alloc.map((a, i) => (
              <span key={a.campaignType} className="flex items-center gap-1 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {a.campaignType} {a.budgetPct}%
              </span>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ─── Budget Overview ─── */}
      <SectionCard title="Budget Overview">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-100">
                {['Campaign', 'Type', 'Funnel', 'Role', 'Monthly', 'Daily', '%', 'KPI'].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold text-neutral-400 uppercase tracking-wide text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaignRows.map((c, i) => (
                <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                  <td className="py-2.5 px-2 font-medium text-neutral-800 max-w-[180px] truncate">{c.name}</td>
                  <td className="py-2.5 px-2"><PlanTypeBadge type={c.type} /></td>
                  <td className="py-2.5 px-2 text-neutral-500">{c.funnel}</td>
                  <td className="py-2.5 px-2 text-neutral-500 max-w-[120px] truncate">{c.role}</td>
                  <td className="py-2.5 px-2 font-semibold text-neutral-800">฿{c.monthly.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-neutral-500">฿{c.daily.toLocaleString()}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                      </div>
                      <span className="text-neutral-500">{c.pct}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-neutral-500">{c.kpi}</td>
                </tr>
              ))}
              <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200">
                <td className="py-2.5 px-2 text-neutral-700" colSpan={4}>รวม</td>
                <td className="py-2.5 px-2 text-neutral-900">฿{totalMonthly.toLocaleString()}</td>
                <td className="py-2.5 px-2 text-neutral-500">฿{campaignRows.reduce((s, c) => s + c.daily, 0).toLocaleString()}</td>
                <td className="py-2.5 px-2 text-neutral-700">100%</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        {totalMonthly > totalBudget * 1.02 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} /> งบรวม ฿{totalMonthly.toLocaleString()} เกินที่ตั้งไว้ ฿{totalBudget.toLocaleString()}
          </div>
        )}
      </SectionCard>

      {/* ─── Per-Campaign Detail Cards ─── */}
      <div>
        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-3">Campaign Details — Keywords & Audiences</h4>
        <div className="space-y-4">
          {campaignRows.map((c, i) => {
            const hasKw = c.keywords.length > 0
            const hasThemes = c.searchThemes.length > 0
            const hasRem = c.remarketing.length > 0
            const hasIM = c.inMarket.length > 0
            const hasCI = c.customIntent.length > 0
            const hasAudience = hasRem || hasIM || hasCI || hasThemes
            return (
              <div key={i} className="border border-neutral-200 rounded-2xl overflow-hidden">
                {/* Campaign header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                  <PlanTypeBadge type={c.type} />
                  <span className="text-sm font-semibold text-neutral-800 flex-1">{c.name}</span>
                  <div className="flex items-center gap-3 text-xs text-neutral-500 shrink-0">
                    <span className="font-semibold text-neutral-800">฿{c.monthly.toLocaleString()}/เดือน</span>
                    <span className="bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full font-semibold">{c.pct}%</span>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* ── Keywords Table ── */}
                  {hasKw && (
                    <div>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-2">🔍 Keywords ({c.keywords.length})</p>
                      <div className="rounded-xl border border-neutral-100 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-100">
                              <th className="text-left py-1.5 px-3 font-semibold text-neutral-400 text-[10px] uppercase">Keyword</th>
                              <th className="py-1.5 px-2 font-semibold text-neutral-400 text-[10px] uppercase text-center">Match</th>
                              <th className="py-1.5 px-2 font-semibold text-neutral-400 text-[10px] uppercase text-right">Vol/mo</th>
                              <th className="py-1.5 px-2 font-semibold text-neutral-400 text-[10px] uppercase text-right">Comp</th>
                              <th className="py-1.5 px-2 font-semibold text-neutral-400 text-[10px] uppercase text-right">CPC ฿</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-50">
                            {c.keywords.map((k, j) => (
                              <tr key={j} className="hover:bg-neutral-50">
                                <td className="py-1.5 px-3 font-medium text-neutral-800">{k.keyword}</td>
                                <td className="py-1.5 px-2 text-center">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${MATCH_COLORS[k.matchType]}`}>{k.matchType[0]}</span>
                                </td>
                                <td className="py-1.5 px-2 text-right text-neutral-600 tabular-nums">
                                  {k.avgMonthlySearches > 0 ? k.avgMonthlySearches.toLocaleString() : '—'}
                                </td>
                                <td className={`py-1.5 px-2 text-right font-bold tabular-nums ${COMP_COLORS[k.competition]}`}>
                                  {k.competition}
                                </td>
                                <td className="py-1.5 px-2 text-right text-neutral-700 tabular-nums font-medium">
                                  {k.suggestedCpc > 0 ? k.suggestedCpc.toFixed(0) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {c.keywords.length > 1 && (
                            <tfoot>
                              <tr className="bg-neutral-50 border-t border-neutral-100">
                                <td className="py-1.5 px-3 text-[10px] text-neutral-400 font-semibold" colSpan={2}>{c.keywords.length} keywords</td>
                                <td className="py-1.5 px-2 text-right text-[10px] text-neutral-500 tabular-nums">
                                  avg {Math.round(c.keywords.reduce((s, k) => s + k.avgMonthlySearches, 0) / c.keywords.length).toLocaleString()}
                                </td>
                                <td></td>
                                <td className="py-1.5 px-2 text-right text-[10px] text-neutral-500 tabular-nums">
                                  avg ฿{(c.keywords.reduce((s, k) => s + k.suggestedCpc, 0) / c.keywords.length).toFixed(0)}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ── Audiences (chips) ── */}
                  {hasAudience && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">👥 Audiences</p>
                      <div className="flex flex-wrap gap-1.5">
                        {hasThemes && c.searchThemes.map((t, j) => (
                          <span key={j} className="text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-100 rounded-full px-2.5 py-1">
                            🎯 {t}
                          </span>
                        ))}
                        {hasRem && c.remarketing.map((r, j) => (
                          <span key={j} className="text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2.5 py-1">
                            👤 {r}
                          </span>
                        ))}
                        {hasIM && c.inMarket.map((s, j) => (
                          <span key={j} className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1">
                            📊 {s}
                          </span>
                        ))}
                        {hasCI && c.customIntent.map((s, j) => (
                          <span key={j} className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-1">
                            💡 {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasKw && !hasAudience && (
                    <p className="text-xs text-neutral-400">ยังไม่มีข้อมูล — กลับไปกรอกที่ Step 4</p>
                  )}

                  {/* KPI row */}
                  <div className="pt-2 border-t border-neutral-100 flex flex-wrap gap-4 text-xs text-neutral-500">
                    <span><span className="font-semibold text-neutral-600">Funnel:</span> {c.funnel}</span>
                    <span><span className="font-semibold text-neutral-600">KPI:</span> {c.kpi}</span>
                    <span><span className="font-semibold text-neutral-600">Role:</span> {c.role}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Funnel Mapping ─── */}
      <SectionCard title="Funnel Mapping">
        <CleanTable
          headers={['Funnel Stage', 'Audience', 'Campaign Type', 'Message Angle', 'Conversion Goal']}
          rows={plan.funnelMapping.map(f => [f.funnelStage, f.audience, f.campaignType, f.messageAngle, f.conversionGoal])}
        />
      </SectionCard>

      {/* ─── Measurement ─── */}
      <SectionCard title="Measurement Plan">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Primary Conversion</p>
            <p className="text-neutral-800 font-medium">{plan.measurementPlan.primaryConversion}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Secondary Conversion</p>
            <p className="text-neutral-700">{plan.measurementPlan.secondaryConversion}</p>
          </div>
        </div>
        {plan.measurementPlan.trackingRisks.filter(Boolean).length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
            {plan.measurementPlan.trackingRisks.filter(Boolean).map((r, i) => (
              <li key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1">{r}</li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ─── Creative Requirements ─── */}
      <SectionCard title="Creative Requirements">
        <div className="space-y-3 text-sm text-neutral-700">
          <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">Search RSA</span>{plan.creativeRequirements.searchAds}</div>
          <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">PMax Assets</span>{plan.creativeRequirements.pmaxAssets}</div>
          <div>
            <span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-1">Extensions</span>
            <div className="flex flex-wrap gap-1.5">
              {plan.creativeRequirements.extensions.map((e, i) => (
                <span key={i} className="text-xs bg-neutral-100 text-neutral-600 rounded-full px-2.5 py-0.5">{e}</span>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ─── Optimization Roadmap ─── */}
      <SectionCard title="Optimization Roadmap">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Week 1–2', color: 'text-blue-600 bg-blue-50', items: plan.optimizationPlan.week1_2 },
            { label: 'Week 3–4', color: 'text-indigo-600 bg-indigo-50', items: plan.optimizationPlan.week3_4 },
            { label: 'Month 2+', color: 'text-purple-600 bg-purple-50', items: plan.optimizationPlan.month2plus },
          ].map(({ label, color, items }) => (
            <div key={label}>
              <div className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full inline-block mb-2 ${color}`}>{label}</div>
              <ul className="space-y-1.5">
                {items.map((item, i) => (
                  <li key={i} className="text-xs text-neutral-600 flex gap-1.5">
                    <ChevronRight size={11} className="text-neutral-300 shrink-0 mt-0.5" />{item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ─── Risks ─── */}
      {plan.risks.filter(Boolean).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-900">Risks & Assumptions</span>
          </div>
          <ul className="space-y-1.5">
            {plan.risks.filter(Boolean).map((r, i) => (
              <li key={i} className="text-sm text-amber-800 flex gap-2"><span className="shrink-0">•</span>{riskToString(r)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <Btn onClick={handleCopy}>
          {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
          {copied ? 'Copied!' : 'Copy Summary'}
        </Btn>
        <Btn variant="outline" onClick={handleExport}>
          <Download size={13} />Export Plan (HTML)
        </Btn>
      </div>
    </div>
  )
}

// ── Step 6: Review ─────────────────────────────────────────────────────────────

// ── Step 3.5: Keyword & Audience Research ─────────────────────────────────────

const MATCH_COLORS: Record<string, string> = {
  EXACT: 'bg-blue-100 text-blue-700',
  PHRASE: 'bg-purple-100 text-purple-700',
  BROAD: 'bg-orange-100 text-orange-700',
}
const COMP_COLORS: Record<string, string> = {
  LOW: 'text-emerald-600', MEDIUM: 'text-amber-600', HIGH: 'text-red-600',
}

function emptyPMaxSignal(name: string): PMaxSignal {
  return {
    campaignName: name,
    audienceSignals: {
      customIntent: [], searchThemes: [], customerList: [],
      remarketing: [], inMarket: [],
      demographics: { ageRanges: [], genders: [], householdIncome: [] },
    },
    assetSuggestions: { headlines: [], descriptions: [], imageThemes: [] },
  }
}

function buildCampaignResearchList(plan: MediaPlanStrategy): CampaignResearch[] {
  const list: CampaignResearch[] = []
  plan.campaignStructure.search.forEach(c => list.push({
    campaignName: c.name, campaignType: 'SEARCH',
    keywords: [], searchThemes: c.keywordThemes ?? [],
    pmaxSignal: emptyPMaxSignal(c.name), done: false,
  }))
  plan.campaignStructure.pmax.forEach(c => list.push({
    campaignName: c.name, campaignType: 'PMAX',
    keywords: [], searchThemes: c.audienceSignals ?? [],
    pmaxSignal: emptyPMaxSignal(c.name), done: false,
  }))
  plan.campaignStructure.remarketing.forEach(c => list.push({
    campaignName: c.name, campaignType: 'REMARKETING',
    keywords: [], searchThemes: [],
    pmaxSignal: emptyPMaxSignal(c.name), done: false,
  }))
  ;(plan.campaignStructure.demandGen ?? []).forEach(c => list.push({
    campaignName: c.name, campaignType: 'DEMAND_GEN',
    keywords: [], searchThemes: [],
    pmaxSignal: emptyPMaxSignal(c.name), done: false,
  }))
  return list
}

const REMARKETING_LISTS = [
  'All Website Visitors (30d)',
  'All Website Visitors (90d)',
  'Cart Abandoners',
  'Past Converters',
  'YouTube Viewers',
  'App Users',
  'LINE Click Audience',
  'Similar Audiences',
]

const IN_MARKET_OPTS = [
  'Real Estate > Residential Properties',
  'Financial Services > Personal Loans',
  'Travel > International Travel',
  'Automotive > New Vehicles',
  'Home & Garden > Home Improvement',
  'Beauty & Personal Care',
  'Health & Fitness',
  'Education > Online Courses',
  'Business Services > B2B Services',
  'Retail > Apparel & Accessories',
]

function SimpleAudienceSelector({
  selected, inMarket, onChangeRemarketing, onChangeInMarket, mode,
}: {
  selected: string[]
  inMarket: string[]
  onChangeRemarketing: (v: string[]) => void
  onChangeInMarket: (v: string[]) => void
  mode: 'rlsa' | 'remarketing'
}) {
  function toggle(list: string[], val: string, setter: (v: string[]) => void) {
    setter(list.includes(val) ? list.filter(x => x !== val) : [...list, val])
  }
  function remove(list: string[], val: string, setter: (v: string[]) => void) {
    setter(list.filter(x => x !== val))
  }
  return (
    <div className="space-y-4">
      {/* Selected chips with X */}
      {(selected.length > 0 || inMarket.length > 0) && (
        <div className="space-y-2">
          {selected.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">เลือกแล้ว</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.map(r => (
                  <span key={r} className="inline-flex items-center gap-1 bg-purple-600 text-white text-xs font-medium rounded-full px-2.5 py-1">
                    {r}
                    <button onClick={() => remove(selected, r, onChangeRemarketing)} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {inMarket.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">In-Market เลือกแล้ว</p>
              <div className="flex flex-wrap gap-1.5">
                {inMarket.map(s => (
                  <span key={s} className="inline-flex items-center gap-1 bg-teal-600 text-white text-xs font-medium rounded-full px-2.5 py-1">
                    {s}
                    <button onClick={() => remove(inMarket, s, onChangeInMarket)} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-gray-100 pt-3" />
        </div>
      )}

      {/* Available lists */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">
          {mode === 'rlsa' ? '🎯 RLSA — Remarketing Lists for Search Ads' : '🎯 Remarketing Audiences'}
        </p>
        <div className="flex flex-wrap gap-2">
          {REMARKETING_LISTS.filter(r => !selected.includes(r)).map(r => (
            <button key={r} onClick={() => toggle(selected, r, onChangeRemarketing)}
              className="text-xs px-2.5 py-1 rounded-full border transition-colors font-medium bg-white text-gray-600 border-gray-200 hover:border-purple-400 hover:text-purple-700">
              + {r}
            </button>
          ))}
          {REMARKETING_LISTS.every(r => selected.includes(r)) && (
            <p className="text-xs text-gray-400">เลือกครบแล้ว</p>
          )}
        </div>
      </div>

      {mode === 'remarketing' && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">📊 In-Market Segments</p>
          <div className="flex flex-wrap gap-2">
            {IN_MARKET_OPTS.filter(s => !inMarket.includes(s)).map(s => (
              <button key={s} onClick={() => toggle(inMarket, s, onChangeInMarket)}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors font-medium bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-700">
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected.length === 0 && <p className="text-xs text-gray-400">กดเพื่อเลือก audience list</p>}
      {selected.length > 0 && (
        <p className="text-xs text-emerald-600 font-medium">✓ {selected.length} remarketing{inMarket.length > 0 ? ` · ${inMarket.length} in-market` : ''}</p>
      )}
    </div>
  )
}

// Detect keyword group from campaign name tokens
function detectKwGroupFromName(name: string): 'brand' | 'generic' | 'competitor' | 'service' | null {
  const n = name.toLowerCase()
  if (/brand/i.test(n)) return 'brand'
  if (/competitor|comp\b|kw-c|kwc/i.test(n)) return 'competitor'
  if (/generic|gen\b|broad/i.test(n)) return 'generic'
  if (/service|product|prod\b|sem|search/i.test(n)) return 'service'
  return null
}

const KW_GROUP_LABEL: Record<string, string> = {
  brand: '🏷️ Brand',
  generic: '🌐 Generic',
  competitor: '⚔️ Competitor',
  service: '🛎️ Service',
}

function CampaignResearchCard({
  item, brief, onChange,
}: {
  item: CampaignResearch
  brief: Record<string, string | number>
  onChange: (updated: CampaignResearch) => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'keywords' | 'audience'>('keywords')
  const [loadingKw, setLoadingKw] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(item.campaignName)
  const [newTheme, setNewTheme] = useState('')
  const [manualKw, setManualKw] = useState('')
  const isSearch = item.campaignType === 'SEARCH'
  const isPmax = item.campaignType === 'PMAX'
  const isAudienceOnly = item.campaignType === 'REMARKETING' || item.campaignType === 'DISPLAY' || item.campaignType === 'DEMAND_GEN' || item.campaignType === 'VIDEO'

  // detect keyword group from current campaign name
  const detectedGroup = detectKwGroupFromName(item.campaignName)

  const selectedKw = item.keywords.filter(k => k.selected)
  const doneLabel = isPmax
    ? `${item.pmaxSignal.audienceSignals.searchThemes.length} search themes · ${item.pmaxSignal.audienceSignals.customIntent.length} custom intent`
    : isSearch
    ? `${selectedKw.length} keywords เลือกแล้ว`
    : `Audience configured`

  function saveName() {
    if (nameInput.trim() && nameInput.trim() !== item.campaignName) {
      onChange({ ...item, campaignName: nameInput.trim() })
    }
    setEditingName(false)
  }

  async function generateKeywords() {
    setLoadingKw(true)
    try {
      // Include keywordThemes from Step 3 as seed context for richer results
      const seedThemes = item.searchThemes.length > 0 ? item.searchThemes.join(', ') : ''
      const res = await fetch('/api/keyword-research/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName:   String(brief.businessName ?? 'Business'),
          productService: seedThemes
            ? `${String(brief.productService ?? '')} — keyword themes: ${seedThemes}`
            : String(brief.productService ?? ''),
          location:       String(brief.targetLocation ?? 'ประเทศไทย'),
          objective:      String(brief.objective ?? 'leads'),
          language:       'th',
          competitors:    String(brief.competitors ?? ''),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      const allKw: KwIdea[] = (data.keywords ?? []).map((k: Record<string, unknown>) => ({
        keyword: String(k.keyword ?? ''),
        matchType: (k.matchType as KwIdea['matchType']) ?? 'PHRASE',
        avgMonthlySearches: Number(k.avgMonthlySearches ?? 0),
        competition: (k.competition as KwIdea['competition']) ?? 'MEDIUM',
        suggestedCpc: Number(k.suggestedCpc ?? k.cpcEst ?? 0),
        selected: true,
        group: String(k.group ?? 'service'),
      }))

      // filter by detected group, fall back to all
      const filtered = detectedGroup
        ? allKw.filter(k => (k as KwIdea & { group: string }).group === detectedGroup)
        : allKw
      const ideas = (filtered.length > 0 ? filtered : allKw).slice(0, 50)

      // Also add seed themes as pre-selected keywords if not already present
      const seedAsKw: KwIdea[] = item.searchThemes.map(t => ({
        keyword: t, matchType: 'PHRASE' as const,
        avgMonthlySearches: 0, competition: 'MEDIUM' as const, suggestedCpc: 0, selected: true,
        group: 'service',
      }))

      const existing = new Set(item.keywords.map(k => k.keyword.toLowerCase()))
      const newFromApi   = ideas.filter(k => !existing.has(k.keyword.toLowerCase()))
      const newFromThemes = seedAsKw.filter(k => !existing.has(k.keyword.toLowerCase()) && !newFromApi.some(n => n.keyword.toLowerCase() === k.keyword.toLowerCase()))

      onChange({ ...item, keywords: [...item.keywords, ...newFromThemes, ...newFromApi] })
    } catch (e) { console.error('[kw-generate]', e) }
    finally { setLoadingKw(false) }
  }

  function toggleKw(idx: number) {
    onChange({ ...item, keywords: item.keywords.map((k, i) => i === idx ? { ...k, selected: !k.selected } : k) })
  }

  function removeKw(idx: number) {
    onChange({ ...item, keywords: item.keywords.filter((_, i) => i !== idx) })
  }

  function changeMatchType(idx: number, mt: KwIdea['matchType']) {
    onChange({ ...item, keywords: item.keywords.map((k, i) => i === idx ? { ...k, matchType: mt } : k) })
  }

  function addManualKw() {
    if (!manualKw.trim()) return
    const kw: KwIdea = {
      keyword: manualKw.trim(), matchType: 'PHRASE',
      avgMonthlySearches: 0, competition: 'MEDIUM', suggestedCpc: 0, selected: true,
    }
    onChange({ ...item, keywords: [...item.keywords, kw] })
    setManualKw('')
  }

  function addSearchTheme() {
    if (!newTheme.trim()) return
    onChange({ ...item, searchThemes: [...item.searchThemes, newTheme.trim()] })
    setNewTheme('')
  }

  function markDone() {
    onChange({ ...item, done: true })
    setOpen(false)
  }

  const typeColor: Record<string, string> = {
    SEARCH: 'bg-blue-50 text-blue-700 border-blue-200',
    PMAX: 'bg-orange-50 text-orange-700 border-orange-200',
    REMARKETING: 'bg-purple-50 text-purple-700 border-purple-200',
    DEMAND_GEN: 'bg-pink-50 text-pink-700 border-pink-200',
    DISPLAY: 'bg-teal-50 text-teal-700 border-teal-200',
    VIDEO: 'bg-red-50 text-red-700 border-red-200',
  }
  const tc = typeColor[item.campaignType] ?? 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${item.done ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-200 bg-white'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${tc} shrink-0`}>{item.campaignType}</div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                autoFocus
                onClick={e => e.stopPropagation()}
                className="w-full text-sm font-semibold text-gray-900 border border-blue-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900 truncate">{item.campaignName}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">{doneLabel}</p>
              {detectedGroup && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide">
                  {KW_GROUP_LABEL[detectedGroup]}
                </span>
              )}
            </div>
          </div>
        </button>
        <button
          onClick={e => { e.stopPropagation(); setEditingName(true); setNameInput(item.campaignName); setOpen(true) }}
          className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors shrink-0"
          title="เปลี่ยนชื่อ campaign">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        {item.done && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
        <button onClick={() => setOpen(o => !o)} className="shrink-0 text-gray-400">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100">
          {/* Tab bar */}
          {!isAudienceOnly && (
            <div className="flex border-b border-gray-100 bg-gray-50/60">
              {(['keywords', 'audience'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${tab === t ? 'text-blue-700 border-b-2 border-blue-500 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t === 'keywords' ? (isPmax ? '🎯 Search Themes' : '🔍 Keywords') : '👥 Audience'}
                </button>
              ))}
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Keywords tab — SEARCH */}
            {(tab === 'keywords' || isAudienceOnly) && isSearch && (
              <div className="space-y-3">
                {/* Group hint */}
                {detectedGroup && (
                  <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-700">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>ตรวจพบ <strong>{KW_GROUP_LABEL[detectedGroup]}</strong> จากชื่อ campaign — AI จะดึงเฉพาะ keyword กลุ่มนี้</span>
                  </div>
                )}

                {/* Action bar */}
                <div className="flex gap-2">
                  <input value={manualKw} onChange={e => setManualKw(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addManualKw()}
                    placeholder="เพิ่ม keyword เอง แล้วกด Enter"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <button onClick={addManualKw} disabled={!manualKw.trim()}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" /> เพิ่ม
                  </button>
                  <button onClick={generateKeywords} disabled={loadingKw}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shrink-0">
                    {loadingKw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {loadingKw ? 'กำลังดึง...' : 'AI Research'}
                  </button>
                </div>

                {/* Keyword list */}
                {item.keywords.length > 0 && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    {/* Header row */}
                    <div className="grid grid-cols-[auto_1fr_80px_60px_50px_60px_auto] gap-x-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-2 border-b border-gray-100">
                      <span></span><span>Keyword</span><span className="text-center">Match</span><span className="text-right">Vol/mo</span><span className="text-right">Comp</span><span className="text-right">CPC ฿</span><span></span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                      {item.keywords.map((k, i) => (
                        <div key={i}
                          className={`grid grid-cols-[auto_1fr_80px_60px_50px_60px_auto] gap-x-2 items-center px-3 py-2 text-xs transition-colors ${k.selected ? 'bg-white hover:bg-blue-50/30' : 'bg-gray-50 opacity-50'}`}>
                          <input type="checkbox" checked={k.selected} onChange={() => toggleKw(i)} className="w-3.5 h-3.5 cursor-pointer" />
                          <span className={`font-medium truncate ${k.selected ? 'text-gray-800' : 'text-gray-400'}`}>{k.keyword}</span>
                          {/* Match type selector */}
                          <div className="flex gap-0.5 justify-center">
                            {(['EXACT', 'PHRASE', 'BROAD'] as KwIdea['matchType'][]).map(mt => (
                              <button key={mt} onClick={() => changeMatchType(i, mt)}
                                className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${k.matchType === mt ? MATCH_COLORS[mt] : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                                {mt[0]}
                              </button>
                            ))}
                          </div>
                          <span className="text-right text-gray-500 tabular-nums">{k.avgMonthlySearches > 0 ? k.avgMonthlySearches.toLocaleString() : '—'}</span>
                          <span className={`text-right font-bold tabular-nums ${COMP_COLORS[k.competition]}`}>{k.competition[0]}</span>
                          <span className="text-right text-gray-600 tabular-nums font-medium">{k.suggestedCpc > 0 ? k.suggestedCpc.toFixed(0) : '—'}</span>
                          <button onClick={() => removeKw(i)} className="text-gray-300 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                    {/* Footer summary */}
                    <div className="bg-gray-50 px-3 py-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
                      <span>{selectedKw.length}/{item.keywords.length} เลือก</span>
                      {selectedKw.length > 0 && (
                        <>
                          <span>Avg Vol: {Math.round(selectedKw.reduce((s, k) => s + k.avgMonthlySearches, 0) / selectedKw.length).toLocaleString()}</span>
                          <span>Avg CPC: ฿{(selectedKw.reduce((s, k) => s + k.suggestedCpc, 0) / selectedKw.length).toFixed(0)}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {item.keywords.length === 0 && !loadingKw && (
                  <div className="text-center py-6 text-gray-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">กด <strong>AI Research</strong> เพื่อดึง keyword{detectedGroup ? ` กลุ่ม ${KW_GROUP_LABEL[detectedGroup]}` : ''} จาก Google Keyword Planner</p>
                  </div>
                )}
                {loadingKw && (
                  <div className="text-center py-6 text-blue-500">
                    <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                    <p className="text-xs">กำลังดึงข้อมูลจาก Keyword Planner...</p>
                  </div>
                )}
              </div>
            )}

            {/* Search Themes tab — PMAX */}
            {tab === 'keywords' && isPmax && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Search Themes ช่วย PMax เข้าใจ intent ของผู้ใช้ (max 25 themes)</p>
                <div className="flex gap-2">
                  <input value={newTheme} onChange={e => setNewTheme(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSearchTheme()}
                    placeholder="เช่น บริษัทรับทำ Google Ads"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                  <button onClick={addSearchTheme} disabled={!newTheme.trim()}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> เพิ่ม
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.searchThemes.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 bg-orange-100 text-orange-800 text-xs rounded-full px-2.5 py-1 font-medium">
                      {t}
                      <button onClick={() => onChange({ ...item, searchThemes: item.searchThemes.filter((_, j) => j !== i) })}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {item.searchThemes.length === 0 && <p className="text-xs text-gray-400">ยังไม่มี search themes</p>}
                </div>
                <div className="flex justify-end">
                  <button onClick={async () => {
                    setLoadingKw(true)
                    try {
                      const res = await fetch('/api/keyword-research/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          businessName:   String(brief.businessName ?? 'Business'),
                          productService: String(brief.productService ?? ''),
                          location:       String(brief.targetLocation ?? 'ประเทศไทย'),
                          objective:      String(brief.objective ?? 'leads'),
                          language:       'th',
                        }),
                      })
                      if (res.ok) {
                        const data = await res.json()
                        const themes = (data.keywords ?? []).slice(0, 10).map((k: Record<string, unknown>) => String(k.keyword ?? ''))
                        const merged = Array.from(new Set([...item.searchThemes, ...themes])).slice(0, 25)
                        onChange({ ...item, searchThemes: merged })
                      }
                    } finally { setLoadingKw(false) }
                  }} disabled={loadingKw}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg">
                    {loadingKw ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI Suggest Themes
                  </button>
                </div>
              </div>
            )}

            {/* Audience — PMax ใช้ full signal builder */}
            {(tab === 'audience') && isPmax && (
              <AudienceSignalBuilder
                campaignName={item.campaignName}
                signal={item.pmaxSignal}
                onChange={signal => onChange({ ...item, pmaxSignal: signal })}
                briefContext={{
                  businessName: String(brief.businessName ?? ''),
                  productService: String(brief.productService ?? ''),
                  targetAudience: String(brief.targetAudience ?? ''),
                  objective: String(brief.objective ?? ''),
                }}
              />
            )}

            {/* Audience — SEARCH ใช้ RLSA only */}
            {(tab === 'audience') && isSearch && (
              <SimpleAudienceSelector
                selected={item.pmaxSignal.audienceSignals.remarketing}
                inMarket={item.pmaxSignal.audienceSignals.inMarket}
                onChangeRemarketing={lists => onChange({ ...item, pmaxSignal: { ...item.pmaxSignal, audienceSignals: { ...item.pmaxSignal.audienceSignals, remarketing: lists } } })}
                onChangeInMarket={segs => onChange({ ...item, pmaxSignal: { ...item.pmaxSignal, audienceSignals: { ...item.pmaxSignal.audienceSignals, inMarket: segs } } })}
                mode="rlsa"
              />
            )}

            {/* Audience — REMARKETING / DISPLAY / DEMAND_GEN / VIDEO */}
            {isAudienceOnly && (
              <SimpleAudienceSelector
                selected={item.pmaxSignal.audienceSignals.remarketing}
                inMarket={item.pmaxSignal.audienceSignals.inMarket}
                onChangeRemarketing={lists => onChange({ ...item, pmaxSignal: { ...item.pmaxSignal, audienceSignals: { ...item.pmaxSignal.audienceSignals, remarketing: lists } } })}
                onChangeInMarket={segs => onChange({ ...item, pmaxSignal: { ...item.pmaxSignal, audienceSignals: { ...item.pmaxSignal.audienceSignals, inMarket: segs } } })}
                mode="remarketing"
              />
            )}

            <div className="flex justify-end pt-1">
              <button onClick={markDone}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors">
                <CheckCircle2 className="w-4 h-4" /> บันทึก Campaign นี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StepKeywordAudience({
  plan, brief, research, onResearchChange, onNext,
}: {
  plan: MediaPlanStrategy
  brief: Record<string, string | number>
  research: CampaignResearch[]
  onResearchChange: (r: CampaignResearch[]) => void
  onNext: () => void
}) {
  const doneCount = research.filter(r => r.done).length

  function updateItem(idx: number, updated: CampaignResearch) {
    const next = research.map((r, i) => i === idx ? updated : r)
    onResearchChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-500" /> Keyword & Audience Research
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">ทำ research ทุก campaign ก่อน approve plan</p>
        </div>
        <div className="text-right text-sm">
          <p className="text-2xl font-bold text-gray-900">{doneCount}<span className="text-sm font-normal text-gray-400">/{research.length}</span></p>
          <p className="text-xs text-gray-400">campaigns done</p>
        </div>
      </div>

      {research.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">ไม่พบ campaigns — กลับไป Strategy step</p>
        </div>
      )}

      <div className="space-y-3">
        {research.map((item, idx) => (
          <CampaignResearchCard
            key={item.campaignName + idx}
            item={item}
            brief={brief}
            onChange={updated => updateItem(idx, updated)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-gray-400">
          {doneCount < research.length ? `ยังเหลือ ${research.length - doneCount} campaigns` : '✅ ทุก campaign เสร็จแล้ว'}
        </p>
        <button onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          ต่อไป — Plan Preview <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function StepReview({ plan, brief, clientId, research, draftId, onApproved }: {
  plan: MediaPlanStrategy; brief: Record<string, string | number>; clientId: string | null
  research: CampaignResearch[]
  draftId: string | null
  onApproved: (id: string) => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [lang, setLang] = useState<Language>('th')

  const checks = [
    { label: 'Business type classified', done: !!plan.businessType },
    { label: 'Budget allocation defined', done: (plan.budgetAllocation?.length ?? 0) > 0 },
    { label: 'Campaign structure defined', done: (plan.campaignStructure?.search?.length ?? 0) > 0 },
    { label: 'Funnel mapping complete', done: (plan.funnelMapping?.length ?? 0) > 0 },
    { label: 'Measurement plan defined', done: !!plan.measurementPlan?.primaryConversion },
    { label: 'Risks identified', done: (plan.risks?.filter(Boolean)?.length ?? 0) > 0 },
    { label: 'Executive summary written', done: !!plan.executiveSummary },
  ]
  const allPassed = checks.every(c => c.done)

  async function approve() {
    setSaving(true); setErr('')
    try {
      // Build the campaignMix + total budget from the strategy so the saved plan
      // persists the same data the user sees/exports — instead of an empty planJson.
      // buildCampaignMix already merges keyword/audience research into each campaign.
      const campaignMix = buildCampaignMix(plan, research)
      const monthlyBudget = campaignMix.reduce((s, c) => s + c.monthlyBudget, 0)
      const planJson = JSON.stringify({ campaignMix })

      let planId = draftId

      if (!planId) {
        // สร้าง plan โดยตรง ไม่ผ่าน brief validation
        const createRes = await fetch('/api/media-plans', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: String(brief.businessName ?? 'Business'),
            strategyJson: JSON.stringify(plan),
            planJson,
            monthlyBudget,
            brief,            // ส่ง intake brief จริง → Campaign Generator auto-fill step Brief ได้
            status:       'review',
            clientId:     clientId ?? undefined,
          }),
        })
        if (!createRes.ok) throw new Error(await createRes.text())
        planId = (await createRes.json()).id as string
        setSavedId(planId)
        onApproved(planId)
        return
      }

      await fetch(`/api/media-plans/${planId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyJson: JSON.stringify(plan),
          planJson,
          monthlyBudget,
          brief,            // re-save ก็อัปเดต brief จริงด้วย
          status: 'review',
        }),
      })

      setSavedId(planId)
      onApproved(planId)
      // onApproved triggers router.push('/media-plans') from parent
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">

      {/* ── Plan Preview ── */}
      <StepOutput plan={plan} research={research} lang={lang} setLang={setLang} />

      {/* ── Approve section ── */}
      <div className="border-t-2 border-dashed border-neutral-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={16} className="text-emerald-500" />
          <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wide">Approve Plan</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
            Status: Review
          </span>
        </div>

        {/* Pre-approval checklist */}
        <SectionCard title="Pre-Approval Checklist">
          <ul className="space-y-2">
            {checks.map(c => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.done
                  ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                  : <XCircle size={15} className="text-neutral-300 shrink-0" />}
                <span className={c.done ? 'text-neutral-800' : 'text-neutral-400'}>{c.label}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {savedId ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mt-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span className="font-semibold text-emerald-900">Approved แล้ว — กำลังพาไป All Plans...</span>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="flex gap-3">
              <button
                onClick={approve}
                disabled={saving || !allPassed}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {saving ? 'กำลังส่ง...' : 'Send to Approve Plan'}
              </button>
            </div>
            {!allPassed && <p className="text-xs text-amber-600">แผนยังไม่สมบูรณ์ครบทุกข้อ</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const SESSION_KEY = 'media-plan-draft'

function loadSession() {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}

function saveSession(data: object) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
}

function clearSession() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(SESSION_KEY)
}

export default function MediaPlanPage() {
  const router = useRouter()
  const [clients,      setClients]      = useState<Account[]>([])
  const [activeId,     setActiveId]     = useState<string | null>(null)
  const [currentStep,  setCurrentStep]  = useState('brief')
  const [lang,         setLang]         = useState<Language>('th')
  const [brief,        setBrief]        = useState<Record<string, string | number>>({})
  const [analysis,     setAnalysis]     = useState<IntakeAnalysis | null>(null)
  const [intakeAnswers,setIntakeAnswers] = useState<Record<string, string>>({})
  const [plan,         setPlan]         = useState<MediaPlanStrategy | null>(null)
  const [research,     setResearch]     = useState<CampaignResearch[]>([])
  const [approvedId,   setApprovedId]   = useState<string | null>(null)
  const [draftId,      setDraftId]      = useState<string | null>(null)
  const [_hydrated,    setHydrated]     = useState(false)
  const [loadingAnalyze, setLoadingAnalyze] = useState(false)
  const [loadingPlan,    setLoadingPlan]    = useState(false)
  const [error,          setError]          = useState('')
  const [pendingPlans,   setPendingPlans]   = useState<{ id: string; title: string; monthlyBudget: number; createdAt: string; status: string }[]>([])

  // ── hydrate from sessionStorage on mount ──────────────────────────────────
  useEffect(() => {
    const saved = loadSession()
    if (saved) {
      if (saved.brief)        setBrief(saved.brief)
      if (saved.intakeAnswers) setIntakeAnswers(saved.intakeAnswers)
      if (saved.plan)         setPlan(normalizePlan(saved.plan))
      if (saved.research)     setResearch(saved.research)
      if (saved.currentStep)  setCurrentStep(saved.currentStep)
      if (saved.activeId)     setActiveId(saved.activeId)
      if (saved.draftId)      setDraftId(saved.draftId)
    }
    setHydrated(true)
  }, [])

  // ── auto-save to sessionStorage whenever key state changes ────────────────
  useEffect(() => {
    if (!_hydrated) return
    saveSession({ brief, intakeAnswers, plan, research, currentStep, activeId, draftId })
  }, [brief, intakeAnswers, plan, research, currentStep, activeId, draftId, _hydrated])

  useEffect(() => {
    fetch('/api/media-plans')
      .then(r => r.json())
      .then(d => {
        const all = Array.isArray(d) ? d : (d.plans ?? [])
        setPendingPlans(all.filter((p: { status: string }) => p.status !== 'approved'))
      })
      .catch(() => {})
  }, [approvedId])


  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(d => {
      const list: Account[] = (d.accounts ?? []).map((a: { id: string; descriptiveName?: string; name?: string; currencyCode?: string }) => ({
        id: a.id, name: a.descriptiveName ?? a.name ?? a.id, currencyCode: a.currencyCode,
      }))
      setClients(list)
      if (list.length && !activeId) setActiveId(list[0].id)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openPendingPlan(planId: string) {
    try {
      const res = await fetch(`/api/media-plans/${planId}`)
      if (!res.ok) return
      const record = await res.json() as { strategyJson?: string; brief?: { clientId?: string } }
      if (!record.strategyJson) {
        // plan เก่าที่ยังไม่มี strategyJson — ไปดูที่ preview แทน
        window.location.href = `/media-plans/${planId}/preview`
        return
      }
      const strategy = normalizePlan(JSON.parse(record.strategyJson) as Partial<MediaPlanStrategy>)
      setPlan(strategy)
      setResearch(buildCampaignResearchList(strategy))
      if (record.brief?.clientId) setActiveId(record.brief.clientId)
      setDraftId(planId)
      setCurrentStep('review')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { /* ignore */ }
  }


  const client = clients.find(c => c.id === activeId)

  async function handleSendReview(): Promise<void> {
    if (!plan) return
    try {
      let planId = draftId
      if (!planId) {
        // ยังไม่มี draft — สร้าง brief + plan ใหม่
        const safeUrl2 = (() => {
          const u = String(brief.websiteUrl ?? '').trim()
          try { new URL(u); return u } catch { return 'https://example.com' }
        })()
        const safeGoal2 = String(brief.conversionGoal ?? '').trim() || 'เพิ่มยอดขายและ Leads'
        const briefRes = await fetch('/api/briefs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName:   brief.businessName,
            websiteUrl:     safeUrl2,
            productService: brief.productService,
            objective:      brief.objective,
            monthlyBudget:  Number(brief.monthlyBudget),
            currency:       'THB',
            targetLocation: brief.targetLocation || 'ประเทศไทย',
            language:       'th',
            targetAudience: brief.targetAudience || 'กลุ่มลูกค้าทั่วไป',
            conversionGoal: safeGoal2,
            promotion:      brief.promotion || '',
            brandTone:      brief.brandTone || '',
            duration:       '3 months',
            notes:          brief.notes || '',
            clientId:       activeId ?? undefined,
          }),
        })
        if (!briefRes.ok) return
        const briefData = await briefRes.json()
        const planRes = await fetch('/api/media-plans/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ briefId: briefData.id }),
        })
        if (!planRes.ok) return
        const planData = await planRes.json()
        planId = planData.id as string
        setDraftId(planId)
      }
      // บันทึก strategyJson + เปลี่ยน status เป็น "review"
      await fetch(`/api/media-plans/${planId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyJson: JSON.stringify(plan), status: 'review' }),
      })
      clearSession()
      router.push('/media-plans')
    } catch { /* ignore */ }
  }


  const handleAnalyze = useCallback(async (briefData: Record<string, string | number>) => {
    setBrief(briefData); setError(''); setLoadingAnalyze(true)
    try {
      const res = await fetch('/api/intake/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: briefData, taskType: 'media-plan' }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data: IntakeAnalysis = await res.json()
      setAnalysis(data)
      setCurrentStep('missing')
    } catch (e) { setError(e instanceof Error ? e.message : 'Analyze failed') }
    finally { setLoadingAnalyze(false) }
  }, [])

  const handleGeneratePlan = useCallback(async () => {
    if (!analysis) return
    setError(''); setLoadingPlan(true)
    try {
      // Step 1: generate strategy
      const res = await fetch('/api/intake/generate-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: { ...brief, ...intakeAnswers }, intakeAnswers, businessType: analysis.businessType }),
      })
      if (!res.ok) throw new Error(await res.text())
      const raw = await res.json() as Partial<MediaPlanStrategy>
      // บังคับใช้ budget จาก brief เสมอ ไม่ว่า AI จะ suggest เท่าไร
      const userBudget = Number(brief.monthlyBudget) || 0
      if (userBudget > 0 && raw.intakeSummary) {
        raw.intakeSummary.monthlyBudget = userBudget
      }
      const data = normalizePlan(raw)
      setPlan(data)
      setResearch(buildCampaignResearchList(data))
      setCurrentStep('strategy')
    } catch (e) { setError(e instanceof Error ? e.message : 'Generate failed') }
    finally { setLoadingPlan(false) }
  }, [analysis, brief, intakeAnswers])

  const completedSteps = new Set<string>()
  if (analysis) {
    completedSteps.add('brief')
    if (plan) {
      completedSteps.add('missing')
      completedSteps.add('strategy')
      if (research.some(r => r.done)) completedSteps.add('research')
      completedSteps.add('output')
    }
  }
  if (approvedId) completedSteps.add('review')

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between pb-5 border-b border-neutral-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Media Plan</h1>
            <p className="text-neutral-500 text-sm mt-0.5">สร้าง Google Ads Media Plan ด้วย AI — เฉพาะ Google Ads</p>
          </div>
          {clients.length > 0 && (
            <select value={activeId ?? ''} onChange={e => setActiveId(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200 focus:outline-none shrink-0 self-start">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {client && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Client', value: client.name },
              { label: 'Currency', value: client.currencyCode ?? 'THB' },
              { label: 'Status', value: analysis ? (plan ? 'Plan Ready' : 'Analyzing') : 'Draft' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl border border-neutral-200 px-4 py-3">
                <div className="text-xs text-neutral-400">{k.label}</div>
                <div className="text-sm font-semibold text-neutral-950 mt-0.5">{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle size={14} />{error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><RefreshCw size={13} /></button>
          </div>
        )}

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* Step nav */}
          <div className="space-y-3 h-fit">
            <div className="bg-white rounded-3xl border border-neutral-200 p-3">
              <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400 mb-1">STEPS</div>
              <div className="space-y-0.5">
                {PLAN_STEPS.map(step => {
                  const isActive = currentStep === step.key
                  const isDone = completedSteps.has(step.key)
                  const isReachable = step.key === 'brief'
                    || (step.key === 'missing' && !!analysis)
                    || (step.key === 'strategy' && !!plan)
                    || (step.key === 'research' && !!plan)
                    || (step.key === 'output' && !!plan)
                    || (step.key === 'review' && !!plan)
                  return (
                    <button key={step.key}
                      onClick={() => isReachable && setCurrentStep(step.key)}
                      disabled={!isReachable}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40 ${isActive ? 'bg-neutral-100 text-neutral-950 font-medium' : 'text-neutral-600 hover:bg-neutral-50 disabled:hover:bg-transparent'}`}>
                      <span className="flex items-center gap-2">
                        {isDone && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                        {step.label}
                      </span>
                      <span className="text-xs text-neutral-400">{step.status}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Pending plans — below step nav */}
            {pendingPlans.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-[11px] font-bold text-amber-700">รอ Approve ({pendingPlans.length})</p>
                </div>
                <div className="space-y-1.5">
                  {pendingPlans.map(p => (
                    <div key={p.id} className="bg-white border border-amber-100 rounded-xl px-2.5 py-2 flex items-center gap-2">
                      <FileText className="w-3 h-3 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-gray-800 truncate leading-tight">{p.title}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">
                          ฿{p.monthlyBudget > 0 ? p.monthlyBudget.toLocaleString() : '—'} · {new Date(p.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <button onClick={() => void openPendingPlan(p.id)}
                        className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 hover:text-amber-800 shrink-0">
                        ดู <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step content */}
          <div>
            {currentStep === 'brief' && (
              <StepBrief
                onAnalyze={briefData => { void handleAnalyze(briefData) }}
                initialValues={Object.keys(brief).length > 0 ? brief : undefined}
              />
            )}
            {currentStep === 'missing' && analysis && (
              <StepMissing
                analysis={analysis}
                intakeAnswers={intakeAnswers}
                setIntakeAnswers={setIntakeAnswers}
                onGenerate={handleGeneratePlan}
                loading={loadingPlan}
              />
            )}
            {currentStep === 'strategy' && plan && <StepStrategy plan={plan} onPlanChange={setPlan} />}
            {currentStep === 'research' && plan && (
              <StepKeywordAudience
                plan={plan}
                brief={brief}
                research={research}
                onResearchChange={setResearch}
                onNext={() => setCurrentStep('output')}
              />
            )}
            {currentStep === 'output' && plan && <StepOutput plan={plan} research={research} lang={lang} setLang={setLang} />}
            {currentStep === 'review' && plan && (
              <StepReview plan={plan} brief={brief} clientId={activeId} research={research} draftId={draftId} onApproved={id => { clearSession(); setApprovedId(id); router.push('/media-plans') }} />
            )}
          </div>
        </div>

        {/* Navigation */}
        {plan && (
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-neutral-100">
            {currentStep !== 'brief' && currentStep !== 'missing' && (
              <Btn variant="outline" onClick={() => {
                const idx = PLAN_STEPS.findIndex(s => s.key === currentStep)
                if (idx > 0) setCurrentStep(PLAN_STEPS[idx - 1].key)
              }}>← ย้อนกลับ</Btn>
            )}
            {['brief', 'missing', 'strategy', 'research', 'output', 'review'].map((s, i, arr) => {
              if (i === 0) return null
              const prev = arr[i - 1]
              if (currentStep !== prev) return null
              const isReachable = s === 'strategy' || s === 'research' || s === 'output' || s === 'review'
              if (!isReachable) return null
              return (
                <Btn key={s} onClick={() => setCurrentStep(s)}>
                  ถัดไป →
                </Btn>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
