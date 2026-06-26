import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  keywords:    z.array(z.string()).min(1).max(20),
  location:    z.string().default('1012'),   // 1012 = Thailand
  language:    z.string().default('1000'),   // 1000 = Thai
  customerId:  z.string().optional(),
})

export interface PlannerKeyword {
  keyword:            string
  avgMonthlySearches: number
  competition:        'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'
  competitionIndex:   number        // 0–100
  lowTopBidMicros:    number        // บาท
  highTopBidMicros:   number        // บาท
  suggestedCpc:       number        // (low+high)/2 บาท
}

async function getAccessToken(): Promise<string | null> {
  const clientId     = process.env.GOOGLE_ADS_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN ?? ''
  if (!clientId || !clientSecret || !refreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { access_token?: string }
  return data.access_token ?? null
}

async function fetchKeywordIdeas(
  keywords:   string[],
  locationId: string,
  languageId: string,
  customerId: string,
  accessToken: string,
): Promise<PlannerKeyword[]> {
  const devToken    = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

  const url = `https://googleads.googleapis.com/v21/customers/${customerId}:generateKeywordIdeas`

  const body = {
    keywordSeed: { keywords },
    geoTargetConstants: [`geoTargetConstants/${locationId}`],
    language: `languageConstants/${languageId}`,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false,
    pageSize: 50,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization:      `Bearer ${accessToken}`,
      'developer-token':  devToken,
      'login-customer-id': loginCustId,
      'Content-Type':     'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Keyword Planner API ${res.status}: ${err.slice(0, 400)}`)
  }

  const data = await res.json() as {
    results?: Array<{
      text?: string
      keywordIdeaMetrics?: {
        avgMonthlySearches?:     string
        monthlySearchVolumes?:   Array<{ monthlySearches?: string }>
        competition?:            string
        competitionIndex?:       string
        lowTopOfPageBidMicros?:  string
        highTopOfPageBidMicros?: string
      }
    }>
  }

  const COMP_MAP: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'> = {
    LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH',
  }

  return (data.results ?? []).map((r) => {
    const m    = r.keywordIdeaMetrics ?? {}
    const low  = Number(m.lowTopOfPageBidMicros  ?? 0) / 1_000_000
    const high = Number(m.highTopOfPageBidMicros ?? 0) / 1_000_000

    // v21 uses monthlySearchVolumes array; fall back to avgMonthlySearches for older versions
    let avgSearches = Number(m.avgMonthlySearches ?? 0)
    if (!avgSearches && m.monthlySearchVolumes?.length) {
      const total = m.monthlySearchVolumes.reduce((s, v) => s + Number(v.monthlySearches ?? 0), 0)
      avgSearches = Math.round(total / m.monthlySearchVolumes.length)
    }

    return {
      keyword:            r.text ?? '',
      avgMonthlySearches: avgSearches,
      competition:        COMP_MAP[m.competition ?? ''] ?? 'UNSPECIFIED',
      competitionIndex:   Number(m.competitionIndex ?? 0),
      lowTopBidMicros:    Math.round(low),
      highTopBidMicros:   Math.round(high),
      suggestedCpc:       Math.round((low + high) / 2),
    }
  }).filter((k) => k.keyword)
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const body    = await req.json()
    const input   = schema.parse(body)

    // Always use MCC env token for Keyword Planner (session token doesn't work with login-customer-id)
    const accessToken = await getAccessToken()

    const customerId = input.customerId
      ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
      ?? ''

    if (!accessToken || !customerId) {
      return NextResponse.json(
        { error: 'ต้องการ accessToken และ customerId' },
        { status: 401 }
      )
    }

    const results = await fetchKeywordIdeas(
      input.keywords,
      input.location,
      input.language,
      customerId,
      accessToken,
    )

    return NextResponse.json({ results, source: 'google_ads_keyword_planner' })
  } catch (err) {
    console.error('[keyword-planner]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
