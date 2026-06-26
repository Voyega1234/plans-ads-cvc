import { NextRequest, NextResponse } from 'next/server'
import { pullCampaignPerformance } from '@/lib/google-ads/performance-reader'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { auth } from '@/lib/auth'

// Map range label → Google Ads dateRange string
const RANGE_MAP: Record<string, string> = {
  '1':  'TODAY',
  '7':  'LAST_7_DAYS',
  '14': 'LAST_14_DAYS',
  '30': 'LAST_30_DAYS',
}

function aggregate(snaps: Awaited<ReturnType<typeof pullCampaignPerformance>>) {
  const byName: Record<string, (typeof snaps)[0]> = {}
  for (const s of snaps) {
    if (!byName[s.campaignName]) {
      byName[s.campaignName] = { ...s }
    } else {
      const e = byName[s.campaignName]
      e.cost        += s.cost
      e.impressions += s.impressions
      e.clicks      += s.clicks
      e.conversions += s.conversions
    }
  }
  return Object.values(byName).map((s) => {
    const conv = Math.round(s.conversions)
    return {
      ...s,
      cost:           Math.round(s.cost),
      conversions:    conv,
      ctr:            s.impressions > 0 ? parseFloat(((s.clicks / s.impressions) * 100).toFixed(2)) : 0,
      cpc:            s.clicks > 0 ? parseFloat((s.cost / s.clicks).toFixed(2)) : 0,
      cpa:            conv > 0 ? Math.round(s.cost / conv) : 0,
      conversionRate: s.clicks > 0 ? parseFloat(((conv / s.clicks) * 100).toFixed(2)) : 0,
    }
  })
}

function summarize(campaigns: ReturnType<typeof aggregate>) {
  const cost        = campaigns.reduce((a, c) => a + c.cost, 0)
  const conversions = Math.round(campaigns.reduce((a, c) => a + c.conversions, 0))
  const clicks      = campaigns.reduce((a, c) => a + c.clicks, 0)
  const impressions = campaigns.reduce((a, c) => a + c.impressions, 0)
  return {
    cost:           Math.round(cost),
    conversions,
    clicks,
    impressions,
    cpa:            conversions > 0 ? Math.round(cost / conversions) : 0,
    ctr:            impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpc:            clicks > 0 ? parseFloat((cost / clicks).toFixed(2)) : 0,
    conversionRate: clicks > 0 ? parseFloat(((conversions / clicks) * 100).toFixed(2)) : 0,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const days       = searchParams.get('days') ?? '30'
  const dateRange  = RANGE_MAP[days] ?? 'LAST_30_DAYS'
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  // Always use MCC token for GAQL campaign queries — session token cannot query sub-accounts
  let adsToken: string | undefined
  try {
    adsToken = await getGoogleAdsAccessToken()
  } catch { /* falls back to mock inside lib */ }

  // Previous period for comparison (same number of days, shifted back)
  const prevRangeMap: Record<string, string> = {
    '1':  'YESTERDAY',
    '7':  'LAST_14_DAYS',
    '14': 'LAST_30_DAYS',
    '30': 'LAST_30_DAYS',
  }
  const prevRange = prevRangeMap[days] ?? 'LAST_30_DAYS'

  const [currentSnaps, prevSnaps] = await Promise.all([
    pullCampaignPerformance(customerId, dateRange, adsToken).catch(() => []),
    pullCampaignPerformance(customerId, prevRange, adsToken).catch(() => []),
  ])

  const campaigns    = aggregate(currentSnaps)
  const prevCampaigns = aggregate(prevSnaps)
  const current  = summarize(campaigns)
  const previous = summarize(prevCampaigns)

  // pct change helper
  const pct = (curr: number, prev: number) =>
    prev === 0 ? null : parseFloat(((curr / prev - 1) * 100).toFixed(1))

  return NextResponse.json({
    current,
    previous,
    changes: {
      cost:        pct(current.cost, previous.cost),
      conversions: pct(current.conversions, previous.conversions),
      cpa:         pct(current.cpa, previous.cpa),
      clicks:      pct(current.clicks, previous.clicks),
      impressions: pct(current.impressions, previous.impressions),
      ctr:            pct(current.ctr, previous.ctr),
      cpc:            pct(current.cpc, previous.cpc),
      conversionRate: pct(current.conversionRate, previous.conversionRate),
    },
    campaigns: campaigns.sort((a, b) => b.cost - a.cost),
    days,
    dateRange,
  })
}
