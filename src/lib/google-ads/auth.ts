/**
 * Google Ads OAuth2 refresh-token flow.
 * Token is cached in-memory for 55 minutes (Google issues 60-min tokens).
 */

interface TokenCache {
  token:     string
  expiresAt: number  // ms epoch
}

let cache: TokenCache | null = null
let inflight: Promise<string> | null = null

export async function getGoogleAdsAccessToken(): Promise<string> {
  // Return cached token if still valid (5-min safety margin)
  if (cache && Date.now() < cache.expiresAt) return cache.token

  // Deduplicate concurrent calls — only one refresh at a time
  if (inflight) return inflight

  inflight = (async () => {
    const clientId     = process.env.GOOGLE_ADS_CLIENT_ID
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Google Ads OAuth2 credentials not configured. ' +
        'Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN.'
      )
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google Ads token refresh failed: ${res.status} ${err.slice(0, 300)}`)
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
    if (!data.access_token) {
      throw new Error(`No access_token returned: ${JSON.stringify(data)}`)
    }

    const ttl = (data.expires_in ?? 3600) * 1000
    cache = { token: data.access_token, expiresAt: Date.now() + ttl - 5 * 60 * 1000 }
    return data.access_token
  })().finally(() => { inflight = null })

  return inflight
}
