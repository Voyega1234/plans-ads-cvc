import { NextRequest, NextResponse } from 'next/server'
import { listGtmAccounts, listGtmContainers } from '@/lib/gtm'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

export async function GET(req: NextRequest) {
  const session = await (auth() as Promise<Session | null>)
  const sessionToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined
  const token = sessionToken ?? req.headers.get('x-access-token') ?? undefined

  // Fallback: if env has GTM_ACCOUNT_ID + GTM_CONTAINER_ID, return directly without API call
  const envAccountId   = process.env.GTM_ACCOUNT_ID ?? ''
  const envContainerId = process.env.GTM_CONTAINER_ID ?? ''

  try {
    const accounts = await listGtmAccounts(token)
    const results: Array<{
      accountId: string; accountName: string
      containerId: string; containerName: string; publicId: string
    }> = []

    await Promise.all(
      accounts.map(async (acc) => {
        try {
          const containers = await listGtmContainers(acc.accountId, token)
          for (const c of containers) {
            results.push({
              accountId: acc.accountId, accountName: acc.name,
              containerId: c.containerId, containerName: c.name, publicId: c.publicId,
            })
          }
        } catch {}
      })
    )

    if (results.length > 0) return NextResponse.json({ containers: results })
    throw new Error('no containers from API')
  } catch {
    // If API fails but env has container info, return that
    if (envAccountId && envContainerId) {
      return NextResponse.json({
        containers: [{
          accountId:     envAccountId,
          accountName:   'ConvertCake GTM',
          containerId:   envContainerId,
          containerName: 'ConvertCake',
          publicId:      `GTM-${envContainerId}`,
        }],
        source: 'env',
      })
    }
    return NextResponse.json({ containers: [] })
  }
}
