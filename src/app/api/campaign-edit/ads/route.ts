import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LiveAd {
  adId: string
  adGroupId: string
  adGroupName: string
  adType: 'RSA' | 'RESPONSIVE_DISPLAY' | 'PMAX_ASSET_GROUP'
  headlines: { text: string; pinned_field?: 'HEADLINE_1' | 'HEADLINE_2' | 'HEADLINE_3' }[]
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
      adType: 'RSA',
      headlines: [
        { text: 'ลดราคาทุกวัน', pinned_field: 'HEADLINE_1' },
        { text: 'ของแท้จากผู้ผลิต' },
        { text: 'เช็คราคาตอนนี้' },
      ],
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
      adType: 'RSA',
      headlines: [
        { text: 'แบรนด์ชั้นนำ', pinned_field: 'HEADLINE_1' },
        { text: 'ผลิตภัณฑ์คุณภาพสูง' },
        { text: 'เว็บไซต์ทางการ' },
        { text: 'รับประกัน 1 ปี' },
      ],
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
      adGroupName: 'กลุ่มโฆษณา — โปรโมชั่น',
      adType: 'RSA',
      headlines: [
        { text: 'ลด 50% ทุกชิ้น', pinned_field: 'HEADLINE_1' },
        { text: 'ส่วนลดพิเศษ Flash Sale' },
        { text: 'จำกัดเวลา อย่าพลาด' },
        { text: 'ออเดอร์แรกลด 200 บาท' },
      ],
      descriptions: [
        { text: 'Flash Sale ลดสูงสุด 50% เฉพาะวันนี้เท่านั้น อย่าพลาดโอกาส' },
        { text: 'ใช้โค้ด SAVE200 ลดทันที 200 บาท สำหรับออเดอร์แรก' },
      ],
      finalUrls: ['https://example.co.th/flash-sale'],
      status: 'ENABLED',
      metrics: { impressions: 63400, clicks: 2220, ctr: 3.5, conversions: 67 },
    },
  ]
}

// ─── GET ───────────────────────────────────────────────────────────────────────

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

  // Real Google Ads REST API
  try {
    const accessToken = await getGoogleAdsAccessToken()
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

    const query = `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls, ad_group.name, ad_group.id FROM ad_group_ad WHERE campaign.id = '${campaignId}' AND ad_group_ad.status != 'REMOVED'`

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

    const data = await res.json() as Array<{
      results?: Array<{
        adGroupAd?: {
          ad?: {
            id?: string
            type?: string
            responsiveSearchAd?: {
              headlines?: { text?: string; pinnedField?: string }[]
              descriptions?: { text?: string }[]
            }
            finalUrls?: string[]
          }
          status?: string
        }
        adGroup?: { id?: string; name?: string }
      }>
    }>

    const ads: LiveAd[] = []
    for (const batch of data) {
      for (const row of batch.results ?? []) {
        const ad = row.adGroupAd?.ad
        const ag = row.adGroup
        if (!ad || !ag) continue

        const adType = ad.type === 'RESPONSIVE_SEARCH_AD' ? 'RSA' : 'RSA'

        ads.push({
          adId: ad.id ?? '',
          adGroupId: ag.id ?? '',
          adGroupName: ag.name ?? '',
          adType,
          headlines: (ad.responsiveSearchAd?.headlines ?? []).map(h => ({
            text: h.text ?? '',
            pinned_field: h.pinnedField as 'HEADLINE_1' | 'HEADLINE_2' | 'HEADLINE_3' | undefined,
          })),
          descriptions: (ad.responsiveSearchAd?.descriptions ?? []).map(d => ({ text: d.text ?? '' })),
          finalUrls: ad.finalUrls ?? [],
          status: (row.adGroupAd?.status ?? 'ENABLED') as 'ENABLED' | 'PAUSED',
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

  const body = await req.json() as { headlines: string[]; descriptions: string[]; finalUrls: string[] }

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

    const operation = {
      updateMask: 'responsiveSearchAd.headlines,responsiveSearchAd.descriptions,finalUrls',
      update: {
        resourceName: `customers/${customerId}/ads/${adId}`,
        finalUrls: body.finalUrls,
        responsiveSearchAd: {
          headlines: body.headlines.map(text => ({ text })),
          descriptions: body.descriptions.map(text => ({ text })),
        },
      },
    }

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
