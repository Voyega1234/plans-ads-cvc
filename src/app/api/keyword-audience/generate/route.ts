export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateKeywordAudiencePlan } from '@/lib/ai/keyword-audience'
import { MediaPlanJson } from '@/types'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

const schema = z.object({ planId: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const body = await req.json()
    const { planId } = schema.parse(body)

    const plan = await prisma.mediaPlan.findFirst({
      where: { id: planId, userId },
      include: { brief: true },
    })
    if (!plan) return NextResponse.json({ error: 'Media plan not found' }, { status: 404 })

    const mediaPlanJson: MediaPlanJson = JSON.parse(plan.planJson)
    const brief = {
      businessName: plan.brief.businessName,
      websiteUrl: plan.brief.websiteUrl,
      productService: plan.brief.productService,
      objective: plan.brief.objective,
      monthlyBudget: plan.brief.monthlyBudget,
      targetLocation: plan.brief.targetLocation,
      language: plan.brief.language,
      targetAudience: plan.brief.targetAudience,
      conversionGoal: plan.brief.conversionGoal,
    }

    const kwPlan = await generateKeywordAudiencePlan(mediaPlanJson, brief)

    // Save keyword ideas
    await prisma.keywordIdea.deleteMany({ where: { mediaPlanId: planId } })
    for (const group of kwPlan.keywordGroups) {
      for (const kw of group.keywords) {
        await prisma.keywordIdea.create({
          data: {
            mediaPlanId: planId,
            campaignName: group.campaignName,
            adGroupName: group.adGroupName,
            keyword: kw.keyword,
            matchType: kw.matchType,
            intent: kw.intent,
            avgMonthlySearches: kw.avgMonthlySearches,
            competition: kw.competition,
            lowTopOfPageBid: kw.suggestedBid,
            highTopOfPageBid: kw.suggestedBid ? kw.suggestedBid * 1.5 : null,
          },
        })
      }
    }

    // Save audience segments
    await prisma.audienceSegment.deleteMany({ where: { mediaPlanId: planId } })
    for (const seg of kwPlan.audienceSegments) {
      await prisma.audienceSegment.create({
        data: {
          mediaPlanId: planId,
          campaignName: seg.campaignName,
          name: seg.name,
          type: seg.type,
          source: seg.source,
          description: seg.description,
          keywords: seg.keywords ? JSON.stringify(seg.keywords) : null,
          urls: seg.urls ? JSON.stringify(seg.urls) : null,
        },
      })
    }

    return NextResponse.json({ success: true, keywordAudiencePlan: kwPlan })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Failed to generate keyword audience plan' }, { status: 500 })
  }
}
