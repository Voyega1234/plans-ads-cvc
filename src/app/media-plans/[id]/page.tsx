'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import FlowProgressBar from '@/components/workflow/FlowProgressBar'
import CampaignMixTable from '@/components/media-plan/CampaignMixTable'
import ForecastCard from '@/components/media-plan/ForecastCard'
import BudgetSplitChart from '@/components/dashboard/BudgetSplitChart'
import BudgetAllocationTable from '@/components/media-plan/BudgetAllocationTable'
import AudienceSignalBuilder from '@/components/media-plan/AudienceSignalBuilder'
import AudienceManager from '@/components/media-plan/AudienceManager'
import { MediaPlanJson, CampaignMixItem, PMaxSignal, KeywordAudiencePlan, KeywordItem } from '@/types'
import type { ResearchKeyword } from '@/app/api/keyword-research/generate/route'
import Link from 'next/link'
import {
  Zap, FileText, CheckCircle, Save, Rocket, Target,
  Hammer, Check, ChevronRight as ChevronRightIcon, Sparkles, Download, Settings2,
  Plus, Search, Users, ChevronDown, ChevronUp, AlertCircle,
  Clock, ThumbsUp, Loader2, X, ShieldAlert, Tag, BarChart3, ExternalLink,
} from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Brief {
  businessName?: string
  websiteUrl?: string
  productService?: string
  objective?: string
  monthlyBudget?: number
  targetLocation?: string
  language?: string
  targetAudience?: string
  conversionGoal?: string
  brandTone?: string
  googleAdsCustomerId?: string
  ga4MeasurementId?: string
  gtmContainerId?: string
  adsConversionId?: string
  adsConversionLabel?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
}

interface PushJob {
  id: string
  status: string
  mode: string
  createdAt: string
}

interface Blueprint {
  id: string
  status: string
  qaScore?: number | null
  pushJobs?: PushJob[]
}

interface MediaPlan {
  id: string
  title: string
  objective: string
  monthlyBudget: number
  planJson: string
  status: string
  createdAt: string
  brief?: Brief | null
  blueprints?: Blueprint[]
  keywordIdeas?: { id: string }[]
}

interface Props {
  params: { id: string }
}

// ─── Match type badge ────────────────────────────────────────────────────────

const matchColors: Record<string, string> = {
  EXACT:  'bg-green-100 text-green-700',
  PHRASE: 'bg-blue-100 text-blue-700',
  BROAD:  'bg-yellow-100 text-yellow-700',
}

const intentColors: Record<string, string> = {
  high:   'bg-red-50 text-red-600',
  medium: 'bg-amber-50 text-amber-600',
  low:    'bg-gray-100 text-gray-500',
}

const KW_GROUP_LABELS: Record<string, string> = {
  brand:      'Brand',
  product:    'Product',
  service:    'Service',
  generic:    'Generic',
  competitor: 'Competitor',
}

const KW_GROUP_COLORS: Record<string, string> = {
  brand:      'bg-blue-100 text-blue-700',
  product:    'bg-emerald-100 text-emerald-700',
  service:    'bg-violet-100 text-violet-700',
  generic:    'bg-yellow-100 text-yellow-700',
  competitor: 'bg-purple-100 text-purple-700',
}

// ─── PMax helpers ────────────────────────────────────────────────────────────

function makeEmptySignal(campaignName: string): PMaxSignal {
  return {
    campaignName,
    audienceSignals: {
      customIntent: [],
      searchThemes: [],
      customerList: [],
      remarketing: [],
      inMarket: [],
      demographics: { ageRanges: [], genders: [], householdIncome: [] },
    },
    assetSuggestions: { headlines: [], descriptions: [], imageThemes: [], videoTopics: [] },
  }
}

// ─── Campaign Workflow Stepper ───────────────────────────────────────────────

interface WorkflowStep {
  label: string
  done: boolean
  ctaLabel?: string
  ctaHref?: string
  ctaDisabled?: boolean
}

function CampaignWorkflowStepper({ plan }: { plan: MediaPlan }) {
  const pushDone = plan.blueprints?.[0]?.pushJobs?.some((j) => j.status === 'completed') ?? false

  const buildHref = `/media-plans/${plan.id}/build`

  const steps: WorkflowStep[] = [
    { label: 'Brief', done: true },
    { label: 'Campaign Structure', done: false, ctaLabel: 'เริ่ม Build', ctaHref: buildHref },
    { label: 'Keyword Research',  done: false, ctaLabel: 'เริ่ม Build', ctaHref: buildHref },
    { label: 'Ad Copy',           done: false, ctaLabel: 'เริ่ม Build', ctaHref: buildHref },
    { label: 'QA',                done: false, ctaLabel: 'เริ่ม Build', ctaHref: buildHref },
    { label: 'Push',              done: pushDone, ctaLabel: 'ดูผลลัพธ์', ctaHref: buildHref },
  ]

  const currentIdx = steps.findIndex((s) => !s.done)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="font-semibold text-gray-900 mb-4">Campaign Workflow</h2>
      <div className="flex items-start gap-0 overflow-x-auto pb-2">
        {steps.map((step, i) => {
          const isDone = step.done
          const isCurrent = i === currentIdx
          const isPending = !isDone && !isCurrent

          return (
            <div key={i} className="flex items-start">
              <div className="flex flex-col items-center min-w-[90px] max-w-[110px]">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
                    isDone
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : isCurrent
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                  )}
                >
                  {isDone ? <Check className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </div>
                <p
                  className={cn(
                    'text-xs font-medium mt-1.5 text-center leading-tight',
                    isDone ? 'text-emerald-700' : isCurrent ? 'text-blue-700' : 'text-gray-400'
                  )}
                >
                  {step.label}
                </p>
                {isCurrent && step.ctaHref && (
                  <Link
                    href={step.ctaDisabled ? '#' : step.ctaHref}
                    className={cn(
                      'mt-2 px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors',
                      step.ctaDisabled
                        ? 'bg-gray-100 text-gray-400 pointer-events-none'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    )}
                  >
                    {step.ctaLabel}
                  </Link>
                )}
                {isPending && (
                  <span className="mt-2 text-[10px] text-gray-400">รอดำเนินการ</span>
                )}
              </div>

              {i < steps.length - 1 && (
                <div className="flex items-center mt-3.5 mx-1">
                  <div
                    className={cn(
                      'h-0.5 w-6',
                      steps[i].done && steps[i + 1].done ? 'bg-emerald-400' : steps[i].done ? 'bg-blue-300' : 'bg-gray-200'
                    )}
                  />
                  <ChevronRightIcon className={cn('w-3 h-3 -ml-1', steps[i].done ? 'text-blue-300' : 'text-gray-200')} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── AI Assist Modal ─────────────────────────────────────────────────────────

interface AIAssistResult {
  suggestions: {
    budgetRationale: string
    bidStrategyRationale: string
    targetCPA?: number
    maxCpc?: number
    targetRoas?: number
    keywordSuggestions?: string[]
    audienceSuggestions?: string[]
    optimizationTips: string[]
  }
}

function AIAssistModal({
  campaign,
  brief,
  currentKeywords,
  onClose,
  onApply,
}: {
  campaign: CampaignMixItem
  brief: Brief | null | undefined
  currentKeywords: string[]
  onClose: () => void
  onApply: (patch: Partial<CampaignMixItem>) => void
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIAssistResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/media-plans/ai-assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign, brief, currentKeywords }),
    })
      .then((r) => r.json())
      .then((data: AIAssistResult) => { setResult(data); setLoading(false) })
      .catch(() => { setError('AI assist ไม่สำเร็จ'); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const s = result?.suggestions

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h3 className="font-semibold text-gray-900">AI Assist — {campaign.campaignName.replace('CVC - ', '')}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-3 text-gray-500">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span>กำลังวิเคราะห์ campaign...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {s && (
            <>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-600 mb-1">Budget Analysis</p>
                <p className="text-sm text-blue-800">{s.budgetRationale}</p>
              </div>

              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-600 mb-1">Bid Strategy</p>
                <p className="text-sm text-purple-800">{s.bidStrategyRationale}</p>
              </div>

              {(s.targetCPA || s.maxCpc || s.targetRoas) && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Suggested Values</p>
                  <div className="flex flex-wrap gap-4">
                    {s.targetCPA && (
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400">Target CPA</p>
                        <p className="text-sm font-bold text-gray-800">฿{s.targetCPA.toLocaleString()}</p>
                        <button onClick={() => onApply({ targetCPA: s.targetCPA })} className="text-[10px] text-blue-600 hover:underline">ใช้ค่านี้</button>
                      </div>
                    )}
                    {s.maxCpc && (
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400">Max CPC</p>
                        <p className="text-sm font-bold text-gray-800">฿{s.maxCpc.toLocaleString()}</p>
                        <button onClick={() => onApply({ maxCpc: s.maxCpc })} className="text-[10px] text-blue-600 hover:underline">ใช้ค่านี้</button>
                      </div>
                    )}
                    {s.targetRoas && (
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400">Target ROAS</p>
                        <p className="text-sm font-bold text-gray-800">{s.targetRoas}x</p>
                        <button onClick={() => onApply({ targetRoas: s.targetRoas })} className="text-[10px] text-blue-600 hover:underline">ใช้ค่านี้</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {s.keywordSuggestions && s.keywordSuggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Keyword Suggestions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.keywordSuggestions.map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {s.audienceSuggestions && s.audienceSuggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Audience Suggestions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.audienceSuggestions.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Optimization Tips</p>
                <ul className="space-y-1.5">
                  {s.optimizationTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Keywords Section ───────────────────────────────────────────────

function CampaignKeywordsSection({
  campaignName,
  planId,
  brief,
  keywordPlan,
  onKeywordDeleted,
  onKeywordsAdded,
}: {
  campaignName: string
  planId: string
  brief?: Brief | null
  keywordPlan: KeywordAudiencePlan | null
  onKeywordDeleted?: (keywordId: string) => void
  onKeywordsAdded?: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showResearch, setShowResearch] = useState(false)
  const [researching, setResearching] = useState(false)
  const [researchError, setResearchError] = useState('')
  const [researchKeywords, setResearchKeywords] = useState<ResearchKeyword[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  const groups = keywordPlan?.keywordGroups.filter((g) =>
    g.campaignName.toLowerCase() === campaignName.toLowerCase()
  ) ?? []
  const allKeywords = groups.flatMap((g) => g.keywords)

  // Group research results by category
  const researchGroups = (['brand', 'product', 'service', 'generic', 'competitor'] as const).map(g => ({
    group: g,
    keywords: researchKeywords.map((kw, i) => ({ kw, i })).filter(({ kw }) => kw.group === g),
  })).filter(({ keywords }) => keywords.length > 0)

  async function deleteKeyword(kwId: string) {
    setDeleting(kwId)
    try {
      await fetch(`/api/keyword-audience/${planId}?keywordId=${kwId}`, { method: 'DELETE' })
      onKeywordDeleted?.(kwId)
    } finally {
      setDeleting(null)
    }
  }

  async function runResearch() {
    setResearching(true)
    setResearchError('')
    setResearchKeywords([])
    setSelected(new Set())
    setSavedCount(null)
    try {
      const res = await fetch('/api/keyword-research/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName:   brief?.businessName ?? campaignName,
          productService: brief?.productService ?? brief?.businessName ?? campaignName,
          location:       brief?.targetLocation ?? 'ทั่วประเทศไทย',
          objective:      brief?.objective ?? 'leads',
          language:       brief?.language ?? 'th',
        }),
      })
      const data = await res.json() as { keywords?: ResearchKeyword[]; error?: string }
      if (!res.ok || data.error) { setResearchError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      const kws = data.keywords ?? []
      setResearchKeywords(kws)
      // Pre-select all by default
      setSelected(new Set(kws.map((_, i) => i)))
    } catch {
      setResearchError('ไม่สามารถเชื่อมต่อได้')
    } finally {
      setResearching(false)
    }
  }

  async function saveSelected() {
    const selectedKws = researchKeywords.filter((_, i) => selected.has(i))
    if (!selectedKws.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/keyword-research/save-to-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'existing',
          mediaPlanId: planId,
          campaignName,
          keywords: selectedKws,
        }),
      })
      const data = await res.json() as { count?: number; error?: string }
      if (!res.ok || data.error) { setResearchError(data.error ?? 'บันทึกไม่สำเร็จ'); return }
      setSavedCount(data.count ?? selectedKws.length)
      setResearchKeywords([])
      setSelected(new Set())
      onKeywordsAdded?.()
    } catch {
      setResearchError('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function toggleKw(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function toggleGroup(indices: number[]) {
    const allSelected = indices.every(i => selected.has(i))
    setSelected(prev => {
      const next = new Set(prev)
      indices.forEach(i => allSelected ? next.delete(i) : next.add(i))
      return next
    })
  }

  return (
    <div className="mt-3">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Search className="w-4 h-4 text-blue-500" />
          <span>Keywords ({allKeywords.length} คำ)</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </button>
        <button
          onClick={() => { setShowResearch(v => !v); if (!showResearch && researchKeywords.length === 0) runResearch() }}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full px-2.5 py-1 transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Research Keywords
        </button>
      </div>

      {/* Inline Research Panel */}
      {showResearch && (
        <div className="mb-3 border border-blue-200 rounded-xl bg-blue-50/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              AI Keyword Research — {campaignName}
            </p>
            <div className="flex items-center gap-2">
              {!researching && researchKeywords.length > 0 && (
                <button onClick={runResearch} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium">↺ Re-generate</button>
              )}
              <button onClick={() => setShowResearch(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {researching && (
            <div className="flex items-center gap-2 py-4 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>กำลังวิเคราะห์ keywords...</span>
            </div>
          )}

          {researchError && (
            <div className="flex items-center gap-2 py-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              {researchError}
            </div>
          )}

          {savedCount !== null && (
            <div className="flex items-center gap-2 py-2 text-xs text-emerald-700 font-medium">
              <CheckCircle className="w-3.5 h-3.5" />
              บันทึก {savedCount} keywords แล้ว
            </div>
          )}

          {researchKeywords.length > 0 && (
            <>
              <div className="space-y-2 mb-3">
                {researchGroups.map(({ group, keywords: kwItems }) => (
                  <div key={group}>
                    <button
                      onClick={() => toggleGroup(kwItems.map(({ i }) => i))}
                      className="flex items-center gap-1.5 mb-1"
                    >
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', KW_GROUP_COLORS[group])}>
                        {KW_GROUP_LABELS[group]}
                      </span>
                      <span className="text-[10px] text-gray-400">({kwItems.length})</span>
                      <span className="text-[10px] text-blue-500 hover:text-blue-700">
                        {kwItems.every(({ i }) => selected.has(i)) ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                      </span>
                    </button>
                    <div className="flex flex-wrap gap-1.5 pl-1">
                      {kwItems.map(({ kw, i }) => (
                        <button
                          key={i}
                          onClick={() => toggleKw(i)}
                          className={cn(
                            'flex items-center gap-1 rounded-lg px-2 py-1 text-xs border transition-colors',
                            selected.has(i)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                          )}
                        >
                          <span className={cn(
                            'text-[9px] font-medium px-1 rounded',
                            selected.has(i) ? 'bg-white/20 text-white' : matchColors[kw.matchType] ?? 'bg-gray-100 text-gray-500'
                          )}>
                            {kw.matchType === 'BROAD' ? 'B' : '"P"'}
                          </span>
                          {kw.keyword}
                          {kw.avgMonthlySearches != null && kw.avgMonthlySearches > 0 && (
                            <span className={selected.has(i) ? 'text-white/70 text-[9px]' : 'text-gray-400 text-[9px]'}>
                              {kw.avgMonthlySearches >= 1000 ? `${(kw.avgMonthlySearches/1000).toFixed(1)}K` : kw.avgMonthlySearches}/mo
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-blue-100">
                <span className="text-xs text-gray-500">เลือก {selected.size} / {researchKeywords.length} คำ</span>
                <button
                  onClick={saveSelected}
                  disabled={saving || selected.size === 0}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {saving ? 'กำลังบันทึก...' : `บันทึก ${selected.size} keywords`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Saved keywords list */}
      {allKeywords.length === 0 && !showResearch && (
        <div className="border border-dashed border-gray-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Search className="w-4 h-4" />
            <span>ยังไม่มี Keywords</span>
          </div>
        </div>
      )}

      {expanded && allKeywords.length > 0 && (
        <div className="space-y-3">
          {groups.map((group, gi) => (
            <div key={gi} className="bg-white rounded-lg p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">
                {KW_GROUP_LABELS[group.adGroupName] ?? group.adGroupName}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.keywords.map((kw: KeywordItem, ki: number) => (
                  <div key={kw.id ?? ki} className="group flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 hover:border-red-200 hover:bg-red-50 transition-colors">
                    <span className={cn('text-[10px] font-medium px-1 py-0.5 rounded', matchColors[kw.matchType] ?? 'bg-gray-100 text-gray-500')}>
                      {kw.matchType === 'EXACT' ? '[E]' : kw.matchType === 'PHRASE' ? '"P"' : 'B'}
                    </span>
                    <span className="text-xs text-gray-800">{kw.keyword}</span>
                    {kw.intent && (
                      <span className={cn('text-[9px] px-1 rounded', KW_GROUP_COLORS[kw.intent] ?? intentColors[kw.intent] ?? 'bg-gray-100')}>
                        {KW_GROUP_LABELS[kw.intent] ?? kw.intent}
                      </span>
                    )}
                    {kw.avgMonthlySearches != null && kw.avgMonthlySearches > 0 && (
                      <span className="text-[9px] text-gray-400">
                        {kw.avgMonthlySearches >= 1000 ? `${(kw.avgMonthlySearches / 1000).toFixed(1)}K` : kw.avgMonthlySearches}/mo
                      </span>
                    )}
                    {kw.id && (
                      <button
                        onClick={() => deleteKeyword(kw.id!)}
                        disabled={deleting === kw.id}
                        className="ml-0.5 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all disabled:opacity-50"
                        title="ลบ keyword"
                      >
                        {deleting === kw.id ? (
                          <span className="text-[10px]">...</span>
                        ) : (
                          <span className="text-[11px] font-bold leading-none">×</span>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campaign Audience Section (non-PMax) ────────────────────────────────────

function CampaignAudienceSection({
  campaignName,
  keywordPlan,
}: {
  campaignName: string
  keywordPlan: KeywordAudiencePlan | null
}) {
  const [expanded, setExpanded] = useState(false)
  const audiences = keywordPlan?.audienceSegments.filter((a) =>
    a.campaignName.toLowerCase() === campaignName.toLowerCase()
  ) ?? []

  if (audiences.length === 0) return null

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2"
      >
        <Users className="w-4 h-4 text-purple-500" />
        <span>Audiences ({audiences.length})</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-2">
          {audiences.map((a, i) => (
            <div key={i} className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-sm">
              <p className="font-medium text-purple-800">{a.name}</p>
              <p className="text-xs text-purple-500">{a.type} • {a.source}</p>
              {a.description && <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Per-Campaign Detail Card ────────────────────────────────────────────────

function CampaignCard({
  campaign,
  index,
  planId,
  brief,
  keywordPlan,
  onAIAssist,
  onKeywordDeleted,
  onKeywordsAdded,
}: {
  campaign: CampaignMixItem
  index: number
  planId: string
  brief?: Brief | null
  keywordPlan: KeywordAudiencePlan | null
  onAIAssist: (campaign: CampaignMixItem, index: number) => void
  onKeywordDeleted?: (keywordId: string) => void
  onKeywordsAdded?: () => void
}) {
  const isSearchLike = campaign.type !== 'PERFORMANCE_MAX'

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{campaign.campaignName}</span>
          <span className="text-xs text-gray-400 bg-gray-200 rounded px-1.5 py-0.5">{campaign.type}</span>
        </div>
        <button
          onClick={() => onAIAssist(campaign, index)}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium bg-purple-50 hover:bg-purple-100 rounded-full px-2.5 py-1 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Assist
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-1">{campaign.objective}</p>

      {isSearchLike && (
        <CampaignKeywordsSection
          campaignName={campaign.campaignName}
          planId={planId}
          brief={brief}
          keywordPlan={keywordPlan}
          onKeywordDeleted={onKeywordDeleted}
          onKeywordsAdded={onKeywordsAdded}
        />
      )}

      <CampaignAudienceSection campaignName={campaign.campaignName} keywordPlan={keywordPlan} />
    </div>
  )
}

// ─── Draft / Approve Banner ──────────────────────────────────────────────────

function StatusBanner({
  status,
  planId,
  onStatusChange,
}: {
  status: string
  planId: string
  onStatusChange: (status: string) => void
}) {
  const [updating, setUpdating] = useState(false)

  async function changeStatus(newStatus: string) {
    setUpdating(true)
    try {
      await fetch(`/api/media-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      onStatusChange(newStatus)
    } finally {
      setUpdating(false)
    }
  }

  if (status === 'approved') {
    return (
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2">
          <ThumbsUp className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-800">Plan Approved</p>
            <p className="text-sm text-emerald-600">ลูกค้า approve แล้ว พร้อมสร้าง Ad Copy</p>
          </div>
        </div>
        <button
          onClick={() => changeStatus('draft')}
          disabled={updating}
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
        >
          กลับเป็น Draft
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-800">Draft — รอ Approve</p>
          <p className="text-sm text-amber-600">Export ส่งลูกค้าเพื่อ review ก่อน generate ads</p>
        </div>
      </div>
      <button
        onClick={() => changeStatus('approved')}
        disabled={updating}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors"
      >
        {updating ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <ThumbsUp className="w-4 h-4" />
        )}
        Mark as Approved
      </button>
    </div>
  )
}

// ─── CVC naming normalizer ────────────────────────────────────────────────────

function toCvcName(c: CampaignMixItem): string {
  const existing = c.campaignName ?? ''
  // Already in CVC format — keep it
  if (/^CVCs*-/i.test(existing)) return existing

  // Extract hints from the old name or fields
  const raw = existing.toLowerCase()
  const obj  = (c.objective ?? '').toUpperCase()
  const goal = obj.includes('LEAD') ? 'Lead' : obj.includes('SALE') ? 'Sales' : obj.includes('TRAFFIC') ? 'Traffic' : obj.includes('AWARE') ? 'Awareness' : 'Lead'

  switch (c.type) {
    case 'SEARCH': {
      // Try to extract keyword group from name (e.g. "Generic", "Brand", "Service")
      const theme = c.theme ?? (raw.includes('brand') ? 'Brand' : raw.includes('competitor') ? 'Competitor' : raw.includes('service') ? 'Service' : raw.includes('product') ? 'Product' : 'Generic')
      return `CVC - SEM | ${theme} | ${goal}`
    }
    case 'PERFORMANCE_MAX': {
      const audience = raw.includes('sme') ? 'SME Owner' : raw.includes('remarketing') || raw.includes('retarget') ? 'Remarketing' : 'All Audiences'
      return `CVC - Performance Max | ${audience}`
    }
    case 'DISPLAY':
      return 'CVC - GDN'
    case 'DEMAND_GEN':
      return `CVC - Demand Gen | ${goal}`
    case 'SHOPPING':
      return `CVC - Shopping | ${c.bidStrategy ?? 'ROAS'}`
    case 'VIDEO':
    case 'YOUTUBE': {
      const bid = (c.bidStrategy ?? '').includes('CPM') ? 'CPM' : (c.bidStrategy ?? '').includes('CPV') ? 'CPV' : 'CPA'
      return `CVC - YouTube | ${bid}`
    }
    case 'APP_CAMPAIGN':
      return raw.includes('engag') ? 'CVC - UACe | App Engagement' : 'CVC - UACi | App Install'
    default:
      return `CVC - ${c.type}`
  }
}

function normalizeMediaPlanNames(parsed: MediaPlanJson): MediaPlanJson {
  return {
    ...parsed,
    campaignMix: parsed.campaignMix.map(c => ({ ...c, campaignName: toCvcName(c) })),
  }
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MediaPlanDetailPage({ params }: Props) {
  const router = useRouter()
  const [plan, setPlan] = useState<MediaPlan | null>(null)
  const [planJson, setPlanJson] = useState<MediaPlanJson | null>(null)
  const [pmaxSignals, setPmaxSignals] = useState<PMaxSignal[]>([])
  const [keywordPlan, setKeywordPlan] = useState<KeywordAudiencePlan | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiAssistTarget, setAiAssistTarget] = useState<{ campaign: CampaignMixItem; index: number } | null>(null)
  const [trackingReady, setTrackingReady] = useState<boolean | null>(null)
  const [accountMetrics, setAccountMetrics] = useState<{
    clicks: number; impressions: number; cost: number; ctr: number; cpc: number
    conversions: number; cpa: number; conversionRate: number
  } | null>(null)

  useEffect(() => {
    fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((d) => {
        const ga4Ready = !!d.ga4?.live
        const adsReady = !!(d.google_ads?.live || d.google_ads?.mock)
        setTrackingReady(ga4Ready && adsReady)
      })
      .catch(() => setTrackingReady(false))
  }, [])

  const fetchPlan = useCallback(async () => {
    try {
      const [planRes, kwRes] = await Promise.all([
        fetch(`/api/media-plans/${params.id}`),
        fetch(`/api/keyword-audience/${params.id}`),
      ])
      if (!planRes.ok) {
        if (planRes.status === 404) { router.replace('/media-plans'); return }
        throw new Error('Failed to fetch')
      }
      const data: MediaPlan = await planRes.json()
      setPlan(data)
      const parsed: MediaPlanJson = normalizeMediaPlanNames(JSON.parse(data.planJson))
      setPlanJson(parsed)

      // Fetch real account metrics if we have a customerId
      const customerId = data.brief?.googleAdsCustomerId
      if (customerId) {
        fetch(`/api/performance/account?customerId=${customerId}&days=30`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.current) setAccountMetrics(d.current) })
          .catch(() => {})
      }

      const pmaxCampaigns = parsed.campaignMix.filter((c) => c.type === 'PERFORMANCE_MAX')
      if (parsed.pmaxSignals && parsed.pmaxSignals.length > 0) {
        const signalMap = new Map(parsed.pmaxSignals.map((s) => [s.campaignName, s]))
        setPmaxSignals(pmaxCampaigns.map((c) => signalMap.get(c.campaignName) ?? makeEmptySignal(c.campaignName)))
      } else {
        setPmaxSignals(pmaxCampaigns.map((c) => makeEmptySignal(c.campaignName)))
      }

      if (kwRes.ok) {
        const kwData: KeywordAudiencePlan = await kwRes.json()
        setKeywordPlan(kwData)
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้')
    }
  }, [params.id, router])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  function handleCampaignMixChange(campaigns: CampaignMixItem[]) {
    if (!planJson) return
    setPlanJson({ ...planJson, campaignMix: campaigns })
    setIsDirty(true)
  }

  function handleSignalChange(idx: number, updated: PMaxSignal) {
    const newSignals = pmaxSignals.map((s, i) => (i === idx ? updated : s))
    setPmaxSignals(newSignals)
    setIsDirty(true)
    // Auto-save signals immediately so they survive navigation
    if (planJson && plan) {
      const updatedJson: MediaPlanJson = { ...planJson, pmaxSignals: newSignals }
      fetch(`/api/media-plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planJson: JSON.stringify(updatedJson) }),
      }).then(() => {
        setPlanJson(updatedJson)
        setIsDirty(false)
      }).catch(() => { /* silent — user can still manually save */ })
    }
  }

  function handleAIApply(index: number, patch: Partial<CampaignMixItem>) {
    if (!planJson) return
    const updatedMix = planJson.campaignMix.map((c, i) => i === index ? { ...c, ...patch } : c)
    setPlanJson({ ...planJson, campaignMix: updatedMix })
    setIsDirty(true)
    setAiAssistTarget(null)
  }

  async function handleSave() {
    if (!planJson || !plan) return
    setSaving(true)
    try {
      const updatedJson: MediaPlanJson = { ...planJson, pmaxSignals }
      const res = await fetch(`/api/media-plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planJson: JSON.stringify(updatedJson) }),
      })
      if (!res.ok) throw new Error('Save failed')
      setPlanJson(updatedJson)
      setIsDirty(false)
    } catch {
      setError('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  function handleExportCSV() {
    if (!plan) return
    window.open(`/api/export/media-plan?planId=${plan.id}&format=csv`, '_blank')
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <p className="text-red-500">{error}</p>
        </div>
      </AppShell>
    )
  }

  if (!plan || !planJson) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  const budgetData = planJson.campaignMix.map((c, i) => ({
    name: c.campaignName,
    value: c.dailyBudget ?? Math.round((c.monthlyBudget ?? 0) / 30),
    color: ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'][i % 4],
  }))
  const blueprint = plan.blueprints?.[0]
  const pmaxCampaigns = planJson.campaignMix.filter((c) => c.type === 'PERFORMANCE_MAX')

  const hasKeywords = (plan.keywordIdeas?.length ?? 0) > 0
  const hasBlueprint = !!blueprint

  // Derive current flow step from plan state
  const currentFlowStep: import('@/components/workflow/FlowProgressBar').FlowStep = (() => {
    if (blueprint?.pushJobs?.some(j => j.status === 'completed')) return 'push'
    if (blueprint?.qaScore != null) return 'qa'
    if (hasBlueprint) return 'adcopy'
    if (hasKeywords) return 'research'
    if (planJson.campaignMix.length > 0) return 'structure'
    return 'brief'
  })()

  return (
    <AppShell>
      <FlowProgressBar planId={plan.id} currentStep={currentFlowStep} />

      {/* AI Assist Modal */}
      {aiAssistTarget && (
        <AIAssistModal
          campaign={aiAssistTarget.campaign}
          brief={plan.brief}
          currentKeywords={
            keywordPlan?.keywordGroups
              .filter((g) => g.campaignName.toLowerCase() === aiAssistTarget.campaign.campaignName.toLowerCase())
              .flatMap((g) => g.keywords.map((k: KeywordItem) => k.keyword))
            ?? []
          }
          onClose={() => setAiAssistTarget(null)}
          onApply={(patch) => handleAIApply(aiAssistTarget.index, patch)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4 pt-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Link href="/media-plans" className="hover:text-gray-600">Media Plans</Link>
            <ChevronRightIcon className="w-3 h-3" />
            <span className="text-gray-600 font-medium truncate max-w-xs">{plan.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{plan.title}</h1>
            {isDirty && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full">
                มีการแก้ไข
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">สร้างเมื่อ {formatDate(plan.createdAt)} • {plan.objective}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end items-center">
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <Link
            href={`/keyword-planner/${plan.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Search className="w-4 h-4" />
            Keyword Research
          </Link>
          <Link
            href={`/media-plans/${plan.id}/build`}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
          >
            <Zap className="w-4 h-4" />
            Build Campaign
          </Link>
          <Link
            href={`/campaign-adjustment/${plan.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Adjust Existing
          </Link>
        </div>
      </div>

      {/* Draft / Approve status */}
      <StatusBanner
        status={plan.status}
        planId={plan.id}
        onStatusChange={(s) => setPlan((p) => p ? { ...p, status: s } : p)}
      />

      {/* Tracking Warning */}
      {trackingReady === false && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">Tracking ยังไม่พร้อม — Smart Bidding จะทำงานไม่ได้</p>
            <p className="text-sm text-amber-700 mt-0.5">
              ยังไม่มี Conversion Actions ในบัญชีนี้ หรือ GA4 ยังไม่ได้เชื่อมต่อ
              — campaign ที่ใช้ Maximize Conversions จะไม่สามารถ optimize ได้จนกว่าจะมี conversion data
            </p>
          </div>
          <Link
            href="/tracking-setup"
            className="flex-shrink-0 text-sm font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2"
          >
            ตั้งค่า Tracking
          </Link>
        </div>
      )}


      {/* Forecast */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Forecast (30 วัน)</h2>
        <ForecastCard forecast={planJson.forecast} accountMetrics={accountMetrics} />
      </div>

      {/* Budget Allocation — table + pie chart side by side */}
      <div className="mb-6">
        <BudgetAllocationTable
          campaigns={planJson.campaignMix}
          totalBudget={plan.monthlyBudget}
          onChange={handleCampaignMixChange}
        />
      </div>

      {/* Campaign Mix — full detail table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Campaign Mix</h2>
          <span className="text-xs text-gray-400">คลิกที่ค่าเพื่อแก้ไข</span>
        </div>
        <CampaignMixTable campaigns={planJson.campaignMix} onChange={handleCampaignMixChange} />
      </div>

      {/* Per-Campaign details: keywords + audiences + AI assist */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Campaign Details</h2>
          <p className="text-xs text-gray-400">Keywords และ Audience ต่อแคมเปญ</p>
        </div>
        <div className="space-y-3">
          {planJson.campaignMix.map((c, i) => (
            <CampaignCard
              key={i}
              campaign={c}
              index={i}
              planId={plan.id}
              brief={plan.brief}
              keywordPlan={keywordPlan}
              onAIAssist={(campaign, index) => setAiAssistTarget({ campaign, index })}
              onKeywordDeleted={(kwId) => setKeywordPlan((prev) => prev ? {
                ...prev,
                keywordGroups: prev.keywordGroups.map((g) => ({
                  ...g,
                  keywords: g.keywords.filter((k) => k.id !== kwId),
                })).filter((g) => g.keywords.length > 0),
              } : prev)}
              onKeywordsAdded={fetchPlan}
            />
          ))}
        </div>
      </div>

      {/* Audience Signals — PMax only */}
      {pmaxCampaigns.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">Audience Signals</h2>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              Performance Max
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Audience Signals คือ hints ให้ Google AI หาคนที่ใช่ — ไม่ใช่ targeting แบบ restrict
          </p>
          <div className="space-y-4">
            {pmaxSignals.map((signal, idx) => (
              <AudienceSignalBuilder
                key={signal.campaignName}
                campaignName={signal.campaignName}
                signal={signal}
                onChange={(updated) => handleSignalChange(idx, updated)}
                briefContext={{
                  businessName:   plan?.brief?.businessName,
                  productService: plan?.brief?.productService,
                  targetAudience: plan?.brief?.targetAudience,
                  objective:      plan?.brief?.objective,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Remarketing Audience Manager */}
      {planJson.campaignMix.some(c => ['DISPLAY', 'PERFORMANCE_MAX', 'DEMAND_GEN'].includes(c.type)) && (
        <div className="mb-6">
          <AudienceManager
            customerId={plan.brief?.googleAdsCustomerId ?? ''}
            planId={plan.id}
            hasDisplayCampaign={planJson.campaignMix.some(c => c.type === 'DISPLAY')}
            hasWebsite={!!(plan.brief?.websiteUrl)}
            websiteUrl={plan.brief?.websiteUrl ?? ''}
          />
        </div>
      )}

      {/* Strategic Rationale */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Strategic Rationale</h2>
        <p className="text-gray-600 leading-relaxed">{planJson.strategicRationale}</p>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">AI Recommendations</h2>
        <ul className="space-y-2">
          {planJson.recommendations.map((rec, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              {rec}
            </li>
          ))}
        </ul>
      </div>

      {/* Next steps after blueprint */}
      {blueprint && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-5 mb-6">
          <h2 className="font-semibold text-blue-800 mb-2">Campaign Blueprint พร้อมแล้ว</h2>
          <p className="text-sm text-blue-700 mb-3">Blueprint ถูกสร้างแล้ว พร้อม QA และ Push ขึ้น Google Ads</p>
          <div className="flex gap-3">
            <Link
              href={`/review/${plan.id}`}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              ไปที่ QA Review
            </Link>
            <Link
              href={`/push-log/${plan.id}`}
              className="px-4 py-2 bg-white text-blue-600 text-sm font-medium rounded-lg border border-blue-300 hover:bg-blue-50 transition-colors"
            >
              ดู Push Log
            </Link>
          </div>
        </div>
      )}

      {/* Launch Campaign */}
      <button
        onClick={() => router.push(`/keyword-planner/${plan.id}`)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-base font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
      >
        <Rocket className="w-5 h-5" />
        ถัดไป: Keyword Research →
      </button>
    </AppShell>
  )
}
