import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// Sitelink / Callout extensions (Google Ads "assets") attached at campaign level.
// Add = create the asset AND link it to the campaign in ONE atomic googleAds:mutate
// request using a temp resource name — no orphan assets if the link step fails.
// Remove = unlink the campaign_asset (the asset stays in the account library,
// which is how Google Ads UI behaves too).

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface ExtensionRow {
  campaignAssetResourceName: string
  assetResourceName: string
  fieldType: 'SITELINK' | 'CALLOUT'
  // sitelink
  linkText?: string
  description1?: string
  description2?: string
  finalUrl?: string
  // callout
  calloutText?: string
}

function headersFor(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const campaignResourceName = searchParams.get('campaignResourceName') ?? ''
  if (!customerId || !campaignResourceName) {
    return NextResponse.json({ error: 'customerId and campaignResourceName are required' }, { status: 400 })
  }
  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')
    const safeRn = campaignResourceName.replace(/'/g, "\\'")
    const query = `SELECT campaign_asset.resource_name, campaign_asset.field_type, asset.resource_name, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.final_urls, asset.callout_asset.callout_text FROM campaign_asset WHERE campaign.resource_name = '${safeRn}' AND campaign_asset.field_type IN ('SITELINK', 'CALLOUT') AND campaign_asset.status != 'REMOVED'`

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
      { method: 'POST', headers: headersFor(token), body: JSON.stringify({ query }) }
    )
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Google Ads API error (${res.status}): ${txt.slice(0, 400)}`)
    }

    const data = await res.json() as Array<{
      results?: Array<{
        campaignAsset?: { resourceName?: string; fieldType?: string }
        asset?: {
          resourceName?: string
          finalUrls?: string[]
          sitelinkAsset?: { linkText?: string; description1?: string; description2?: string }
          calloutAsset?: { calloutText?: string }
        }
      }>
    }>

    const extensions: ExtensionRow[] = []
    for (const batch of data) {
      for (const row of batch.results ?? []) {
        const ca = row.campaignAsset
        const asset = row.asset
        if (!ca?.resourceName || !asset?.resourceName) continue
        if (ca.fieldType === 'SITELINK') {
          extensions.push({
            campaignAssetResourceName: ca.resourceName,
            assetResourceName: asset.resourceName,
            fieldType: 'SITELINK',
            linkText: asset.sitelinkAsset?.linkText ?? '',
            description1: asset.sitelinkAsset?.description1 ?? '',
            description2: asset.sitelinkAsset?.description2 ?? '',
            finalUrl: asset.finalUrls?.[0] ?? '',
          })
        } else if (ca.fieldType === 'CALLOUT') {
          extensions.push({
            campaignAssetResourceName: ca.resourceName,
            assetResourceName: asset.resourceName,
            fieldType: 'CALLOUT',
            calloutText: asset.calloutAsset?.calloutText ?? '',
          })
        }
      }
    }
    return NextResponse.json({ extensions })
  } catch (err) {
    console.error('[campaign-edit/extensions GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

interface ExtensionOp {
  op: 'add_sitelink' | 'add_callout' | 'remove'
  campaignResourceName?: string
  // add_sitelink
  linkText?: string
  finalUrl?: string
  description1?: string
  description2?: string
  // add_callout
  calloutText?: string
  // remove
  campaignAssetResourceName?: string
}

export async function POST(req: NextRequest) {
  let body: { customerId?: string; operations?: ExtensionOp[] }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const customerId = body.customerId ?? ''
  const operations = body.operations ?? []
  if (!customerId || operations.length === 0) {
    return NextResponse.json({ error: 'customerId and operations are required' }, { status: 400 })
  }
  if (operations.length > 50) {
    return NextResponse.json({ error: 'สูงสุด 50 รายการต่อครั้ง' }, { status: 400 })
  }

  const cid = customerId.replace(/-/g, '')
  const mutateOperations: Record<string, unknown>[] = []
  let tempId = -1
  for (const [i, op] of operations.entries()) {
    if (op.op === 'add_sitelink') {
      if (!op.campaignResourceName || !op.linkText?.trim() || !op.finalUrl?.trim()) {
        return NextResponse.json({ error: `operation[${i}]: add_sitelink ต้องมี campaignResourceName, linkText, finalUrl` }, { status: 400 })
      }
      const tempRn = `customers/${cid}/assets/${tempId--}`
      mutateOperations.push({
        assetOperation: {
          create: {
            resourceName: tempRn,
            finalUrls: [op.finalUrl.trim()],
            sitelinkAsset: {
              linkText: op.linkText.trim().slice(0, 25),
              ...(op.description1?.trim() ? { description1: op.description1.trim().slice(0, 35) } : {}),
              ...(op.description2?.trim() ? { description2: op.description2.trim().slice(0, 35) } : {}),
            },
          },
        },
      })
      mutateOperations.push({
        campaignAssetOperation: {
          create: { campaign: op.campaignResourceName, asset: tempRn, fieldType: 'SITELINK' },
        },
      })
    } else if (op.op === 'add_callout') {
      if (!op.campaignResourceName || !op.calloutText?.trim()) {
        return NextResponse.json({ error: `operation[${i}]: add_callout ต้องมี campaignResourceName, calloutText` }, { status: 400 })
      }
      const tempRn = `customers/${cid}/assets/${tempId--}`
      mutateOperations.push({
        assetOperation: {
          create: { resourceName: tempRn, calloutAsset: { calloutText: op.calloutText.trim().slice(0, 25) } },
        },
      })
      mutateOperations.push({
        campaignAssetOperation: {
          create: { campaign: op.campaignResourceName, asset: tempRn, fieldType: 'CALLOUT' },
        },
      })
    } else if (op.op === 'remove') {
      if (!op.campaignAssetResourceName) {
        return NextResponse.json({ error: `operation[${i}]: remove ต้องมี campaignAssetResourceName` }, { status: 400 })
      }
      mutateOperations.push({ campaignAssetOperation: { remove: op.campaignAssetResourceName } })
    } else {
      return NextResponse.json({ error: `operation[${i}]: op ไม่ถูกต้อง` }, { status: 400 })
    }
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
      { method: 'POST', headers: headersFor(token), body: JSON.stringify({ mutateOperations }) }
    )
    const data = await res.json() as { mutateOperationResponses?: unknown[]; error?: { message?: string } }
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Google Ads API error (${res.status})`)
    }
    return NextResponse.json({ success: true, applied: operations.length })
  } catch (err) {
    console.error('[campaign-edit/extensions POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
