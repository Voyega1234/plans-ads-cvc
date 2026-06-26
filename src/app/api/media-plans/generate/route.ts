export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateMediaPlan } from '@/lib/ai/media-plan'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

const schema = z.object({
  briefId: z.string().min(1),
  selectedKeywords: z.array(z.object({
    keyword:   z.string(),
    matchType: z.string(),
    group:     z.string(),
    intent:    z.string().optional(),
    avgMonthlySearches: z.number().optional(),
    competition: z.string().optional(),
    cpcEst:    z.number().optional(),
  })).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const userId = skipAuth ? null : getUserId(session)
    const body = await req.json()
    const { briefId, selectedKeywords } = schema.parse(body)

    const brief = await prisma.brief.findFirst({
      where: skipAuth ? { id: briefId } : { id: briefId, userId },
    })
    if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

    const planJson = await generateMediaPlan({
      businessName: brief.businessName,
      websiteUrl: brief.websiteUrl,
      productService: brief.productService,
      objective: brief.objective,
      monthlyBudget: brief.monthlyBudget,
      currency: brief.currency,
      targetLocation: brief.targetLocation,
      language: brief.language,
      targetAudience: brief.targetAudience,
      conversionGoal: brief.conversionGoal,
      promotion: brief.promotion,
      brandTone: brief.brandTone,
      selectedKeywords: selectedKeywords ?? [],
    })

    const mediaPlan = await prisma.mediaPlan.create({
      data: {
        briefId: brief.id,
        ...(userId ? { userId } : {}),
        title: `Media Plan - ${brief.businessName} - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        objective: brief.objective,
        monthlyBudget: brief.monthlyBudget,
        currency: brief.currency,
        planJson: JSON.stringify(planJson),
        status: 'draft',
      },
    })

    return NextResponse.json(mediaPlan, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Failed to generate media plan' }, { status: 500 })
  }
}
