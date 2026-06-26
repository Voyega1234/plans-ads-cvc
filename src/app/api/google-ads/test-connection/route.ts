import { NextRequest, NextResponse } from 'next/server'
import { mockTestConnection } from '@/lib/google-ads/mock'
import { isMockMode } from '@/lib/google-ads/client'
import { auth } from '@/lib/auth'
import { getAccessibleCustomers } from '@/lib/google-ads/accounts'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const customerId = body.customerId || ''

    if (isMockMode()) {
      const result = await mockTestConnection(customerId)
      return NextResponse.json(result)
    }

    const session = await auth()
    const accessToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated — please sign in' })
    }

    const accounts = await getAccessibleCustomers(accessToken)
    return NextResponse.json({
      success:      true,
      customerId,
      accountCount: accounts.length,
      accounts:     accounts.slice(0, 5).map((a) => ({ id: a.id, name: a.descriptiveName })),
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Connection test failed' },
      { status: 500 }
    )
  }
}
