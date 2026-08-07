import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// Campaign-level audience criteria (remarketing / customer lists = USER_LIST).
// GET returns both what is attached to the campaign and the account's available
// user lists so the UI can offer an add-dropdown with human-readable names.
// PMax is excluded client-side — its audiences live on asset group signals.

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface AttachedAudience {
  criterionResourceName: string
  userListResourceName: string
  name: string
  bidModifier?: number
  negative: boolean
}

export interface AvailableUserList {
  resourceName: string
  name: string
  sizeForSearch?: number
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

async function searchStream<T>(cid: string, query: string, token: string): Promise<T[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
    { method: 'POST', headers: headersFor(token), body: JSON.stringify({ query }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google Ads API error (${res.status}): ${txt.slice(0, 400)}`)
  }
  const batches = await res.json() as Array<{ results?: T[] }>
  const out: T[] = []
  for (const b of batches) for (const r of b.results ?? []) out.push(r)
  return out
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

    type CritRow = {
      campaignCriterion?: {
        resourceName?: string
        bidModifier?: number
        negative?: boolean
        userList?: { userList?: string }
      }
    }
    type ListRow = {
      userList?: { resourceName?: string; name?: string; sizeForSearch?: string }
    }

    const [critRows, listRows] = await Promise.all([
      searchStream<CritRow>(cid,
        `SELECT campaign_criterion.resource_name, campaign_criterion.bid_modifier, campaign_criterion.negative, campaign_criterion.user_list.user_list FROM campaign_criterion WHERE campaign.resource_name = '${safeRn}' AND campaign_criterion.type = 'USER_LIST'`,
        token),
      searchStream<ListRow>(cid,
        `SELECT user_list.resource_name, user_list.name, user_list.size_for_search FROM user_list`,
        token),
    ])

    const available: AvailableUserList[] = []
    const nameByRn = new Map<string, string>()
    for (const row of listRows) {
      const ul = row.userList
      if (!ul?.resourceName) continue
      const name = ul.name ?? ul.resourceName
      nameByRn.set(ul.resourceName, name)
      available.push({
        resourceName: ul.resourceName,
        name,
        sizeForSearch: ul.sizeForSearch ? parseInt(ul.sizeForSearch, 10) : undefined,
      })
    }

    const attached: AttachedAudience[] = []
    for (const row of critRows) {
      const cc = row.campaignCriterion
      if (!cc?.resourceName || !cc.userList?.userList) continue
      attached.push({
        criterionResourceName: cc.resourceName,
        userListResourceName: cc.userList.userList,
        name: nameByRn.get(cc.userList.userList) ?? cc.userList.userList,
        bidModifier: cc.bidModifier,
        negative: cc.negative === true,
      })
    }

    return NextResponse.json({ attached, available })
  } catch (err) {
    console.error('[campaign-edit/audiences GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

interface AudienceOp {
  op: 'add' | 'remove' | 'set_bid_modifier'
  campaignResourceName?: string
  userListResourceName?: string
  bidModifier?: number
  criterionResourceName?: string
}

export async function POST(req: NextRequest) {
  let body: { customerId?: string; operations?: AudienceOp[] }
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
    if (op.op === 'add') {
      if (!op.campaignResourceName || !op.userListResourceName) {
        return NextResponse.json({ error: `operation[${i}]: add ต้องมี campaignResourceName, userListResourceName` }, { status: 400 })
      }
      ops.push({
        create: {
          campaign: op.campaignResourceName,
          userList: { userList: op.userListResourceName },
          ...(op.bidModifier && op.bidModifier > 0 ? { bidModifier: op.bidModifier } : {}),
        },
      })
    } else if (op.op === 'set_bid_modifier') {
      if (!op.criterionResourceName || !op.bidModifier || op.bidModifier <= 0) {
        return NextResponse.json({ error: `operation[${i}]: set_bid_modifier ต้องมี criterionResourceName, bidModifier > 0` }, { status: 400 })
      }
      ops.push({
        updateMask: 'bid_modifier',
        update: { resourceName: op.criterionResourceName, bidModifier: op.bidModifier },
      })
    } else if (op.op === 'remove') {
      if (!op.criterionResourceName) {
        return NextResponse.json({ error: `operation[${i}]: remove ต้องมี criterionResourceName` }, { status: 400 })
      }
      ops.push({ remove: op.criterionResourceName })
    } else {
      return NextResponse.json({ error: `operation[${i}]: op ไม่ถูกต้อง` }, { status: 400 })
    }
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/campaignCriteria:mutate`,
      { method: 'POST', headers: headersFor(token), body: JSON.stringify({ operations: ops }) }
    )
    const data = await res.json() as { results?: unknown[]; error?: { message?: string } }
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Google Ads API error (${res.status})`)
    }
    return NextResponse.json({ success: true, applied: (data.results ?? []).length })
  } catch (err) {
    console.error('[campaign-edit/audiences POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
