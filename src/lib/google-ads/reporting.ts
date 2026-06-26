import { isMockMode } from './client'
import { mockGetCampaignPerformance } from './mock'
import { getGoogleAdsAccessToken } from './auth'

interface CampaignPerformanceRow {
  campaignId: string
  campaignName: string
  cost: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  costPerConversion: number
}

export async function getCampaignPerformance(
  customerId: string,
  dateRange = 'LAST_30_DAYS',
  accessToken?: string
): Promise<CampaignPerformanceRow[]> {
  if (isMockMode()) {
    return (await mockGetCampaignPerformance(customerId, dateRange) as unknown) as CampaignPerformanceRow[]
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

  // Use passed-in MCC token; fall back to refresh-token flow
  let token = accessToken ?? ''
  if (!token) {
    try {
      token = await getGoogleAdsAccessToken()
    } catch {
      console.error('[reporting] no token available for', customerId)
      return []
    }
  }

  if (!devToken) {
    console.error('[reporting] no dev token')
    return []
  }

  const cid   = customerId.replace(/-/g, '')
  const lcid  = loginCustomerId.replace(/-/g, '')

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
  `.trim()

  // MCC-first retry: try with login-customer-id header first, then without
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
    console.error(`[reporting] ${res.status} lcid=${attempt || 'none'}`, body.slice(0, 200))
  }

  if (!ok) {
    console.error('[reporting] all attempts failed for', cid)
    return []
  }

  type GadsResult = {
    results?: Array<{
      campaign: { id: string; name: string }
      metrics: { costMicros: string; impressions: string; clicks: string; conversions: string; ctr: string; averageCpc: string; costPerConversion: string }
    }>
  }
  let data: GadsResult
  try { data = JSON.parse(body) as GadsResult } catch {
    console.error('[reporting] JSON parse failed for', cid)
    return []
  }

  return (data.results ?? []).map((r) => {
    const cost = Number(r.metrics.costMicros ?? 0) / 1_000_000
    const conv = Number(r.metrics.conversions ?? 0)
    return {
      campaignId:        String(r.campaign.id ?? ''),
      campaignName:      r.campaign.name,
      cost,
      impressions:       Number(r.metrics.impressions ?? 0),
      clicks:            Number(r.metrics.clicks ?? 0),
      conversions:       conv,
      ctr:               Number(r.metrics.ctr ?? 0) * 100,
      cpc:               Number(r.metrics.averageCpc ?? 0) / 1_000_000,
      costPerConversion: conv > 0 ? cost / conv : 0,
    }
  })
}
