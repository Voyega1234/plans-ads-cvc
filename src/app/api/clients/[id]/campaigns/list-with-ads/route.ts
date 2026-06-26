import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { auth } from '@/lib/auth'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

function adsHeaders(token: string) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

async function gaqlQuery(customerId: string, query: string, token: string) {
  const cid = customerId.replace(/-/g, '')
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: adsHeaders(token),
      body: JSON.stringify({ query }),
    }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GAQL failed (${res.status}): ${txt.slice(0, 2000)}`)
  }
  const chunks = await res.json() as Array<{ results?: unknown[] }>
  return chunks.flatMap(c => c.results ?? [])
}

function mockCampaigns() {
  return [
    {
      id: '111111', resourceName: 'customers/5482007847/campaigns/111111',
      name: 'Bangkok | Search | Brand | Test Co | Lead', campaignType: 'SEARCH', status: 'ENABLED',
      budgetAmountMicros: '50000000',
      adGroups: [{
        id: 'ag1', resourceName: 'customers/5482007847/adGroups/ag1',
        name: 'Brand Keywords', status: 'ENABLED',
        ads: [{
          id: 'ad1', resourceName: 'customers/5482007847/adGroupAds/ag1~ad1',
          type: 'RESPONSIVE_SEARCH_AD',
          headlines: ['ทดสอบ Headline 1', 'ทดสอบ Headline 2', 'ทดสอบ Headline 3'],
          descriptions: ['คำอธิบาย Test 1', 'คำอธิบาย Test 2'],
          finalUrls: ['https://www.test.com'],
        }],
      }],
    },
    {
      id: '222222', resourceName: 'customers/5482007847/campaigns/222222',
      name: 'Bangkok | PMax | Test Co | Lead', campaignType: 'PERFORMANCE_MAX', status: 'ENABLED',
      budgetAmountMicros: '100000000',
      adGroups: [],
      assetGroups: [{
        id: 'assetg1', resourceName: 'customers/5482007847/assetGroups/assetg1',
        name: 'Asset Group 1', status: 'ENABLED',
      }],
    },
    {
      id: '333333', resourceName: 'customers/5482007847/campaigns/333333',
      name: 'Bangkok | Display | Remarketing | Test Co | Lead', campaignType: 'DISPLAY', status: 'ENABLED',
      budgetAmountMicros: '30000000',
      adGroups: [{
        id: 'ag2', resourceName: 'customers/5482007847/adGroups/ag2',
        name: 'Remarketing', status: 'ENABLED',
        ads: [{
          id: 'ad2', resourceName: 'customers/5482007847/adGroupAds/ag2~ad2',
          type: 'RESPONSIVE_DISPLAY_AD',
          headlines: ['Display Ad Test'],
          descriptions: ['Display description'],
          finalUrls: ['https://www.test.com/display'],
        }],
      }],
    },
  ]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customerId = params.id.replace(/-/g, '')

    if (isMockMode()) {
      return NextResponse.json({ campaigns: mockCampaigns() })
    }

    const session = await auth()
    const sessionToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined
    const mccToken = await getGoogleAdsAccessToken().catch(() => undefined)
    const token = sessionToken ?? mccToken
    if (!token) return NextResponse.json({ error: 'No access token' }, { status: 401 })

    // Fetch campaigns
    const campQuery = `
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name
    `
    type CampRow = {
      campaign: { id: string; name: string; status: string; advertisingChannelType: string; resourceName: string }
      campaignBudget?: { amountMicros: string }
    }
    const campRows = await gaqlQuery(customerId, campQuery, token) as CampRow[]

    // Fetch ad groups for all campaigns
    const agQuery = `
      SELECT
        ad_group.id, ad_group.name, ad_group.status,
        ad_group.resource_name,
        campaign.id
      FROM ad_group
      WHERE ad_group.status != 'REMOVED'
    `
    type AgRow = {
      adGroup: { id: string; name: string; status: string; resourceName: string }
      campaign: { id: string }
    }
    const agRows = await gaqlQuery(customerId, agQuery, token) as AgRow[]

    // Fetch ads (responsive search + display)
    const adQuery = `
      SELECT
        ad_group_ad.resource_name,
        ad_group_ad.ad.id,
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.responsive_display_ad.headlines,
        ad_group_ad.ad.responsive_display_ad.descriptions,
        ad_group.id
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
    `
    type AdRow = {
      adGroupAd: {
        resourceName: string
        ad: {
          id: string; type: string; finalUrls?: string[]
          responsiveSearchAd?: { headlines: { text: string }[]; descriptions: { text: string }[] }
          responsiveDisplayAd?: { headlines: { text: string }[]; descriptions: { text: string }[] }
        }
      }
      adGroup: { id: string }
    }
    const adRows = await gaqlQuery(customerId, adQuery, token) as AdRow[]

    // Build adGroup → ads map
    const adsByGroup = new Map<string, Array<{
      id: string; resourceName: string; type: string
      headlines: string[]; descriptions: string[]; finalUrls: string[]
    }>>()
    for (const row of adRows) {
      const agId = row.adGroup.id
      const ad = row.adGroupAd.ad
      const rsa = ad.responsiveSearchAd
      const rda = ad.responsiveDisplayAd
      if (!adsByGroup.has(agId)) adsByGroup.set(agId, [])
      adsByGroup.get(agId)!.push({
        id: ad.id,
        resourceName: row.adGroupAd.resourceName,
        type: ad.type,
        headlines: (rsa?.headlines ?? rda?.headlines ?? []).map(h => h.text),
        descriptions: (rsa?.descriptions ?? rda?.descriptions ?? []).map(d => d.text),
        finalUrls: ad.finalUrls ?? [],
      })
    }

    // Build campaign → adGroups map
    const agsByCamp = new Map<string, typeof agRows>()
    for (const row of agRows) {
      const cid = row.campaign.id
      if (!agsByCamp.has(cid)) agsByCamp.set(cid, [])
      agsByCamp.get(cid)!.push(row)
    }

    const campaigns = campRows.map(row => {
      const c = row.campaign
      const ags = agsByCamp.get(c.id) ?? []
      const campaignType = c.advertisingChannelType
      return {
        id: c.id,
        resourceName: c.resourceName,
        name: c.name,
        campaignType,
        status: c.status,
        budgetAmountMicros: row.campaignBudget?.amountMicros,
        adGroups: ags.map(ag => ({
          id: ag.adGroup.id,
          resourceName: ag.adGroup.resourceName,
          name: ag.adGroup.name,
          status: ag.adGroup.status,
          ads: adsByGroup.get(ag.adGroup.id) ?? [],
        })),
      }
    })

    return NextResponse.json({ campaigns })
  } catch (err) {
    console.error('[campaigns/list-with-ads]', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to fetch campaigns',
    }, { status: 500 })
  }
}
