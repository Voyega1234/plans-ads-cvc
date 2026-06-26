import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'

// PATCH — toggle enabled or update fields
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await (auth() as Promise<Session | null>)
  const userId  = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { enabled?: boolean }

  const rule = await prisma.automationRule.updateMany({
    where:  { id: params.id, userId },
    data:   { ...(body.enabled !== undefined && { enabled: body.enabled }) },
  })

  if (!rule.count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove rule
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await (auth() as Promise<Session | null>)
  const userId  = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.automationRule.deleteMany({ where: { id: params.id, userId } })
  return NextResponse.json({ ok: true })
}
