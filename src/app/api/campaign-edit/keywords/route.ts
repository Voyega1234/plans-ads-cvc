import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface KeywordRow {
  adGroupId: string
  adGroupName: string
  adGroupResourceName: string
  criterionResourceName: string
  text: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD' | 'UNKNOWN'
  status: 'ENABLED' | 'PAUSED'
  negative: boolean
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

// ── GET: list keywords of one campaign (SEARCH) ────────────────────────────────
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
    // Interpolated value is a Google Ads resource name we received from the API
    // itself; still, quote-escape to keep GAQL intact.
    const safeRn = campaignResourceName.replace(/'/g, "\\'")
    const query = `SELECT ad_group.id, ad_group.name, ad_group.resource_name, ad_group_criterion.criterion_id, ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative FROM keyword_view WHERE campaign.resource_name = '${safeRn}' AND ad_group_criterion.status != 'REMOVED' ORDER BY ad_group.name`

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
        adGroup?: { id?: string; name?: string; resourceName?: string }
        adGroupCriterion?: {
          resourceName?: string
          status?: string
          negative?: boolean
          keyword?: { text?: string; matchType?: string }
        }
      }>
    }>

    const keywords: KeywordRow[] = []
    for (const batch of data) {
      for (const row of batch.results ?? []) {
        const cr = row.adGroupCriterion
        if (!cr?.resourceName || !cr.keyword?.text) continue
        keywords.push({
          adGroupId: row.adGroup?.id ?? '',
          adGroupName: row.adGroup?.name ?? '',
          adGroupResourceName: row.adGroup?.resourceName ?? '',
          criterionResourceName: cr.resourceName,
          text: cr.keyword.text,
          matchType: (['EXACT', 'PHRASE', 'BROAD'].includes(cr.keyword.matchType ?? '') ? cr.keyword.matchType : 'UNKNOWN') as KeywordRow['matchType'],
          status: cr.status === 'PAUSED' ? 'PAUSED' : 'ENABLED',
          negative: cr.negative === true,
        })
      }
    }
    return NextResponse.json({ keywords })
  } catch (err) {
    console.error('[campaign-edit/keywords GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

// ── POST: mutate keywords (add / set status / remove) ──────────────────────────
interface KeywordOp {
  op: 'add' | 'set_status' | 'remove'
  // add
  adGroupResourceName?: string
  text?: string
  matchType?: 'EXACT' | 'PHRASE' | 'BROAD'
  negative?: boolean
  // set_status / remove
  criterionResourceName?: string
  status?: 'ENABLED' | 'PAUSED'
}

export async function POST(req: NextRequest) {
  let body: { customerId?: string; operations?: KeywordOp[] }
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
  if (operations.length > 100) {
    return NextResponse.json({ error: 'สูงสุด 100 รายการต่อครั้ง' }, { status: 400 })
  }

  // Build adGroupCriteria mutate operations. Validation is per-op so one bad row
  // fails the whole request BEFORE anything is pushed (mutate is atomic anyway).
  const ops: Record<string, unknown>[] = []
  for (const [i, op] of operations.entries()) {
    if (op.op === 'add') {
      if (!op.adGroupResourceName || !op.text?.trim() || !op.matchType) {
        return NextResponse.json({ error: `operation[${i}]: add ต้องมี adGroupResourceName, text, matchType` }, { status: 400 })
      }
      ops.push({
        create: {
          adGroup: op.adGroupResourceName,
          status: 'ENABLED',
          negative: op.negative === true,
          keyword: { text: op.text.trim(), matchType: op.matchType },
        },
      })
    } else if (op.op === 'set_status') {
      if (!op.criterionResourceName || !op.status) {
        return NextResponse.json({ error: `operation[${i}]: set_status ต้องมี criterionResourceName, status` }, { status: 400 })
      }
      ops.push({
        updateMask: 'status',
        update: { resourceName: op.criterionResourceName, status: op.status },
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
      `https://googleads.googleapis.com/v21/customers/${cid}/adGroupCriteria:mutate`,
      { method: 'POST', headers: headersFor(token), body: JSON.stringify({ operations: ops }) }
    )
    const data = await res.json() as { results?: unknown[]; error?: { message?: string } }
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Google Ads API error (${res.status})`)
    }
    return NextResponse.json({ success: true, applied: (data.results ?? []).length })
  } catch (err) {
    console.error('[campaign-edit/keywords POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
