import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

interface GA4Property {
  propertyId:  string
  displayName: string
  measurementId?: string
}

export async function GET() {
  try {
    const session     = await (auth() as Promise<Session | null>)
    const accessToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

    if (!accessToken) {
      return NextResponse.json({ data: [], source: 'no_session' })
    }

    // Try GA4 Admin API (requires analytics.edit or analytics.readonly scope)
    const res = await fetch(
      'https://analyticsadmin.googleapis.com/v1beta/accounts',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('[ga4] accounts list failed:', res.status, err.slice(0, 200))
      return NextResponse.json({ data: [], error: `GA4 API ${res.status}` })
    }

    const accountsJson = await res.json() as { accounts?: Array<{ name: string; displayName: string }> }
    const accounts     = accountsJson.accounts ?? []

    // Fetch properties for each account
    const allProperties: GA4Property[] = []
    await Promise.all(
      accounts.map(async (acct) => {
        const accountId = acct.name.replace('accounts/', '')
        const propRes = await fetch(
          `https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:${acct.name}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ).catch(() => null)

        if (!propRes?.ok) return

        const propJson = await propRes.json() as {
          properties?: Array<{ name: string; displayName: string }>
        }
        for (const p of propJson.properties ?? []) {
          allProperties.push({
            propertyId:  p.name.replace('properties/', ''),
            displayName: p.displayName,
            // accountId available for reference
          })
          void accountId
        }
      })
    )

    return NextResponse.json({ data: allProperties, source: 'google_analytics_admin_api' })
  } catch (err) {
    console.error('[ga4] unexpected error:', err)
    return NextResponse.json({ data: [], error: 'unexpected error' })
  }
}
