import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAccessibleCustomers, getAccountSummary, getEnvConfiguredAccounts } from '@/lib/google-ads/accounts'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

export async function GET() {
  // auth() and token refresh are independent — run in parallel
  const [session, mccToken] = await Promise.all([
    auth(),
    getGoogleAdsAccessToken().catch(() => undefined),
  ])
  const sessionToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

  try {
    // Priority: session token → MCC env token → env-configured CID list
    // This ensures accounts always show even when session DB was reset
    let accounts = sessionToken ? await getAccessibleCustomers(sessionToken, true) : []

    if (accounts.length === 0 && mccToken) {
      accounts = await getAccessibleCustomers(mccToken, false)
    }

    if (accounts.length === 0) {
      accounts = getEnvConfiguredAccounts()
    }

    const queryToken = mccToken || sessionToken
    const accountsWithSummary = await Promise.all(
      accounts.map(async (acc) => {
        const summary = queryToken
          ? await getAccountSummary(acc.id, queryToken).catch(() => null)
          : null
        return { ...acc, summary }
      })
    )

    return NextResponse.json({
      accounts: accountsWithSummary,
      userEmail: session?.user?.email ?? null,
      source: sessionToken ? 'google_ads_api' : mccToken ? 'mcc_token' : 'mock',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}
