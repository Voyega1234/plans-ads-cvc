'use client'

import AppShell from '@/components/layout/AppShell'
import FlowProgressBar from '@/components/workflow/FlowProgressBar'
import KeywordIntentTable from '@/components/keyword-planner/KeywordIntentTable'
import AudienceSegmentCard from '@/components/keyword-planner/AudienceSegmentCard'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { KeywordAudiencePlan, MediaPlanJson } from '@/types'
import {
  Loader, Sparkles, ArrowRight, ArrowLeft, XCircle, RefreshCw,
  Target, Users, ChevronDown, ChevronUp, Search, BarChart3, Tag, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MediaPlanData {
  id: string
  title: string
  planJson: string
  brief?: {
    businessName?: string
    productService?: string
    objective?: string
  } | null
}

const CAMPAIGN_TYPE_COLORS: Record<string, string> = {
  SEARCH: 'bg-blue-100 text-blue-700 border-blue-200',
  DISPLAY: 'bg-purple-100 text-purple-700 border-purple-200',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-700 border-orange-200',
  SHOPPING: 'bg-green-100 text-green-700 border-green-200',
  YOUTUBE: 'bg-red-100 text-red-700 border-red-200',
  DEMAND_GEN: 'bg-pink-100 text-pink-700 border-pink-200',
}

const INTENT_COLORS: Record<string, string> = {
  high: 'bg-red-50 text-red-600 border-red-100',
  medium: 'bg-amber-50 text-amber-600 border-amber-100',
  low: 'bg-gray-100 text-gray-500 border-gray-200',
}

const MATCH_COLORS: Record<string, string> = {
  EXACT: 'bg-green-100 text-green-700',
  PHRASE: 'bg-blue-100 text-blue-700',
  BROAD: 'bg-yellow-100 text-yellow-700',
}

function KeywordGroupCard({
  group,
  campaignType,
  index,
}: {
  group: KeywordAudiencePlan['keywordGroups'][0]
  campaignType: string
  index: number
}) {
  const [expanded, setExpanded] = useState(index < 2)

  const highIntent = group.keywords.filter((k) => k.intent === 'high').length
  const avgSearches = group.keywords.length > 0
    ? Math.round(group.keywords.reduce((s, k) => s + (k.avgMonthlySearches ?? 0), 0) / group.keywords.length)
    : 0
  const avgBid = group.keywords.length > 0
    ? Math.round(group.keywords.reduce((s, k) => s + (k.suggestedBid ?? 0), 0) / group.keywords.length)
    : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn(
            'text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0',
            CAMPAIGN_TYPE_COLORS[campaignType] ?? 'bg-gray-100 text-gray-600 border-gray-200'
          )}>
            {campaignType}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{group.campaignName}</p>
            <p className="text-xs text-gray-500">{group.adGroupName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 ml-3">
          <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Search className="w-3 h-3" />
              {group.keywords.length} keywords
            </span>
            {highIntent > 0 && (
              <span className={cn('px-2 py-0.5 rounded border text-xs', INTENT_COLORS.high)}>
                {highIntent} high intent
              </span>
            )}
            {avgBid > 0 && (
              <span className="text-gray-400">avg ฿{avgBid}/click</span>
            )}
            {avgSearches > 0 && (
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                {avgSearches.toLocaleString()}/mo
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4">
          <KeywordIntentTable keywords={group.keywords} adGroupName={group.adGroupName} />
        </div>
      )}
    </div>
  )
}

export default function KeywordPlannerPage() {
  const params = useParams()
  const router = useRouter()
  const planId = params.planId as string

  const [plan, setPlan] = useState<KeywordAudiencePlan | null>(null)
  const [mediaPlan, setMediaPlan] = useState<MediaPlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'keywords' | 'audiences' | 'negatives'>('keywords')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [kwRes, mpRes] = await Promise.all([
        fetch(`/api/keyword-audience/${planId}`),
        fetch(`/api/media-plans/${planId}`),
      ])
      if (mpRes.ok) {
        const mpData: MediaPlanData = await mpRes.json()
        setMediaPlan(mpData)
      }
      if (kwRes.ok) {
        const data: KeywordAudiencePlan = await kwRes.json()
        if (data.keywordGroups?.length > 0) {
          setPlan(data)
        }
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => { fetchData() }, [fetchData])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/keyword-audience/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? 'Failed to generate')
      }
      const data = await res.json()
      setPlan(data.keywordAudiencePlan)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error generating keywords')
    } finally {
      setGenerating(false)
    }
  }

  const mediaPlanJson = mediaPlan?.planJson ? (() => {
    try { return JSON.parse(mediaPlan.planJson) as MediaPlanJson } catch { return null }
  })() : null

  const campaignTypeMap: Record<string, string> = {}
  if (mediaPlanJson) {
    for (const c of mediaPlanJson.campaignMix) {
      campaignTypeMap[c.campaignName] = c.type
    }
  }

  const totalKeywords = plan?.keywordGroups.reduce((s, g) => s + g.keywords.length, 0) ?? 0
  const highIntentTotal = plan?.keywordGroups.reduce(
    (s, g) => s + g.keywords.filter((k) => k.intent === 'high').length,
    0
  ) ?? 0

  return (
    <AppShell>
      <FlowProgressBar planId={planId as string} currentStep="research" />
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 mt-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => router.push(`/media-plans/${planId}`)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Media Plan
            </button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Keyword Research</h1>
          <p className="text-gray-500 mt-1">
            {mediaPlan?.brief?.businessName
              ? `${mediaPlan.brief.businessName} — `
              : ''}
            Keywords & Audiences ตาม Campaign Structure
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!loading && (
            <button
              onClick={generate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
            >
              {generating ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {generating ? 'กำลังสร้าง...' : plan ? 'Re-generate' : 'Generate Keywords'}
            </button>
          )}
          {plan && (
            <button
              onClick={() => router.push(`/campaign-details/${planId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              ถัดไป: Campaign Details <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-600">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : generating ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader className="w-10 h-10 text-blue-500 animate-spin" />
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-700">AI กำลังวิเคราะห์ Keywords...</p>
            <p className="text-sm text-gray-500 mt-1">Senior Media Planner AI กำลังทำ keyword research ตาม campaign structure</p>
          </div>
        </div>
      ) : !plan ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">ยังไม่มี Keyword Research</h3>
          <p className="text-gray-500 mb-2 max-w-md mx-auto">
            AI จะวิเคราะห์ Keywords สำหรับแต่ละ campaign ตาม structure ที่วางไว้
          </p>
          {mediaPlanJson && (
            <p className="text-sm text-blue-600 mb-6">
              {mediaPlanJson.campaignMix.length} campaigns พบ — จะสร้าง keyword groups ให้ครบทุก campaign
            </p>
          )}
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate Keywords & Audiences
          </button>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Keyword Groups', value: plan.keywordGroups.length, icon: <Tag className="w-4 h-4 text-blue-500" /> },
              { label: 'Total Keywords', value: totalKeywords, icon: <Search className="w-4 h-4 text-green-500" /> },
              { label: 'High Intent', value: highIntentTotal, icon: <Target className="w-4 h-4 text-red-500" /> },
              { label: 'Audience Segments', value: plan.audienceSegments.length, icon: <Users className="w-4 h-4 text-purple-500" /> },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
            {[
              { key: 'keywords' as const, label: `Keywords (${plan.keywordGroups.length})`, icon: <Search className="w-3.5 h-3.5" /> },
              { key: 'audiences' as const, label: `Audiences (${plan.audienceSegments.length})`, icon: <Users className="w-3.5 h-3.5" /> },
              { key: 'negatives' as const, label: `Negatives (${plan.negativeKeywords.length})`, icon: <AlertCircle className="w-3.5 h-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors',
                  activeTab === tab.key
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Keywords Tab */}
          {activeTab === 'keywords' && (
            <div className="space-y-3">
              {plan.keywordGroups.map((group, i) => (
                <KeywordGroupCard
                  key={i}
                  group={group}
                  campaignType={campaignTypeMap[group.campaignName] ?? 'SEARCH'}
                  index={i}
                />
              ))}
            </div>
          )}

          {/* Audiences Tab */}
          {activeTab === 'audiences' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plan.audienceSegments.length === 0 ? (
                <p className="text-gray-500 text-sm col-span-2 py-8 text-center">ไม่มี Audience Segments</p>
              ) : (
                plan.audienceSegments.map((seg, i) => (
                  <AudienceSegmentCard key={i} segment={seg} />
                ))
              )}
            </div>
          )}

          {/* Negatives Tab */}
          {activeTab === 'negatives' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Negative Keywords — ป้องกัน traffic ที่ไม่ต้องการ
              </h2>
              {plan.negativeKeywords.length === 0 ? (
                <p className="text-gray-400 text-sm">ไม่มี Negative Keywords</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {plan.negativeKeywords.map((kw, i) => (
                    <span
                      key={i}
                      className="text-sm bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg"
                    >
                      -{kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Recommendations */}
          {plan.recommendations && plan.recommendations.length > 0 && (
            <div className="mt-6 bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Senior Media Planner Recommendations
              </h3>
              <ul className="space-y-1.5">
                {plan.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-blue-700">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Step CTA */}
          <div className="mt-6 flex justify-between items-center">
            <button
              onClick={() => router.push(`/media-plans/${planId}`)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              ย้อนกลับ: Media Plan
            </button>
            <button
              onClick={() => router.push(`/campaign-details/${planId}`)}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              ถัดไป: Campaign Details
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </AppShell>
  )
}
