import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// PMax asset-group image management. Listing comes from the existing
// /api/campaign-edit/asset-groups GET (images + logos with URLs) — this route
// only mutates:
//   link   — take an uploaded image URL (from /api/upload/image, which returns a
//            public blob URL or a data: URL in dev), download it server-side,
//            create an ImageAsset AND attach it to the asset group in one atomic
//            googleAds:mutate (temp resource name — no orphan assets).
//   unlink — detach an image from the asset group (asset stays in the library).
//            AssetGroupAsset resource names have the documented shape
//            customers/{cid}/assetGroupAssets/{assetGroupId}~{assetId}~{fieldType},
//            so we build it from the pieces the list endpoint already returns.
// Google enforces PMax minimums (≥1 marketing image / square / logo) server-side
// — an unlink below minimum returns its error text straight to the UI.

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

const IMAGE_FIELD_TYPES = ['MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'PORTRAIT_MARKETING_IMAGE', 'LOGO', 'LANDSCAPE_LOGO'] as const
type ImageFieldType = (typeof IMAGE_FIELD_TYPES)[number]

function headersFor(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

/** Resolve an uploaded image URL (blob URL or data: URL) to base64 bytes. */
async function imageUrlToBase64(imageUrl: string): Promise<string> {
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

interface AssetGroupAssetOp {
  op: 'link' | 'unlink'
  assetGroupResourceName?: string
  fieldType?: string
  // link
  imageUrl?: string
  assetName?: string
  // unlink
  assetResourceName?: string
}

export async function POST(req: NextRequest) {
  let body: { customerId?: string; operations?: AssetGroupAssetOp[] }
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
  if (operations.length > 20) {
    return NextResponse.json({ error: 'สูงสุด 20 รายการต่อครั้ง' }, { status: 400 })
  }

  const cid = customerId.replace(/-/g, '')
  const mutateOperations: Record<string, unknown>[] = []
  let tempId = -1

  for (const [i, op] of operations.entries()) {
    const fieldType = (op.fieldType ?? '') as ImageFieldType
    if (!IMAGE_FIELD_TYPES.includes(fieldType)) {
      return NextResponse.json({ error: `operation[${i}]: fieldType ต้องเป็น ${IMAGE_FIELD_TYPES.join(' / ')}` }, { status: 400 })
    }
    if (op.op === 'link') {
      if (!op.assetGroupResourceName || !op.imageUrl) {
        return NextResponse.json({ error: `operation[${i}]: link ต้องมี assetGroupResourceName, imageUrl` }, { status: 400 })
      }
      let base64: string
      try {
        base64 = await imageUrlToBase64(op.imageUrl)
      } catch (e) {
        return NextResponse.json({ error: `operation[${i}]: ${e instanceof Error ? e.message : 'อ่านรูปไม่สำเร็จ'}` }, { status: 400 })
      }
      const tempRn = `customers/${cid}/assets/${tempId--}`
      mutateOperations.push({
        assetOperation: {
          create: {
            resourceName: tempRn,
            name: op.assetName?.trim() || `img-${fieldType.toLowerCase()}-${tempRn.split('/').pop()}`,
            imageAsset: { data: base64 },
          },
        },
      })
      mutateOperations.push({
        assetGroupAssetOperation: {
          create: { assetGroup: op.assetGroupResourceName, asset: tempRn, fieldType },
        },
      })
    } else if (op.op === 'unlink') {
      if (!op.assetGroupResourceName || !op.assetResourceName) {
        return NextResponse.json({ error: `operation[${i}]: unlink ต้องมี assetGroupResourceName, assetResourceName` }, { status: 400 })
      }
      const agId = op.assetGroupResourceName.split('/').pop()
      const assetId = op.assetResourceName.split('/').pop()
      if (!agId || !assetId) {
        return NextResponse.json({ error: `operation[${i}]: resource name ไม่ถูกต้อง` }, { status: 400 })
      }
      mutateOperations.push({
        assetGroupAssetOperation: {
          remove: `customers/${cid}/assetGroupAssets/${agId}~${assetId}~${fieldType}`,
        },
      })
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
    console.error('[campaign-edit/asset-group-assets POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
