import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushCampaignBlueprint } from '@/lib/google-ads/campaign-builder'
import { CampaignBlueprintJson } from '@/types'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  customerId: z.string().min(1),
  blueprintJson: z.record(z.unknown()),
  mode: z.enum(['live', 'dry_run']).default('dry_run'),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const userId = skipAuth ? null : getUserId(session)
    const planId = params.id

    const body = await req.json()
    const { customerId, blueprintJson, mode } = schema.parse(body)

    // Verify plan exists and belongs to user
    const plan = await prisma.mediaPlan.findFirst({
      where: skipAuth ? { id: planId } : { id: planId, userId: userId ?? undefined },
    })
    if (!plan) return NextResponse.json({ error: 'Media plan not found' }, { status: 404 })

    // Delete existing blueprints for this plan and save the new one
    const existing = await prisma.campaignBlueprint.findMany({ where: { mediaPlanId: planId }, select: { id: true } })
    if (existing.length > 0) {
      const ids = existing.map(b => b.id)
      await prisma.pushJob.deleteMany({ where: { campaignBlueprintId: { in: ids } } })
      await prisma.qACheck.deleteMany({ where: { campaignBlueprintId: { in: ids } } })
      await prisma.campaignBlueprint.deleteMany({ where: { mediaPlanId: planId } })
    }

    const blueprint = await prisma.campaignBlueprint.create({
      data: {
        mediaPlanId: planId,
        ...(userId ? { userId } : {}),
        blueprintJson: JSON.stringify(blueprintJson),
        status: 'approved',
      },
    })

    // Create push job record
    const pushJob = await prisma.pushJob.create({
      data: {
        campaignBlueprintId: blueprint.id,
        ...(userId ? { userId } : {}),
        provider: 'google_ads',
        status: 'running',
        mode,
        startedAt: new Date(),
      },
    })

    try {
      // Debug: log blueprint structure to find logo assets
      const bpCampaigns = (blueprintJson as Record<string, unknown>).campaigns as Array<Record<string, unknown>> ?? []
      for (const c of bpCampaigns) {
        const assetGroups = (c.assetGroups as Array<Record<string, unknown>> | undefined) ?? []
        const adGroups = (c.adGroups as Array<Record<string, unknown>> | undefined) ?? []
        console.log('[push-blueprint] campaign:', c.campaignName, 'type:', c.campaignType)
        console.log('[push-blueprint]   assetGroups:', assetGroups.length, JSON.stringify(assetGroups.map(ag => ({ name: ag.assetGroupName, imgCount: (ag.imageAssets as unknown[] | undefined)?.length ?? 0, imgs: (ag.imageAssets as Array<{assetType:string;imageUrl?:string}> | undefined)?.map(i => i.assetType + ':' + (i.imageUrl?.slice(0,40) ?? 'none')) }))))
        console.log('[push-blueprint]   adGroups:', adGroups.length)
      }
      const result = await pushCampaignBlueprint(blueprintJson as unknown as CampaignBlueprintJson, customerId, mode)

      await prisma.pushJob.update({
        where: { id: pushJob.id },
        data: {
          status: result.status === 'completed' ? 'completed' : result.status === 'partial' ? 'partial' : 'failed',
          resultJson: JSON.stringify(result),
          finishedAt: new Date(),
        },
      })
      await prisma.campaignBlueprint.update({
        where: { id: blueprint.id },
        data: { status: result.status === 'completed' ? 'pushed' : 'failed' },
      })

      return NextResponse.json({ success: true, result, blueprintId: blueprint.id, pushJobId: pushJob.id })
    } catch (pushErr) {
      await prisma.pushJob.update({
        where: { id: pushJob.id },
        data: { status: 'failed', resultJson: JSON.stringify({ error: String(pushErr) }), finishedAt: new Date() },
      })
      throw pushErr
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 })
    }
    console.error('[push-blueprint]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
