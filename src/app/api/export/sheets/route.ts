import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exportMediaPlanToSheet } from '@/lib/google-sheets'
import { MediaPlanJson } from '@/types'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const body = await req.json()
    const { planId } = body

    if (!planId) {
      return NextResponse.json({ error: 'planId required' }, { status: 400 })
    }

    const plan = await prisma.mediaPlan.findFirst({
      where: { id: planId, userId },
    })
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

    const planJson: MediaPlanJson = JSON.parse(plan.planJson)
    const result = await exportMediaPlanToSheet(planJson, plan.title)

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to export to sheets' }, { status: 500 })
  }
}
