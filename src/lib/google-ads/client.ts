/**
 * Google Ads API Client
 *
 * Separation of concerns:
 *  - isMockMode()           → true only when MOCK_GOOGLE_ADS=true (explicit opt-in)
 *  - isCredentialsMissing() → true when required env vars are absent (regardless of mock flag)
 *
 * API routes should check isCredentialsMissing() independently and throw a
 * descriptive error rather than silently falling back to mock data. This
 * prevents confusing "mock responses" when credentials are simply misconfigured.
 */

/** Returns true only when MOCK_GOOGLE_ADS is explicitly set to "true". */
export function isMockMode(): boolean {
  return process.env.MOCK_GOOGLE_ADS === 'true'
}

/**
 * Returns true when one or more required Google Ads credential env vars are
 * absent. Use this to detect misconfiguration and surface a clear error
 * instead of silently returning mock data.
 */
export function isCredentialsMissing(): boolean {
  return (
    !process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
    !process.env.GOOGLE_ADS_CLIENT_ID ||
    !process.env.GOOGLE_ADS_REFRESH_TOKEN
  )
}

export interface GoogleAdsClientConfig {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  loginCustomerId?: string
}

export function getGoogleAdsConfig(): GoogleAdsClientConfig {
  const config = {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    clientId: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? '',
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  }
  return config
}

// NOTE: For real Google Ads API integration, install 'google-ads-api' package
// and initialize the client here. Currently using REST-based mock.
