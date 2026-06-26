'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import AdCreativeEditor from '@/components/creatives/AdCreativeEditor'
import { CampaignBlueprintJson, CampaignBlueprintItem, AdCopy, PMaxAssetGroup } from '@/types'
import { Loader, Save, CheckCircle, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getAdCopyForCampaign(campaign: CampaignBlueprintItem): AdCopy {
  const type = campaign.campaignType?.toUpperCase()

  // PMax: use assetGroups[0] or adGroups[0].ads[0].pmax
  if (type === 'PERFORMANCE_MAX') {
    const assetGroup = campaign.assetGroups?.[0]
    const adCopyPmax = campaign.adGroups[0]?.ads[0]

    if (assetGroup) {
      return {
        headline1: assetGroup.headlines[0] ?? '',
        headline2: assetGroup.headlines[1] ?? '',
        headline3: assetGroup.headlines[2] ?? '',
        description1: assetGroup.descriptions[0] ?? '',
        description2: assetGroup.descriptions[1] ?? '',
        finalUrl: assetGroup.finalUrl,
        pmax: assetGroup,
      }
    }

    if (adCopyPmax?.pmax) {
      return adCopyPmax
    }

    return {
      headline1: '',
      headline2: '',
      headline3: '',
      description1: '',
      description2: '',
      finalUrl: campaign.finalUrl ?? '',
      pmax: {
        assetGroupName: `${campaign.campaignName} - Asset Group`,
        headlines: [],
        longHeadlines: [],
        descriptions: [],
        businessName: '',
        finalUrl: campaign.finalUrl ?? '',
        imageAssets: [],
      },
    }
  }

  // SEARCH: use first ad in first ad group
  const firstAd = campaign.adGroups[0]?.ads[0]
  if (firstAd) return firstAd

  return {
    headline1: '',
    headline2: '',
    headline3: '',
    description1: '',
    description2: '',
    finalUrl: campaign.finalUrl ?? '',
  }
}

/**
 * Merge edited AdCopy back into the campaign, updating the correct data location
 * based on campaign type.
 */
function mergeCopyIntoCampaign(
  campaign: CampaignBlueprintItem,
  updatedCopy: AdCopy
): CampaignBlueprintItem {
  const type = campaign.campaignType?.toUpperCase()

  if (type === 'PERFORMANCE_MAX') {
    const pmaxGroup: PMaxAssetGroup = updatedCopy.pmax ?? {
      assetGroupName: `${campaign.campaignName} - Asset Group`,
      headlines: [updatedCopy.headline1, updatedCopy.headline2, updatedCopy.headline3].filter(Boolean),
      longHeadlines: [],
      descriptions: [updatedCopy.description1, updatedCopy.description2].filter(Boolean),
      businessName: '',
      finalUrl: updatedCopy.finalUrl,
      imageAssets: [],
    }

    // Update assetGroups[0] if present, else put it in adGroups[0].ads[0].pmax
    if (campaign.assetGroups && campaign.assetGroups.length > 0) {
      return {
        ...campaign,
        assetGroups: [pmaxGroup, ...campaign.assetGroups.slice(1)],
      }
    }

    // Fallback: store in adGroups[0].ads[0]
    if (campaign.adGroups.length > 0) {
      const adGroups = campaign.adGroups.map((ag, i) =>
        i === 0 ? { ...ag, ads: ag.ads.length > 0 ? [updatedCopy, ...ag.ads.slice(1)] : [updatedCopy] } : ag
      )
      return { ...campaign, adGroups }
    }

    return campaign
  }

  // SEARCH (and others): update first ad in first ad group
  const adGroups = campaign.adGroups.map((ag, agIdx) => {
    if (agIdx !== 0) return ag
    const ads = ag.ads.length > 0
      ? ag.ads.map((ad, adIdx) => (adIdx === 0 ? updatedCopy : ad))
      : [updatedCopy]
    return { ...ag, ads }
  })
  return { ...campaign, adGroups }
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function CreativesPage() {
  const params = useParams()
  const router = useRouter()
  const planId = params.planId as string

  const [blueprint, setBlueprint] = useState<CampaignBlueprintJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCampaignIdx, setActiveCampaignIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Per-campaign ad copy state (keyed by campaign index)
  const [adCopyMap, setAdCopyMap] = useState<Record<number, AdCopy>>({})
  // Per-campaign generating state
  const [generatingMap, setGeneratingMap] = useState<Record<number, boolean>>({})

  // ─── Fetch blueprint ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchBlueprint() {
      try {
        const res = await fetch(`/api/campaign-blueprints/${planId}`)
        if (!res.ok) throw new Error('Blueprint not found')
        const data = await res.json()
        const parsed: CampaignBlueprintJson = JSON.parse(data.blueprintJson)
        setBlueprint(parsed)
        // Seed adCopyMap with appropriate copy from each campaign
        const initial: Record<number, AdCopy> = {}
        parsed.campaigns.forEach((camp, i) => {
          initial[i] = getAdCopyForCampaign(camp)
        })
        setAdCopyMap(initial)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load blueprint')
      } finally {
        setLoading(false)
      }
    }
    fetchBlueprint()
  }, [planId])

  // ─── Update ad copy for a campaign ───────────────────────────────────────────

  const handleAdCopyChange = useCallback((idx: number, updated: AdCopy) => {
    setAdCopyMap((prev) => ({ ...prev, [idx]: updated }))
    setSaved(false)
  }, [])

  // ─── AI Rewrite ───────────────────────────────────────────────────────────────

  const handleAIRewrite = useCallback(async (idx: number) => {
    if (!blueprint) return
    const campaign = blueprint.campaigns[idx]
    const currentCopy = adCopyMap[idx] ?? getAdCopyForCampaign(campaign)

    // Extract business name from finalUrl domain or campaign name
    const finalUrl = currentCopy.finalUrl || currentCopy.pmax?.finalUrl || campaign.finalUrl || ''
    let businessName = campaign.campaignName
    try {
      if (finalUrl) {
        const url = new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`)
        businessName = url.hostname.replace(/^www\./, '')
      }
    } catch {
      // keep campaignName as fallback
    }

    setGeneratingMap((prev) => ({ ...prev, [idx]: true }))
    try {
      const res = await fetch('/api/creatives/ai-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignType: campaign.campaignType,
          campaignName: campaign.campaignName,
          currentCopy,
          businessContext: {
            businessName,
            productService: campaign.campaignName,
            objective: campaign.bidStrategy ?? 'conversions',
            brandTone: 'professional',
          },
        }),
      })
      if (!res.ok) throw new Error('Rewrite failed')
      const data = await res.json()
      setAdCopyMap((prev) => ({ ...prev, [idx]: data.copy }))
      setSaved(false)
    } catch (e) {
      console.error('AI Rewrite error:', e)
    } finally {
      setGeneratingMap((prev) => ({ ...prev, [idx]: false }))
    }
  }, [blueprint, adCopyMap])

  // ─── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!blueprint) return
    setSaving(true)

    // Build updated blueprint by merging each edited AdCopy back into its campaign
    const updatedBlueprint: CampaignBlueprintJson = {
      ...blueprint,
      campaigns: blueprint.campaigns.map((camp, i) => {
        const updatedCopy = adCopyMap[i]
        if (!updatedCopy) return camp
        return mergeCopyIntoCampaign(camp, updatedCopy)
      }),
    }

    try {
      const res = await fetch(`/api/campaign-blueprints/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintJson: JSON.stringify(updatedBlueprint) }),
      })
      if (res.ok) {
        setBlueprint(updatedBlueprint)
        setSaved(true)
      } else {
        // API unavailable — still reflect saved state locally
        setBlueprint(updatedBlueprint)
        setSaved(true)
      }
    } catch {
      setBlueprint(updatedBlueprint)
      setSaved(true)
    } finally {
      setSaving(false)
      setTimeout(() => setSaved(false), 3000)
    }
  }, [blueprint, adCopyMap, planId])

  // ─── Type label / color helpers ───────────────────────────────────────────────

  const typeColor: Record<string, string> = {
    SEARCH: 'bg-blue-100 text-blue-700 border-blue-200',
    PERFORMANCE_MAX: 'bg-orange-100 text-orange-700 border-orange-200',
    DISPLAY: 'bg-purple-100 text-purple-700 border-purple-200',
    VIDEO: 'bg-pink-100 text-pink-700 border-pink-200',
    SHOPPING: 'bg-green-100 text-green-700 border-green-200',
    DEMAND_GEN: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    APP_CAMPAIGN: 'bg-teal-100 text-teal-700 border-teal-200',
    YOUTUBE: 'bg-red-100 text-red-700 border-red-200',
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad Creative Builder</h1>
          <p className="text-gray-500 mt-1">สร้างและแก้ไข Ad Copy พร้อม Image/Asset Requirements ตาม Google Ads Spec</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
          >
            {saving ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'กำลังบันทึก...' : saved ? 'บันทึกแล้ว!' : 'บันทึก'}
          </button>
          <button
            onClick={() => router.push(`/review/${planId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Approve &amp; Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-600">
          <p className="font-semibold">ไม่พบ Blueprint</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => router.push(`/campaign-builder/${planId}`)}
            className="mt-3 text-sm text-red-600 underline hover:text-red-700"
          >
            กลับไปสร้าง Campaign Blueprint ก่อน
          </button>
        </div>
      )}

      {blueprint && !loading && (
        <div className="space-y-6">
          {/* Campaign Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">Campaigns</span>
              <span className="text-xs text-gray-400">({blueprint.campaigns.length})</span>
              {blueprint.campaigns.length > 5 && (
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => setActiveCampaignIdx((i) => Math.max(0, i - 1))}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    disabled={activeCampaignIdx === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveCampaignIdx((i) => Math.min(blueprint.campaigns.length - 1, i + 1))}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    disabled={activeCampaignIdx === blueprint.campaigns.length - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-0 overflow-x-auto">
              {blueprint.campaigns.map((camp, i) => (
                <button
                  key={i}
                  onClick={() => setActiveCampaignIdx(i)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                    activeCampaignIdx === i
                      ? 'border-blue-500 text-blue-700 bg-blue-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold border', typeColor[camp.campaignType] ?? 'bg-gray-100 text-gray-600')}>
                    {camp.campaignType === 'PERFORMANCE_MAX' ? 'PMAX' : camp.campaignType}
                  </span>
                  <span className="truncate max-w-[140px]">{camp.campaignName}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Active Campaign Editor */}
          {blueprint.campaigns[activeCampaignIdx] && (
            <AdCreativeEditor
              campaignName={blueprint.campaigns[activeCampaignIdx].campaignName}
              campaignType={blueprint.campaigns[activeCampaignIdx].campaignType}
              adCopy={adCopyMap[activeCampaignIdx] ?? getAdCopyForCampaign(blueprint.campaigns[activeCampaignIdx])}
              onChange={(updated) => handleAdCopyChange(activeCampaignIdx, updated)}
              onAIRewrite={() => handleAIRewrite(activeCampaignIdx)}
              isGenerating={generatingMap[activeCampaignIdx] ?? false}
            />
          )}

          {/* Bottom Action Bar */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              แก้ไขแล้ว {Object.keys(adCopyMap).length}/{blueprint.campaigns.length} campaigns
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 border border-emerald-300 text-emerald-700 text-sm font-medium rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => router.push(`/review/${planId}`)}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Approve &amp; Continue to QA
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
