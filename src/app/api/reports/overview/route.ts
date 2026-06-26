import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function GET() {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const snapshots = await prisma.performanceSnapshot.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    })

    const totalCost = snapshots.reduce((s, r) => s + r.cost, 0)
    const totalConversions = snapshots.reduce((s, r) => s + r.conversions, 0)
    const totalClicks = snapshots.reduce((s, r) => s + r.clicks, 0)
    const totalImpressions = snapshots.reduce((s, r) => s + r.impressions, 0)
    const blendedCPA = totalConversions > 0 ? totalCost / totalConversions : 0
    const blendedCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

    return NextResponse.json({
      summary: { totalCost, totalConversions, totalClicks, totalImpressions, blendedCPA, blendedCTR },
      campaigns: snapshots,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}
