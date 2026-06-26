import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateMediaPlan } from '@/lib/ai/media-plan'
import { generateKeywordAudiencePlan } from '@/lib/ai/keyword-audience'
import { checkForDuplicates } from '@/lib/checks/duplicate-checker'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

const schema = z.object({
  businessName:   z.string().min(2),
  websiteUrl:     z.string().url(),
  productService: z.string().min(10),
  objective:      z.enum(['LEADS', 'SALES', 'AWARENESS', 'TRAFFIC', 'APP_INSTALLS']),
  monthlyBudget:  z.number().min(1),
  currency:       z.string().default('THB'),
  targetLocation: z.string().min(2),
  language:       z.string().default('th'),
  targetAudience: z.string().min(10),
  conversionGoal: z.string().min(5),
  promotion:      z.string().optional(),
  brandTone:      z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const body   = await req.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const input = parsed.data

    // Generate a lightweight media plan + keyword plan to know what campaign names
    // and keywords are about to be created — same logic as the real pipeline
    const briefData = {
      businessName:   input.businessName,
      websiteUrl:     input.websiteUrl,
      productService: input.productService,
      objective:      input.objective,
      monthlyBudget:  input.monthlyBudget,
      currency:       input.currency,
      targetLocation: input.targetLocation,
      language:       input.language,
      targetAudience: input.targetAudience,
      conversionGoal: input.conversionGoal,
      brandTone:      input.brandTone ?? '',
      promotion:      input.promotion ?? '',
    }

    const [mediaPlan, keywordPlan] = await Promise.all([
      generateMediaPlan(briefData),
      generateKeywordAudiencePlan(
        await generateMediaPlan(briefData), // lightweight second call
        briefData
      ),
    ])

    const proposedCampaigns = mediaPlan.campaignMix.map((c) => c.campaignName)
    const proposedKeywords  = (keywordPlan.keywordGroups ?? [])
      .flatMap((g) => g.keywords ?? [])
      .map((k) => k.keyword)

    const result = await checkForDuplicates(
      input.businessName,
      input.websiteUrl,
      proposedCampaigns,
      proposedKeywords,
      userId
    )

    return NextResponse.json({
      ...result,
      proposedCampaigns,
      proposedKeywordsCount: proposedKeywords.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
