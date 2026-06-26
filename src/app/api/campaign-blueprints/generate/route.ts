export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateKeywordAudiencePlan } from '@/lib/ai/keyword-audience'
import { generateCampaignBlueprint } from '@/lib/ai/campaign-blueprint'
import { MediaPlanJson, KeywordAudiencePlan } from '@/types'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({ planId: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const userId = skipAuth ? null : getUserId(session)
    const body = await req.json()
    const { planId } = schema.parse(body)

    const plan = await prisma.mediaPlan.findFirst({
      where: skipAuth ? { id: planId } : { id: planId, userId: userId ?? undefined },
      include: { brief: true, keywordIdeas: true, audienceSegments: true },
    })
    if (!plan) return NextResponse.json({ error: 'Media plan not found' }, { status: 404 })

    const mediaPlanJson: MediaPlanJson = JSON.parse(plan.planJson)
    const brief = {
      businessName: plan.brief.businessName,
      websiteUrl: plan.brief.websiteUrl,
      productService: plan.brief.productService,
      objective: plan.brief.objective,
      monthlyBudget: plan.brief.monthlyBudget,
      currency: plan.brief.currency,
      targetLocation: plan.brief.targetLocation,
      language: plan.brief.language,
      targetAudience: plan.brief.targetAudience,
      conversionGoal: plan.brief.conversionGoal,
      promotion: plan.brief.promotion,
      brandTone: plan.brief.brandTone,
      utmSource: plan.brief.utmSource,
      utmMedium: plan.brief.utmMedium,
      utmCampaign: plan.brief.utmCampaign,
      utmContent: plan.brief.utmContent,
    }

    // Build keyword plan from DB or generate fresh
    let keywordPlan: KeywordAudiencePlan
    if (plan.keywordIdeas.length > 0) {
      const groups = new Map<string, { campaignName: string; adGroupName: string; keywords: unknown[] }>()
      for (const kw of plan.keywordIdeas) {
        const key = `${kw.campaignName}__${kw.adGroupName}`
        if (!groups.has(key)) groups.set(key, { campaignName: kw.campaignName, adGroupName: kw.adGroupName, keywords: [] })
        groups.get(key)!.keywords.push({ keyword: kw.keyword, matchType: kw.matchType, intent: kw.intent, suggestedBid: kw.lowTopOfPageBid })
      }
      keywordPlan = {
        keywordGroups: Array.from(groups.values()) as KeywordAudiencePlan['keywordGroups'],
        audienceSegments: plan.audienceSegments.map((a) => ({
          campaignName: a.campaignName,
          name: a.name,
          type: a.type as 'REMARKETING',
          source: a.source,
          description: a.description || undefined,
          keywords: a.keywords ? JSON.parse(a.keywords) : undefined,
          urls: a.urls ? JSON.parse(a.urls) : undefined,
        })),
        negativeKeywords: [],
        recommendations: [],
      }
    } else {
      keywordPlan = await generateKeywordAudiencePlan(mediaPlanJson, brief)
    }

    const blueprintJson = await generateCampaignBlueprint(mediaPlanJson, keywordPlan, brief)

    // Delete existing blueprints for this plan (delete all dependents first)
    const existingBlueprints = await prisma.campaignBlueprint.findMany({ where: { mediaPlanId: planId }, select: { id: true } })
    if (existingBlueprints.length > 0) {
      const ids = existingBlueprints.map((b) => b.id)
      await prisma.pushJob.deleteMany({ where: { campaignBlueprintId: { in: ids } } })
      await prisma.qACheck.deleteMany({ where: { campaignBlueprintId: { in: ids } } })
      await prisma.campaignBlueprint.deleteMany({ where: { mediaPlanId: planId } })
    }

    const blueprint = await prisma.campaignBlueprint.create({
      data: {
        mediaPlanId: planId,
        ...(userId ? { userId } : {}),
        blueprintJson: JSON.stringify(blueprintJson),
        status: 'draft',
      },
    })

    return NextResponse.json(blueprint, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Failed to generate blueprint' }, { status: 500 })
  }
}
