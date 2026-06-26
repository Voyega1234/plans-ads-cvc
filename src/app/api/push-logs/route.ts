import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

const ADMIN_EMAIL = 'bob@convertcake.com'

export async function GET(req: NextRequest) {
  try {
    const session = await (auth() as Promise<Session | null>)
    const email = session?.user?.email ?? ''

    if (email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200)
    const offset = Number(searchParams.get('offset') ?? '0')

    const [jobs, total] = await Promise.all([
      prisma.pushJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { email: true, name: true } },
          blueprint: {
            select: {
              id: true,
              mediaPlanId: true,
              mediaPlan: { select: { title: true, brief: { select: { businessName: true } } } },
            },
          },
        },
      }),
      prisma.pushJob.count(),
    ])

    const rows = jobs.map((j) => {
      let campaigns: { campaignName: string; status: string; error?: string }[] = []
      try {
        const r = j.resultJson ? JSON.parse(j.resultJson) : null
        campaigns = r?.campaigns ?? []
      } catch { /* ignore */ }

      return {
        id:           j.id,
        status:       j.status,
        mode:         j.mode,
        provider:     j.provider,
        startedAt:    j.startedAt,
        finishedAt:   j.finishedAt,
        createdAt:    j.createdAt,
        user:         j.user ? { email: j.user.email, name: j.user.name } : null,
        businessName: j.blueprint?.mediaPlan?.brief?.businessName ?? j.blueprint?.mediaPlan?.title ?? '—',
        mediaPlanId:  j.blueprint?.mediaPlanId ?? null,
        blueprintId:  j.blueprint?.id ?? null,
        campaigns,
        totalCreated: campaigns.filter(c => c.status === 'success').length,
        totalErrors:  campaigns.filter(c => c.status === 'error').length,
      }
    })

    return NextResponse.json({ jobs: rows, total, limit, offset })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
