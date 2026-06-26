import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, MEDIA_ASSIST_CONTEXT } from '@/lib/ai/prompts'
import { CampaignMixItem } from '@/types'

interface AIAssistRequest {
  campaign: CampaignMixItem
  brief: {
    businessName?: string
    productService?: string
    objective?: string
    targetAudience?: string
    monthlyBudget?: number
    targetLocation?: string
  }
  currentKeywords?: string[]
}

interface AIAssistResponse {
  suggestions: {
    budgetRationale: string
    bidStrategyRationale: string
    targetCPA?: number
    maxCpc?: number
    targetRoas?: number
    keywordSuggestions?: string[]
    audienceSuggestions?: string[]
    optimizationTips: string[]
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: AIAssistRequest = await req.json()
    const { campaign, brief, currentKeywords = [] } = body

    const prompt = `You are an expert Google Ads media planner for the Thai market.
Analyze this campaign and provide optimization suggestions.

Campaign:
- Name: ${campaign.campaignName}
- Type: ${campaign.type}
- Monthly Budget: ${campaign.monthlyBudget} THB
- Bid Strategy: ${campaign.bidStrategy}
- Current CPA: ${campaign.targetCPA} THB
- Expected Clicks: ${campaign.expectedClicks}
- Expected Conversions: ${campaign.expectedConversions}

Business Context:
- Business: ${brief.businessName || 'N/A'}
- Product/Service: ${brief.productService || 'N/A'}
- Objective: ${brief.objective || 'N/A'}
- Target Audience: ${brief.targetAudience || 'N/A'}
- Location: ${brief.targetLocation || 'Thailand'}
- Total Budget: ${brief.monthlyBudget || 0} THB

Current Keywords: ${currentKeywords.slice(0, 20).join(', ') || 'None'}

Respond with JSON only:
{
  "suggestions": {
    "budgetRationale": "why this budget allocation is good/bad and how to improve",
    "bidStrategyRationale": "analysis of current bid strategy and recommendation",
    "targetCPA": <suggested target CPA in THB or null>,
    "maxCpc": <suggested max CPC in THB or null, only for MAXIMIZE_CLICKS/MANUAL_CPC>,
    "targetRoas": <suggested target ROAS as decimal e.g. 3.5, or null>,
    "keywordSuggestions": ["keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5"],
    "audienceSuggestions": ["audience segment 1", "audience segment 2"],
    "optimizationTips": ["tip 1", "tip 2", "tip 3"]
  }
}`

    const result = await safeCallAI<AIAssistResponse>(
      prompt,
      (v): AIAssistResponse | null => {
        if (typeof v !== 'object' || v === null || !('suggestions' in v)) return null
        const s = (v as AIAssistResponse).suggestions
        if (!s) return null
        // Require mandatory rationale fields — without these the suggestions are useless
        if (typeof s.budgetRationale !== 'string' || !s.budgetRationale.trim()) return null
        if (typeof s.bidStrategyRationale !== 'string' || !s.bidStrategyRationale.trim()) return null
        if (!Array.isArray(s.optimizationTips) || s.optimizationTips.length === 0) return null
        // Coerce numeric fields — AI sometimes returns strings
        if (s.targetCPA !== undefined && s.targetCPA !== null) s.targetCPA = Number(s.targetCPA)
        if (s.maxCpc !== undefined && s.maxCpc !== null) s.maxCpc = Number(s.maxCpc)
        if (s.targetRoas !== undefined && s.targetRoas !== null) s.targetRoas = Number(s.targetRoas)
        return v as AIAssistResponse
      },
      () => ({
        suggestions: {
          budgetRationale: 'งบประมาณดูสมเหตุสมผลสำหรับ campaign ประเภทนี้',
          bidStrategyRationale: `${campaign.bidStrategy} เหมาะสมกับ objective ${campaign.objective}`,
          targetCPA: campaign.targetCPA || undefined,
          optimizationTips: [
            'เพิ่ม negative keywords เพื่อลด wasted spend',
            'ตรวจสอบ Quality Score ของ keywords หลัก',
            'ทดสอบ ad schedule ตามช่วงเวลาที่ convert ดีที่สุด',
          ],
        },
      }),
      { tier: 'quality', maxTokens: 65536, systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${MEDIA_ASSIST_CONTEXT}` }
    )

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'AI assist failed' }, { status: 500 })
  }
}
