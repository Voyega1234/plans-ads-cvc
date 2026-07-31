import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

interface PMaxUpdateBody {
  customerId: string
  assetGroupResourceName: string
  headlines: string[]
  longHeadlines: string[]
  descriptions: string[]
  businessName: string
  // Existing asset group asset resource names to remove (text field types)
  existingTextAssetRNs?: string[]
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

export async function POST(req: NextRequest) {
  const body = await req.json() as PMaxUpdateBody

  const { customerId, assetGroupResourceName, headlines, longHeadlines, descriptions, businessName } = body

  if (!customerId || !assetGroupResourceName) {
    return NextResponse.json({ error: 'customerId and assetGroupResourceName are required' }, { status: 400 })
  }
  if (!headlines || headlines.length < 3) {
    return NextResponse.json({ error: 'At least 3 headlines required' }, { status: 400 })
  }
  if (!descriptions || descriptions.length < 2) {
    return NextResponse.json({ error: 'At least 2 descriptions required' }, { status: 400 })
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')

    // Step 1: Query existing text assetGroupAssets for this asset group so we can remove them
    const headers = adsHeaders(token)

    const queryRes = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `SELECT asset_group_asset.resource_name, asset_group_asset.field_type
                  FROM asset_group_asset
                  WHERE asset_group_asset.asset_group = '${assetGroupResourceName}'
                    AND asset_group_asset.field_type IN ('HEADLINE','LONG_HEADLINE','DESCRIPTION','BUSINESS_NAME')
                    AND asset_group_asset.status != 'REMOVED'`,
        }),
      }
    )

    const textFieldTypes = new Set(['HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'BUSINESS_NAME'])
    const existingRNs: string[] = []

    if (queryRes.ok) {
      const batches = await queryRes.json() as Array<{
        results?: Array<{
          assetGroupAsset?: { resourceName?: string; fieldType?: string }
        }>
      }>
      for (const batch of batches) {
        for (const row of batch.results ?? []) {
          const rn = row.assetGroupAsset?.resourceName
          const ft = row.assetGroupAsset?.fieldType
          if (rn && ft && textFieldTypes.has(ft)) existingRNs.push(rn)
        }
      }
    }

    const ops: unknown[] = []

    // Remove existing text assets
    for (const rn of existingRNs) {
      ops.push({
        assetGroupAssetOperation: {
          remove: rn,
        },
      })
    }

    // Create new text assets and link them
    const textAssets: { text: string; fieldType: string }[] = [
      ...headlines.map(h => ({ text: h, fieldType: 'HEADLINE' })),
      ...(longHeadlines ?? []).map(h => ({ text: h, fieldType: 'LONG_HEADLINE' })),
      ...descriptions.map(d => ({ text: d, fieldType: 'DESCRIPTION' })),
      ...(businessName ? [{ text: businessName, fieldType: 'BUSINESS_NAME' }] : []),
    ]

    let tmpId = -1000
    for (const ta of textAssets) {
      const assetTmpId = tmpId--
      ops.push({
        assetOperation: {
          create: {
            resourceName: `customers/${cid}/assets/${assetTmpId}`,
            textAsset: { text: ta.text },
          },
        },
      })
      ops.push({
        assetGroupAssetOperation: {
          create: {
            assetGroup: assetGroupResourceName,
            asset: `customers/${cid}/assets/${assetTmpId}`,
            fieldType: ta.fieldType,
          },
        },
      })
    }

    const mutateRes = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ mutateOperations: ops }),
      }
    )

    if (!mutateRes.ok) {
      const txt = await mutateRes.text()
      throw new Error(`Google Ads mutate failed (${mutateRes.status}): ${txt.slice(0, 3000)}`)
    }

    const result = await mutateRes.json()
    return NextResponse.json({ success: true, assetGroupResourceName, result })
  } catch (err) {
    console.error('[campaign-edit/pmax-update POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
