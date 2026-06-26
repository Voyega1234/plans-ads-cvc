'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Shield, Zap, RefreshCw, Eye, ShoppingCart,
  Play, Timer, Sparkles, Smartphone, Bot, LayoutTemplate,
  CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronRight,
  ChevronLeft, User, Rocket, FileText, Wrench, ShieldCheck,
  ShieldAlert, Plus, X, Globe, ImageIcon, Upload, Package, Edit3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CAMPAIGN_TEMPLATES, TEMPLATE_FILTERS, filterTemplates,
  type CampaignTemplate, type TemplateFilterKey,
} from '@/lib/templates/campaign-templates'
import AdTextEditor from '@/components/campaigns/AdTextEditor'
import type { CampaignBlueprintItem } from '@/types'

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Search, Shield, Zap, RefreshCw, Eye, ShoppingCart,
  Play, Timer, Sparkles, Smartphone, Bot,
}

const DIFFICULTY_LABELS: Record<CampaignTemplate['difficulty'], string> = {
  beginner: 'มือใหม่', intermediate: 'ปานกลาง', advanced: 'ขั้นสูง',
}
const DIFFICULTY_COLORS: Record<CampaignTemplate['difficulty'], string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-amber-100 text-amber-700',
  advanced: 'bg-red-100 text-red-700',
}

const SEARCH_TYPES = ['SEARCH', 'SHOPPING']
const IMAGE_TYPES  = ['DISPLAY', 'PERFORMANCE_MAX', 'YOUTUBE', 'DEMAND_GEN']
const VIDEO_TYPES  = ['YOUTUBE', 'DEMAND_GEN']

// ── Types ─────────────────────────────────────────────────────────────────────
interface GoogleAdsAccount {
  id: string
  descriptiveName?: string
  name?: string
  summary?: { website?: string; businessName?: string }
}

type Phase = 'account' | 'pick' | 'build' | 'pipeline' | 'done'

type StepStatus = 'idle' | 'loading' | 'done' | 'error'
interface StepState {
  status: StepStatus
  data?: Record<string, unknown>
  message?: string
}

interface KeywordItem {
  text: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
  selected: boolean
  volume?: number
  cpc?: number
  competition?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'
}
interface AudienceItem { name: string; type: string; description: string; selected: boolean }

// ── Pipeline Steps ─────────────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  { n: 0, label: 'ตรวจสอบ Campaign ซ้ำ', icon: ShieldAlert },
  { n: 1, label: 'สร้าง Text Ads',        icon: FileText },
  { n: 2, label: 'สร้าง Campaign',        icon: Wrench },
  { n: 3, label: 'ตรวจสอบ QA',           icon: ShieldCheck },
  { n: 4, label: 'Push เข้า Google Ads', icon: Rocket },
]

// ── Template Card ──────────────────────────────────────────────────────────────
function TemplateCard({ template, selected, onSelect }: { template: CampaignTemplate; selected: boolean; onSelect: () => void }) {
  const Icon = ICON_MAP[template.icon] ?? LayoutTemplate
  return (
    <button onClick={onSelect} className={cn('text-left bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-all flex flex-col w-full', selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-200')}>
      <div className={cn('h-20 flex items-center justify-center relative', template.color)}>
        <Icon className="w-8 h-8 text-white" />
        {selected && <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-blue-600" /></div>}
        {template.badge && !selected && <span className="absolute top-2 right-2 bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/30">{template.badge}</span>}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-1 mb-1">
          <h3 className="font-semibold text-gray-900 text-xs leading-snug">{template.name}</h3>
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0', DIFFICULTY_COLORS[template.difficulty])}>{DIFFICULTY_LABELS[template.difficulty]}</span>
        </div>
        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mb-2">{template.description}</p>
        <div className="mt-auto flex items-center justify-between text-[10px] text-gray-400">
          <span>CPA: <span className="text-gray-600 font-medium">{template.estimatedCPA}</span></span>
          <span>฿{template.minBudget.toLocaleString()}/เดือน</span>
        </div>
      </div>
    </button>
  )
}

// ── Keyword Builder (Search/Shopping) ─────────────────────────────────────────
function KeywordBuilder({
  keywords, onToggle, onAdd, onRemove, generating,
  onGenerate,
}: {
  keywords: KeywordItem[]
  onToggle: (i: number) => void
  onAdd: (kw: string, match: KeywordItem['matchType']) => void
  onRemove: (i: number) => void
  generating: boolean
  onGenerate: () => void
}) {
  const [input, setInput] = useState('')
  const [match, setMatch] = useState<KeywordItem['matchType']>('PHRASE')

  function add() {
    const t = input.trim()
    if (!t) return
    onAdd(t, match)
    setInput('')
  }

  const matchColors: Record<KeywordItem['matchType'], string> = {
    EXACT: 'bg-green-100 text-green-700',
    PHRASE: 'bg-blue-100 text-blue-700',
    BROAD: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Keywords</h3>
          <p className="text-xs text-gray-500 mt-0.5">{keywords.filter(k => k.selected).length}/{keywords.length} selected</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generating ? 'กำลัง Generate...' : 'Re-generate'}
        </button>
      </div>

      {/* Add keyword manually */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="พิมพ์ keyword แล้วกด Enter"
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={match}
          onChange={e => setMatch(e.target.value as KeywordItem['matchType'])}
          className="px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="EXACT">Exact</option>
          <option value="PHRASE">Phrase</option>
          <option value="BROAD">Broad</option>
        </select>
        <button onClick={add} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
          <Plus className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Keyword list */}
      {generating ? (
        <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">กำลัง Generate Keywords...</span>
        </div>
      ) : keywords.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          ยังไม่มี keyword — กด Re-generate หรือพิมพ์เพิ่มเองด้านบน
        </div>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {/* Header */}
          <div className="grid grid-cols-[1fr_60px_70px_60px_24px] gap-2 px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <span>Keyword</span>
            <span className="text-center">Match</span>
            <span className="text-right">Vol/เดือน</span>
            <span className="text-right">CPC (฿)</span>
            <span />
          </div>
          {keywords.map((kw, i) => {
            const compColor = kw.competition === 'HIGH' ? 'text-red-500' : kw.competition === 'MEDIUM' ? 'text-yellow-500' : kw.competition === 'LOW' ? 'text-green-500' : 'text-gray-300'
            return (
              <div
                key={i}
                onClick={() => onToggle(i)}
                className={cn('grid grid-cols-[1fr_60px_70px_60px_24px] gap-2 items-center px-3 py-2 rounded-lg border transition-colors cursor-pointer',
                  kw.selected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 opacity-60'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input type="checkbox" checked={kw.selected} onChange={() => onToggle(i)} onClick={e => e.stopPropagation()} className="w-3.5 h-3.5 rounded accent-blue-600 shrink-0" />
                  <span className="text-sm text-gray-800 truncate">{kw.text}</span>
                </div>
                <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-center', matchColors[kw.matchType])}>{kw.matchType}</span>
                <div className="text-right">
                  {kw.volume != null ? (
                    <span className={cn('text-xs font-medium tabular-nums', compColor)}>
                      {kw.volume.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>
                <div className="text-right">
                  {kw.cpc != null && kw.cpc > 0 ? (
                    <span className="text-xs text-gray-600 tabular-nums">฿{kw.cpc}</span>
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>
                <button onClick={e => { e.stopPropagation(); onRemove(i) }} className="text-gray-300 hover:text-red-400 transition-colors flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Audience Builder (PMax / Display / YouTube) ────────────────────────────────
function AudienceBuilder({
  audiences, onToggle, generating, onGenerate,
}: {
  audiences: AudienceItem[]
  onToggle: (i: number) => void
  generating: boolean
  onGenerate: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Audience Signals</h3>
          <p className="text-xs text-gray-500 mt-0.5">{audiences.filter(a => a.selected).length}/{audiences.length} selected</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generating ? 'กำลัง Generate...' : 'Re-generate'}
        </button>
      </div>

      {generating ? (
        <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">กำลัง Generate Audiences...</span>
        </div>
      ) : audiences.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          กด Generate เพื่อให้ระบบแนะนำ Audience Signals
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {audiences.map((aud, i) => (
            <div key={i} onClick={() => onToggle(i)} className={cn('flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors', aud.selected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 opacity-60')}>
              <input type="checkbox" checked={aud.selected} onChange={() => onToggle(i)} className="w-3.5 h-3.5 rounded accent-blue-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{aud.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{aud.description}</p>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full mt-1 inline-block">{aud.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface DraftSummary {
  id: string
  accountId: string
  accountName: string
  templateType: string
  templateName: string
  phase: string
  mediaPlanId?: string | null
  updatedAt: string
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TemplatesPage() {
  const [phase, setPhase] = useState<Phase>('account')

  // Account
  const [accounts, setAccounts] = useState<GoogleAdsAccount[]>([])
  const [accountsLoading, setAL] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<GoogleAdsAccount | null>(null)
  const [drafts, setDrafts] = useState<DraftSummary[]>([])

  // Template
  const [activeFilter, setActiveFilter] = useState<TemplateFilterKey>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null)

  // Build phase state
  const [keywords, setKeywords] = useState<KeywordItem[]>([])
  const [audiences, setAudiences] = useState<AudienceItem[]>([])
  const [generatingKw, setGeneratingKw] = useState(false)
  const [generatingAud, setGeneratingAud] = useState(false)
  const [promotion, setPromotion] = useState('')
  const [budget, setBudget] = useState('')
  const [productService, setProductService] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [campaignName, setCampaignName] = useState('')
  // Image assets (Display, PMax, YouTube, DemandGen)
  const [uploadedImages, setUploadedImages] = useState<{ name: string; dataUrl: string; size: string }[]>([])
  const [logoUrl, setLogoUrl] = useState<{ name: string; dataUrl: string } | null>(null)
  const [assetChecked, setAssetChecked] = useState<Record<string, boolean>>({})

  // Pipeline
  const [currentStep, setCurrentStep] = useState(-1)
  const [stepStates, setStepStates] = useState<Record<number, StepState>>({})
  const [runCtx, setRunCtx] = useState<{ briefId?: string; mediaPlanId?: string; blueprintId?: string }>({})
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [blueprints, setBlueprints] = useState<CampaignBlueprintItem[]>([])

  // Draft persistence
  const draftId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function collectDraftState() {
    return {
      keywords, audiences, promotion, budget, productService, targetAudience,
      campaignName, assetChecked, stepStates, runCtx, currentStep,
    }
  }

  const saveDraft = useCallback(async (overridePhase?: string) => {
    if (!draftId.current || !selectedTemplate || !selectedAccount) return
    clearTimeout(saveTimer.current ?? undefined)
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/template-drafts/${draftId.current}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: overridePhase ?? phase,
          stateJson: collectDraftState(),
          ...(runCtx.mediaPlanId && { mediaPlanId: runCtx.mediaPlanId }),
        }),
      }).catch(() => {})
    }, 600)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, selectedAccount, phase, keywords, audiences, promotion, budget, productService, targetAudience, campaignName, assetChecked, stepStates, runCtx, currentStep])

  // Auto-save whenever important state changes
  useEffect(() => {
    if (draftId.current) saveDraft()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, keywords, audiences, budget, productService, targetAudience, campaignName, stepStates, runCtx])

  async function deleteDraft(id: string) {
    await fetch(`/api/template-drafts/${id}`, { method: 'DELETE' }).catch(() => {})
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  async function resumeDraft(d: DraftSummary) {
    const res = await fetch(`/api/template-drafts/${d.id}`)
    if (!res.ok) return
    const data = await res.json()
    const s = data.stateJson as ReturnType<typeof collectDraftState>

    const tpl = CAMPAIGN_TEMPLATES.find(t => t.type === d.templateType)
    if (!tpl) return

    const account = accounts.find(a => a.id === d.accountId)
    if (!account) return

    draftId.current = d.id
    setSelectedTemplate(tpl)
    setSelectedAccount(account)
    setKeywords(s.keywords ?? [])
    setAudiences(s.audiences ?? [])
    setPromotion(s.promotion ?? '')
    setBudget(s.budget ?? '')
    setProductService(s.productService ?? '')
    setTargetAudience(s.targetAudience ?? '')
    setCampaignName(s.campaignName ?? '')
    setAssetChecked(s.assetChecked ?? {})
    setStepStates(s.stepStates ?? {})
    const ctx = s.runCtx ?? {}
    setRunCtx(ctx)
    setCurrentStep(s.currentStep ?? -1)
    setPhase((d.phase as Phase) ?? 'build')

    // Restore blueprints if pipeline already ran
    if (ctx.mediaPlanId && (s.stepStates as Record<number, StepState>)?.[2]?.status === 'done') {
      fetch(`/api/campaign-blueprints/${ctx.mediaPlanId}`)
        .then(r => r.ok ? r.json() : null)
        .then(bpData => {
          if (!bpData) return
          const parsed = typeof bpData.blueprintJson === 'string' ? JSON.parse(bpData.blueprintJson) : bpData.blueprintJson
          setBlueprints(Array.isArray(parsed) ? parsed : [parsed])
        })
        .catch(() => {})
    }
  }

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => {
        const accs = d.accounts ?? []
        setAccounts(accs)
        if (accs.length === 1) setSelectedAccount(accs[0])
      })
      .catch(() => {})
      .finally(() => setAL(false))

    // Load existing drafts
    fetch('/api/template-drafts')
      .then(r => r.json())
      .then(d => setDrafts(d.drafts ?? []))
      .catch(() => {})
  }, [])

  const accountName = (a: GoogleAdsAccount) => a.descriptiveName || a.name || `Account ${a.id}`
  const isSearch  = selectedTemplate ? SEARCH_TYPES.includes(selectedTemplate.type) : false
  const needsImages = selectedTemplate ? IMAGE_TYPES.includes(selectedTemplate.type) : false
  const needsVideo  = selectedTemplate ? VIDEO_TYPES.includes(selectedTemplate.type) : false

  // Auto-generate when entering build phase
  const generateResearch = useCallback(async (tpl: CampaignTemplate, account: GoogleAdsAccount, product?: string, audience?: string) => {
    const isSearchType = SEARCH_TYPES.includes(tpl.type)
    const accountBiz = account.descriptiveName || account.name || ''

    const setter = isSearchType ? setGeneratingKw : setGeneratingAud
    setter(true)
    try {
      const res = await fetch('/api/templates/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName:   accountBiz,
          productService: product || accountBiz,
          targetAudience: audience || '',
          objective:      tpl.defaults.objective,
          campaignType:   tpl.type,
          campaignName:   `CVC - ${tpl.type === 'SEARCH' ? 'SEM' : tpl.type} - ${accountBiz}`,
        }),
      })
      const data = await res.json()
      if (isSearchType) {
        const kws: KeywordItem[] = (data.keywords ?? []).map((k: { keyword: string; matchType?: string }) => ({
          text: k.keyword,
          matchType: (k.matchType as KeywordItem['matchType']) ?? 'PHRASE',
          selected: true,
        }))
        setKeywords(kws)

        // Enrich with real Keyword Planner volume data
        try {
          const plannerRes = await fetch('/api/keyword-research/planner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: kws.map(k => k.text) }),
          })
          if (plannerRes.ok) {
            const plannerData = await plannerRes.json() as {
              results: Array<{ keyword: string; avgMonthlySearches: number; suggestedCpc: number; competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED' }>
            }
            const volumeMap = new Map(plannerData.results.map(r => [r.keyword.toLowerCase(), r]))
            setKeywords(prev => prev.map(k => {
              const info = volumeMap.get(k.text.toLowerCase())
              return info ? { ...k, volume: info.avgMonthlySearches, cpc: info.suggestedCpc, competition: info.competition } : k
            }))
          }
        } catch {
          // volume enrichment failed silently — keywords still usable
        }
      } else {
        const auds: AudienceItem[] = (data.audiences ?? []).map((a: { name: string; type?: string; description?: string }) => ({
          name: a.name,
          type: a.type ?? 'IN_MARKET',
          description: a.description ?? '',
          selected: true,
        }))
        setAudiences(auds)
      }
    } catch {
      isSearchType ? setKeywords([]) : setAudiences([])
    } finally {
      setter(false)
    }
  }, [])

  async function enterBuild(tpl: CampaignTemplate) {
    setSelectedTemplate(tpl)
    setKeywords([])
    setAudiences([])
    setPromotion('')
    setBudget(String(Math.round(tpl.minBudget / 30)))
    setProductService('')
    setTargetAudience('')
    setCampaignName('')
    setUploadedImages([])
    setLogoUrl(null)
    setAssetChecked({})
    setStepStates({})
    setRunCtx({})
    setCurrentStep(-1)
    draftId.current = null
    setPhase('build')

    // Create new draft in DB
    const acc = selectedAccount!
    const res = await fetch('/api/template-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId:    acc.id,
        accountName:  acc.descriptiveName || acc.name || acc.id,
        templateType: tpl.type,
        templateName: tpl.name,
        stateJson:    {},
        phase:        'build',
      }),
    })
    if (res.ok) {
      const data = await res.json()
      draftId.current = data.id
      setDrafts(prev => [{
        id: data.id,
        accountId: acc.id,
        accountName: acc.descriptiveName || acc.name || acc.id,
        templateType: tpl.type,
        templateName: tpl.name,
        phase: 'build',
        updatedAt: new Date().toISOString(),
      }, ...prev])
    }
  }

  // Pipeline execution
  async function callApi(apiStep: number, ctx: typeof runCtx, payload: Record<string, unknown>) {
    const res = await fetch('/api/automation/run-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: apiStep, ...payload, ...ctx }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    const data = await res.json()
    const newCtx = { ...ctx }
    if (data.briefId)     newCtx.briefId     = data.briefId
    if (data.mediaPlanId) newCtx.mediaPlanId = data.mediaPlanId
    if (data.blueprintId) newCtx.blueprintId = data.blueprintId
    setRunCtx(newCtx)
    return { data, ctx: newCtx }
  }

  function buildCampaignName(tpl: CampaignTemplate, biz: string) {
    const typeLabel: Record<string, string> = {
      SEARCH: 'SEM', SHOPPING: 'Shopping', DISPLAY: 'Display',
      PERFORMANCE_MAX: 'PMax', YOUTUBE: 'YouTube', DEMAND_GEN: 'DemandGen',
      APP_CAMPAIGN: 'App', SMART: 'Smart',
    }
    return `CVC - ${typeLabel[tpl.type] ?? tpl.type} - Generic - ${biz} - ${tpl.defaults.objective === 'LEADS' ? 'Lead' : tpl.defaults.objective}`
  }

  function basePayload() {
    const tpl = selectedTemplate!
    const acc = selectedAccount!
    const biz = acc.descriptiveName || acc.name || ''
    const finalCampaignName = campaignName.trim() || buildCampaignName(tpl, biz)
    return {
      businessName:   biz,
      websiteUrl:     acc.summary?.website ?? `https://${biz.toLowerCase().replace(/\s+/g, '')}.com`,
      productService: productService.trim() || `${biz} — ${tpl.name}`,
      campaignName:   finalCampaignName,
      objective:      tpl.defaults.objective,
      dailyBudget:    Number(budget) || Math.round(tpl.minBudget / 30),
      monthlyBudget:  (Number(budget) || Math.round(tpl.minBudget / 30)) * 30,
      currency:       'THB',
      targetLocation: 'Thailand',
      language:       'th',
      targetAudience: targetAudience.trim() || audiences.filter(a => a.selected).map(a => a.name).join(', ') || 'general',
      conversionGoal: 'Form submit / Call',
      promotion:      promotion || undefined,
      templateId:     tpl.id,
      templateType:   tpl.type,
      customerId:     acc.id,
      allowedTypes:   [tpl.type],
      selectedKeywords: keywords.filter(k => k.selected).map(k => ({ keyword: k.text, matchType: k.matchType })),
      selectedAudiences: audiences.filter(a => a.selected).map(a => ({ name: a.name, type: a.type })),
    }
  }

  async function startPipeline() {
    setPhase('pipeline')
    setCurrentStep(0)
    setStepStates({})
    saveDraft('pipeline')
    const ctx: typeof runCtx = {}
    const payload = basePayload()

    // Step 0: conflict check
    setStepStates(p => ({ ...p, 0: { status: 'loading' } }))
    try {
      const r0 = await callApi(0, ctx, payload)
      setStepStates(p => ({ ...p, 0: { status: 'done', data: r0.data } }))
      setCurrentStep(1)

      // Step 1: brief + media plan (1 campaign type only)
      setStepStates(p => ({ ...p, 1: { status: 'loading' } }))
      let r1 = await callApi(1, r0.ctx, payload)
      r1 = await callApi(3, r1.ctx, payload)
      setStepStates(p => ({ ...p, 1: { status: 'done', data: r1.data } }))
      setCurrentStep(2)

      // Step 2: blueprint + ad copy
      setStepStates(p => ({ ...p, 2: { status: 'loading' } }))
      const r2 = await callApi(5, r1.ctx, payload)
      setStepStates(p => ({ ...p, 2: { status: 'done', data: r2.data } }))
      setCurrentStep(3)

      // Fetch blueprint for inline editing
      if (r2.ctx.mediaPlanId) {
        try {
          const bpRes = await fetch(`/api/campaign-blueprints/${r2.ctx.mediaPlanId}`)
          if (bpRes.ok) {
            const bpData = await bpRes.json()
            const parsed = typeof bpData.blueprintJson === 'string' ? JSON.parse(bpData.blueprintJson) : bpData.blueprintJson
            setBlueprints(Array.isArray(parsed) ? parsed : [parsed])
          }
        } catch {
          // blueprint fetch failed silently
        }
      }

      // Step 3: QA
      setStepStates(p => ({ ...p, 3: { status: 'loading' } }))
      const r3 = await callApi(6, r2.ctx, payload)
      setStepStates(p => ({ ...p, 3: { status: 'done', data: r3.data } }))
      setCurrentStep(4)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setStepStates(p => ({ ...p, [currentStep]: { status: 'error', message: msg } }))
    }
  }

  async function saveBlueprintChange(updated: CampaignBlueprintItem) {
    const next = blueprints.map(bp => bp.campaignName === updated.campaignName ? updated : bp)
    setBlueprints(next)
    if (!runCtx.mediaPlanId) return
    await fetch(`/api/campaign-blueprints/${runCtx.mediaPlanId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprintJson: JSON.stringify(next) }),
    }).catch(() => {})
  }

  async function pushCampaign() {
    setStepStates(p => ({ ...p, 4: { status: 'loading' } }))
    try {
      const r = await callApi(7, runCtx, basePayload())
      setStepStates(p => ({ ...p, 4: { status: 'done', data: r.data } }))
      setPhase('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setStepStates(p => ({ ...p, 4: { status: 'error', message: msg } }))
    }
  }

  const filtered = filterTemplates(CAMPAIGN_TEMPLATES, activeFilter)

  // ── PHASE: account ────────────────────────────────────────────────────────────
  if (phase === 'account') return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <LayoutTemplate className="w-5 h-5 text-blue-500" />
          <h1 className="text-xl font-bold text-gray-900">Campaign Templates</h1>
        </div>
        <p className="text-sm text-gray-500">เลือก Account → เลือก Template → สร้าง 1 Campaign ทันที</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">เลือก Google Ads Account</h2>
            <p className="text-xs text-gray-500">Campaign จะถูก push เข้า account นี้</p>
          </div>
        </div>

        {accountsLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-red-500 mb-2">ไม่พบ Google Ads Account</p>
            <button onClick={() => { window.location.href = '/auth/signin' }} className="text-sm text-blue-600 underline">Login ใหม่</button>
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {accounts.map(acc => (
              <button key={acc.id} onClick={() => setSelectedAccount(acc)} className={cn('w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-left transition-all', selectedAccount?.id === acc.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50')}>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{accountName(acc)}</p>
                  <p className="text-xs text-gray-400">{acc.id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}</p>
                </div>
                {selectedAccount?.id === acc.id && <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}

        <button onClick={() => { if (selectedAccount) setPhase('pick') }} disabled={!selectedAccount} className={cn('w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-colors', selectedAccount ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
          ถัดไป — เลือก Template <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Resume drafts */}
      {drafts.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900">ทำต่อจากที่ค้างไว้</h3>
          </div>
          <div className="space-y-2">
            {drafts.slice(0, 5).map(d => (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.templateName}</p>
                  <p className="text-xs text-gray-400">{d.accountName} · {d.phase === 'done' ? 'เสร็จแล้ว' : d.phase === 'pipeline' ? 'กำลัง generate' : 'กำลังกรอกข้อมูล'}</p>
                  <p className="text-[10px] text-gray-300">{new Date(d.updatedAt).toLocaleString('th-TH')}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => resumeDraft(d)}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    ทำต่อ
                  </button>
                  <button
                    onClick={() => deleteDraft(d.id)}
                    className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ── PHASE: pick ────────────────────────────────────────────────────────────
  if (phase === 'pick') return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setPhase('account')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4" /> เปลี่ยน Account
        </button>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5">
          <User className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-medium text-blue-700">{selectedAccount ? accountName(selectedAccount) : ''}</span>
        </div>
      </div>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">เลือก Campaign Type</h1>
        <p className="text-sm text-gray-500">1 template = 1 campaign ถ้าต้องการเพิ่มให้กลับมาเลือกใหม่</p>
      </div>

      <div className="flex items-center gap-1.5 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TEMPLATE_FILTERS.map(f => (
          <button key={f.key} onClick={() => setActiveFilter(f.key)} className={cn('px-4 py-1.5 text-sm font-medium rounded-lg transition-colors', activeFilter === f.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(tpl => (
          <TemplateCard key={tpl.id} template={tpl} selected={selectedTemplate?.id === tpl.id} onSelect={() => enterBuild(tpl)} />
        ))}
      </div>
    </div>
  )

  // ── PHASE: build ──────────────────────────────────────────────────────────
  if (phase === 'build' && selectedTemplate) {
    const tpl = selectedTemplate
    const Icon = ICON_MAP[tpl.icon] ?? LayoutTemplate

    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => setPhase('pick')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
          <ChevronLeft className="w-4 h-4" /> เปลี่ยน Template
        </button>

        {/* Template header */}
        <div className={cn('rounded-2xl p-5 flex items-center gap-4 mb-6', tpl.color)}>
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white">{tpl.name}</h2>
            <p className="text-xs text-white/80 mt-0.5">{tpl.description}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-white/70">Account</p>
            <p className="text-sm font-semibold text-white">{selectedAccount ? accountName(selectedAccount) : ''}</p>
          </div>
        </div>

        {/* Campaign Name + Budget */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">ชื่อแคมเปญ</label>
            <input
              type="text"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder={buildCampaignName(tpl, selectedAccount ? accountName(selectedAccount) : '')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-400 mt-1">ปล่อยว่างให้ระบบตั้งชื่อให้อัตโนมัติ — ห้ามใช้ | (pipe)</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">งบประมาณ/วัน (THB)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={String(Math.round(tpl.minBudget / 30))}
              />
              <span className="text-xs text-gray-400">min ฿{Math.round(tpl.minBudget / 30).toLocaleString()}/วัน</span>
            </div>
          </div>
        </div>

        {/* Product / Audience context */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">ข้อมูลสำหรับ Generate</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">สินค้า / บริการ <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={productService}
                onChange={e => setProductService(e.target.value)}
                placeholder="เช่น บ้านจัดสรร / ประกันภัยรถ / ซอฟต์แวร์บัญชี"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">กลุ่มเป้าหมาย <span className="text-gray-300">(optional)</span></label>
              <input
                type="text"
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                placeholder="เช่น คนทำงานอายุ 25-40 / เจ้าของ SME / คนมีรถ"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => {
                if (!productService.trim()) return
                generateResearch(tpl, selectedAccount!, productService, targetAudience)
              }}
              disabled={!productService.trim() || generatingKw || generatingAud}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {(generatingKw || generatingAud) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {(generatingKw || generatingAud) ? 'กำลัง Generate...' : `Generate ${isSearch ? 'Keywords' : 'Audiences'}`}
            </button>
          </div>
        </div>

        {/* Keywords or Audiences */}
        {(keywords.length > 0 || audiences.length > 0 || generatingKw || generatingAud) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          {isSearch ? (
            <KeywordBuilder
              keywords={keywords}
              onToggle={i => setKeywords(p => p.map((k, idx) => idx === i ? { ...k, selected: !k.selected } : k))}
              onAdd={(text, matchType) => setKeywords(p => [...p, { text, matchType, selected: true }])}
              onRemove={i => setKeywords(p => p.filter((_, idx) => idx !== i))}
              generating={generatingKw}
              onGenerate={() => generateResearch(tpl, selectedAccount!, productService, targetAudience)}
            />
          ) : (
            <AudienceBuilder
              audiences={audiences}
              onToggle={i => setAudiences(p => p.map((a, idx) => idx === i ? { ...a, selected: !a.selected } : a))}
              generating={generatingAud}
              onGenerate={() => generateResearch(tpl, selectedAccount!, productService, targetAudience)}
            />
          )}
        </div>
        )}

        {/* Required Assets (Display / PMax / YouTube / DemandGen) */}
        {needsImages && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 space-y-5">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-semibold text-gray-700">Assets ที่ต้องใช้</h3>
            </div>

            {/* Required assets checklist */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Checklist</p>
              {tpl.defaults.requiredAssets.map((asset, i) => (
                <label key={i} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assetChecked[asset] ?? false}
                    onChange={e => setAssetChecked(p => ({ ...p, [asset]: e.target.checked }))}
                    className="w-3.5 h-3.5 mt-0.5 rounded accent-blue-600 flex-shrink-0"
                  />
                  <span className={cn('text-xs', assetChecked[asset] ? 'line-through text-gray-400' : 'text-gray-700')}>{asset}</span>
                </label>
              ))}
            </div>

            {/* Logo upload */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Logo</p>
              <label className={cn('flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors', logoUrl ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50')}>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => setLogoUrl({ name: file.name, dataUrl: ev.target?.result as string })
                    reader.readAsDataURL(file)
                  }}
                />
                {logoUrl ? (
                  <>
                    <img src={logoUrl.dataUrl} alt="logo" className="w-10 h-10 object-contain rounded-lg border border-emerald-200 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-700 truncate">{logoUrl.name}</p>
                      <p className="text-[10px] text-emerald-500">อัปโหลดแล้ว — คลิกเพื่อเปลี่ยน</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-gray-300 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-600">อัปโหลด Logo</p>
                      <p className="text-[10px] text-gray-400">PNG หรือ SVG ความละเอียดสูง</p>
                    </div>
                  </>
                )}
              </label>
            </div>

            {/* Image upload */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                รูปภาพโฆษณา <span className="text-gray-300 font-normal">(1200×628, 300×250, 160×600)</span>
              </p>
              <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? [])
                    files.forEach(file => {
                      const reader = new FileReader()
                      reader.onload = ev => {
                        const kb = Math.round(file.size / 1024)
                        setUploadedImages(p => [...p, { name: file.name, dataUrl: ev.target?.result as string, size: `${kb} KB` }])
                      }
                      reader.readAsDataURL(file)
                    })
                  }}
                />
                <Upload className="w-5 h-5 text-gray-300 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-600">เลือกรูปภาพ (เลือกหลายรูปได้)</p>
                  <p className="text-[10px] text-gray-400">JPG, PNG — แนะนำ 1200×628px ขึ้นไป</p>
                </div>
              </label>
              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {uploadedImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img.dataUrl} alt={img.name} className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg transition-opacity flex items-end p-1.5">
                        <p className="text-[9px] text-white truncate flex-1">{img.name}</p>
                        <button onClick={() => setUploadedImages(p => p.filter((_, idx) => idx !== i))} className="text-white/80 hover:text-white ml-1 flex-shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="absolute top-1 right-1 bg-black/50 text-white text-[9px] px-1 rounded">{img.size}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video note */}
            {needsVideo && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-700">ต้องมี Video URL</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">campaign ประเภทนี้ต้องใช้ YouTube video — อัปโหลด video ขึ้น YouTube channel ก่อน แล้วใส่ URL ใน Ad Copy</p>
                </div>
              </div>
            )}

            {/* Shopping note */}
            {tpl.type === 'SHOPPING' && (
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <Package className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-700">ต้องมี Google Merchant Center</p>
                  <p className="text-[10px] text-blue-600 mt-0.5">Shopping campaign ดึงรูปภาพสินค้าจาก Merchant Center Feed โดยตรง — ตรวจสอบว่า feed approved แล้ว</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Shopping requirement note (shown even outside needsImages) */}
        {!needsImages && tpl.type === 'SHOPPING' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-3">
              <Package className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-700">ต้องมี Google Merchant Center</p>
                <p className="text-[10px] text-blue-600 mt-0.5">Shopping campaign ดึงรูปภาพสินค้าจาก Merchant Center Feed — ตรวจสอบว่า feed approved และ linked กับ account นี้แล้ว</p>
              </div>
            </div>
          </div>
        )}

        {/* Required assets checklist for Search (minimal) */}
        {isSearch && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-semibold text-gray-700">Requirements</h3>
            </div>
            <div className="space-y-2">
              {tpl.defaults.requiredAssets.map((asset, i) => (
                <label key={i} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assetChecked[asset] ?? false}
                    onChange={e => setAssetChecked(p => ({ ...p, [asset]: e.target.checked }))}
                    className="w-3.5 h-3.5 mt-0.5 rounded accent-blue-600 flex-shrink-0"
                  />
                  <span className={cn('text-xs', assetChecked[asset] ? 'line-through text-gray-400' : 'text-gray-700')}>{asset}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Promotion (optional) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <label className="block text-xs font-semibold text-gray-700 mb-2">
            โปรโมชั่น <span className="font-normal text-gray-400">(ถ้ามี — ระบบจะใส่ใน Ad Copy ให้)</span>
          </label>
          <input
            type="text"
            value={promotion}
            onChange={e => setPromotion(e.target.value)}
            placeholder="เช่น ลด 20% เฉพาะเดือนนี้ / ฟรีติดตั้ง / ทดลองใช้ 30 วัน"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {stepStates[3]?.status === 'done' ? (
          <div className="space-y-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-emerald-800 mb-1">Pipeline เสร็จแล้ว — พร้อม Push</p>
              <p className="text-xs text-gray-500 mb-3">แก้ไขข้อมูลด้านบนแล้ว กด Push เพื่อสร้าง Campaign ใน Google Ads (PAUSED)</p>
              <button
                onClick={() => { setPhase('pipeline'); pushCampaign() }}
                disabled={stepStates[4]?.status === 'loading'}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
              >
                {stepStates[4]?.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                {stepStates[4]?.status === 'loading' ? 'กำลัง Push...' : 'Push Campaign (PAUSED)'}
              </button>
            </div>
            <button
              onClick={startPipeline}
              disabled={generatingKw || generatingAud}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-gray-500 border border-gray-200 hover:border-gray-300 rounded-xl transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> รัน Pipeline ใหม่ทั้งหมด
            </button>
          </div>
        ) : (
          <button
            onClick={startPipeline}
            disabled={generatingKw || generatingAud}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
          >
            <Rocket className="w-4 h-4" />
            สร้าง Campaign — {tpl.name}
          </button>
        )}
      </div>
    )
  }

  // ── PHASE: pipeline ───────────────────────────────────────────────────────
  if (phase === 'pipeline' || phase === 'done') {
    const tpl = selectedTemplate!
    const Icon = ICON_MAP[tpl?.icon] ?? LayoutTemplate

    return (
      <div className="max-w-2xl mx-auto">
        <div className={cn('rounded-2xl p-5 flex items-center gap-4 mb-6', tpl.color)}>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white">{tpl.name}</h2>
            <p className="text-xs text-white/70">{selectedAccount ? accountName(selectedAccount) : ''}</p>
          </div>
          {phase !== 'done' && (
            <button
              onClick={() => setPhase('build')}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-white" />
              <span className="text-xs font-semibold text-white">แก้ไข</span>
            </button>
          )}
          {phase === 'done' && (
            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span className="text-xs font-semibold text-white">สำเร็จ</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {PIPELINE_STEPS.map(s => {
            const state = stepStates[s.n]
            const StepIcon = s.icon
            const isActive = currentStep === s.n
            const isDone = state?.status === 'done'
            const isError = state?.status === 'error'
            const isLoading = state?.status === 'loading'

            const isExpanded = expandedStep === s.n
            const preview = state?.data?.preview as Record<string, unknown> | undefined

            return (
              <div key={s.n} className={cn('bg-white rounded-2xl border overflow-hidden transition-all', isDone ? 'border-emerald-200' : isActive ? 'border-blue-300 shadow-sm' : isError ? 'border-red-200' : 'border-gray-200 opacity-50')}>
                <div
                  className={cn('flex items-center gap-3 p-4', isDone && 'cursor-pointer hover:bg-gray-50')}
                  onClick={() => isDone && setExpandedStep(isExpanded ? null : s.n)}
                >
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', isDone ? 'bg-emerald-500' : isLoading ? 'bg-blue-600' : isError ? 'bg-red-500' : 'bg-gray-200')}>
                    {isLoading ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                      : isDone ? <CheckCircle2 className="w-4 h-4 text-white" />
                      : isError ? <XCircle className="w-4 h-4 text-white" />
                      : <StepIcon className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold', isDone ? 'text-emerald-700' : isActive ? 'text-blue-700' : isError ? 'text-red-600' : 'text-gray-400')}>
                      {s.label}
                    </p>
                    {isLoading && <p className="text-xs text-gray-400 mt-0.5">กำลังดำเนินการ...</p>}
                    {isError && <p className="text-xs text-red-500 mt-0.5">{state.message}</p>}
                    {isDone && s.n === 0 && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {(state.data?.blockingCount as number) > 0
                          ? `⚠ พบ ${state.data?.blockingCount} conflicts`
                          : `✓ ไม่พบ conflict — ${state.data?.proposedCampaigns ? (state.data.proposedCampaigns as string[]).length : 0} campaigns`}
                      </p>
                    )}
                    {isDone && s.n === 1 && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        สร้าง Media Plan — ฿{((state.data as Record<string, unknown>)?.dailyBudget as number)?.toLocaleString() ?? budget}/วัน · {((state.data as Record<string, unknown>)?.campaigns as number) ?? 1} campaign
                      </p>
                    )}
                    {isDone && s.n === 2 && <p className="text-xs text-emerald-600 mt-0.5">Ad Copy พร้อมแล้ว</p>}
                    {isDone && s.n === 3 && (
                      <p className="text-xs text-emerald-600 mt-0.5">QA Score: {(state.data?.score as number) ?? '—'}/100</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isDone && (
                      <span className="text-[10px] text-emerald-600 font-medium">
                        {isExpanded ? 'ซ่อน ▲' : 'ดูผล ▼'}
                      </span>
                    )}
                    <span className="text-xs text-gray-300 font-mono">0{s.n + 1}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isDone && isExpanded && (
                  <div className="border-t border-emerald-100 bg-emerald-50/50 px-4 py-3 space-y-2">
                    {s.n === 0 && preview && (
                      <>
                        <p className="text-xs font-semibold text-gray-600">Campaigns ที่จะสร้าง:</p>
                        {((state.data?.proposedCampaigns as string[]) ?? []).map((name, i) => (
                          <p key={i} className="text-xs text-gray-700 bg-white rounded-lg px-3 py-1.5 border border-emerald-100">{name}</p>
                        ))}
                        <button onClick={() => setPhase('build')} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1">
                          <Edit3 className="w-3 h-3" /> แก้ไขข้อมูลแล้วรันใหม่
                        </button>
                      </>
                    )}
                    {s.n === 1 && preview && Array.isArray((preview as {campaigns?: unknown[]}).campaigns) && (
                      <>
                        <p className="text-xs font-semibold text-gray-600">Campaign Mix:</p>
                        {((preview as {campaigns: {name:string;type:string;dailyBudget:number;objective:string}[]}).campaigns ?? []).map((c, i) => (
                          <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-emerald-100">
                            <div>
                              <p className="text-xs font-medium text-gray-800">{c.name}</p>
                              <p className="text-[10px] text-gray-400">{c.type} · {c.objective}</p>
                            </div>
                            <span className="text-xs font-semibold text-emerald-700">฿{c.dailyBudget?.toLocaleString()}/วัน</span>
                          </div>
                        ))}
                        {(preview as {rationale?: string}).rationale && (
                          <p className="text-xs text-gray-500 italic mt-1">{(preview as {rationale: string}).rationale}</p>
                        )}
                        {runCtx.mediaPlanId && (
                          <a href={`/media-plans/${runCtx.mediaPlanId}/build`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1">
                            <Eye className="w-3 h-3" /> ดู / แก้ไขใน Media Plan
                          </a>
                        )}
                      </>
                    )}
                    {s.n === 2 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-600">Ad Copy — แก้ไขได้เลย</p>
                          {runCtx.mediaPlanId && (
                            <a href={`/media-plans/${runCtx.mediaPlanId}/build`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                              <Eye className="w-3 h-3" /> ดูใน Media Plan
                            </a>
                          )}
                        </div>
                        {blueprints.length === 0 && (
                          <p className="text-xs text-gray-400 italic">Blueprint กำลังโหลด...</p>
                        )}
                        {blueprints.map((bp, i) => (
                          <div key={i} className="bg-white rounded-xl border border-emerald-100 p-3">
                            <p className="text-xs font-semibold text-gray-700 mb-3">{bp.campaignName}</p>
                            <AdTextEditor
                              campaign={bp}
                              onChange={updated => saveBlueprintChange(updated)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {s.n === 3 && (
                      <>
                        <p className="text-xs font-semibold text-gray-600">QA Score: <span className="text-emerald-700">{(state.data?.score as number) ?? '—'}/100</span></p>
                        {preview && ((preview as {checks?: {name:string;status:string;message:string;recommendation?:string}[]})?.checks ?? []).slice(0, 8).map((c, i) => (
                          <div key={i} className="flex items-start gap-2 bg-white rounded-lg px-3 py-1.5 border border-emerald-100">
                            <span className={cn('text-[10px] font-bold mt-0.5', c.status === 'pass' ? 'text-emerald-600' : c.status === 'warning' ? 'text-amber-500' : 'text-red-500')}>
                              {c.status === 'pass' ? '✓' : c.status === 'warning' ? '⚠' : '✗'}
                            </span>
                            <div>
                              <p className="text-xs font-medium text-gray-700">{c.name}</p>
                              {c.message && <p className="text-[10px] text-gray-400">{c.message}</p>}
                              {c.recommendation && c.status !== 'pass' && <p className="text-[10px] text-amber-600 mt-0.5">{c.recommendation}</p>}
                            </div>
                          </div>
                        ))}
                        {runCtx.mediaPlanId && (
                          <a href={`/media-plans/${runCtx.mediaPlanId}/build`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1">
                            <Eye className="w-3 h-3" /> ดู Media Plan เต็มรูปแบบ
                          </a>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Push button — shown after QA done */}
        {stepStates[3]?.status === 'done' && phase === 'pipeline' && (
          <div className="mt-6 bg-white rounded-2xl border border-blue-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">พร้อม Push เข้า Google Ads</h3>
            <p className="text-xs text-gray-500 mb-4">Campaign จะถูกสร้างในสถานะ PAUSED — ตรวจสอบก่อน Enable เอง</p>
            <button
              onClick={pushCampaign}
              disabled={stepStates[4]?.status === 'loading'}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
            >
              {stepStates[4]?.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {stepStates[4]?.status === 'loading' ? 'กำลัง Push...' : 'Push Campaign (PAUSED)'}
            </button>
            {stepStates[4]?.status === 'error' && (
              <p className="text-xs text-red-500 mt-2 text-center">{stepStates[4].message}</p>
            )}
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="mt-6 bg-emerald-50 rounded-2xl border border-emerald-200 p-5 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-base font-bold text-emerald-800 mb-1">Campaign สร้างสำเร็จ!</h3>
            <p className="text-sm text-emerald-600 mb-4">Campaign อยู่ใน Google Ads สถานะ PAUSED — กด Enable ใน Google Ads เพื่อเริ่มแสดงโฆษณา</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setPhase('account'); setSelectedTemplate(null); setStepStates({}); setCurrentStep(-1); setKeywords([]); setAudiences([]) }}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" /> สร้าง Campaign ใหม่
              </button>
              <a href="/push-logs" className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors">
                <Globe className="w-4 h-4" /> ดู Push Log
              </a>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
