import { NextRequest, NextResponse } from 'next/server'
import { loadRecentSnapshots } from '@/lib/google-ads/performance-reader'
import { generateRecommendations } from '@/lib/ai/recommendation-engine'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = getUserId(session)
  const { searchParams } = new URL(req.url)
  const targetCPA = Number(searchParams.get('targetCPA') ?? '500')
  const days      = Number(searchParams.get('days') ?? '30')

  const snapshots = await loadRecentSnapshots(userId, days)

  // Aggregate by campaign name (sum across days)
  const byName: Record<string, typeof snapshots[0]> = {}
  for (const s of snapshots) {
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

  const aggregated = Object.values(byName).map((s) => ({
    ...s,
    ctr:            s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0,
    cpc:            s.clicks > 0 ? s.cost / s.clicks : 0,
    cpa:            s.conversions > 0 ? s.cost / s.conversions : 0,
    conversionRate: s.clicks > 0 ? (s.conversions / s.clicks) * 100 : 0,
  }))

  const recommendations = await generateRecommendations(aggregated, targetCPA)
  return NextResponse.json({ recommendations, snapshotCount: snapshots.length })
}
