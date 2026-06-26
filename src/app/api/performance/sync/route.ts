import { NextRequest, NextResponse } from 'next/server'
import { syncPerformanceSnapshots } from '@/lib/google-ads/performance-reader'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

const schema = z.object({
  customerId: z.string().min(1),
  clientId:   z.string().optional(),
  dateRange:  z.string().default('LAST_30_DAYS'),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = getUserId(session)
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const { customerId, clientId, dateRange } = parsed.data

  let adsToken: string | undefined
  try { adsToken = await getGoogleAdsAccessToken() } catch { /* falls back to mock inside lib */ }

  const result = await syncPerformanceSnapshots(userId, customerId, clientId, dateRange, adsToken)
  return NextResponse.json({ ok: true, ...result })
}
