import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface CampaignSummary {
  campaignId: string
  campaignName: string
  type: 'SEARCH' | 'PERFORMANCE_MAX' | 'DISPLAY' | 'VIDEO' | 'SHOPPING' | 'DEMAND_GEN' | 'APP' | 'LOCAL' | 'UNKNOWN'
  status: 'ENABLED' | 'PAUSED'
  dailyBudgetMicros: number
  campaignResourceName: string
  budgetResourceName: string
  /** Google Ads bidding strategy type (e.g. MAXIMIZE_CONVERSIONS) — for the Bidding panel. */
  biddingStrategyType?: string
}

const CHANNEL_MAP: Record<string, CampaignSummary['type']> = {
  SEARCH: 'SEARCH',
  PERFORMANCE_MAX: 'PERFORMANCE_MAX',
  DISPLAY: 'DISPLAY',
  VIDEO: 'VIDEO',
  SHOPPING: 'SHOPPING',
  DEMAND_GEN: 'DEMAND_GEN',
  // App campaigns ใช้ channel type MULTI_CHANNEL ใน Google Ads API
  MULTI_CHANNEL: 'APP',
  LOCAL: 'LOCAL',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''

  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'developer-token': DEV_TOKEN,
      'Content-Type': 'application/json',
    }
    if (LOGIN_CID) headers['login-customer-id'] = LOGIN_CID

    const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.resource_name, campaign.bidding_strategy_type, campaign_budget.amount_micros, campaign_budget.resource_name FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name`

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    )

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Google Ads API error (${res.status}): ${txt.slice(0, 400)}`)
    }

    const data = await res.json() as Array<{
      results?: Array<{
        campaign?: {
          id?: string
          name?: string
          status?: string
          advertisingChannelType?: string
          resourceName?: string
          biddingStrategyType?: string
        }
        campaignBudget?: {
          amountMicros?: string
          resourceName?: string
        }
      }>
    }>

    const campaigns: CampaignSummary[] = []
    for (const batch of data) {
      for (const row of batch.results ?? []) {
        const c = row.campaign
        if (!c?.id) continue
        const channelType = c.advertisingChannelType ?? 'UNKNOWN'
        campaigns.push({
          campaignId: c.id,
          campaignName: c.name ?? c.id,
          type: CHANNEL_MAP[channelType] ?? 'UNKNOWN',
          status: (c.status === 'PAUSED' ? 'PAUSED' : 'ENABLED') as 'ENABLED' | 'PAUSED',
          dailyBudgetMicros: parseInt(row.campaignBudget?.amountMicros ?? '0', 10),
          campaignResourceName: c.resourceName ?? `customers/${cid}/campaigns/${c.id}`,
          budgetResourceName: row.campaignBudget?.resourceName ?? '',
          biddingStrategyType: c.biddingStrategyType,
        })
      }
    }

    return NextResponse.json({ campaigns })
  } catch (err) {
    console.error('[campaign-edit/campaigns GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
