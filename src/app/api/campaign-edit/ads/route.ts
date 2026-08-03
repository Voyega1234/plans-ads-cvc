import { NextRequest, NextResponse } from 'next/server'
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

// แม็ป ad type ของ Google Ads → ชนิดที่ฟอร์มนี้แก้ได้
// (เคยหล่นหายไปจากแพ็กเกจรอบ 31 ก.ค. ทำให้ `npm run build` พังที่ TS2304 — ห้ามลบ)
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

  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
  }

  const body = await req.json() as {
    adType?: EditableAdType
    headlines: string[]
    longHeadlines?: string[]
    descriptions: string[]
    finalUrls: string[]
    // สร้างใหม่ (ไม่ส่ง adId มา) — ต้องบอกว่าจะเอาไปไว้ ad group ไหน
    adGroupResourceName?: string
    path1?: string
    path2?: string
    status?: 'ENABLED' | 'PAUSED'
  }

  // ไม่มี adId = "สร้างโฆษณาใหม่" ส่วนมี adId = แก้ของเดิม (พฤติกรรมเดิม ไม่เปลี่ยน)
  if (!adId) {
    return createAd(customerId, body)
  }
  const adType: EditableAdType = body.adType ?? 'RSA'
  const longHeadlines = body.longHeadlines ?? []

  if (adType === 'DEMAND_GEN_CAROUSEL') {
    return NextResponse.json({ error: 'Demand Gen Carousel ads แก้ text ผ่านหน้านี้ไม่ได้ — แก้ใน Google Ads UI' }, { status: 400 })
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

// ─── สร้างโฆษณาใหม่ (Responsive Search Ad) ─────────────────────────────────────
//
// เรียกเมื่อ POST มาโดยไม่มี ?adId= — สร้าง RSA ใหม่ในกลุ่มโฆษณาที่ระบุ
// รองรับเฉพาะ RSA เพราะเป็นชนิดเดียวที่สร้างจบได้ด้วย text ล้วน ๆ ชนิดอื่น
// (Display / Demand Gen) ต้องมี asset รูป+โลโก้ที่อัปโหลดไว้ก่อน จึงไม่รับที่นี่
const RSA_MAX_HEADLINE = 30
const RSA_MAX_DESCRIPTION = 90

async function createAd(
  customerId: string,
  body: {
    adType?: EditableAdType
    headlines: string[]
    descriptions: string[]
    finalUrls: string[]
    adGroupResourceName?: string
    path1?: string
    path2?: string
    status?: 'ENABLED' | 'PAUSED'
  }
) {
  const adType: EditableAdType = body.adType ?? 'RSA'
  if (adType !== 'RSA') {
    return NextResponse.json(
      { error: 'ตอนนี้สร้างใหม่ได้เฉพาะ Responsive Search Ad — ชนิดอื่นต้องมีรูป/วิดีโอ ให้สร้างจากหน้า Media plan' },
      { status: 400 }
    )
  }

  const adGroup = (body.adGroupResourceName ?? '').trim()
  if (!adGroup) {
    return NextResponse.json({ error: 'ต้องระบุ adGroupResourceName ว่าจะสร้างโฆษณาในกลุ่มไหน' }, { status: 400 })
  }

  // ตัดช่องว่าง/บรรทัดว่างทิ้งก่อนนับ ผู้ใช้มักเว้นช่องไว้เฉย ๆ
  const headlines = (body.headlines ?? []).map(h => (h ?? '').trim()).filter(h => h.length > 0)
  const descriptions = (body.descriptions ?? []).map(d => (d ?? '').trim()).filter(d => d.length > 0)
  const finalUrl = (body.finalUrls ?? []).map(u => (u ?? '').trim()).filter(u => u.length > 0)[0] ?? ''

  // เช็คกติกาของ Google ตั้งแต่ที่นี่ จะได้บอกเป็นภาษาคนแทนที่จะปล่อยให้
  // Google ตีกลับมาเป็น error code ที่ผู้ใช้อ่านไม่รู้เรื่อง
  if (headlines.length < 3) {
    return NextResponse.json({ error: `ต้องมีพาดหัวอย่างน้อย 3 อัน (ตอนนี้มี ${headlines.length})` }, { status: 400 })
  }
  if (headlines.length > 15) {
    return NextResponse.json({ error: 'พาดหัวได้มากสุด 15 อัน' }, { status: 400 })
  }
  if (descriptions.length < 2) {
    return NextResponse.json({ error: `ต้องมีคำอธิบายอย่างน้อย 2 อัน (ตอนนี้มี ${descriptions.length})` }, { status: 400 })
  }
  if (descriptions.length > 4) {
    return NextResponse.json({ error: 'คำอธิบายได้มากสุด 4 อัน' }, { status: 400 })
  }
  for (let i = 0; i < headlines.length; i++) {
    if (headlines[i].length > RSA_MAX_HEADLINE) {
      return NextResponse.json({ error: `พาดหัวอันที่ ${i + 1} ยาว ${headlines[i].length} ตัวอักษร เกิน ${RSA_MAX_HEADLINE}` }, { status: 400 })
    }
  }
  for (let i = 0; i < descriptions.length; i++) {
    if (descriptions[i].length > RSA_MAX_DESCRIPTION) {
      return NextResponse.json({ error: `คำอธิบายอันที่ ${i + 1} ยาว ${descriptions[i].length} ตัวอักษร เกิน ${RSA_MAX_DESCRIPTION}` }, { status: 400 })
    }
  }
  if (!finalUrl) {
    return NextResponse.json({ error: 'ต้องระบุ URL ปลายทาง (finalUrls)' }, { status: 400 })
  }
  if (!/^https?:\/\//i.test(finalUrl)) {
    return NextResponse.json({ error: 'URL ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://' }, { status: 400 })
  }

  const path1 = (body.path1 ?? '').trim()
  const path2 = (body.path2 ?? '').trim()
  if (path1.length > 15 || path2.length > 15) {
    return NextResponse.json({ error: 'path ต่อท้าย URL ยาวได้ไม่เกิน 15 ตัวอักษรต่อช่อง' }, { status: 400 })
  }
  if (!path1 && path2) {
    return NextResponse.json({ error: 'ถ้าจะใส่ path ช่องที่ 2 ต้องใส่ช่องที่ 1 ก่อน' }, { status: 400 })
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

    const rsa: Record<string, unknown> = {
      headlines: headlines.map(text => ({ text })),
      descriptions: descriptions.map(text => ({ text })),
    }
    if (path1) rsa.path1 = path1
    if (path2) rsa.path2 = path2

    const create = {
      adGroup,
      // สร้างเป็น PAUSED ได้ เผื่ออยากตรวจก่อนเปิด
      status: body.status === 'PAUSED' ? 'PAUSED' : 'ENABLED',
      ad: { finalUrls: [finalUrl], responsiveSearchAd: rsa },
    }

    const cid = customerId.replace(/-/g, '')
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/adGroupAds:mutate`,
      { method: 'POST', headers, body: JSON.stringify({ operations: [{ create }] }) }
    )
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Google Ads mutate error (${res.status}): ${errText.slice(0, 600)}`)
    }
    const result = await res.json() as { results?: Array<{ resourceName?: string }> }
    return NextResponse.json({
      success: true,
      created: true,
      resourceName: result.results?.[0]?.resourceName ?? '',
    })
  } catch (err) {
    console.error('[campaign-edit/ads POST create]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
