import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  customerId:    z.string().min(1),
  campaignType:  z.enum(['DISPLAY', 'VIDEO', 'YOUTUBE']),
  monthlyBudget: z.number().positive(),
  location:      z.string().default('1012'), // 1012 = Thailand
})

export interface ReachData {
  weeklyImpressions:    number
  weeklyReach:          number
  onTargetImpressions:  number
  costMicros:           number
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

function fallbackEstimate(campaignType: string, monthlyBudget: number): ReachData {
  const weeklyBudget = monthlyBudget / 4
  const isVideo = campaignType === 'VIDEO' || campaignType === 'YOUTUBE'

  return {
    weeklyImpressions:   Math.round(weeklyBudget * (isVideo ? 25 : 40)),
    weeklyReach:         Math.round(weeklyBudget * (isVideo ? 10 : 15)),
    onTargetImpressions: Math.round(weeklyBudget * (isVideo ? 18 : 28)),
    costMicros:          Math.round(weeklyBudget * 1_000_000),
  }
}

async function fetchReachForecast(
  customerId:    string,
  campaignType:  string,
  monthlyBudget: number,
  locationId:    string,
  accessToken:   string,
): Promise<ReachData> {
  const devToken    = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

  const url = `https://googleads.googleapis.com/v21/customers/${customerId}:generateReachForecast`

  // Map our type to Google Ads plannable campaign type
  const plannableType =
    campaignType === 'DISPLAY' ? 'DISPLAY' :
    campaignType === 'YOUTUBE' ? 'BUMPER' :
    'TRUEVIEW_IN_STREAM' // VIDEO

  const weeklyBudgetMicros = Math.round((monthlyBudget / 4) * 1_000_000)

  const body = {
    campaignDuration: { durationInDays: 7 },
    plannedProducts: [
      {
        plannableNetworkCode: plannableType,
        budgetMicros: String(weeklyBudgetMicros),
      },
    ],
    targeting: {
      plannableLocationIds: [locationId],
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization:        `Bearer ${accessToken}`,
      'developer-token':    devToken,
      'login-customer-id':  loginCustId,
      'Content-Type':       'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Reach Planner API ${res.status}: ${err.slice(0, 400)}`)
  }

  const data = await res.json() as {
    reachCurve?: {
      reachForecasts?: Array<{
        costMicros?: string
        forecast?: {
          impressions?: number
          onTargetImpressions?: number
          reach?: number
        }
      }>
    }
  }

  const forecasts = data.reachCurve?.reachForecasts ?? []
  // Pick the forecast closest to the requested budget
  const best = forecasts[Math.floor(forecasts.length / 2)] ?? forecasts[0]
  if (!best) throw new Error('No forecast data returned')

  const f = best.forecast ?? {}
  return {
    weeklyImpressions:   Math.round(f.impressions ?? 0),
    weeklyReach:         Math.round(f.reach ?? 0),
    onTargetImpressions: Math.round(f.onTargetImpressions ?? 0),
    costMicros:          Number(best.costMicros ?? 0),
  }
}

export async function POST(req: NextRequest) {
  try {
    await auth()
    const body  = await req.json()
    const input = schema.parse(body)

    const accessToken = await getAccessToken()
    if (!accessToken) {
      // No token — return fallback immediately
      return NextResponse.json({
        ...fallbackEstimate(input.campaignType, input.monthlyBudget),
        source: 'fallback_no_token',
      })
    }

    try {
      const result = await fetchReachForecast(
        input.customerId,
        input.campaignType,
        input.monthlyBudget,
        input.location,
        accessToken,
      )
      return NextResponse.json({ ...result, source: 'google_ads_reach_planner' })
    } catch (apiErr) {
      console.warn('[reach-planner] API failed, using fallback:', apiErr)
      return NextResponse.json({
        ...fallbackEstimate(input.campaignType, input.monthlyBudget),
        source: 'fallback_api_error',
      })
    }
  } catch (err) {
    console.error('[reach-planner]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
