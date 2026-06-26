import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'

export async function GET(_req: NextRequest, { params }: { params: { planId: string } }) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await (auth() as Promise<Session | null>)
    const userId = skipAuth ? '' : getUserId(session)

    const where = skipAuth
      ? { mediaPlanId: params.planId }
      : { mediaPlanId: params.planId, userId }

    const blueprint = await prisma.campaignBlueprint.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        qaChecks: true,
        pushJobs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    })
    if (!blueprint) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(blueprint)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch blueprint' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { planId: string } }) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await (auth() as Promise<Session | null>)
    const userId = skipAuth ? '' : getUserId(session)

    const { blueprintJson } = await req.json() as { blueprintJson: string }
    if (typeof blueprintJson !== 'string') {
      return NextResponse.json({ error: 'blueprintJson is required' }, { status: 400 })
    }

    // Try find by mediaPlanId first, then by id (blueprintId) — supports both callers
    const bp = await prisma.campaignBlueprint.findFirst({
      where: skipAuth
        ? { OR: [{ mediaPlanId: params.planId }, { id: params.planId }] }
        : { OR: [{ mediaPlanId: params.planId, userId }, { id: params.planId, userId }] },
    })
    if (!bp) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })

    const updated = await prisma.campaignBlueprint.update({
      where: { id: bp.id },
      data:  { blueprintJson },
    })
    return NextResponse.json({ updated: 1, id: updated.id })
  } catch {
    return NextResponse.json({ error: 'Failed to update blueprint' }, { status: 500 })
  }
}
