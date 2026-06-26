import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/template-drafts — list all drafts for current user
export async function GET() {
  try {
    const session = await auth()
    const drafts = await prisma.templateDraft.findMany({
      where: session?.user?.id ? { userId: session.user.id } : {},
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        accountId: true,
        accountName: true,
        templateType: true,
        templateName: true,
        phase: true,
        mediaPlanId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({ drafts })
  } catch (err) {
    console.error('[template-drafts GET]', err)
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 })
  }
}

// POST /api/template-drafts — create new draft
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const body = await req.json()
    const { accountId, accountName, templateType, templateName, stateJson, phase } = body

    const draft = await prisma.templateDraft.create({
      data: {
        userId: session?.user?.id ?? null,
        accountId,
        accountName,
        templateType,
        templateName,
        stateJson: JSON.stringify(stateJson),
        phase: phase ?? 'build',
      },
    })
    return NextResponse.json({ id: draft.id })
  } catch (err) {
    console.error('[template-drafts POST]', err)
    return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
  }
}
