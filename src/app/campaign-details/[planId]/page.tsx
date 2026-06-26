'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import FlowProgressBar from '@/components/workflow/FlowProgressBar'
import { CampaignBlueprintJson, CampaignBlueprintItem } from '@/types'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Loader,
  ArrowLeft,
  ArrowRight,
  Target,
  BarChart3,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  SEARCH:          'bg-blue-100 text-blue-700 border-blue-200',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-700 border-orange-200',
  DISPLAY:         'bg-purple-100 text-purple-700 border-purple-200',
  SHOPPING:        'bg-green-100 text-green-700 border-green-200',
}

const BID_LABELS: Record<string, string> = {
  MAXIMIZE_CONVERSIONS:       'Maximize Conversions',
  MAXIMIZE_CLICKS:            'Maximize Clicks',
  MAXIMIZE_CONVERSION_VALUE:  'Max Conv. Value',
  TARGET_CPA:                 'Target CPA',
  TARGET_ROAS:                'Target ROAS',
  TARGET_CPM:                 'Target CPM',
  CPV:                        'CPV',
}

// ─── Campaign Card ────────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  defaultOpen,
}: {
  campaign: CampaignBlueprintItem
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  const isSearch  = campaign.campaignType === 'SEARCH'
  const isPMax    = campaign.campaignType === 'PERFORMANCE_MAX'
  const isDisplay = campaign.campaignType === 'DISPLAY'

  const adGroupCount   = campaign.adGroups?.length ?? 0
  const assetGroupCount = campaign.assetGroups?.length ?? 0
  const groupCount     = isPMax ? assetGroupCount : adGroupCount

  const totalKeywords = campaign.adGroups?.reduce(
    (sum, ag) => sum + (ag.keywords?.length ?? 0),
    0,
  ) ?? 0

  const badgeClass = TYPE_BADGE[campaign.campaignType] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  const typeLabel  = campaign.campaignType.replace(/_/g, ' ')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Card header — always visible, toggles expand */}
      <button
        className="w-full flex items-start justify-between p-5 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span
              className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0',
                badgeClass,
              )}
            >
              {typeLabel}
            </span>
            <h3 className="text-sm font-semibold text-gray-800 truncate">
              {campaign.campaignName}
            </h3>
          </div>

          <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
            <span className="font-medium text-gray-700">
              ฿{(campaign.budget ?? 0).toLocaleString()}/day
            </span>
            <span>{BID_LABELS[campaign.bidStrategy] ?? campaign.bidStrategy}</span>
            {(isSearch || isDisplay) && (
              <span>{adGroupCount} ad group{adGroupCount !== 1 ? 's' : ''}</span>
            )}
            {isPMax && (
              <span>{assetGroupCount} asset group{assetGroupCount !== 1 ? 's' : ''}</span>
            )}
            {isSearch && totalKeywords > 0 && (
              <span>{totalKeywords} keywords</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 ml-3 mt-0.5 text-gray-400">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {/* Settings grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Daily Budget',  value: `฿${(campaign.budget ?? 0).toLocaleString()}` },
              { label: 'Bid Strategy',  value: BID_LABELS[campaign.bidStrategy] ?? campaign.bidStrategy },
              { label: 'Status',        value: campaign.status ?? 'PAUSED' },
              { label: 'Locations',     value: (campaign.locationTargets ?? []).join(', ') || '—' },
            ].map((item) => (
              <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 mb-0.5">{item.label}</p>
                <p className="text-sm font-semibold text-gray-800 truncate">{item.value}</p>
              </div>
            ))}
          </div>

          {/* SEARCH — ad groups + keywords */}
          {isSearch && adGroupCount > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Ad Groups
              </h4>
              <div className="space-y-2">
                {campaign.adGroups!.map((ag, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium text-gray-700">{ag.adGroupName}</p>
                      <span className="text-xs text-gray-400">
                        {ag.keywords?.length ?? 0} keywords
                      </span>
                    </div>
                    {(ag.keywords?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(ag.keywords ?? []).slice(0, 10).map((kw, j) => {
                          const mt = ag.matchTypes?.[j] ?? 'BROAD'
                          return (
                            <span
                              key={j}
                              className={cn(
                                'text-xs px-2 py-0.5 rounded border',
                                mt === 'EXACT'  ? 'bg-green-50 text-green-700 border-green-200' :
                                mt === 'PHRASE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                  'bg-yellow-50 text-yellow-700 border-yellow-200',
                              )}
                            >
                              {mt === 'EXACT' ? `[${kw}]` : mt === 'PHRASE' ? `"${kw}"` : kw}
                            </span>
                          )
                        })}
                        {(ag.keywords?.length ?? 0) > 10 && (
                          <span className="text-xs text-gray-400 px-2 py-0.5">
                            +{(ag.keywords!.length) - 10} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PERFORMANCE_MAX — asset groups */}
          {isPMax && assetGroupCount > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Asset Groups
              </h4>
              <div className="space-y-2">
                {campaign.assetGroups!.map((ag, i) => (
                  <div key={i} className="bg-orange-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-orange-700 mb-1.5">
                      {ag.assetGroupName}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                      <span className={cn('px-2 py-0.5 rounded text-center', (ag.headlines?.length ?? 0) >= 15 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                        {ag.headlines?.length ?? 0}/15 Headlines
                      </span>
                      <span className={cn('px-2 py-0.5 rounded text-center', (ag.longHeadlines?.length ?? 0) >= 5 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                        {ag.longHeadlines?.length ?? 0}/5 Long HL
                      </span>
                      <span className={cn('px-2 py-0.5 rounded text-center', (ag.descriptions?.length ?? 0) >= 4 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                        {ag.descriptions?.length ?? 0}/4 Desc
                      </span>
                      <span className={cn('px-2 py-0.5 rounded text-center', (ag.imageAssets?.length ?? 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                        {ag.imageAssets?.length ?? 0} Images
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DISPLAY — ad groups */}
          {isDisplay && adGroupCount > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Ad Groups ({adGroupCount})
              </h4>
              <div className="space-y-2">
                {campaign.adGroups!.map((ag, i) => (
                  <div key={i} className="bg-purple-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-purple-700">{ag.adGroupName}</p>
                    {(ag.audiences?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {ag.audiences!.map((aud, j) => (
                          <span key={j} className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                            {aud}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const planId = params.planId as string

  const [blueprint, setBlueprint] = useState<CampaignBlueprintJson | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bpRes] = await Promise.all([
        fetch(`/api/campaign-blueprints/${planId}`),
      ])

      if (bpRes.ok) {
        const data = await bpRes.json()
        // /api/campaign-blueprints/[planId] returns the blueprint object directly
        const rawJson: string | undefined = data?.blueprintJson
        if (rawJson) {
          try {
            const parsed: CampaignBlueprintJson = JSON.parse(rawJson)
            setBlueprint(parsed)
          } catch {
            // blueprintJson unparseable — treat as missing
          }
        }
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้')
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived summary values ──────────────────────────────────────────────────

  const totalCampaigns = blueprint?.campaigns.length ?? 0
  const totalDailyBudget = blueprint?.campaigns.reduce((sum, c) => sum + (c.budget ?? 0), 0) ?? 0
  const totalAdGroups = blueprint?.campaigns.reduce(
    (sum, c) =>
      sum + (c.campaignType === 'PERFORMANCE_MAX'
        ? (c.assetGroups?.length ?? 0)
        : (c.adGroups?.length ?? 0)),
    0,
  ) ?? 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Step progress bar */}
      <FlowProgressBar planId={planId} currentStep="mediaplan" />

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Campaign Details</h1>
          <p className="text-sm text-gray-500 mt-1">
            ตรวจสอบโครงสร้างแคมเปญก่อนสร้าง Ad Copy
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        {/* Error fetching */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium mb-3">{error}</p>
            <button
              onClick={fetchData}
              className="text-sm text-red-600 underline hover:text-red-800"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* No blueprint yet */}
        {!loading && !error && !blueprint && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
            <Target className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-base font-semibold text-amber-800 mb-1">
              ยังไม่มี Campaign Blueprint — กลับไปสร้าง Media Plan ก่อน
            </p>
            <p className="text-sm text-amber-600 mb-5">
              สร้าง Media Plan แล้ว AI จะสร้าง campaign structure ให้โดยอัตโนมัติ
            </p>
            <button
              onClick={() => router.push(`/keyword-planner/${planId}`)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไป Keyword Research
            </button>
          </div>
        )}

        {/* Blueprint loaded */}
        {!loading && !error && blueprint && (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{totalCampaigns}</p>
                  <p className="text-xs text-gray-500">Campaigns</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(totalDailyBudget, 'THB')}
                  </p>
                  <p className="text-xs text-gray-500">Total Budget / Day</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{totalAdGroups}</p>
                  <p className="text-xs text-gray-500">Ad / Asset Groups</p>
                </div>
              </div>
            </div>

            {/* Campaign cards */}
            <div className="space-y-3 mb-8">
              {blueprint.campaigns.map((campaign, i) => (
                <CampaignCard
                  key={i}
                  campaign={campaign}
                  defaultOpen={i < 3}
                />
              ))}
            </div>

            {/* Bottom navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push(`/keyword-planner/${planId}`)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                ย้อนกลับ
              </button>

              <button
                onClick={() => router.push(`/campaign-builder/${planId}`)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                ไปสร้าง Ad Copy
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
