import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
import { mockGetCampaignMonitor } from '@/lib/google-ads/mock'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

export interface MonitorCampaign {
  customerId: string
  campaignId: string
  campaignName: string
  status: string
  // Resource names ใช้ตอนกดแก้ status/budget/bidding จากหน้า Campaign Monitor (mock ไม่มีค่า)
  campaignResourceName?: string
  budgetResourceName?: string
  dailyBudget: number
  biddingStrategy: string
  targetCpa: number | null
  targetRoas: number | null
  cost: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
  valuePerConv: number
  costChange: number | null
  convChange: number | null
  cpaChange: number | null
  roasChange: number | null
}

// Build the GAQL for campaign monitor — includes budget, bidding, ROAS
function buildMonitorQuery(dateRange: string) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.resource_name,
      campaign.bidding_strategy_type,
      campaign.target_cpa.target_cpa_micros,
      campaign.maximize_conversions.target_cpa_micros,
      campaign.target_roas.target_roas,
      campaign.maximize_conversion_value.target_roas,
      campaign_budget.amount_micros,
      campaign_budget.resource_name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.cost_per_conversion,
      metrics.value_per_conversion
    FROM campaign
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `.trim()
}

async function queryMonitor(
  customerId: string,
  dateRange: string,
  token: string,
  devToken: string,
  loginCustomerId: string
): Promise<MonitorCampaign[]> {
  const cid  = customerId.replace(/-/g, '')
  const lcid = loginCustomerId.replace(/-/g, '')
  const query = buildMonitorQuery(dateRange)

  const attempts = lcid ? [lcid, ''] : ['']
  let body = ''
  let ok   = false

  for (const attempt of attempts) {
    const headers: Record<string, string> = {
      Authorization:     `Bearer ${token}`,
      'developer-token': devToken,
      'Content-Type':    'application/json',
    }
    if (attempt) headers['login-customer-id'] = attempt

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    )
    body = await res.text().catch(() => '')
    if (res.ok) { ok = true; break }
    console.error(`[monitor] ${res.status} cid=${cid} lcid=${attempt || 'none'}`, body.slice(0, 200))
  }

  if (!ok) return []

  type Row = {
    campaign: {
      id: string; name: string; status: string; biddingStrategyType: string
      resourceName?: string
      targetCpa?: { targetCpaMicros?: string }
      maximizeConversions?: { targetCpaMicros?: string }
      targetRoas?: { targetRoas?: number }
      maximizeConversionValue?: { targetRoas?: number }
    }
    campaignBudget?: { amountMicros: string; resourceName?: string }
    metrics: {
      costMicros: string; impressions: string; clicks: string; conversions: string
      conversionsValue: string; ctr: string; costPerConversion: string; valuePerConversion: string
    }
  }

  let data: { results?: Row[] }
  try { data = JSON.parse(body) as { results?: Row[] } }
  catch { return [] }

  return (data.results ?? []).map(r => {
    const cost   = Number(r.metrics.costMicros ?? 0) / 1_000_000
    const conv   = Number(r.metrics.conversions ?? 0)
    const value  = Number(r.metrics.conversionsValue ?? 0)
    const clicks = Number(r.metrics.clicks ?? 0)
    const budget = Number(r.campaignBudget?.amountMicros ?? 0) / 1_000_000
    const targetCpaMicros = Number(r.campaign.targetCpa?.targetCpaMicros ?? r.campaign.maximizeConversions?.targetCpaMicros ?? 0)
    const targetRoas = Number(r.campaign.targetRoas?.targetRoas ?? r.campaign.maximizeConversionValue?.targetRoas ?? 0)
    return {
      customerId,
      campaignId:      String(r.campaign.id ?? ''),
      campaignName:    r.campaign.name,
      status:          r.campaign.status ?? 'ENABLED',
      campaignResourceName: r.campaign.resourceName ?? `customers/${cid}/campaigns/${r.campaign.id}`,
      budgetResourceName:   r.campaignBudget?.resourceName ?? '',
      dailyBudget:     Math.round(budget),
      biddingStrategy: r.campaign.biddingStrategyType ?? '',
      targetCpa:       targetCpaMicros > 0 ? Math.round(targetCpaMicros / 1_000_000) : null,
      targetRoas:      targetRoas > 0 ? parseFloat(targetRoas.toFixed(2)) : null,
      cost:            Math.round(cost),
      impressions:     Number(r.metrics.impressions ?? 0),
      clicks,
      conversions:     Math.round(conv),
      conversionValue: Math.round(value),
      ctr:             parseFloat((Number(r.metrics.ctr ?? 0) * 100).toFixed(2)),
      cpc:             clicks > 0 ? parseFloat((cost / clicks).toFixed(2)) : 0,
      cpa:             conv > 0 ? Math.round(cost / conv) : 0,
      roas:            cost > 0 && value > 0 ? parseFloat((value / cost).toFixed(2)) : 0,
      valuePerConv:    conv > 0 ? Math.round(value / conv) : 0,
      costChange:      null,
      convChange:      null,
      cpaChange:       null,
      roasChange:      null,
    }
  })
}

const RANGE_MAP: Record<string, string> = {
  '1':  'TODAY',
  '7':  'LAST_7_DAYS',
  '30': 'LAST_30_DAYS',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ids   = searchParams.get('customerIds') ?? ''
  const days  = searchParams.get('days') ?? '1'
  const range = RANGE_MAP[days] ?? 'TODAY'

  const accountIds = ids.split(',').map(s => s.trim()).filter(Boolean)
  if (!accountIds.length) return NextResponse.json({ campaigns: [] })

  if (isMockMode()) {
    const rows = await mockGetCampaignMonitor(accountIds)
    return NextResponse.json({ campaigns: rows })
  }

  const devToken       = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCid       = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

  let token = ''
  try { token = await getGoogleAdsAccessToken() } catch { /* */ }
  if (!token || !devToken) return NextResponse.json({ campaigns: [] })

  const results = await Promise.all(
    accountIds.map(id => queryMonitor(id, range, token, devToken, loginCid).catch(() => []))
  )

  return NextResponse.json({ campaigns: results.flat().sort((a, b) => b.cost - a.cost) })
}
