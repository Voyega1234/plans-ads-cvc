import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// ─── Types ─────────────────────────────────────────────────────────────────────

// ad type ที่แก้ text ได้จากหน้า Campaign Adjustment
// DEMAND_GEN_CAROUSEL อ่านได้อย่างเดียว (โครงสร้าง card แก้ผ่านฟอร์มนี้ไม่ได้)
export type EditableAdType =
  | 'RSA'
  | 'RESPONSIVE_DISPLAY'
  | 'APP'
  | 'DEMAND_GEN_MULTI_ASSET'
  | 'DEMAND_GEN_VIDEO'
  | 'DEMAND_GEN_CAROUSEL'

export interface LiveAd {
  adId: string
  adGroupId: string
  adGroupName: string
  adType: EditableAdType
  headlines: { text: string; pinned_field?: 'HEADLINE_1' | 'HEADLINE_2' | 'HEADLINE_3' }[]
  longHeadlines: { text: string }[]
  descriptions: { text: string }[]
  finalUrls: string[]
  status: 'ENABLED' | 'PAUSED'
  metrics?: { impressions: number; clicks: number; ctr: number; conversions: number }
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

function getMockAds(campaignId: string): LiveAd[] {
  return [
    {
      adId: `${campaignId}-ad-001`,
      adGroupId: `${campaignId}-ag-001`,
      adGroupName: 'กลุ่มโฆษณา — สินค้าหลัก',
      adType: 'RSA',
      headlines: [
        { text: 'โปรโมชั่นพิเศษวันนี้', pinned_field: 'HEADLINE_1' },
        { text: 'ราคาถูกที่สุดในไทย' },
        { text: 'สั่งซื้อง่ายส่งเร็ว' },
        { text: 'รับประกันคุณภาพ' },
        { text: 'ฟรีค่าจัดส่งทั่วประเทศ' },
      ],
      longHeadlines: [],
      descriptions: [
        { text: 'สินค้าคุณภาพสูง ราคาคุ้มค่า ส่งฟรีทุกออเดอร์ สั่งซื้อเลยวันนี้' },
        { text: 'บริการลูกค้า 24 ชั่วโมง คืนสินค้าได้ภายใน 30 วัน' },
      ],
      finalUrls: ['https://example.co.th/products'],
      status: 'ENABLED',
      metrics: { impressions: 42800, clicks: 1284, ctr: 3.0, conversions: 38 },
    },
    {
      adId: `${campaignId}-ad-002`,
      adGroupId: `${campaignId}-ag-001`,
      adGroupName: 'กลุ่มโฆษณา — สินค้าหลัก',
      adType: 'RESPONSIVE_DISPLAY',
      headlines: [
        { text: 'ลดราคาทุกวัน' },
        { text: 'ของแท้จากผู้ผลิต' },
        { text: 'เช็คราคาตอนนี้' },
      ],
      longHeadlines: [{ text: 'สินค้าคุณภาพราคาโปร สั่งออนไลน์ส่งด่วนทั่วไทย' }],
      descriptions: [
        { text: 'ร้านค้าออนไลน์อันดับ 1 สินค้าครบ ราคาโปร จัดส่งไว' },
        { text: 'มั่นใจได้กับคุณภาพ ลูกค้ากว่า 50,000 คนไว้วางใจ' },
      ],
      finalUrls: ['https://example.co.th/sale'],
      status: 'ENABLED',
      metrics: { impressions: 28600, clicks: 857, ctr: 3.0, conversions: 22 },
    },
    {
      adId: `${campaignId}-ad-003`,
      adGroupId: `${campaignId}-ag-002`,
      adGroupName: 'กลุ่มโฆษณา — แบรนด์',
      adType: 'DEMAND_GEN_MULTI_ASSET',
      headlines: [
        { text: 'แบรนด์ชั้นนำ คุณภาพระดับพรีเมียม' },
        { text: 'ผลิตภัณฑ์คุณภาพสูง' },
      ],
      longHeadlines: [],
      descriptions: [
        { text: 'แบรนด์ที่วางใจได้ สินค้าแท้ 100% จัดส่งด่วนทั่วประเทศ' },
        { text: 'ช้อปตรงจากแบรนด์ รับส่วนลดพิเศษสำหรับสมาชิก' },
      ],
      finalUrls: ['https://example.co.th/brand'],
      status: 'PAUSED',
      metrics: { impressions: 9200, clicks: 460, ctr: 5.0, conversions: 14 },
    },
    {
      adId: `${campaignId}-ad-004`,
      adGroupId: `${campaignId}-ag-003`,
      adGroupName: 'กลุ่มโฆษณา — App',
      adType: 'APP',
      headlines: [
        { text: 'โหลดแอปวันนี้' },
        { text: 'ดีลพิเศษเฉพาะในแอป' },
      ],
      longHeadlines: [],
      descriptions: [
        { text: 'ดาวน์โหลดฟรี รับส่วนลดออเดอร์แรกทันที' },
        { text: 'ช้อปสะดวกกว่าในแอป พร้อมโปรเฉพาะสมาชิก' },
      ],
      finalUrls: [],
      status: 'ENABLED',
      metrics: { impressions: 63400, clicks: 2220, ctr: 3.5, conversions: 67 },
    },
  ]
}

// ─── GET ───────────────────────────────────────────────────────────────────────

const AD_TYPE_MAP: Record<string, EditableAdType> = {
  RESPONSIVE_SEARCH_AD: 'RSA',
  RESPONSIVE_DISPLAY_AD: 'RESPONSIVE_DISPLAY',
  APP_AD: 'APP',
  DEMAND_GEN_MULTI_ASSET_AD: 'DEMAND_GEN_MULTI_ASSET',
  DEMAND_GEN_VIDEO_RESPONSIVE_AD: 'DEMAND_GEN_VIDEO',
  DEMAND_GEN_CAROUSEL_AD: 'DEMAND_GEN_CAROUSEL',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const campaignId = searchParams.get('campaignId') ?? ''

  if (!customerId || !campaignId) {
    return NextResponse.json({ error: 'customerId and campaignId are required' }, { status: 400 })
  }

  if (isMockMode()) {
    return NextResponse.json({ ads: getMockAds(campaignId) })
  }

  // Real Google Ads REST API — ดึง field ของทุก ad type ที่รองรับ (Search / Display / App / Demand Gen)
  try {
    const accessToken = await getGoogleAdsAccessToken()
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

    const query = `SELECT
        ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.status,
        ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline, ad_group_ad.ad.responsive_display_ad.descriptions,
        ad_group_ad.ad.app_ad.headlines, ad_group_ad.ad.app_ad.descriptions,
        ad_group_ad.ad.demand_gen_multi_asset_ad.headlines, ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions,
        ad_group_ad.ad.demand_gen_video_responsive_ad.headlines, ad_group_ad.ad.demand_gen_video_responsive_ad.long_headlines, ad_group_ad.ad.demand_gen_video_responsive_ad.descriptions,
        ad_group.name, ad_group.id
      FROM ad_group_ad
      WHERE campaign.id = '${campaignId}' AND ad_group_ad.status != 'REMOVED'`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google Ads API error (${res.status}): ${err.slice(0, 400)}`)
    }

    type TextAsset = { text?: string; pinnedField?: string }
    const data = await res.json() as Array<{
      results?: Array<{
        adGroupAd?: {
          ad?: {
            id?: string
            type?: string
            responsiveSearchAd?: { headlines?: TextAsset[]; descriptions?: TextAsset[] }
            responsiveDisplayAd?: { headlines?: TextAsset[]; longHeadline?: TextAsset; descriptions?: TextAsset[] }
            appAd?: { headlines?: TextAsset[]; descriptions?: TextAsset[] }
            demandGenMultiAssetAd?: { headlines?: TextAsset[]; descriptions?: TextAsset[] }
            demandGenVideoResponsiveAd?: { headlines?: TextAsset[]; longHeadlines?: TextAsset[]; descriptions?: TextAsset[] }
            finalUrls?: string[]
          }
          status?: string
        }
        adGroup?: { id?: string; name?: string }
      }>
    }>

    const toTexts = (arr?: TextAsset[]) => (arr ?? []).filter(t => (t.text ?? '').length > 0)

    const ads: LiveAd[] = []
    for (const batch of data) {
      for (const row of batch.results ?? []) {
        const ad = row.adGroupAd?.ad
        const ag = row.adGroup
        if (!ad || !ag) continue

        const adType = AD_TYPE_MAP[ad.type ?? '']
        if (!adType) continue // ข้าม ad type ที่ยังไม่รองรับ (video, ฯลฯ)

        let headlines: TextAsset[] = []
        let longHeadlines: TextAsset[] = []
        let descriptions: TextAsset[] = []

        switch (adType) {
          case 'RSA':
            headlines = toTexts(ad.responsiveSearchAd?.headlines)
            descriptions = toTexts(ad.responsiveSearchAd?.descriptions)
            break
          case 'RESPONSIVE_DISPLAY':
            headlines = toTexts(ad.responsiveDisplayAd?.headlines)
            longHeadlines = toTexts(ad.responsiveDisplayAd?.longHeadline ? [ad.responsiveDisplayAd.longHeadline] : [])
            descriptions = toTexts(ad.responsiveDisplayAd?.descriptions)
            break
          case 'APP':
            headlines = toTexts(ad.appAd?.headlines)
            descriptions = toTexts(ad.appAd?.descriptions)
            break
          case 'DEMAND_GEN_MULTI_ASSET':
            headlines = toTexts(ad.demandGenMultiAssetAd?.headlines)
            descriptions = toTexts(ad.demandGenMultiAssetAd?.descriptions)
            break
          case 'DEMAND_GEN_VIDEO':
            headlines = toTexts(ad.demandGenVideoResponsiveAd?.headlines)
            longHeadlines = toTexts(ad.demandGenVideoResponsiveAd?.longHeadlines)
            descriptions = toTexts(ad.demandGenVideoResponsiveAd?.descriptions)
            break
          case 'DEMAND_GEN_CAROUSEL':
            // carousel: อ่านอย่างเดียว — ไม่มี field ให้ดึงแบบ array กลาง
            break
        }

        ads.push({
          adId: ad.id ?? '',
          adGroupId: ag.id ?? '',
          adGroupName: ag.name ?? '',
          adType,
          headlines: headlines.map(h => ({
            text: h.text ?? '',
            pinned_field: h.pinnedField as 'HEADLINE_1' | 'HEADLINE_2' | 'HEADLINE_3' | undefined,
          })),
          longHeadlines: longHeadlines.map(h => ({ text: h.text ?? '' })),
          descriptions: descriptions.map(d => ({ text: d.text ?? '' })),
          finalUrls: ad.finalUrls ?? [],
          status: (row.adGroupAd?.status === 'PAUSED' ? 'PAUSED' : 'ENABLED'),
        })
      }
    }

    return NextResponse.json({ ads })
  } catch (err) {
    console.error('[campaign-edit/ads GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const adId = searchParams.get('adId') ?? ''

  if (!customerId || !adId) {
    return NextResponse.json({ error: 'customerId and adId are required' }, { status: 400 })
  }

  const body = await req.json() as {
    adType?: EditableAdType
    headlines: string[]
    longHeadlines?: string[]
    descriptions: string[]
    finalUrls: string[]
  }
  const adType: EditableAdType = body.adType ?? 'RSA'
  const longHeadlines = body.longHeadlines ?? []

  if (adType === 'DEMAND_GEN_CAROUSEL') {
    return NextResponse.json({ error: 'Demand Gen Carousel ads แก้ text ผ่านหน้านี้ไม่ได้ — แก้ใน Google Ads UI' }, { status: 400 })
  }

  if (isMockMode()) {
    return NextResponse.json({
      success: true,
      resourceName: `customers/${customerId}/ads/${adId}`,
    })
  }

  try {
    const accessToken = await getGoogleAdsAccessToken()
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    const toAssets = (texts: string[]) => texts.map(text => ({ text }))

    // updateMask + payload ต่างกันตาม ad type — ผิด mask = mutate ล้มเหลวทั้งก้อน
    let updateMask = ''
    const adUpdate: Record<string, unknown> = {
      resourceName: `customers/${customerId}/ads/${adId}`,
    }

    switch (adType) {
      case 'RSA':
        updateMask = 'responsiveSearchAd.headlines,responsiveSearchAd.descriptions,finalUrls'
        adUpdate.finalUrls = body.finalUrls
        adUpdate.responsiveSearchAd = {
          headlines: toAssets(body.headlines),
          descriptions: toAssets(body.descriptions),
        }
        break
      case 'RESPONSIVE_DISPLAY':
        updateMask = 'responsiveDisplayAd.headlines,responsiveDisplayAd.longHeadline,responsiveDisplayAd.descriptions,finalUrls'
        adUpdate.finalUrls = body.finalUrls
        adUpdate.responsiveDisplayAd = {
          headlines: toAssets(body.headlines),
          longHeadline: { text: longHeadlines[0] ?? '' },
          descriptions: toAssets(body.descriptions),
        }
        break
      case 'APP':
        // App ads ไม่มี finalUrls ให้แก้ (ผูกกับ store listing)
        updateMask = 'appAd.headlines,appAd.descriptions'
        adUpdate.appAd = {
          headlines: toAssets(body.headlines),
          descriptions: toAssets(body.descriptions),
        }
        break
      case 'DEMAND_GEN_MULTI_ASSET':
        updateMask = 'demandGenMultiAssetAd.headlines,demandGenMultiAssetAd.descriptions,finalUrls'
        adUpdate.finalUrls = body.finalUrls
        adUpdate.demandGenMultiAssetAd = {
          headlines: toAssets(body.headlines),
          descriptions: toAssets(body.descriptions),
        }
        break
      case 'DEMAND_GEN_VIDEO':
        updateMask = 'demandGenVideoResponsiveAd.headlines,demandGenVideoResponsiveAd.longHeadlines,demandGenVideoResponsiveAd.descriptions,finalUrls'
        adUpdate.finalUrls = body.finalUrls
        adUpdate.demandGenVideoResponsiveAd = {
          headlines: toAssets(body.headlines),
          longHeadlines: toAssets(longHeadlines),
          descriptions: toAssets(body.descriptions),
        }
        break
    }

    const operation = { updateMask, update: adUpdate }

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/ads:mutate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ operations: [operation] }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google Ads mutate error (${res.status}): ${err.slice(0, 400)}`)
    }

    const result = await res.json() as { results?: Array<{ resourceName?: string }> }
    const resourceName = result.results?.[0]?.resourceName ?? `customers/${customerId}/ads/${adId}`

    return NextResponse.json({ success: true, resourceName })
  } catch (err) {
    console.error('[campaign-edit/ads POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
