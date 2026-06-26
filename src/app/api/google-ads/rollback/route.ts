/**
 * POST /api/google-ads/rollback
 * Pause campaigns that were just pushed (by resource name)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { z } from 'zod'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

const schema = z.object({
  customerId:    z.string().min(1),
  resourceNames: z.array(z.string()).min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())
    const cid  = body.customerId.replace(/-/g, '')

    const token = await getGoogleAdsAccessToken()
    if (!token) return NextResponse.json({ error: 'No access token' }, { status: 401 })

    const headers: Record<string, string> = {
      Authorization:    `Bearer ${token}`,
      'developer-token': DEV_TOKEN,
      'Content-Type':   'application/json',
    }
    if (LOGIN_CID) headers['login-customer-id'] = LOGIN_CID

    let paused = 0
    let failed = 0

    for (const resourceName of body.resourceNames) {
      try {
        const ops = [{
          campaignOperation: {
            updateMask: 'status',
            update: { resourceName, status: 'PAUSED' },
          },
        }]
        const res = await fetch(
          `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
          { method: 'POST', headers, body: JSON.stringify({ mutateOperations: ops }) }
        )
        if (res.ok) paused++
        else failed++
      } catch {
        failed++
      }
    }

    return NextResponse.json({ paused, failed })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
