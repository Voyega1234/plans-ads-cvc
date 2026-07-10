/**
 * Google audience taxonomy API — the REAL segments that exist in Google Ads
 * GET /api/audiences/google?customerId=xxx&q=insurance&type=IN_MARKET
 *
 * Queries the `user_interest` constant resource (In-Market / Affinity taxonomy) via
 * GAQL. The taxonomy is global (identical for every account), so results are cached
 * in-process for 24h — the customerId is only used as the query context.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

export interface GoogleAudienceSegment {
  id: string
  name: string
  type: 'IN_MARKET' | 'AFFINITY'
  path: string   // full breadcrumb, e.g. "Real Estate/Residential Properties"
}

// Module-level cache — taxonomy is static, don't re-pull it per request
let cache: { segments: GoogleAudienceSegment[]; at: number } | null = null
const CACHE_TTL = 24 * 60 * 60 * 1000

const MOCK_SEGMENTS: GoogleAudienceSegment[] = [
  { id: '80532', name: 'Residential Properties', type: 'IN_MARKET', path: 'Real Estate/Residential Properties (For Sale)' },
  { id: '80145', name: 'Personal Loans', type: 'IN_MARKET', path: 'Financial Services/Loans/Personal Loans' },
  { id: '80559', name: 'Trips to Taiwan', type: 'IN_MARKET', path: 'Travel/Trips by Destination/Trips to East Asia/Trips to Taiwan' },
]

async function fetchTaxonomy(customerId: string): Promise<GoogleAudienceSegment[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.segments

  const token = await getGoogleAdsAccessToken()
  const cid = customerId.replace(/-/g, '')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) headers['login-customer-id'] = LOGIN_CID.replace(/-/g, '')

  const query = `
    SELECT
      user_interest.user_interest_id,
      user_interest.name,
      user_interest.taxonomy_type
    FROM user_interest
    WHERE user_interest.taxonomy_type IN ('IN_MARKET', 'AFFINITY')
  `
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
    { method: 'POST', headers, body: JSON.stringify({ query }) }
  )
  if (!res.ok) throw new Error(`GAQL user_interest failed (${res.status}): ${(await res.text()).slice(0, 500)}`)

  type Row = { userInterest: { userInterestId: string; name: string; taxonomyType: string } }
  const chunks = await res.json() as Array<{ results?: Row[] }>
  const rows = chunks.flatMap(c => c.results ?? [])

  const segments: GoogleAudienceSegment[] = rows
    .filter(r => r.userInterest?.name)
    .map(r => ({
      id:   r.userInterest.userInterestId,
      name: r.userInterest.name,
      type: (r.userInterest.taxonomyType === 'AFFINITY' ? 'AFFINITY' : 'IN_MARKET') as 'IN_MARKET' | 'AFFINITY',
      path: r.userInterest.name,
    }))

  cache = { segments, at: Date.now() }
  return segments
}

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId')
  const q = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase().trim()
  const type = req.nextUrl.searchParams.get('type')  // IN_MARKET | AFFINITY | (all)
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 1500)   // taxonomy ทั้งชุด ~1,000 ตัว

  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  if (isMockMode()) {
    return NextResponse.json({ segments: MOCK_SEGMENTS, total: MOCK_SEGMENTS.length })
  }

  try {
    let segments = await fetchTaxonomy(customerId)
    if (type === 'IN_MARKET' || type === 'AFFINITY') segments = segments.filter(s => s.type === type)
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean)
      segments = segments.filter(s => {
        const hay = s.name.toLowerCase()
        return terms.every(t => hay.includes(t))
      })
    }
    return NextResponse.json({ segments: segments.slice(0, limit), total: segments.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
