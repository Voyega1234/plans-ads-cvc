export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { generateKeywordAudiencePlan } from '@/lib/ai/keyword-audience'
import { z } from 'zod'

const schema = z.object({
  businessName:   z.string().min(1),
  productService: z.string().optional().default(''),
  objective:      z.string().optional().default('LEADS'),
  targetAudience: z.string().optional().default(''),
  campaignType:   z.string(),
  campaignName:   z.string().optional().default(''),
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
      language:       'th',
    }

    // Build a minimal single-campaign media plan for research
    const campaignName = input.campaignName || `CVC - ${input.campaignType} - ${input.businessName}`
    const mediaPlan = {
      title: campaignName,
      objective: input.objective,
      totalBudget: 15000,
      currency: 'THB',
      campaignMix: [{
        campaignName,
        type: input.campaignType,
        objective: input.objective,
        recommendedBudgetPct: 100,
        dailyBudget: 500,
        monthlyBudget: 15000,
        channels: [input.campaignType],
        bidStrategy: 'Maximize Conversions',
        targeting: {},
        forecast: { impressions: 0, clicks: 0, ctr: 0, cpc: 0, cost: 0, conversions: 0, cpa: 0 },
      }],
    }

    const plan = await generateKeywordAudiencePlan(mediaPlan as never, brief)

    const isSearch = ['SEARCH', 'SHOPPING'].includes(input.campaignType)

    if (isSearch) {
      const keywords = (plan.keywordGroups ?? []).flatMap(g =>
        (g.keywords ?? []).map(k => ({
          keyword: k.keyword,
          matchType: k.matchType ?? 'PHRASE',
          intent: k.intent,
          group: g.adGroupName,
        }))
      )
      return NextResponse.json({ keywords, audiences: [] })
    } else {
      const audiences = (plan.audienceSegments ?? []).map(a => ({
        name: a.name,
        type: a.type,
        description: a.description ?? '',
      }))
      return NextResponse.json({ keywords: [], audiences })
    }
  } catch (err) {
    console.error('templates/research error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
