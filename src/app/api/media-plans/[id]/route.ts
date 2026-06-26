import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await (auth() as Promise<Session | null>)
    const userId = getUserId(session)

    const plan = await prisma.mediaPlan.findFirst({
      where: userId ? { id: params.id, userId } : { id: params.id },
      include: {
        brief: true,
        blueprints: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { pushJobs: { orderBy: { createdAt: 'desc' }, take: 10 } },
        },
        keywordIdeas: { select: { id: true }, take: 1 },
      },
    })
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(plan)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch media plan' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await (auth() as Promise<Session | null>)
    const userId = getUserId(session)

    // Find by id only — userId filter is best-effort (agency internal tool, not multi-tenant)
    const plan = await prisma.mediaPlan.findFirst({
      where: userId ? { id: params.id, userId } : { id: params.id },
    })
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Delete children first (no cascade in schema)
    const blueprints = await prisma.campaignBlueprint.findMany({
      where: { mediaPlanId: params.id },
      select: { id: true },
    })
    for (const bp of blueprints) {
      await prisma.qACheck.deleteMany({ where: { campaignBlueprintId: bp.id } })
      await prisma.pushJob.deleteMany({ where: { campaignBlueprintId: bp.id } })
      await prisma.campaignComment.deleteMany({ where: { blueprintId: bp.id } })
    }
    await prisma.campaignBlueprint.deleteMany({ where: { mediaPlanId: params.id } })
    await prisma.keywordIdea.deleteMany({ where: { mediaPlanId: params.id } })
    await prisma.audienceSegment.deleteMany({ where: { mediaPlanId: params.id } })
    await prisma.mediaPlan.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete media plan' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await (auth() as Promise<Session | null>)
    const userId = getUserId(session)

    const body = await req.json()
    const { planJson, status } = body as { planJson?: string; status?: string }
    if (planJson !== undefined && typeof planJson !== 'string') {
      return NextResponse.json({ error: 'planJson must be a string' }, { status: 400 })
    }
    const data: Record<string, unknown> = {}
    if (planJson !== undefined) data.planJson = planJson
    if (status !== undefined) data.status = status
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    const plan = await prisma.mediaPlan.updateMany({
      where: userId ? { id: params.id, userId } : { id: params.id },
      data,
    })
    if (plan.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update media plan' }, { status: 500 })
  }
}
