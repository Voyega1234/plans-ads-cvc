import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listGtmAccounts, listGtmContainers } from '@/lib/gtm'
import type { Session } from 'next-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await (auth() as Promise<Session | null>)
    const accessToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

    if (!accessToken) {
      return NextResponse.json({ accounts: [], containers: [] })
    }

    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')

    // Return containers for a specific account
    if (accountId) {
      const containers = await listGtmContainers(accountId, accessToken).catch(() => [])
      return NextResponse.json({
        containers: containers.map(c => ({
          containerId: c.containerId,
          name: c.name,
          publicId: c.publicId,
          accountId: c.accountId,
        })),
      })
    }

    // Return all accounts
    const accounts = await listGtmAccounts(accessToken)
    return NextResponse.json({
      accounts: accounts.map(a => ({ accountId: a.accountId, name: a.name })),
    })
  } catch {
    return NextResponse.json({ accounts: [], containers: [] })
  }
}
