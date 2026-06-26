import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function GET() {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const plans = await prisma.mediaPlan.findMany({
      where: userId ? { userId } : {},
      include: { brief: true, blueprints: true },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(plans)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch media plans' }, { status: 500 })
  }
}
