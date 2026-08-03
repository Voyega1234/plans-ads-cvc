import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// Ad-group level controls: default CPC bid + enable/pause per ad group.

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface AdGroupRow {
  adGroupId: string
  adGroupResourceName: string
  name: string
  status: 'ENABLED' | 'PAUSED'
  cpcBidMicros: number
  type: string
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
    const query = `SELECT ad_group.id, ad_group.name, ad_group.resource_name, ad_group.status, ad_group.cpc_bid_micros, ad_group.type FROM ad_group WHERE campaign.resource_name = '${safeRn}' AND ad_group.status != 'REMOVED' ORDER BY ad_group.name`

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
        adGroup?: { id?: string; name?: string; resourceName?: string; status?: string; cpcBidMicros?: string; type?: string }
      }>
    }>

    const adGroups: AdGroupRow[] = []
    for (const batch of data) {
      for (const row of batch.results ?? []) {
        const ag = row.adGroup
        if (!ag?.id) continue
        adGroups.push({
          adGroupId: ag.id,
          adGroupResourceName: ag.resourceName ?? `customers/${cid}/adGroups/${ag.id}`,
          name: ag.name ?? ag.id,
          status: ag.status === 'PAUSED' ? 'PAUSED' : 'ENABLED',
          cpcBidMicros: parseInt(ag.cpcBidMicros ?? '0', 10),
          type: ag.type ?? '',
        })
      }
    }
    return NextResponse.json({ adGroups })
  } catch (err) {
    console.error('[campaign-edit/ad-groups GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

interface AdGroupOp {
  op: 'set_bid' | 'set_status' | 'create'
  adGroupResourceName?: string
  cpcBidMicros?: number
  status?: 'ENABLED' | 'PAUSED'
  // op = 'create' เท่านั้น
  campaignResourceName?: string
  name?: string
  type?: string
}

// ad group ที่สร้างใหม่ต้องมี type ตรงกับชนิดแคมเปญ ไม่งั้น Google ปฏิเสธทั้งก้อน
const AD_GROUP_TYPES = ['SEARCH_STANDARD', 'DISPLAY_STANDARD', 'VIDEO_RESPONSIVE', 'DEMAND_GEN_AD_GROUP']

export async function POST(req: NextRequest) {
  let body: { customerId?: string; operations?: AdGroupOp[] }
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
  const ops: Record<string, unknown>[] = []
  // ใช้ index loop แทน operations.entries() — tsconfig ของโปรเจกต์ไม่ได้ตั้ง `target`
  // (ตกเป็น ES5) การ iterate iterator จะพัง TS2802 ตอน build ถ้าไม่มี downlevelIteration
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]
    if (op.op === 'set_bid') {
      if (!op.adGroupResourceName || !op.cpcBidMicros || op.cpcBidMicros <= 0) {
        return NextResponse.json({ error: `operation[${i}]: set_bid ต้องมี adGroupResourceName, cpcBidMicros > 0` }, { status: 400 })
      }
      ops.push({
        updateMask: 'cpc_bid_micros',
        update: { resourceName: op.adGroupResourceName, cpcBidMicros: op.cpcBidMicros },
      })
    } else if (op.op === 'set_status') {
      if (!op.adGroupResourceName || !op.status) {
        return NextResponse.json({ error: `operation[${i}]: set_status ต้องมี adGroupResourceName, status` }, { status: 400 })
      }
      ops.push({
        updateMask: 'status',
        update: { resourceName: op.adGroupResourceName, status: op.status },
      })
    } else if (op.op === 'create') {
      const name = (op.name ?? '').trim()
      if (!op.campaignResourceName || !name) {
        return NextResponse.json({ error: `operation[${i}]: create ต้องมี campaignResourceName และ name` }, { status: 400 })
      }
      if (name.length > 255) {
        return NextResponse.json({ error: `operation[${i}]: ชื่อ ad group ยาวเกิน 255 ตัวอักษร` }, { status: 400 })
      }
      const type = op.type && AD_GROUP_TYPES.indexOf(op.type) !== -1 ? op.type : 'SEARCH_STANDARD'
      const create: Record<string, unknown> = {
        name,
        campaign: op.campaignResourceName,
        // สร้างมาเป็น ENABLED ตามค่าเริ่มต้นของ Google แต่ให้สั่ง PAUSED มาได้
        status: op.status === 'PAUSED' ? 'PAUSED' : 'ENABLED',
        type,
      }
      // แคมเปญที่ใช้ bid strategy อัตโนมัติ (Maximize Clicks ฯลฯ) ห้ามส่ง cpcBidMicros
      // มาด้วย ไม่งั้น Google ตอบ error — ส่งเฉพาะตอนที่ผู้ใช้กรอกมาจริง
      if (op.cpcBidMicros && op.cpcBidMicros > 0) create.cpcBidMicros = op.cpcBidMicros
      ops.push({ create })
    } else {
      return NextResponse.json({ error: `operation[${i}]: op ไม่ถูกต้อง` }, { status: 400 })
    }
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/adGroups:mutate`,
      { method: 'POST', headers: headersFor(token), body: JSON.stringify({ operations: ops }) }
    )
    const data = await res.json() as { results?: Array<{ resourceName?: string }>; error?: { message?: string } }
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Google Ads API error (${res.status})`)
    }
    const results = data.results ?? []
    // คืน resource name ที่เพิ่งสร้างกลับไปด้วย — หน้าเว็บจะได้เอาไปสร้างโฆษณาต่อได้ทันที
    // โดยไม่ต้องรีเฟรชแล้วมานั่งหาว่า ad group ที่เพิ่งสร้างคืออันไหน
    return NextResponse.json({
      success: true,
      applied: results.length,
      resourceNames: results.map(r => r.resourceName ?? ''),
    })
  } catch (err) {
    console.error('[campaign-edit/ad-groups POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
