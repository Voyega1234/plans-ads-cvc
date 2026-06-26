import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { blueprintId: string } }) {
  try {
    const checks = await prisma.qACheck.findMany({
      where: { campaignBlueprintId: params.blueprintId },
      orderBy: { severity: 'asc' },
    })
    return NextResponse.json(checks)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch QA checks' }, { status: 500 })
  }
}
