import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface AssetGroupImage {
  resourceName: string
  assetName: string
  url: string
  fieldType: 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'LOGO' | 'PORTRAIT_MARKETING_IMAGE' | string
}

export interface AssetGroup {
  assetGroupId: string
  assetGroupResourceName: string
  name: string
  status: string
  finalUrls: string[]
  headlines: string[]
  longHeadlines: string[]
  descriptions: string[]
  businessName: string
  images: AssetGroupImage[]
  logos: AssetGroupImage[]
}

function adsHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

async function searchStream<T>(cid: string, query: string, token: string): Promise<T[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
    { method: 'POST', headers: adsHeaders(token), body: JSON.stringify({ query }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google Ads API error (${res.status}): ${txt.slice(0, 400)}`)
  }
  const batches = await res.json() as Array<{ results?: T[] }>
  const results: T[] = []
  for (const b of batches) {
    for (const r of b.results ?? []) results.push(r)
  }
  return results
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const campaignId = searchParams.get('campaignId') ?? ''

  if (!customerId || !campaignId) {
    return NextResponse.json({ error: 'customerId and campaignId are required' }, { status: 400 })
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')

    type AssetGroupAssetRow = {
      assetGroup?: {
        id?: string
        name?: string
        status?: string
        finalUrls?: string[]
        resourceName?: string
      }
      assetGroupAsset?: {
        asset?: string
        fieldType?: string
        status?: string
      }
      asset?: {
        textAsset?: { text?: string }
        type?: string
        resourceName?: string
        name?: string
      }
    }

    const rows = await searchStream<AssetGroupAssetRow>(
      cid,
      `SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.final_urls, asset_group.resource_name,
        asset_group_asset.asset, asset_group_asset.field_type, asset_group_asset.status,
        asset.text_asset.text, asset.type, asset.resource_name, asset.name
       FROM asset_group_asset
       WHERE campaign.id = '${campaignId}' AND asset_group_asset.status != 'REMOVED'`,
      token
    )

    // Group by asset group
    const groupMap = new Map<string, AssetGroup>()

    for (const row of rows) {
      const ag = row.assetGroup
      const aga = row.assetGroupAsset
      const asset = row.asset
      if (!ag?.id || !aga || !asset) continue

      if (!groupMap.has(ag.id)) {
        groupMap.set(ag.id, {
          assetGroupId: ag.id,
          assetGroupResourceName: ag.resourceName ?? `customers/${cid}/assetGroups/${ag.id}`,
          name: ag.name ?? ag.id,
          status: ag.status ?? 'ENABLED',
          finalUrls: ag.finalUrls ?? [],
          headlines: [],
          longHeadlines: [],
          descriptions: [],
          businessName: '',
          images: [],
          logos: [],
        })
      }

      const group = groupMap.get(ag.id)!
      const fieldType = aga.fieldType ?? ''
      const text = asset.textAsset?.text ?? ''

      switch (fieldType) {
        case 'HEADLINE':
          group.headlines.push(text)
          break
        case 'LONG_HEADLINE':
          group.longHeadlines.push(text)
          break
        case 'DESCRIPTION':
          group.descriptions.push(text)
          break
        case 'BUSINESS_NAME':
          group.businessName = text
          break
        case 'MARKETING_IMAGE':
        case 'SQUARE_MARKETING_IMAGE':
        case 'PORTRAIT_MARKETING_IMAGE':
          // Image URL fetched separately below
          group.images.push({
            resourceName: asset.resourceName ?? '',
            assetName: asset.name ?? '',
            url: '',
            fieldType,
          })
          break
        case 'LOGO':
        case 'LANDSCAPE_LOGO':
          group.logos.push({
            resourceName: asset.resourceName ?? '',
            assetName: asset.name ?? '',
            url: '',
            fieldType,
          })
          break
      }
    }

    // Fetch image URLs for any image assets found
    const allImageRNs: string[] = []
    for (const group of Array.from(groupMap.values())) {
      for (const img of [...group.images, ...group.logos]) {
        if (img.resourceName) allImageRNs.push(`'${img.resourceName}'`)
      }
    }

    if (allImageRNs.length > 0) {
      type ImageAssetRow = {
        asset?: {
          id?: string
          name?: string
          type?: string
          resourceName?: string
          imageAsset?: { fullSize?: { url?: string } }
        }
      }
      const imgRows = await searchStream<ImageAssetRow>(
        cid,
        `SELECT asset.id, asset.name, asset.type, asset.resource_name, asset.image_asset.full_size.url
         FROM asset WHERE asset.resource_name IN (${allImageRNs.join(',')})`,
        token
      )

      const urlByRN = new Map<string, string>()
      for (const row of imgRows) {
        const a = row.asset
        if (a?.resourceName && a.imageAsset?.fullSize?.url) {
          urlByRN.set(a.resourceName, a.imageAsset.fullSize.url)
        }
      }

      for (const group of Array.from(groupMap.values())) {
        for (const img of group.images) {
          img.url = urlByRN.get(img.resourceName) ?? ''
        }
        for (const logo of group.logos) {
          logo.url = urlByRN.get(logo.resourceName) ?? ''
        }
      }
    }

    return NextResponse.json({ assetGroups: Array.from(groupMap.values()) })
  } catch (err) {
    console.error('[campaign-edit/asset-groups GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

// ─── POST: สร้าง Asset Group ใหม่ในแคมเปญ PMax ─────────────────────────────────
//
// Google บังคับขั้นต่ำต่อ asset group: headline ≥3 (≤30), long headline ≥1 (≤90),
// description ≥2 (≤90 โดยอย่างน้อย 1 อัน ≤60), business name, final URL,
// รูป landscape 1.91:1 ≥1, รูป square 1:1 ≥1, โลโก้ ≥1
// ทุกอย่างถูกส่งเป็น googleAds:mutate ก้อนเดียว (temp resource name) —
// ถ้าผิดข้อเดียว Google ปฏิเสธทั้งก้อน = ไม่มี asset ค้างเป็นขยะในบัญชี

interface CreateAssetGroupBody {
  customerId?: string
  campaignResourceName?: string
  name?: string
  finalUrl?: string
  headlines?: string[]
  longHeadline?: string
  descriptions?: string[]
  businessName?: string
  // รูปจาก /api/upload/image (https URL หรือ data URL)
  landscapeImageUrls?: string[]
  squareImageUrls?: string[]
  logoUrls?: string[]
  status?: 'ENABLED' | 'PAUSED'
}

async function imgToBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) {
    const comma = imageUrl.indexOf(',')
    if (comma < 0) throw new Error('data URL ไม่ถูกต้อง')
    return imageUrl.slice(comma + 1)
  }
  if (!/^https?:\/\//i.test(imageUrl)) throw new Error('imageUrl ต้องเป็น http(s) หรือ data URL')
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`ดาวน์โหลดรูปไม่สำเร็จ (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) throw new Error('ไฟล์รูปว่างเปล่า')
  if (buf.length > 5 * 1024 * 1024) throw new Error('รูปใหญ่เกิน 5MB (ลิมิตของ Google Ads image asset)')
  return buf.toString('base64')
}

export async function POST(req: NextRequest) {
  let body: CreateAssetGroupBody
  try {
    body = await req.json() as CreateAssetGroupBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const customerId = (body.customerId ?? '').replace(/-/g, '')
  const campaign = (body.campaignResourceName ?? '').trim()
  const name = (body.name ?? '').trim()
  const finalUrl = (body.finalUrl ?? '').trim()
  const headlines = (body.headlines ?? []).map(h => h.trim()).filter(Boolean)
  const longHeadline = (body.longHeadline ?? '').trim()
  const descriptions = (body.descriptions ?? []).map(d => d.trim()).filter(Boolean)
  const businessName = (body.businessName ?? '').trim()
  const landscapes = (body.landscapeImageUrls ?? []).filter(Boolean)
  const squares = (body.squareImageUrls ?? []).filter(Boolean)
  const logos = (body.logoUrls ?? []).filter(Boolean)

  // ── ตรวจกติกาของ Google ก่อนยิง — บอกเป็นภาษาคน ไม่ปล่อยให้ตีกลับเป็น error code ──
  if (!customerId || !campaign || !name) {
    return NextResponse.json({ error: 'ต้องมี customerId, campaignResourceName และชื่อ asset group' }, { status: 400 })
  }
  if (!/^https?:\/\//i.test(finalUrl)) {
    return NextResponse.json({ error: 'Final URL ต้องขึ้นต้นด้วย http:// หรือ https://' }, { status: 400 })
  }
  if (headlines.length < 3) return NextResponse.json({ error: `ต้องมีพาดหัวอย่างน้อย 3 อัน (ตอนนี้ ${headlines.length})` }, { status: 400 })
  for (const h of headlines) {
    if (h.length > 30) return NextResponse.json({ error: `พาดหัว "${h.slice(0, 20)}…" ยาว ${h.length} เกิน 30 ตัวอักษร` }, { status: 400 })
  }
  if (!longHeadline) return NextResponse.json({ error: 'ต้องมี long headline 1 อัน' }, { status: 400 })
  if (longHeadline.length > 90) return NextResponse.json({ error: `long headline ยาว ${longHeadline.length} เกิน 90 ตัวอักษร` }, { status: 400 })
  if (descriptions.length < 2) return NextResponse.json({ error: `ต้องมีคำอธิบายอย่างน้อย 2 อัน (ตอนนี้ ${descriptions.length})` }, { status: 400 })
  for (const d of descriptions) {
    if (d.length > 90) return NextResponse.json({ error: `คำอธิบาย "${d.slice(0, 20)}…" ยาว ${d.length} เกิน 90 ตัวอักษร` }, { status: 400 })
  }
  if (!descriptions.some(d => d.length <= 60)) {
    return NextResponse.json({ error: 'คำอธิบายอย่างน้อย 1 อันต้องยาวไม่เกิน 60 ตัวอักษร (กติกา PMax)' }, { status: 400 })
  }
  if (!businessName) return NextResponse.json({ error: 'ต้องใส่ชื่อธุรกิจ (Business name)' }, { status: 400 })
  if (businessName.length > 25) return NextResponse.json({ error: `ชื่อธุรกิจยาว ${businessName.length} เกิน 25 ตัวอักษร` }, { status: 400 })
  if (landscapes.length < 1) return NextResponse.json({ error: 'ต้องมีรูป Landscape (1.91:1 เช่น 1200×628) อย่างน้อย 1 รูป' }, { status: 400 })
  if (squares.length < 1) return NextResponse.json({ error: 'ต้องมีรูป Square (1:1 เช่น 1200×1200) อย่างน้อย 1 รูป' }, { status: 400 })
  if (logos.length < 1) return NextResponse.json({ error: 'ต้องมีโลโก้ (1:1) อย่างน้อย 1 รูป' }, { status: 400 })

  try {
    const token = await getGoogleAdsAccessToken()
    let tempId = -1
    const nextTemp = () => `customers/${customerId}/assets/${tempId--}`
    const mutateOperations: Record<string, unknown>[] = []

    // text assets
    const textAsset = (text: string) => {
      const rn = nextTemp()
      mutateOperations.push({ assetOperation: { create: { resourceName: rn, textAsset: { text } } } })
      return rn
    }
    const linkOps: Array<{ asset: string; fieldType: string }> = []
    for (const h of headlines.slice(0, 15)) linkOps.push({ asset: textAsset(h), fieldType: 'HEADLINE' })
    linkOps.push({ asset: textAsset(longHeadline), fieldType: 'LONG_HEADLINE' })
    for (const d of descriptions.slice(0, 5)) linkOps.push({ asset: textAsset(d), fieldType: 'DESCRIPTION' })
    linkOps.push({ asset: textAsset(businessName), fieldType: 'BUSINESS_NAME' })

    // image assets — ดาวน์โหลด/แปลงก่อนเข้า mutate เดียวกัน
    const imageAsset = async (url: string, label: string) => {
      const rn = nextTemp()
      const base64 = await imgToBase64(url)
      mutateOperations.push({
        assetOperation: { create: { resourceName: rn, name: `${name}-${label}-${Math.abs(tempId)}`, imageAsset: { data: base64 } } },
      })
      return rn
    }
    for (const u of landscapes.slice(0, 5)) linkOps.push({ asset: await imageAsset(u, 'landscape'), fieldType: 'MARKETING_IMAGE' })
    for (const u of squares.slice(0, 5)) linkOps.push({ asset: await imageAsset(u, 'square'), fieldType: 'SQUARE_MARKETING_IMAGE' })
    for (const u of logos.slice(0, 5)) linkOps.push({ asset: await imageAsset(u, 'logo'), fieldType: 'LOGO' })

    // asset group + links
    const agTemp = `customers/${customerId}/assetGroups/${tempId--}`
    mutateOperations.push({
      assetGroupOperation: {
        create: {
          resourceName: agTemp,
          campaign,
          name,
          finalUrls: [finalUrl],
          // เริ่มเป็น PAUSED โดย default — ให้คนตรวจใน Google Ads ก่อนเปิดจริง
          status: body.status === 'ENABLED' ? 'ENABLED' : 'PAUSED',
        },
      },
    })
    for (const l of linkOps) {
      mutateOperations.push({
        assetGroupAssetOperation: { create: { assetGroup: agTemp, asset: l.asset, fieldType: l.fieldType } },
      })
    }

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:mutate`,
      { method: 'POST', headers: adsHeaders(token), body: JSON.stringify({ mutateOperations }) }
    )
    const data = await res.json() as {
      mutateOperationResponses?: Array<{ assetGroupResult?: { resourceName?: string } }>
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Google Ads API error (${res.status})`)
    }
    const created = (data.mutateOperationResponses ?? []).find(r => r.assetGroupResult?.resourceName)
    return NextResponse.json({
      success: true,
      resourceName: created?.assetGroupResult?.resourceName ?? '',
    })
  } catch (err) {
    console.error('[campaign-edit/asset-groups POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
