import { isMockMode } from './client'
import { mockGetAccessibleCustomers, mockGetCustomerDetails } from './mock'

// In-memory TTL caches — avoids re-hitting Google API on every page load
const _customersCache = new Map<string, { data: GoogleAdsAccount[]; expiresAt: number }>()
const _summaryCache   = new Map<string, { data: { spend: number; campaigns: number; currency: string } | null; expiresAt: number }>()
const CUSTOMERS_TTL_MS = 60_000  // 1 minute
const SUMMARY_TTL_MS   = 60_000  // 1 minute

export interface GoogleAdsAccount {
  id: string
  resourceName: string
  descriptiveName: string
  currencyCode: string
  timeZone: string
  testAccount: boolean
  manager?: boolean
}

async function fetchAccountDetails(
  customerId: string,
  accessToken: string,
  devToken: string,
  loginCustomerId: string,
): Promise<GoogleAdsAccount | null> {
  try {
    const headers: Record<string, string> = {
      Authorization:     `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type':    'application/json',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.test_account, customer.manager FROM customer LIMIT 1',
        }),
        signal: AbortSignal.timeout(8000),
      }
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[accounts] probe', customerId, 'status:', res.status, errText.slice(0, 200))
      return null
    }

    const data = await res.json() as {
      results?: Array<{
        customer: {
          id: string
          descriptiveName?: string
          currencyCode?: string
          timeZone?: string
          testAccount?: boolean
          resourceName?: string
          manager?: boolean
        }
      }>
    }
    const row = data.results?.[0]?.customer
    if (!row) return null

    return {
      id:              row.id ?? customerId,
      resourceName:    row.resourceName ?? `customers/${customerId}`,
      descriptiveName: row.descriptiveName ?? `Account ${customerId}`,
      currencyCode:    row.currencyCode ?? 'THB',
      timeZone:        row.timeZone ?? 'Asia/Bangkok',
      testAccount:     row.testAccount ?? false,
      manager:         row.manager ?? false,
    }
  } catch {
    return null
  }
}

export async function getAccessibleCustomers(
  accessToken?: string,
  isSessionToken = true,
): Promise<GoogleAdsAccount[]> {
  if (isMockMode()) return mockGetAccessibleCustomers()
  if (!accessToken)  return []

  const devToken        = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const mccId           = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

  if (!devToken) return mockGetAccessibleCustomers()

  // Return cached result if still fresh (avoid hammering Google Ads API on every page load)
  const cacheKey = `${accessToken.slice(-16)}`
  const cached = _customersCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  // Always send login-customer-id so the token can reach sub-accounts under the MCC.
  // This works for both the user's session token and the env MCC refresh token,
  // because bob@convertcake.com is a user on the MCC.
  const loginCustomerId = mccId

  // listAccessibleCustomers must NOT have login-customer-id header
  const listHeaders: Record<string, string> = {
    Authorization:     `Bearer ${accessToken}`,
    'developer-token': devToken,
  }

  let resourceNames: string[] = []
  try {
    const listRes = await fetch(
      'https://googleads.googleapis.com/v21/customers:listAccessibleCustomers',
      { headers: listHeaders, signal: AbortSignal.timeout(8000) }
    )

    if (listRes.ok) {
      const listData = await listRes.json() as { resourceNames?: string[] }
      resourceNames = listData.resourceNames ?? []
    } else {
      const errText = await listRes.text().catch(() => '')
      console.error('[accounts] listAccessibleCustomers failed:', listRes.status, errText.slice(0, 400))
    }
  } catch (e) {
    console.error('[accounts] listAccessibleCustomers error:', e)
  }

  if (resourceNames.length === 0) {
    return isSessionToken ? [] : getEnvConfiguredAccounts()
  }

  // Probe each account via MCC first (skip direct probe — MCC path always works for sub-accounts)
  const results = await Promise.all(
    resourceNames.map(async (rn) => {
      const cid = rn.replace('customers/', '').replace(/-/g, '')

      // 1. Try with MCC as login-customer-id (fastest path — avoids a failed direct probe)
      if (loginCustomerId) {
        const viaMcc = await fetchAccountDetails(cid, accessToken, devToken, loginCustomerId)
        if (viaMcc) return viaMcc
      }

      // 2. Try direct (no login-customer-id) as fallback
      const direct = await fetchAccountDetails(cid, accessToken, devToken, '')
      if (direct) return direct

      // 3. listAccessibleCustomers already confirmed this token can see this account
      //    Return basic info so it still shows up (non-admin users can't query customer table)
      return {
        id:              cid,
        resourceName:    rn,
        descriptiveName: `Account ${cid.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}`,
        currencyCode:    'THB',
        timeZone:        'Asia/Bangkok',
        testAccount:     false,
        manager:         false,
      } as GoogleAdsAccount
    })
  )

  const allAccessible = results.filter(Boolean) as GoogleAdsAccount[]

  // Always exclude MCC/manager accounts from the client-facing list
  const leafAccounts = allAccessible.filter((a) => !a.manager)

  const finalResult = leafAccounts.length > 0 ? leafAccounts : (isSessionToken ? [] : getEnvConfiguredAccounts())

  // Store in cache
  _customersCache.set(cacheKey, { data: finalResult, expiresAt: Date.now() + CUSTOMERS_TTL_MS })

  return finalResult
}

export function getEnvConfiguredAccounts(): GoogleAdsAccount[] {
  const raw = process.env.GOOGLE_ADS_CUSTOMER_ID ?? ''
  const seen = new Set<string>()
  return raw.split(',').flatMap((rawId) => {
    const id = rawId.trim().replace(/-/g, '')
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{
      id,
      resourceName:    `customers/${id}`,
      descriptiveName: `Account ${id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}`,
      currencyCode:    'THB',
      timeZone:        'Asia/Bangkok',
      testAccount:     false,
    }]
  })
}

export async function getCustomerDetails(customerId: string, accessToken?: string) {
  if (isMockMode() || !accessToken) {
    return mockGetCustomerDetails(customerId)
  }

  const devToken        = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

  if (!devToken) return mockGetCustomerDetails(customerId)

  return fetchAccountDetails(customerId.replace(/-/g, ''), accessToken, devToken, loginCustomerId)
}

async function gaqlSearch(
  customerId: string,
  accessToken: string,
  devToken: string,
  query: string,
  loginCustomerId = '',
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization:     `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
  return fetch(
    `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) }
  )
}

export async function getAccountSummary(
  customerId: string,
  accessToken: string,
): Promise<{ spend: number; campaigns: number; currency: string } | null> {
  const devToken        = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

  if (!devToken || isMockMode()) return null

  const cid      = customerId.replace(/-/g, '')
  const cacheKey = `${cid}:${accessToken.slice(-16)}`
  const cached   = _summaryCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  try {
    const query = 'SELECT campaign.id, campaign.status, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS'

    // MCC first (required for sub-accounts), fallback to direct
    const attempts = loginCustomerId ? [loginCustomerId, ''] : ['']
    let body = ''
    let ok   = false
    for (const lcid of attempts) {
      const res = await gaqlSearch(cid, accessToken, devToken, query, lcid)
      body = await res.text().catch(() => '')
      if (res.ok) { ok = true; break }
    }
    if (!ok) { _summaryCache.set(cacheKey, { data: null, expiresAt: Date.now() + SUMMARY_TTL_MS }); return null }

    let parsed: { results?: Array<{ campaign: { id: string; status: string }; metrics: { costMicros: string } }> }
    try { parsed = JSON.parse(body) } catch { return null }

    const rows            = parsed.results ?? []
    const totalMicros     = rows.reduce((s, r) => s + Number(r.metrics?.costMicros ?? 0), 0)
    const activeCampaigns = rows.filter((r) => r.campaign.status === 'ENABLED').length

    const result = {
      spend:     Math.round(totalMicros / 1_000_000),
      campaigns: activeCampaigns,
      currency:  'THB',
    }
    _summaryCache.set(cacheKey, { data: result, expiresAt: Date.now() + SUMMARY_TTL_MS })
    return result
  } catch {
    return null
  }
}
