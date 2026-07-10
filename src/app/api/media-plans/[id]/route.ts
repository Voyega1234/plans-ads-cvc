import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await (auth() as Promise<Session | null>)
    const userId = skipAuth ? null : getUserId(session)

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
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await (auth() as Promise<Session | null>)
    const userId = skipAuth ? null : getUserId(session)

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
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await (auth() as Promise<Session | null>)
    const userId = skipAuth ? null : getUserId(session)

    const body = await req.json()
    const { planJson, strategyJson, status, monthlyBudget, brief } = body as {
      planJson?: string; strategyJson?: string; status?: string; monthlyBudget?: number
      brief?: Record<string, string | number | null | undefined>
    }
    if (planJson !== undefined && typeof planJson !== 'string') {
      return NextResponse.json({ error: 'planJson must be a string' }, { status: 400 })
    }
    const data: Record<string, unknown> = {}
    if (planJson !== undefined) data.planJson = planJson
    if (strategyJson !== undefined) data.strategyJson = strategyJson
    if (status !== undefined) data.status = status
    const hasBudget = monthlyBudget !== undefined && Number.isFinite(monthlyBudget)
    if (hasBudget) data.monthlyBudget = Number(monthlyBudget)
    if (Object.keys(data).length === 0 && !brief) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const target = await prisma.mediaPlan.findFirst({
      where: userId ? { id: params.id, userId } : { id: params.id },
      select: { id: true, briefId: true },
    })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (Object.keys(data).length > 0) {
      await prisma.mediaPlan.update({ where: { id: target.id }, data })
    }

    // Sync the linked Brief so the Campaign Generator's Brief step stays accurate.
    if (brief && typeof brief === 'object' && target.briefId) {
      const briefData: Record<string, unknown> = {}
      const set = (key: string, v: unknown) => {
        if (v == null) return
        const s = String(v).trim()
        if (s.length > 0) briefData[key] = s
      }
      set('businessName',   brief.businessName)
      set('websiteUrl',     brief.websiteUrl)
      set('productService', brief.productService)
      set('objective',      brief.objective)
      set('targetLocation', brief.targetLocation)
      set('language',       brief.language)
      set('targetAudience', brief.targetAudience)
      set('conversionGoal', brief.conversionGoal)
      set('promotion',      brief.promotion)
      set('brandTone',      brief.brandTone)
      set('notes',          brief.notes)
      if (hasBudget) briefData.monthlyBudget = Number(monthlyBudget)
      if (Object.keys(briefData).length > 0) {
        await prisma.brief.update({ where: { id: target.briefId }, data: briefData })
      }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update media plan' }, { status: 500 })
  }
}
