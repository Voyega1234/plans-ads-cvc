import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

export interface ChannelPerformance {
  channel: 'SEARCH' | 'DISPLAY' | 'YOUTUBE' | 'SHOPPING' | 'GMAIL' | 'MAPS' | 'DISCOVERY'
  label: string
  cost: number
  clicks: number
  impressions: number
  conversions: number
  conversionValue: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
  costShare: number
}

// Realistic PMax channel distribution for mock
const CHANNEL_WEIGHTS = [
  { channel: 'SEARCH'    as const, label: 'Search',   weight: 0.45 },
  { channel: 'SHOPPING'  as const, label: 'Shopping', weight: 0.20 },
  { channel: 'DISPLAY'   as const, label: 'Display',  weight: 0.20 },
  { channel: 'YOUTUBE'   as const, label: 'YouTube',  weight: 0.10 },
  { channel: 'MAPS'      as const, label: 'Maps',     weight: 0.05 },
]
const CHANNEL_CTR: Record<string, number> = { SEARCH: 3.5, SHOPPING: 2.8, DISPLAY: 0.35, YOUTUBE: 0.55, MAPS: 4.2 }
const CHANNEL_CPC: Record<string, number> = { SEARCH: 12.5, SHOPPING: 8.2, DISPLAY: 4.5, YOUTUBE: 6.8, MAPS: 9.1 }
const CHANNEL_CVR: Record<string, number> = { SEARCH: 2.8, SHOPPING: 3.5, DISPLAY: 0.8, YOUTUBE: 1.1, MAPS: 3.2 }

async function getMockChannelBreakdown(campaignId: string, days: number): Promise<ChannelPerformance[]> {
  await new Promise(r => setTimeout(r, 300))
  const seed = campaignId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const baseCost = 8000 + (seed % 10000) + days * 300
  return CHANNEL_WEIGHTS.map(({ channel, label, weight }) => {
    const cost = parseFloat((baseCost * weight).toFixed(0))
    const cpc  = CHANNEL_CPC[channel]
    const clicks = Math.round(cost / cpc)
    const ctr  = CHANNEL_CTR[channel]
    const impressions = Math.round((clicks / ctr) * 100)
    const cvr  = CHANNEL_CVR[channel]
    const conversions = parseFloat(((clicks * cvr) / 100).toFixed(1))
    const cpa  = conversions > 0 ? parseFloat((cost / conversions).toFixed(2)) : 0
    const conversionValue = parseFloat((conversions * 350).toFixed(0))
    const roas = cost > 0 ? parseFloat((conversionValue / cost).toFixed(2)) : 0
    return { channel, label, cost, clicks, impressions, conversions, conversionValue, ctr, cpc, cpa, roas, costShare: weight * 100 }
  })
}

const COLOR_CYCLE = ['SEARCH', 'SHOPPING', 'DISPLAY', 'YOUTUBE', 'MAPS', 'GMAIL', 'DISCOVERY'] as const

// PMax adNetworkType returns "MIXED" — channel breakdown not available via GAQL.
// We use asset_group as a proxy (PMax equivalent of ad groups / creative sets).
async function getRealChannelBreakdown(
  customerId: string,
  campaignId: string,
  days: number,
  accessToken?: string
): Promise<ChannelPerformance[]> {
  const devToken        = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

  let token = ''
  try { token = await getGoogleAdsAccessToken() } catch { token = '' }
  if (!token) token = accessToken ?? ''
  if (!token || !devToken) return []

  const cid = customerId.replace(/-/g, '')
  const RANGE_MAP: Record<number, string> = { 7: 'LAST_7_DAYS', 14: 'LAST_14_DAYS', 30: 'LAST_30_DAYS', 90: 'LAST_90_DAYS' }
  const dateRange = RANGE_MAP[days] ?? 'LAST_30_DAYS'

  const headers: Record<string, string> = {
    Authorization:     `Bearer ${token}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

  // Two queries: (1) metrics for active period, (2) all asset group names including PAUSED
  const metricsQuery = `
    SELECT
      asset_group.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM asset_group
    WHERE campaign.id = '${campaignId}'
      AND segments.date DURING ${dateRange}
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `.trim()

  const namesQuery = `
    SELECT asset_group.name, asset_group.status
    FROM asset_group
    WHERE campaign.id = '${campaignId}'
    ORDER BY asset_group.name
    LIMIT 50
  `.trim()

  // Fetch both in parallel
  const [metricsRes, namesRes] = await Promise.all([
    fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`, { method: 'POST', headers, body: JSON.stringify({ query: metricsQuery }) }),
    fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`, { method: 'POST', headers, body: JSON.stringify({ query: namesQuery }) }),
  ])

  if (!metricsRes.ok) {
    console.error('[pmax-channels] asset_group metrics query failed', metricsRes.status, await metricsRes.text().catch(() => ''))
    return []
  }

  type MetricsRow = { assetGroup: { name: string }; metrics: { costMicros: string; clicks: string; impressions: string; conversions: string; conversionsValue: string } }
  type NamesRow   = { assetGroup: { name: string; status: string } }

  const metricsData = await metricsRes.json() as { results?: MetricsRow[] }
  const namesData   = namesRes.ok ? await namesRes.json() as { results?: NamesRow[] } : { results: [] }

  // Build set of all asset group names (including PAUSED with zero metrics)
  const allNames = new Map<string, string>() // name → status
  for (const r of namesData.results ?? []) {
    allNames.set(r.assetGroup?.name ?? '', r.assetGroup?.status ?? 'UNKNOWN')
  }

  // Aggregate metrics by name
  const grouped: Record<string, { name: string; cost: number; clicks: number; impressions: number; conversions: number; conversionValue: number }> = {}
  // Pre-populate all names with zero
  allNames.forEach((_, name) => {
    grouped[name] = { name, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
  })
  for (const r of metricsData.results ?? []) {
    const name = r.assetGroup?.name ?? 'Unknown'
    if (!grouped[name]) grouped[name] = { name, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
    grouped[name].cost            += Number(r.metrics.costMicros ?? 0) / 1_000_000
    grouped[name].clicks          += Number(r.metrics.clicks ?? 0)
    grouped[name].impressions     += Number(r.metrics.impressions ?? 0)
    grouped[name].conversions     += Number(r.metrics.conversions ?? 0)
    grouped[name].conversionValue += Number(r.metrics.conversionsValue ?? 0)
  }

  // Sort: active (cost>0) first, then by cost desc
  const groups = Object.values(grouped).sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
  const totalCost = groups.reduce((a, g) => a + g.cost, 0)

  return groups.map((g, i) => ({
    channel:         COLOR_CYCLE[i % COLOR_CYCLE.length],
    label:           g.name,
    cost:            g.cost,
    clicks:          g.clicks,
    impressions:     g.impressions,
    conversions:     g.conversions,
    conversionValue: g.conversionValue,
    ctr:             g.impressions > 0 ? parseFloat(((g.clicks / g.impressions) * 100).toFixed(2)) : 0,
    cpc:             g.clicks > 0 ? parseFloat((g.cost / g.clicks).toFixed(2)) : 0,
    cpa:             g.conversions > 0 ? parseFloat((g.cost / g.conversions).toFixed(2)) : 0,
    roas:            g.cost > 0 && g.conversionValue > 0 ? parseFloat((g.conversionValue / g.cost).toFixed(2)) : 0,
    costShare:       totalCost > 0 ? parseFloat(((g.cost / totalCost) * 100).toFixed(1)) : 0,
  }))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId  = searchParams.get('customerId') ?? ''
  const campaignId  = searchParams.get('campaignId') ?? ''
  const days        = parseInt(searchParams.get('days') ?? '30', 10)
  const accessToken = req.headers.get('x-access-token') ?? undefined

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  try {
    const channels = isMockMode()
      ? await getMockChannelBreakdown(campaignId, days)
      : await getRealChannelBreakdown(customerId, campaignId, days, accessToken)

    const totalCost   = channels.reduce((a, c) => a + c.cost, 0)
    const totalClicks = channels.reduce((a, c) => a + c.clicks, 0)
    const totalImpr   = channels.reduce((a, c) => a + c.impressions, 0)
    const totalConv   = channels.reduce((a, c) => a + c.conversions, 0)
    const totalValue  = channels.reduce((a, c) => a + c.conversionValue, 0)

    return NextResponse.json({
      customerId,
      campaignId,
      days,
      channels,
      source: isMockMode() ? 'mock' : 'asset_group',
      totals: {
        cost:            totalCost,
        clicks:          totalClicks,
        impressions:     totalImpr,
        conversions:     totalConv,
        conversionValue: totalValue,
        roas:            totalCost > 0 && totalValue > 0 ? parseFloat((totalValue / totalCost).toFixed(2)) : 0,
        cpa:             totalConv > 0 ? parseFloat((totalCost / totalConv).toFixed(2)) : 0,
        ctr:             totalImpr > 0 ? parseFloat(((totalClicks / totalImpr) * 100).toFixed(2)) : 0,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch breakdown' },
      { status: 500 }
    )
  }
}
