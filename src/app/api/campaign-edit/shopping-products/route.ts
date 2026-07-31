import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface ProductGroup {
  resourceName: string
  criterionId: string
  adGroupId: string
  adGroupName: string
  listingGroupType: string
  caseValue: string
  status: 'ENABLED' | 'PAUSED' | 'REMOVED'
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
    const headers = adsHeaders(token)

    const query = `SELECT ad_group_criterion.resource_name, ad_group_criterion.criterion_id,
        ad_group_criterion.listing_group.type, ad_group_criterion.listing_group.case_value,
        ad_group_criterion.status, ad_group.id, ad_group.name
      FROM ad_group_criterion
      WHERE campaign.id = '${campaignId}' AND ad_group_criterion.type = 'LISTING_GROUP'
        AND ad_group_criterion.status != 'REMOVED'`

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    )

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Google Ads API error (${res.status}): ${txt.slice(0, 400)}`)
    }

    const batches = await res.json() as Array<{
      results?: Array<{
        adGroupCriterion?: {
          resourceName?: string
          criterionId?: string
          listingGroup?: { type?: string; caseValue?: { productType?: { value?: string }; productBrand?: { value?: string } } }
          status?: string
        }
        adGroup?: { id?: string; name?: string }
      }>
    }>

    const productGroups: ProductGroup[] = []
    for (const batch of batches) {
      for (const row of batch.results ?? []) {
        const c = row.adGroupCriterion
        const ag = row.adGroup
        if (!c?.resourceName) continue

        const cv = c.listingGroup?.caseValue
        const caseValueStr = cv?.productType?.value ?? cv?.productBrand?.value ?? 'All products'

        productGroups.push({
          resourceName: c.resourceName,
          criterionId: c.criterionId ?? '',
          adGroupId: ag?.id ?? '',
          adGroupName: ag?.name ?? '',
          listingGroupType: c.listingGroup?.type ?? 'UNIT',
          caseValue: caseValueStr,
          status: (c.status ?? 'ENABLED') as 'ENABLED' | 'PAUSED' | 'REMOVED',
        })
      }
    }

    return NextResponse.json({ productGroups })
  } catch (err) {
    console.error('[campaign-edit/shopping-products GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    customerId: string
    resourceName: string
    status: 'ENABLED' | 'PAUSED'
  }

  if (!body.customerId || !body.resourceName || !body.status) {
    return NextResponse.json({ error: 'customerId, resourceName, and status are required' }, { status: 400 })
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = body.customerId.replace(/-/g, '')
    const headers = adsHeaders(token)

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/adGroupCriteria:mutate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [{
            updateMask: 'status',
            update: {
              resourceName: body.resourceName,
              status: body.status,
            },
          }],
        }),
      }
    )

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Google Ads mutate error (${res.status}): ${txt.slice(0, 400)}`)
    }

    return NextResponse.json({ success: true, resourceName: body.resourceName, status: body.status })
  } catch (err) {
    console.error('[campaign-edit/shopping-products POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
