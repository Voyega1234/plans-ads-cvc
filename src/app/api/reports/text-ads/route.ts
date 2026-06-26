import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'

const DEV_TOKEN   = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID   = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

async function gaqlSearch(cid: string, query: string, token: string) {
  const headers: Record<string, string> = {
    Authorization:     `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type':    'application/json',
  }
  if (LOGIN_CID) headers['login-customer-id'] = LOGIN_CID.replace(/-/g, '')

  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid.replace(/-/g, '')}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    console.error('[text-ads] GAQL failed', res.status, txt.slice(0, 300))
    return []
  }
  const data = await res.json() as { results?: unknown[] }
  return data.results ?? []
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const dateRange  = searchParams.get('dateRange') ?? 'LAST_30_DAYS'

  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  if (isMockMode()) {
    return NextResponse.json({ ads: [], source: 'mock' })
  }

  let token = ''
  try { token = await getGoogleAdsAccessToken() } catch { token = '' }
  if (!token) return NextResponse.json({ ads: [], error: 'no token' })

  // Query RSA (Responsive Search Ads) performance
  const query = `
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad_strength,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM ad_group_ad
    WHERE segments.date DURING ${dateRange}
      AND ad_group_ad.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
      AND ad_group_ad.ad.type IN ('RESPONSIVE_SEARCH_AD', 'EXPANDED_TEXT_AD')
    ORDER BY metrics.impressions DESC
    LIMIT 50
  `.trim()

  type AdRow = {
    campaign: { name: string }
    adGroup: { name: string }
    adGroupAd: {
      ad: {
        id: string
        type: string
        responsiveSearchAd?: {
          headlines?: Array<{ text: string }>
          descriptions?: Array<{ text: string }>
        }
        expandedTextAd?: {
          headlinePart1?: string; headlinePart2?: string; headlinePart3?: string
          description?: string; description2?: string
        }
        finalUrls?: string[]
      }
      adStrength?: string
    }
    metrics: {
      impressions: string; clicks: string; costMicros: string
      conversions: string; ctr: string; averageCpc: string
    }
  }

  try {
    const results = await gaqlSearch(customerId, query, token) as AdRow[]

    const ads = results.map((r) => {
      const ad = r.adGroupAd.ad
      const m  = r.metrics
      const cost        = Number(m.costMicros ?? 0) / 1_000_000
      const conversions = Number(m.conversions ?? 0)
      const clicks      = Number(m.clicks ?? 0)

      let headlines: string[] = []
      let descriptions: string[] = []

      if (ad.responsiveSearchAd) {
        headlines    = (ad.responsiveSearchAd.headlines ?? []).map((h) => h.text).filter(Boolean)
        descriptions = (ad.responsiveSearchAd.descriptions ?? []).map((d) => d.text).filter(Boolean)
      } else if (ad.expandedTextAd) {
        headlines    = [ad.expandedTextAd.headlinePart1, ad.expandedTextAd.headlinePart2, ad.expandedTextAd.headlinePart3].filter(Boolean) as string[]
        descriptions = [ad.expandedTextAd.description, ad.expandedTextAd.description2].filter(Boolean) as string[]
      }

      return {
        campaignName: r.campaign.name,
        adGroupName:  r.adGroup.name,
        adId:         ad.id,
        type:         ad.type,
        headlines,
        descriptions,
        finalUrl:     (ad.finalUrls ?? [])[0] ?? '',
        adStrength:   r.adGroupAd.adStrength ?? null,
        impressions:  Number(m.impressions ?? 0),
        clicks,
        cost,
        conversions,
        ctr:          Number(m.ctr ?? 0) * 100,
        cpc:          Number(m.averageCpc ?? 0) / 1_000_000,
        cpa:          conversions > 0 ? cost / conversions : 0,
      }
    })

    return NextResponse.json({ ads, source: 'google_ads_api' })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed', ads: [] }, { status: 500 })
  }
}
