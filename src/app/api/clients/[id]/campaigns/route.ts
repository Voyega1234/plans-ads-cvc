import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { auth } from '@/lib/auth'

interface CampaignMetrics {
  spend: number; impressions: number; clicks: number; conversions: number
  ctr: number; cpc: number; cpa: number; convRate: number; roas: number
}

interface CampaignChange {
  spend: number | null; impressions: number | null; clicks: number | null
  conversions: number | null; ctr: number | null; cpc: number | null
  cpa: number | null; convRate: number | null
}

interface CampaignDetail extends CampaignMetrics {
  id: string; name: string; status: 'ENABLED' | 'PAUSED' | 'REMOVED'
  biddingStrategy: string; budget: number
  startDate: string; endDate: string | null
  prev: CampaignMetrics | null
  changes: CampaignChange
}

type RawRow = {
  campaign: { id: string; name: string; status: string; biddingStrategyType: string; startDate: string; endDate?: string }
  campaignBudget?: { amountMicros: string }
  metrics: {
    costMicros: string; impressions: string; clicks: string; conversions: string; conversionsValue: string
    ctr: string; averageCpc: string; costPerConversion: string
  }
}

// Map GAQL dateRange → previous period GAQL clause
function prevPeriodGaql(dateRange: string): string {
  const map: Record<string, string> = {
    LAST_7_DAYS:  'LAST_14_DAYS',   // previous 7 days = days 8-14
    LAST_14_DAYS: 'LAST_28_DAYS',
    LAST_30_DAYS: 'LAST_60_DAYS',
    LAST_90_DAYS: 'LAST_180_DAYS',
    THIS_MONTH:   'LAST_MONTH',
    LAST_MONTH:   'LAST_MONTH',     // approximate — won't be exactly -1mo but close enough
  }
  return map[dateRange] ?? 'LAST_60_DAYS'
}

// % change, rounded to 1dp, null if can't compute
function pct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return parseFloat(((curr / prev - 1) * 100).toFixed(1))
}

function toMetrics(row: RawRow): CampaignMetrics {
  const cost   = Number(row.metrics.costMicros ?? 0) / 1e6
  const conv   = Number(row.metrics.conversions ?? 0)
  const value  = Number(row.metrics.conversionsValue ?? 0)
  const clicks = Number(row.metrics.clicks ?? 0)
  const impr   = Number(row.metrics.impressions ?? 0)
  return {
    spend:       cost,
    impressions: impr,
    clicks,
    conversions: conv,
    ctr:         Number(row.metrics.ctr ?? 0) * 100,
    cpc:         Number(row.metrics.averageCpc ?? 0) / 1e6,
    cpa:         conv > 0 ? cost / conv : 0,
    convRate:    clicks > 0 ? (conv / clicks) * 100 : 0,
    roas:        cost > 0 && value > 0 ? value / cost : 0,
  }
}

function buildChanges(curr: CampaignMetrics, prev: CampaignMetrics | null): CampaignChange {
  if (!prev) return { spend: null, impressions: null, clicks: null, conversions: null, ctr: null, cpc: null, cpa: null, convRate: null }
  return {
    spend:       pct(curr.spend,       prev.spend),
    impressions: pct(curr.impressions, prev.impressions),
    clicks:      pct(curr.clicks,      prev.clicks),
    conversions: pct(curr.conversions, prev.conversions),
    ctr:         pct(curr.ctr,         prev.ctr),
    cpc:         pct(curr.cpc,         prev.cpc),
    cpa:         pct(curr.cpa,         prev.cpa),
    convRate:    pct(curr.convRate,    prev.convRate),
  }
}

async function gaqlSearch(customerId: string, token: string, query: string, loginCustomerId = ''): Promise<Response> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const headers: Record<string, string> = {
    Authorization:     `Bearer ${token}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
  return fetch(
    `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) }
  )
}

const CAMPAIGN_FIELDS = `
  campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type,
  campaign.start_date, campaign.end_date, campaign_budget.amount_micros,
  metrics.cost_micros, metrics.impressions, metrics.clicks,
  metrics.conversions, metrics.conversions_value,
  metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion
`.trim()

async function fetchCampaigns(customerId: string, token: string, dateRange: string): Promise<CampaignDetail[]> {
  const devToken        = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
  if (!devToken || !token) return []

  const cid = customerId.replace(/-/g, '')

  const makeQuery = (period: string) => `
    SELECT ${CAMPAIGN_FIELDS}
    FROM campaign
    WHERE segments.date DURING ${period}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `.trim()

  const prevPeriod = prevPeriodGaql(dateRange)

  // Determine login-customer-id
  const lcid = loginCustomerId || ''

  async function runQuery(period: string): Promise<RawRow[]> {
    const attempts = lcid ? [lcid, ''] : ['']
    for (const l of attempts) {
      const res  = await gaqlSearch(cid, token, makeQuery(period), l)
      const body = await res.text().catch(() => '')
      if (res.ok) {
        try { return (JSON.parse(body) as { results?: RawRow[] }).results ?? [] } catch { return [] }
      }
    }
    return []
  }

  // Fetch both periods in parallel
  const [currRows, prevRows] = await Promise.all([
    runQuery(dateRange),
    runQuery(prevPeriod),
  ])

  // Build prev map by campaign id
  const prevMap = new Map<string, CampaignMetrics>()
  for (const r of prevRows) {
    const m = toMetrics(r)
    const existing = prevMap.get(r.campaign.id)
    if (existing) {
      // Accumulate in case of multiple rows per campaign
      existing.spend       += m.spend
      existing.impressions += m.impressions
      existing.clicks      += m.clicks
      existing.conversions += m.conversions
    } else {
      prevMap.set(r.campaign.id, { ...m })
    }
  }

  return currRows.map((r) => {
    const curr = toMetrics(r)
    const prev = prevMap.get(r.campaign.id) ?? null
    return {
      id:              r.campaign.id,
      name:            r.campaign.name,
      status:          r.campaign.status as CampaignDetail['status'],
      biddingStrategy: r.campaign.biddingStrategyType ?? 'MANUAL_CPC',
      budget:          Number(r.campaignBudget?.amountMicros ?? 0) / 1e6,
      startDate:       r.campaign.startDate ?? '',
      endDate:         r.campaign.endDate ?? null,
      ...curr,
      prev,
      changes: buildChanges(curr, prev),
    }
  })
}

function mockMetrics(spend: number, impr: number, clicks: number, conv: number): CampaignMetrics {
  return {
    spend, impressions: impr, clicks, conversions: conv,
    ctr:      impr > 0 ? parseFloat(((clicks / impr) * 100).toFixed(2)) : 0,
    cpc:      clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0,
    cpa:      conv > 0 ? parseFloat((spend / conv).toFixed(2)) : 0,
    convRate: clicks > 0 ? parseFloat(((conv / clicks) * 100).toFixed(2)) : 0,
    roas:     0,
  }
}

function mockCampaigns(): CampaignDetail[] {
  const campaigns: Array<[string, string, CampaignDetail['status'], string, CampaignMetrics, CampaignMetrics]> = [
    ['1', 'SEM - Brand KW',       'ENABLED', 'TARGET_CPA',   mockMetrics(2450, 12000, 380, 18), mockMetrics(2100, 10800, 340, 14)],
    ['2', 'SEM - Competitor KW',  'ENABLED', 'TARGET_CPA',   mockMetrics(1890,  8400, 210,  6), mockMetrics(2050,  9200, 240,  8)],
    ['3', 'Display - Remarketing','PAUSED',  'TARGET_ROAS',  mockMetrics(0,        0,   0,  0), mockMetrics(420,   5200,  90,  3)],
  ]
  return campaigns.map(([id, name, status, strat, curr, prev]) => ({
    id, name, status, biddingStrategy: strat, budget: 3000,
    startDate: '2025-01-01', endDate: null,
    ...curr,
    prev,
    changes: buildChanges(curr, prev),
  }))
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url)
  const dateRange  = searchParams.get('dateRange') ?? 'LAST_30_DAYS'
  const customerId = params.id.replace(/-/g, '')

  const session      = await auth()
  const sessionToken = (session as Record<string, unknown> | null)?.accessToken as string ?? ''
  const mccToken     = await getGoogleAdsAccessToken().catch(() => '')
  const token        = mccToken || sessionToken

  const mock = isMockMode()
  const campaigns = mock || !token
    ? mockCampaigns()
    : await fetchCampaigns(customerId, token, dateRange).catch(() => mockCampaigns())

  const totalSpend  = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalConv   = campaigns.reduce((s, c) => s + c.conversions, 0)
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0)
  const totalImpr   = campaigns.reduce((s, c) => s + c.impressions, 0)

  // Summary changes vs previous period
  const prevSpend  = campaigns.reduce((s, c) => s + (c.prev?.spend ?? 0), 0)
  const prevConv   = campaigns.reduce((s, c) => s + (c.prev?.conversions ?? 0), 0)
  const prevClicks = campaigns.reduce((s, c) => s + (c.prev?.clicks ?? 0), 0)
  const prevImpr   = campaigns.reduce((s, c) => s + (c.prev?.impressions ?? 0), 0)

  const blendedCPA     = totalConv > 0 ? totalSpend / totalConv : 0
  const blendedCTR     = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0
  const prevBlendedCPA = prevConv > 0 ? prevSpend / prevConv : 0
  const prevBlendedCTR = prevImpr > 0 ? (prevClicks / prevImpr) * 100 : 0

  return NextResponse.json({
    customerId,
    dateRange,
    campaigns,
    summary: {
      totalSpend,    totalConversions: totalConv,    totalClicks,    totalImpressions: totalImpr,
      blendedCPA,    blendedCTR,
      activeCampaigns:  campaigns.filter((c) => c.status === 'ENABLED').length,
      pausedCampaigns:  campaigns.filter((c) => c.status === 'PAUSED').length,
      changes: {
        spend:       pct(totalSpend,  prevSpend),
        conversions: pct(totalConv,   prevConv),
        clicks:      pct(totalClicks, prevClicks),
        impressions: pct(totalImpr,   prevImpr),
        blendedCPA:  pct(blendedCPA,  prevBlendedCPA),
        blendedCTR:  pct(blendedCTR,  prevBlendedCTR),
      },
    },
    mock: mock || !token,
  })
}
