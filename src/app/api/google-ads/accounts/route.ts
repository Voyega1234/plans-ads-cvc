import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAccessibleCustomers, getEnvConfiguredAccounts } from '@/lib/google-ads/accounts'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

export async function GET() {
  try {
    const [session, mccToken] = await Promise.all([
      auth(),
      getGoogleAdsAccessToken().catch(() => undefined),
    ])
    const sessionToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

    let accounts = sessionToken ? await getAccessibleCustomers(sessionToken, true) : []

    if (accounts.length === 0 && mccToken) {
      accounts = await getAccessibleCustomers(mccToken, false)
    }

    if (accounts.length === 0) {
      accounts = getEnvConfiguredAccounts()
    }

    return NextResponse.json(accounts)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}
