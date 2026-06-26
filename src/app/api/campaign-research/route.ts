import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { z } from 'zod'
import type { PlannerKeyword } from '@/app/api/keyword-research/planner/route'
import type { ReachData } from '@/app/api/reach-planner/route'

const schema = z.object({
  campaignId:   z.string().min(1),
  campaignType: z.string().min(1),
  theme:        z.string().optional(),
  briefId:      z.string().min(1),
  mediaPlanId:  z.string().optional(),
  customerId:   z.string().optional(),
})

export interface CampaignForecast {
  impressions: number
  clicks:      number
  ctr:         number
  cpc:         number
  cost:        number
}

export interface CampaignResearchResult {
  keywords?:  PlannerKeyword[]
  reachData?: ReachData
  forecast:   CampaignForecast
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildSeedKeywords(brief: {
  businessName: string
  productService: string
  targetAudience: string
  objective: string
  theme?: string
}): string[] {
  const base: string[] = [
    brief.businessName,
    ...brief.productService.split(/[,/\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 3),
  ]

  const themeKws: Record<string, string[]> = {
    Generic:    ['บริการ', 'ราคา', 'ที่ไหน'],
    Brand:      [brief.businessName, `${brief.businessName} รีวิว`],
    Competitor: ['เปรียบเทียบ', 'ดีกว่า', 'ทางเลือก'],
    Product:    ['ซื้อ', 'ราคา', 'โปรโมชั่น'],
    Service:    ['บริการ', 'ปรึกษา', 'ฟรี'],
  }

  const extraKws = brief.theme ? (themeKws[brief.theme] ?? []) : []
  return [...base, ...extraKws].slice(0, 10)
}

function forecastFromKeywords(keywords: PlannerKeyword[], monthlyBudget: number): CampaignForecast {
  const ctr = 0.05
  const totalSearches  = keywords.reduce((s, k) => s + k.avgMonthlySearches, 0)
  const avgCpc         = keywords.length > 0
    ? keywords.reduce((s, k) => s + k.suggestedCpc, 0) / keywords.length
    : 20
  const impressions = totalSearches
  const clicks      = Math.round(impressions * ctr)
  const cost        = Math.min(clicks * avgCpc, monthlyBudget)

  return { impressions, clicks, ctr, cpc: Math.round(avgCpc), cost: Math.round(cost) }
}

function forecastFromReach(reach: ReachData, campaignType: string, monthlyBudget: number): CampaignForecast {
  const ctr        = campaignType === 'DISPLAY' ? 0.008 : 0.005   // 0.8% / 0.5%
  const impressions = reach.weeklyImpressions * 4                   // monthly
  const clicks      = Math.round(impressions * ctr)
  const cost        = monthlyBudget
  const cpc         = clicks > 0 ? Math.round(cost / clicks) : 0

  return { impressions, clicks, ctr, cpc, cost }
}

// ── internal fetch helpers ────────────────────────────────────────────────────

async function callKeywordPlanner(
  keywords: string[],
  customerId: string | undefined,
  origin: string,
): Promise<PlannerKeyword[]> {
  const res = await fetch(`${origin}/api/keyword-research/planner`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ keywords, customerId }),
  })
  if (!res.ok) return []
  const data = await res.json() as { results?: PlannerKeyword[] }
  return data.results ?? []
}

async function callReachPlanner(
  campaignType: string,
  monthlyBudget: number,
  customerId: string | undefined,
  origin: string,
): Promise<ReachData | undefined> {
  // Only supported types
  if (!['DISPLAY', 'VIDEO', 'YOUTUBE'].includes(campaignType)) return undefined

  const res = await fetch(`${origin}/api/reach-planner`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      campaignType,
      monthlyBudget,
      customerId: customerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '',
    }),
  })
  if (!res.ok) return undefined
  const data = await res.json() as ReachData & { source?: string }
  return data
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session  = skipAuth ? null : await auth()
    const userId   = skipAuth ? null : getUserId(session)

    const body  = await req.json()
    const input = schema.parse(body)

    // Fetch brief for context
    const brief = await prisma.brief.findFirst({
      where: skipAuth
        ? { id: input.briefId }
        : { id: input.briefId, userId: userId ?? undefined },
    })
    if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

    const origin      = req.nextUrl.origin
    const type        = input.campaignType.toUpperCase()
    const isSearch    = type === 'SEARCH'
    const isDisplay   = ['DISPLAY', 'VIDEO', 'YOUTUBE', 'DEMAND_GEN'].includes(type)
    const isPMax      = type === 'PERFORMANCE_MAX'

    const seedKeywords = buildSeedKeywords({
      businessName:   brief.businessName,
      productService: brief.productService,
      targetAudience: brief.targetAudience,
      objective:      brief.objective,
      theme:          input.theme,
    })

    let keywords: PlannerKeyword[] | undefined
    let reachData: ReachData | undefined

    if (isSearch || isPMax) {
      keywords = await callKeywordPlanner(seedKeywords, input.customerId, origin)
    }

    if ((isDisplay || isPMax) && ['DISPLAY', 'VIDEO', 'YOUTUBE'].includes(isPMax ? 'DISPLAY' : type)) {
      reachData = await callReachPlanner(
        isPMax ? 'DISPLAY' : type,
        brief.monthlyBudget,
        input.customerId,
        origin,
      )
    }

    // Build forecast
    let forecast: CampaignForecast
    if (isSearch && keywords && keywords.length > 0) {
      forecast = forecastFromKeywords(keywords, brief.monthlyBudget)
    } else if (reachData) {
      forecast = forecastFromReach(reachData, type, brief.monthlyBudget)
    } else if (isPMax) {
      // PMax: blend search + display estimates
      const searchForecast = keywords && keywords.length > 0
        ? forecastFromKeywords(keywords, brief.monthlyBudget * 0.5)
        : { impressions: 0, clicks: 0, ctr: 0.05, cpc: 20, cost: 0 }
      const displayForecast: CampaignForecast = {
        impressions: brief.monthlyBudget * 40 / 4,  // rough weekly * 4
        clicks:      Math.round(brief.monthlyBudget * 40 / 4 * 0.008),
        ctr:         0.008,
        cpc:         20,
        cost:        brief.monthlyBudget * 0.5,
      }
      forecast = {
        impressions: searchForecast.impressions + displayForecast.impressions,
        clicks:      searchForecast.clicks + displayForecast.clicks,
        ctr:         0.02,
        cpc:         Math.round((searchForecast.cost + displayForecast.cost) / Math.max(1, searchForecast.clicks + displayForecast.clicks)),
        cost:        brief.monthlyBudget,
      }
    } else {
      // Fallback for DEMAND_GEN, SHOPPING etc.
      const ctr = type === 'SHOPPING' ? 0.02 : 0.005
      const impressions = brief.monthlyBudget * 30
      const clicks      = Math.round(impressions * ctr)
      const cpc         = clicks > 0 ? Math.round(brief.monthlyBudget / clicks) : 20
      forecast = { impressions, clicks, ctr, cpc, cost: brief.monthlyBudget }
    }

    const result: CampaignResearchResult = { forecast }
    if (keywords && keywords.length > 0) result.keywords = keywords
    if (reachData) result.reachData = reachData

    return NextResponse.json(result)
  } catch (err) {
    console.error('[campaign-research]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
