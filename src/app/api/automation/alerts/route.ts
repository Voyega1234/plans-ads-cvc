import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function GET() {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const alerts = await prisma.automationAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(alerts)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }
}
