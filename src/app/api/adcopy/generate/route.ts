export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { generateCampaignBlueprint } from '@/lib/ai/campaign-blueprint'
import { z } from 'zod'
import type { MediaPlanJson, KeywordAudiencePlan } from '@/types'

const schema = z.object({
  campaignName:   z.string(),
  campaignType:   z.string(),
  objective:      z.string().default('LEADS'),
  dailyBudget:    z.number().default(500),
  businessName:   z.string().default(''),
  productService: z.string().default(''),
  targetAudience: z.string().default(''),
  websiteUrl:     z.string().default(''),
  language:       z.string().default('th'),
  promotion:      z.string().optional(),
  keywords:       z.array(z.string()).optional(),
  audiences:      z.array(z.object({ name: z.string(), type: z.string() })).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = schema.parse(body)

    const brief = {
      businessName:   input.businessName,
      productService: input.productService || input.businessName,
      objective:      input.objective,
      targetAudience: input.targetAudience,
      targetLocation: 'Thailand',
      language:       input.language,
      websiteUrl:     input.websiteUrl,
      promotion:      input.promotion ?? '',
    }

    const mediaPlan: MediaPlanJson = {
      campaignMix: [{
        campaignName:          input.campaignName,
        type:                  input.campaignType as MediaPlanJson['campaignMix'][0]['type'],
        objective:             input.objective,
        budgetPercent:         100,
        dailyBudget:           input.dailyBudget,
        monthlyBudget:         input.dailyBudget * 30,
        targetCPA:             0,
        expectedClicks:        0,
        expectedImpressions:   0,
        expectedConversions:   0,
        bidStrategy:           'Maximize Conversions',
        networks:              [input.campaignType],
        targeting:             { locations: ['Thailand'], languages: ['th'], devices: [] },
      }],
      forecast: {
        totalMonthlyBudget:          input.dailyBudget * 30,
        totalExpectedConversions:    0,
        blendedCPA:                  0,
        totalExpectedClicks:         0,
        totalExpectedImpressions:    0,
        blendedCTR:                  0,
        blendedCPC:                  0,
        roas:                        0,
      },
      strategicRationale: '',
      recommendations:    [],
    }

    const kwGroups = (input.keywords ?? []).length > 0 ? [{
      campaignName: input.campaignName,
      adGroupName:  'Ad Group 1',
      keywords:     (input.keywords ?? []).map(k => ({ keyword: k, matchType: 'PHRASE' as const, intent: 'high' as const })),
    }] : []

    const audSegments = (input.audiences ?? []).map(a => ({
      campaignName: input.campaignName,
      name:         a.name,
      type:         a.type as KeywordAudiencePlan['audienceSegments'][0]['type'],
      source:       'manual',
      description:  '',
    }))

    const kwPlan: KeywordAudiencePlan = {
      keywordGroups:    kwGroups,
      audienceSegments: audSegments,
      negativeKeywords:  [],
      recommendations:   [],
    }

    const blueprintJson = await generateCampaignBlueprint(mediaPlan, kwPlan, brief, '')

    // Return the matching campaign blueprint item
    const campaign = blueprintJson.campaigns?.[0]
    if (!campaign) {
      return NextResponse.json({ error: 'No campaign generated' }, { status: 500 })
    }

    return NextResponse.json({ blueprint: campaign })
  } catch (err) {
    console.error('adcopy/generate error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
