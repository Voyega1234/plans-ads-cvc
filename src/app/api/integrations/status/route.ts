import { NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { hasVertexOidcConfig } from '@/lib/ai/vertex'

export const dynamic = 'force-dynamic'

// Server-side only — never exposes key values, only boolean status
export async function GET() {
  // ── Google Ads: live connectivity probe ───────────────────────────────────
  const adsMock = process.env.MOCK_GOOGLE_ADS === 'true'
  let adsLive = false
  if (!adsMock && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    try {
      const token = await getGoogleAdsAccessToken()
      const mcc = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
      const res = await fetch(
        `https://googleads.googleapis.com/v21/customers/${mcc}/googleAds:search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: 'SELECT customer.id FROM customer LIMIT 1' }),
        }
      )
      adsLive = res.ok
    } catch {
      adsLive = false
    }
  }

  // ── GA4: property configured in env (OAuth-based, not service account)
  const ga4Configured = !!process.env.GA4_PROPERTY_ID
  const ga4Live = ga4Configured

  // ── GTM: both credentials AND GTM API reachable
  const gtmConfigured = !!(process.env.GTM_ACCOUNT_ID && process.env.GTM_CONTAINER_ID)
  let gtmLive = false
  if (gtmConfigured) {
    try {
      const gtmToken = await getGoogleAdsAccessToken().catch(() => undefined)
      if (gtmToken) {
        const gtmRes = await fetch(
          `https://www.googleapis.com/tagmanager/v2/accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}`,
          { headers: { Authorization: `Bearer ${gtmToken}` }, signal: AbortSignal.timeout(5000) }
        )
        gtmLive = gtmRes.ok
      }
    } catch {
      gtmLive = false
    }
  }

  // ── AI (Vertex Gemini primary, Anthropic fallback) ────────────────────────
  const aiConfigured = hasVertexOidcConfig() || !!process.env.ANTHROPIC_API_KEY
  const aiMock = process.env.MOCK_AI === 'true'

  // ── Sheets / Drive ────────────────────────────────────────────────────────
  const sheetsLive = !!(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY
  )
  const driveLive = !!(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
    process.env.GOOGLE_DRIVE_ENABLED === 'true' &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  )

  return NextResponse.json({
    google_ads: { configured: adsMock || adsLive, mock: adsMock, live: adsLive },
    anthropic: { configured: aiConfigured, mock: aiMock, live: aiConfigured && !aiMock },
    ga4: { configured: ga4Configured, mock: false, live: ga4Live },
    gtm: { configured: gtmConfigured, mock: false, live: gtmLive },
    google_sheets: { configured: sheetsLive, mock: false, live: sheetsLive },
    google_drive: { configured: driveLive, mock: false, live: driveLive },
  })
}
