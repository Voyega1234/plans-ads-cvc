import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushCampaignBlueprint, validateAssets, PMaxImageAssets } from '@/lib/google-ads/campaign-builder'
import { CampaignBlueprintJson } from '@/types'
import { pushBlueprintSchema } from '@/lib/validation/campaign'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const userId = skipAuth ? null : getUserId(session)
    const rawBody = await req.json()
    const { blueprintId, customerId, mode } = pushBlueprintSchema.parse(rawBody)
    const campaignNames: string[] | undefined = Array.isArray(rawBody.campaignNames) ? rawBody.campaignNames : undefined
    const pmaxImageAssets: PMaxImageAssets | undefined = rawBody.pmaxImageAssets ?? undefined

    const blueprint = await prisma.campaignBlueprint.findUnique({
      where: { id: blueprintId },
    })
    if (!blueprint) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })

    const blueprintJson: CampaignBlueprintJson = JSON.parse(blueprint.blueprintJson)

    // If campaignNames filter provided, only push selected campaigns
    const filteredBlueprint: CampaignBlueprintJson = campaignNames
      ? { ...blueprintJson, campaigns: blueprintJson.campaigns.filter(c => campaignNames.includes(c.campaignName)) }
      : blueprintJson

    // Validate asset completeness — block push if required assets are missing
    // Pass ?force=true to override this check
    const force = rawBody.force === true
    if (!force) {
      const gaps = validateAssets(filteredBlueprint)
      if (gaps.length > 0) {
        return NextResponse.json({
          error: 'asset_incomplete',
          message: 'Campaign มี assets ไม่ครบ กรุณาตรวจสอบก่อน push หรือส่ง force:true เพื่อ push ต่อ',
          gaps,
        }, { status: 422 })
      }
    }

    const pushJob = await prisma.pushJob.create({
      data: {
        campaignBlueprintId: blueprintId,
        ...(userId ? { userId } : {}),
        provider: 'google_ads',
        status: 'running',
        mode,
        startedAt: new Date(),
      },
    })

    try {
      const result = await pushCampaignBlueprint(filteredBlueprint, customerId, mode, pmaxImageAssets)

      await prisma.pushJob.update({
        where: { id: pushJob.id },
        data: {
          status: result.status,
          resultJson: JSON.stringify(result),
          finishedAt: new Date(),
        },
      })

      await prisma.campaignBlueprint.update({
        where: { id: blueprintId },
        data: { status: 'pushed' },
      })

      return NextResponse.json({ success: true, jobId: pushJob.id, result })
    } catch (pushError) {
      await prisma.pushJob.update({
        where: { id: pushJob.id },
        data: {
          status: 'failed',
          errorJson: JSON.stringify({ error: String(pushError) }),
          finishedAt: new Date(),
        },
      })
      throw pushError
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to push blueprint' }, { status: 500 })
  }
}
