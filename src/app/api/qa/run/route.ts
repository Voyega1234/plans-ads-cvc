import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCampaignQA } from '@/lib/ai/qa'
import { CampaignBlueprintJson } from '@/types'
import { z } from 'zod'

const schema = z.object({ blueprintId: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { blueprintId } = schema.parse(body)

    const blueprint = await prisma.campaignBlueprint.findUnique({
      where: { id: blueprintId },
      include: { mediaPlan: { include: { brief: true } } },
    })
    if (!blueprint) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })

    const blueprintJson: CampaignBlueprintJson = JSON.parse(blueprint.blueprintJson)
    const brief = {
      businessName: blueprint.mediaPlan.brief.businessName,
      websiteUrl: blueprint.mediaPlan.brief.websiteUrl,
      objective: blueprint.mediaPlan.brief.objective,
      monthlyBudget: blueprint.mediaPlan.brief.monthlyBudget,
      conversionGoal: blueprint.mediaPlan.brief.conversionGoal,
    }

    const qaResult = await runCampaignQA(blueprintJson, brief)

    // Delete old QA checks
    await prisma.qACheck.deleteMany({ where: { campaignBlueprintId: blueprintId } })

    // Save QA checks
    for (const check of qaResult.checks) {
      await prisma.qACheck.create({
        data: {
          campaignBlueprintId: blueprintId,
          checkName: check.checkName,
          severity: check.severity,
          status: check.status,
          message: check.message,
          recommendation: check.recommendation,
        },
      })
    }

    // Update blueprint QA score
    await prisma.campaignBlueprint.update({
      where: { id: blueprintId },
      data: { qaScore: qaResult.score, status: qaResult.readyToPush ? 'approved' : 'review' },
    })

    return NextResponse.json({ success: true, qaResult })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Failed to run QA' }, { status: 500 })
  }
}
