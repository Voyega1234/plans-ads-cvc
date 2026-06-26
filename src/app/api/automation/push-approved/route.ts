import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushCampaignBlueprint } from '@/lib/google-ads/campaign-builder'
import { CampaignBlueprintJson, PushResult } from '@/types'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

const schema = z.object({
  customerId: z.string().min(1),
  approvedBlueprintIds: z.array(z.string().min(1)).min(1),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = getUserId(session)
  const body = await req.json()

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.errors },
      { status: 400 }
    )
  }

  const { customerId, approvedBlueprintIds } = parsed.data

  const results: {
    blueprintId: string
    pushResult?: PushResult
    error?: string
  }[] = []

  let pushedCount = 0

  for (const blueprintId of approvedBlueprintIds) {
    try {
      const blueprint = await prisma.campaignBlueprint.findFirst({
        where: { id: blueprintId, userId },
      })

      if (!blueprint) {
        results.push({ blueprintId, error: 'Blueprint not found' })
        continue
      }

      const blueprintJson: CampaignBlueprintJson = JSON.parse(blueprint.blueprintJson as string)

      const pushResult = await pushCampaignBlueprint(blueprintJson, customerId, 'PAUSED')

      // Save push job
      await prisma.pushJob.create({
        data: {
          campaignBlueprintId: blueprintId,
          userId,
          provider:            'google_ads',
          status:              pushResult.status === 'completed' ? 'completed' : 'failed',
          mode:                'PAUSED',
          resultJson:          JSON.stringify(pushResult),
          startedAt:           new Date(pushResult.startedAt),
          finishedAt:          new Date(pushResult.finishedAt),
        },
      })

      // Update blueprint status
      await prisma.campaignBlueprint.update({
        where: { id: blueprintId },
        data: { status: 'pushed' },
      })

      results.push({ blueprintId, pushResult })
      pushedCount++
    } catch (err) {
      results.push({
        blueprintId,
        error: err instanceof Error ? err.message : 'Push failed',
      })
    }
  }

  return NextResponse.json({
    pushed: pushedCount,
    total: approvedBlueprintIds.length,
    results,
  })
}
