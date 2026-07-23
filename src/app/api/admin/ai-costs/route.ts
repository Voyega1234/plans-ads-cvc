import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_EMAILS = ['bob@convertcake.com', 'apps@convertcake.com']

export async function GET(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email ?? ''
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const days  = parseInt(searchParams.get('days') ?? '30', 10)
  const limit = parseInt(searchParams.get('limit') ?? '200', 10)

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [logs, totals] = await Promise.all([
    prisma.aiCostLog.findMany({
      where:   { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: { user: { select: { email: true, name: true } } },
    }),
    prisma.aiCostLog.aggregate({
      where:  { createdAt: { gte: since } },
      _sum:   { inputTokens: true, outputTokens: true, totalTokens: true, estimatedUSD: true },
      _count: { id: true },
    }),
  ])

  // Group by route for summary
  const byRoute: Record<string, { calls: number; totalTokens: number; estimatedUSD: number }> = {}
  for (const log of logs) {
    if (!byRoute[log.route]) byRoute[log.route] = { calls: 0, totalTokens: 0, estimatedUSD: 0 }
    byRoute[log.route].calls++
    byRoute[log.route].totalTokens += log.totalTokens
    byRoute[log.route].estimatedUSD += log.estimatedUSD
  }

  return NextResponse.json({
    logs,
    summary: {
      totalCalls:    totals._count.id,
      totalTokens:   totals._sum.totalTokens ?? 0,
      inputTokens:   totals._sum.inputTokens  ?? 0,
      outputTokens:  totals._sum.outputTokens ?? 0,
      estimatedUSD:  totals._sum.estimatedUSD ?? 0,
      byRoute: Object.entries(byRoute)
        .sort((a, b) => b[1].estimatedUSD - a[1].estimatedUSD)
        .map(([route, v]) => ({ route, ...v })),
    },
    days,
  })
}
