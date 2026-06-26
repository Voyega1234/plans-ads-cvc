/**
 * Google Ads API Client
 * Uses mock data when MOCK_GOOGLE_ADS=true or when credentials are not configured.
 */

export function isMockMode(): boolean {
  return (
    process.env.MOCK_GOOGLE_ADS === 'true' ||
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
