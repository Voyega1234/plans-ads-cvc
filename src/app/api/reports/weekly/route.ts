import { NextRequest, NextResponse } from 'next/server'
import { loadRecentSnapshots, pullCampaignPerformance } from '@/lib/google-ads/performance-reader'
import { generateRecommendations } from '@/lib/ai/recommendation-engine'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// ── In-memory cache (15-min TTL) ─────────────────────────────────────────────
interface WeeklyCacheEntry { data: unknown; expiresAt: number }
const weeklyCache = new Map<string, WeeklyCacheEntry>()
const WEEKLY_TTL  = 15 * 60 * 1000

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = getUserId(session)
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  const targetCPA  = Number(searchParams.get('targetCPA') ?? '500')
  const dateRange  = searchParams.get('dateRange') ?? 'LAST_30_DAYS'

  // Cache check
  const cacheKey = `${customerId}:${dateRange}:${targetCPA}`
  const cached   = weeklyCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return NextResponse.json(cached.data)

  const daysMap: Record<string, number> = {
    LAST_7_DAYS:  7,
    LAST_30_DAYS: 30,
    LAST_90_DAYS: 90,
    THIS_MONTH:   30,
    LAST_MONTH:   60,
  }
  const prevPeriodMap: Record<string, string> = {
    LAST_7_DAYS:  'LAST_14_DAYS',
    LAST_30_DAYS: 'LAST_60_DAYS',
    LAST_90_DAYS: 'LAST_180_DAYS',
    THIS_MONTH:   'LAST_MONTH',
    LAST_MONTH:   'LAST_MONTH',
  }
  const days       = daysMap[dateRange] ?? 30
  const prevPeriod = prevPeriodMap[dateRange] ?? 'LAST_60_DAYS'

  function pct(curr: number, prev: number): number | null {
    if (prev === 0) return null
    return parseFloat(((curr / prev - 1) * 100).toFixed(1))
  }

  // Get access token via refresh-token flow
  let adsToken: string | undefined
  try { adsToken = await getGoogleAdsAccessToken() } catch { /* falls back to mock */ }

  // Pull current + previous period + stored snapshots in parallel
  const [liveSnaps, prevLiveSnaps, storedSnaps] = await Promise.all([
    pullCampaignPerformance(customerId, dateRange,  adsToken),
    pullCampaignPerformance(customerId, prevPeriod, adsToken),
    loadRecentSnapshots(userId, days),
  ])

  const snapshots     = liveSnaps.length > 0     ? liveSnaps     : storedSnaps
  const prevSnapshots = prevLiveSnaps.length > 0 ? prevLiveSnaps : []

  function aggregate(snaps: typeof snapshots) {
    const map: Record<string, typeof snaps[0]> = {}
    for (const s of snaps) {
      if (!map[s.campaignName]) { map[s.campaignName] = { ...s } }
      else { const e = map[s.campaignName]; e.cost += s.cost; e.impressions += s.impressions; e.clicks += s.clicks; e.conversions += s.conversions }
    }
    return Object.values(map)
  }

  const currAgg = aggregate(snapshots)
  const prevAgg = aggregate(prevSnapshots)

  // Build prev lookup by campaign name
  const prevByName = new Map(prevAgg.map((s) => [s.campaignName, s]))

  const campaigns = currAgg.map((s) => {
    const prev = prevByName.get(s.campaignName)
    const ctr  = s.impressions > 0 ? parseFloat(((s.clicks / s.impressions) * 100).toFixed(2)) : 0
    const cpc  = s.clicks > 0 ? parseFloat((s.cost / s.clicks).toFixed(2)) : 0
    const cpa  = s.conversions > 0 ? parseFloat((s.cost / s.conversions).toFixed(2)) : 0
    const cvr  = s.clicks > 0 ? parseFloat(((s.conversions / s.clicks) * 100).toFixed(2)) : 0
    const prevCtr = prev && prev.impressions > 0 ? (prev.clicks / prev.impressions) * 100 : 0
    const prevCpc = prev && prev.clicks > 0 ? prev.cost / prev.clicks : 0
    const prevCpa = prev && prev.conversions > 0 ? prev.cost / prev.conversions : 0
    const prevCvr = prev && prev.clicks > 0 ? (prev.conversions / prev.clicks) * 100 : 0
    return {
      ...s, ctr, cpc, cpa, conversionRate: cvr,
      changes: {
        cost:           prev ? pct(s.cost,        prev.cost)        : null,
        impressions:    prev ? pct(s.impressions, prev.impressions) : null,
        clicks:         prev ? pct(s.clicks,      prev.clicks)      : null,
        conversions:    prev ? pct(s.conversions, prev.conversions) : null,
        ctr:            prev ? pct(ctr,  prevCtr)  : null,
        cpc:            prev ? pct(cpc,  prevCpc)  : null,
        cpa:            prev ? pct(cpa,  prevCpa)  : null,
        convRate:       prev ? pct(cvr,  prevCvr)  : null,
      },
    }
  })

  const totalCost        = campaigns.reduce((s, c) => s + c.cost, 0)
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0)
  const totalClicks      = campaigns.reduce((s, c) => s + c.clicks, 0)
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0)
  const blendedCPA       = totalConversions > 0 ? totalCost / totalConversions : 0
  const blendedCTR       = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

  const prevTotalCost  = prevAgg.reduce((s, c) => s + c.cost, 0)
  const prevTotalConv  = prevAgg.reduce((s, c) => s + c.conversions, 0)
  const prevTotalClick = prevAgg.reduce((s, c) => s + c.clicks, 0)
  const prevTotalImpr  = prevAgg.reduce((s, c) => s + c.impressions, 0)
  const prevCPA        = prevTotalConv > 0 ? prevTotalCost / prevTotalConv : 0
  const prevCTR        = prevTotalImpr > 0 ? (prevTotalClick / prevTotalImpr) * 100 : 0

  const summary = {
    totalCost,
    totalConversions,
    totalClicks,
    totalImpressions,
    blendedCPA: parseFloat(blendedCPA.toFixed(2)),
    blendedCTR: parseFloat(blendedCTR.toFixed(2)),
    targetCPA,
    cpaVsTarget: blendedCPA > 0 ? parseFloat(((blendedCPA / targetCPA - 1) * 100).toFixed(1)) : null,
    period: dateRange,
    generatedAt: new Date().toISOString(),
    changes: {
      totalCost:        pct(totalCost,        prevTotalCost),
      totalConversions: pct(totalConversions, prevTotalConv),
      totalClicks:      pct(totalClicks,      prevTotalClick),
      totalImpressions: pct(totalImpressions, prevTotalImpr),
      blendedCPA:       pct(blendedCPA,       prevCPA),
      blendedCTR:       pct(blendedCTR,       prevCTR),
    },
  }

  // Generate AI recommendations
  const recommendations = await generateRecommendations(campaigns, targetCPA)

  const result = { summary, campaigns, recommendations }
  weeklyCache.set(cacheKey, { data: result, expiresAt: Date.now() + WEEKLY_TTL })
  return NextResponse.json(result)
}
