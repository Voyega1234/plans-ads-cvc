import { NextRequest, NextResponse } from 'next/server'

// Creates a Google Ads conversion action via REST API
// Uses the user's refresh token from env (same as Google Ads API)

const ADS_API_BASE = 'https://googleads.googleapis.com/v21'
const DEV_TOKEN    = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const CLIENT_ID    = process.env.GOOGLE_ADS_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN ?? ''
const LOGIN_CID    = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

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

export async function POST(req: NextRequest) {
  try {
    const { customerId, name, category, valueSettings } = await req.json() as {
      customerId: string
      name: string
      category: 'LEAD' | 'PURCHASE' | 'PAGE_VIEW' | 'SIGNUP' | 'PHONE_CALL_LEADS'
      valueSettings?: { defaultValue: number; defaultCurrencyCode: string }
    }

    if (!customerId || !name) {
      return NextResponse.json({ error: 'customerId and name required' }, { status: 400 })
    }

    const accessToken = await getAccessToken()
    const cid = customerId.replace(/-/g, '')

    const conversionAction: Record<string, unknown> = {
      name,
      category,
      type: 'WEBPAGE',
      status: 'ENABLED',
      countingType: category === 'PURCHASE' ? 'ONE_PER_CLICK' : 'MANY_PER_CLICK',
    }

    if (valueSettings) {
      conversionAction.valueSettings = {
        defaultValue: valueSettings.defaultValue,
        defaultCurrencyCode: valueSettings.defaultCurrencyCode,
        alwaysUseDefaultValue: false,
      }
    }

    const res = await fetch(`${ADS_API_BASE}/customers/${cid}/conversionActions:mutate`, {
      method: 'POST',
      headers: {
        Authorization:        `Bearer ${accessToken}`,
        'developer-token':    DEV_TOKEN,
        'login-customer-id':  LOGIN_CID,
        'Content-Type':       'application/json',
      },
      body: JSON.stringify({
        operations: [{
          create: conversionAction,
        }],
      }),
    })

    const data = await res.json() as {
      results?: Array<{ resourceName: string }>
      error?: { message: string }
    }

    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error?.message ?? 'Create conversion failed' }, { status: 500 })
    }

    const resourceName = data.results?.[0]?.resourceName ?? ''
    // Extract conversion ID from resource name: customers/123/conversionActions/456
    const conversionId = resourceName.split('/').pop() ?? ''

    // Pull the tag snippet to get the REAL send_to value ("AW-123456789/AbCdEf...")
    // — without this the GTM conversion tags stay on placeholders and never fire.
    let awId = '', label = '', sendTo = ''
    try {
      const q = await fetch(`${ADS_API_BASE}/customers/${cid}/googleAds:search`, {
        method: 'POST',
        headers: {
          Authorization:       `Bearer ${accessToken}`,
          'developer-token':   DEV_TOKEN,
          'login-customer-id': LOGIN_CID,
          'Content-Type':      'application/json',
        },
        body: JSON.stringify({
          query: `SELECT conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.resource_name = '${resourceName}'`,
        }),
      })
      const qd = await q.json() as { results?: Array<{ conversionAction?: { tagSnippets?: Array<{ pageFormat?: string; eventSnippet?: string; globalSiteTag?: string }> } }> }
      const snippets = qd.results?.[0]?.conversionAction?.tagSnippets ?? []
      const snip = snippets.find(sn => sn.pageFormat === 'HTML') ?? snippets[0]
      const m = `${snip?.eventSnippet ?? ''}\n${snip?.globalSiteTag ?? ''}`.match(/AW-[A-Za-z0-9]+\/[A-Za-z0-9_-]+/)
      if (m) {
        sendTo = m[0]
        ;[awId, label] = sendTo.split('/')
      } else {
        const g = String(snip?.globalSiteTag ?? '').match(/AW-[A-Za-z0-9]+/)
        if (g) awId = g[0]
      }
    } catch { /* snippet lookup is best-effort — conversion action itself is created */ }

    return NextResponse.json({ success: true, conversionId, resourceName, awId, label, sendTo })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
