import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
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

function getMockAssetGroups(campaignId: string): AssetGroup[] {
  return [
    {
      assetGroupId: `${campaignId}-ag-1`,
      assetGroupResourceName: `customers/mock/assetGroups/${campaignId}-ag-1`,
      name: 'Asset Group หลัก',
      status: 'ENABLED',
      finalUrls: ['https://example.co.th'],
      headlines: ['โปรโมชั่นพิเศษ', 'ราคาถูกที่สุด', 'สั่งซื้อได้เลย'],
      longHeadlines: ['สินค้าคุณภาพสูงราคาโปร สั่งซื้อออนไลน์ได้เลยวันนี้'],
      descriptions: ['บริการระดับพรีเมียม คุ้มค่าทุกบาท', 'ส่งด่วนทั่วไทย รับประกันคุณภาพ'],
      businessName: 'Example Brand',
      images: [],
      logos: [],
    },
  ]
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

  if (isMockMode()) {
    return NextResponse.json({ assetGroups: getMockAssetGroups(campaignId) })
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
