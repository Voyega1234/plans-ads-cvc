import { prisma } from '@/lib/prisma'
import { getCampaignPerformance } from './reporting'

export interface CampaignSnapshot {
  campaignId?:      string
  campaignName:     string
  cost:             number
  impressions:      number
  clicks:           number
  conversions:      number
  ctr:              number
  cpc:              number
  cpa:              number
  conversionRate:   number
  date:             string
}

// Pull performance from Google Ads API (or mock) and return snapshot array
export async function pullCampaignPerformance(
  customerId: string,
  dateRange = 'LAST_30_DAYS',
  accessToken?: string
): Promise<CampaignSnapshot[]> {
  const raw = await getCampaignPerformance(customerId, dateRange, accessToken)

  return (raw as Array<{
    campaignId?: string
    campaignName: string
    cost: number
    impressions: number
    clicks: number
    conversions: number
    ctr: number
    cpc: number
    cpa?: number
    costPerConversion?: number
  }>).map((r) => ({
    campaignId:     r.campaignId,
    campaignName:   r.campaignName,
    cost:           r.cost,
    impressions:    r.impressions,
    clicks:         r.clicks,
    conversions:    r.conversions,
    ctr:            r.ctr,
    cpc:            r.cpc,
    cpa:            r.cpa ?? r.costPerConversion ?? (r.conversions > 0 ? r.cost / r.conversions : 0),
    conversionRate: r.clicks > 0 ? (r.conversions / r.clicks) * 100 : 0,
    date:           new Date().toISOString().split('T')[0],
  }))
}

// Persist performance snapshots to DB (upsert by campaignName+date)
export async function syncPerformanceSnapshots(
  userId: string,
  customerId: string,
  clientId?: string,
  dateRange = 'LAST_30_DAYS',
  accessToken?: string
): Promise<{ synced: number; date: string }> {
  const snapshots = await pullCampaignPerformance(customerId, dateRange, accessToken)
  const today = new Date().toISOString().split('T')[0]

  for (const snap of snapshots) {
    const existing = await prisma.performanceSnapshot.findFirst({
      where: { userId, campaignName: snap.campaignName, date: today },
    })

    if (existing) {
      await prisma.performanceSnapshot.update({
        where: { id: existing.id },
        data: {
          cost:              snap.cost,
          impressions:       snap.impressions,
          clicks:            snap.clicks,
          conversions:       snap.conversions,
          ctr:               snap.ctr,
          cpc:               snap.cpc,
          costPerConversion: snap.cpa,
          conversionRate:    snap.conversionRate,
          campaignId:        customerId,
          clientId:          clientId ?? null,
        },
      })
    } else {
      await prisma.performanceSnapshot.create({
        data: {
          userId,
          clientId:          clientId ?? null,
          campaignId:        customerId,
          date:              today,
          campaignName:      snap.campaignName,
          cost:              snap.cost,
          impressions:       snap.impressions,
          clicks:            snap.clicks,
          conversions:       snap.conversions,
          ctr:               snap.ctr,
          cpc:               snap.cpc,
          costPerConversion: snap.cpa,
          conversionRate:    snap.conversionRate,
        },
      })
    }
  }

  return { synced: snapshots.length, date: today }
}

// Load recent snapshots from DB for a given user
export async function loadRecentSnapshots(
  userId: string,
  days = 30
): Promise<Array<{
  campaignName: string
  date: string
  cost: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  conversionRate: number
}>> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const rows = await prisma.performanceSnapshot.findMany({
    where: {
      userId,
      createdAt: { gte: since },
    },
    orderBy: { date: 'desc' },
    take: 500,
  })

  return rows.map((r) => ({
    campaignName:   r.campaignName,
    date:           r.date,
    cost:           r.cost,
    impressions:    r.impressions,
    clicks:         r.clicks,
    conversions:    r.conversions,
    ctr:            r.ctr,
    cpc:            r.cpc,
    cpa:            r.costPerConversion,
    conversionRate: r.conversionRate,
  }))
}
