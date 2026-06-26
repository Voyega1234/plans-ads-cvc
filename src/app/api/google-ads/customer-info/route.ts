import { NextRequest, NextResponse } from 'next/server'

const ADS_API_BASE  = 'https://googleads.googleapis.com/v21'
const DEV_TOKEN     = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const CLIENT_ID     = process.env.GOOGLE_ADS_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN ?? ''
const LOGIN_CID     = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; error?: string }
  if (!res.ok || !data.access_token) throw new Error(data.error ?? 'Token refresh failed')
  return data.access_token
}

// Returns the customer's Google Ads Conversion ID (the "AW-XXXXXXXXX" tag ID)
// This is the conversionId used for Remarketing tags in GTM
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = (searchParams.get('customerId') ?? '').replace(/-/g, '')
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  try {
    const accessToken = await getAccessToken()

    // Query customer to get the conversion tracking ID
    const gaqlRes = await fetch(`${ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        Authorization:       `Bearer ${accessToken}`,
        'developer-token':   DEV_TOKEN,
        'login-customer-id': LOGIN_CID,
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        query: `SELECT customer.id, customer.descriptive_name, customer.conversion_tracking_setting.conversion_tracking_id FROM customer LIMIT 1`,
      }),
    })

    const raw = await gaqlRes.json() as unknown[]

    let conversionTrackingId = ''
    let descriptiveName = ''
    if (Array.isArray(raw) && raw.length > 0) {
      const batch = raw[0] as { results?: Array<{ customer?: Record<string, unknown> }> }
      const row = batch.results?.[0]?.customer ?? {}
      const cts = row['conversionTrackingSetting'] as Record<string, unknown> | undefined
      conversionTrackingId = String(cts?.['conversionTrackingId'] ?? '')
      descriptiveName = String(row['descriptiveName'] ?? '')
    }

    // Format as AW-XXXXXXXXX
    const remarketingId = conversionTrackingId ? `AW-${conversionTrackingId}` : ''

    return NextResponse.json({
      customerId,
      descriptiveName,
      conversionTrackingId,
      remarketingId,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
