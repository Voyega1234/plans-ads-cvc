import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const brief = await prisma.brief.findFirst({
      where: { id: params.id, userId },
      include: { client: true, mediaPlans: true },
    })
    if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(brief)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch brief' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.brief.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete brief' }, { status: 500 })
  }
}
