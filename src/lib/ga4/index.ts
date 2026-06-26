/**
 * GA4 Data API — uses OAuth token from the logged-in user's session.
 * No service account needed; the user's Google account must have Viewer access to GA4.
 */

export interface GA4ReportRow {
  page?: string
  source?: string
  sessions: number
  conversions: number
  bounceRate: number
}

function isMockMode(): boolean {
  return false
}

async function getGA4Token(): Promise<string> {
  // Import here to avoid circular dep; auth() reads the session cookie server-side
  const { auth } = await import('@/lib/auth')
  const session = await auth() as Record<string, unknown> | null
  const token = session?.accessToken as string | undefined
  if (!token) throw new Error('No OAuth session token — user must be logged in')
  return token
}

async function ga4Report(
  propertyId: string,
  token: string,
  body: Record<string, unknown>
): Promise<{ rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GA4 API error: ${res.status} ${err.slice(0, 300)}`)
  }
  return res.json()
}

function mockReport(): GA4ReportRow[] {
  return []
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getGA4Report(
  propertyId: string,
  dateRange: string = 'last30days'
): Promise<GA4ReportRow[]> {
  if (isMockMode()) return mockReport()

  let startDate = '30daysAgo'
  let endDate = 'today'
  if (dateRange === 'last7days') startDate = '7daysAgo'
  else if (dateRange === 'last90days') startDate = '90daysAgo'
  else if (dateRange.includes(':')) {
    const [s, e] = dateRange.split(':')
    startDate = s; endDate = e
  }

  try {
    const token = await getGA4Token()
    const data = await ga4Report(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'bounceRate' }],
      limit: 100,
    })
    return (data.rows ?? []).map((row) => ({
      page:        row.dimensionValues?.[0]?.value ?? '',
      source:      row.dimensionValues?.[1]?.value ?? '',
      sessions:    Number(row.metricValues[0]?.value ?? 0),
      conversions: Number(row.metricValues[1]?.value ?? 0),
      bounceRate:  parseFloat(row.metricValues[2]?.value ?? '0'),
    }))
  } catch (err) {
    console.warn('[GA4] getGA4Report error:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function getConversionEvents(propertyId: string) {
  if (isMockMode()) return []
  try {
    const token = await getGA4Token()
    const data = await ga4Report(propertyId, token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: ['generate_lead', 'contact_form_submit', 'phone_call', 'purchase'] },
        },
      },
    })
    return (data.rows ?? []).map((row) => ({
      eventName: row.dimensionValues?.[0]?.value ?? '',
      count:     Number(row.metricValues[0]?.value ?? 0),
      value:     Number(row.metricValues[1]?.value ?? 0),
    }))
  } catch {
    return []
  }
}

export async function getLandingPagePerformance(propertyId: string) {
  if (isMockMode()) return []
  try {
    const token = await getGA4Token()
    const data = await ga4Report(propertyId, token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    })
    return (data.rows ?? []).map((row) => ({
      page:        row.dimensionValues?.[0]?.value ?? '',
      sessions:    Number(row.metricValues[0]?.value ?? 0),
      bounceRate:  parseFloat(row.metricValues[1]?.value ?? '0'),
      avgDuration: Math.round(parseFloat(row.metricValues[2]?.value ?? '0')),
      conversions: Number(row.metricValues[3]?.value ?? 0),
    }))
  } catch {
    return []
  }
}

const EMPTY_AUDIENCE = {
  totalUsers: 0, newUsers: 0, returningUsers: 0, avgSessionDuration: 0,
  topCountries: [], deviceCategories: [],
}

export async function getAudienceSummary(propertyId: string) {
  if (isMockMode()) return EMPTY_AUDIENCE

  try {
    const token = await getGA4Token()
    const [totalsRes, countryRes, deviceRes] = await Promise.all([
      ga4Report(propertyId, token, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }, { name: 'newUsers' }, { name: 'averageSessionDuration' }],
      }),
      ga4Report(propertyId, token, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        limit: 5,
      }),
      ga4Report(propertyId, token, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
      }),
    ])

    type AggRow = { totals?: Array<{ metricValues: Array<{ value: string }> }> }
    const totalsRow = ((totalsRes as unknown as AggRow).totals?.[0]?.metricValues) ?? totalsRes.rows?.[0]?.metricValues ?? []
    const totalUsers = Number(totalsRow[0]?.value ?? 0)
    const newUsers   = Number(totalsRow[1]?.value ?? 0)
    const avgDur     = Math.round(parseFloat(totalsRow[2]?.value ?? '0'))
    const allSessions = deviceRes.rows?.reduce((s, r) => s + Number(r.metricValues[0]?.value ?? 0), 0) ?? 1

    return {
      totalUsers,
      newUsers,
      returningUsers: totalUsers - newUsers,
      avgSessionDuration: avgDur,
      topCountries: (countryRes.rows ?? []).map((r) => ({
        country: r.dimensionValues?.[0]?.value ?? '',
        users:   Number(r.metricValues[0]?.value ?? 0),
      })),
      deviceCategories: (deviceRes.rows ?? []).map((r) => ({
        device:  r.dimensionValues?.[0]?.value ?? '',
        percent: Math.round((Number(r.metricValues[0]?.value ?? 0) / allSessions) * 100),
      })),
    }
  } catch (err) {
    console.warn('[GA4] getAudienceSummary error:', err instanceof Error ? err.message : err)
    return EMPTY_AUDIENCE
  }
}
