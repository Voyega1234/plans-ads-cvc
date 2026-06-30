export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import type { PlannerKeyword } from '@/app/api/keyword-research/planner/route'
import { EXECUTIVE_GROWTH_SKILL, KEYWORD_RESEARCH_CONTEXT } from '@/lib/ai/prompts'
import { logAiCost } from '@/lib/ai/provider'
import { generateVertexText } from '@/lib/ai/vertex'

const schema = z.object({
  businessName: z.string().min(1),
  productService: z.string().min(1),
  location: z.string().default('ทั่วประเทศไทย'),
  objective: z.string().default('leads'),
  language: z.string().default('th'),
  competitors: z.string().optional(),
  customerId: z.string().optional(),
})

export interface ResearchKeyword {
  keyword: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
  group: 'brand' | 'product' | 'service' | 'generic' | 'competitor'
  intent: 'high' | 'medium' | 'low'
  volume: 'สูง' | 'กลาง' | 'ต่ำ'
  competition: 'LOW' | 'MEDIUM' | 'HIGH'
  cpcEst: number
  selected: boolean
  avgMonthlySearches?: number
  lowTopBid?: number
  highTopBid?: number
  competitionIndex?: number
  dataSource?: 'google_ads' | 'ai_estimate'
  lowVolumeBroad?: boolean // true = auto-upgraded to BROAD due to low volume
}

export interface KeywordAnalysis {
  summary: string
  topKeywords: string[]
  budgetAdvice: string
  matchTypeAdvice: string
  negativeAdvice: string
  strategyTips: string[]
}

// Pull real volume + CPC from Keyword Planner — send all keywords as one seed batch
// Planner returns related ideas; we keep exact matches first, then best-match fallback
async function fetchFromKeywordPlanner(
  keywords: string[],
  _accessToken: string,
  customerId: string,
  _location: string
): Promise<Map<string, PlannerKeyword>> {
  const plannerMap = new Map<string, PlannerKeyword>()

  // Always use MCC token — session token cannot use Keyword Planner with login-customer-id
  const { getGoogleAdsAccessToken } = await import('@/lib/google-ads/auth')
  let mccToken: string
  try {
    mccToken = await getGoogleAdsAccessToken()
  } catch {
    console.error('[kw-generate] no MCC token for planner')
    return plannerMap
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
  const cid = customerId.replace(/-/g, '')
  if (!devToken || !cid) return plannerMap

  // Send all non-neg keywords as one batch seed (max 20 per request)
  for (let i = 0; i < keywords.length; i += 20) {
    const chunk = keywords.slice(i, i + 20)
    try {
      const body = {
        keywordSeed: { keywords: chunk },
        geoTargetConstants: ['geoTargetConstants/2764'], // Thailand national
        language: 'languageConstants/1000', // Thai
        keywordPlanNetwork: 'GOOGLE_SEARCH',
        includeAdultKeywords: false,
        pageSize: 200,
      }
      const res = await fetch(
        `https://googleads.googleapis.com/v21/customers/${cid}:generateKeywordIdeas`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mccToken}`,
            'developer-token': devToken,
            'login-customer-id': loginCustId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )
      const raw = await res.text()
      if (!res.ok) {
        console.error('[kw-generate] planner', res.status, raw.slice(0, 300))
        continue
      }
      const data = JSON.parse(raw) as {
        results?: Array<{
          text?: string
          keywordIdeaMetrics?: {
            avgMonthlySearches?: string
            monthlySearchVolumes?: Array<{ monthlySearches?: string }>
            competition?: string
            competitionIndex?: string
            lowTopOfPageBidMicros?: string
            highTopOfPageBidMicros?: string
          }
        }>
      }

      for (const r of data.results ?? []) {
        if (!r.text) continue
        const m = r.keywordIdeaMetrics ?? {}
        const low = Number(m.lowTopOfPageBidMicros ?? 0) / 1_000_000
        const high = Number(m.highTopOfPageBidMicros ?? 0) / 1_000_000

        // v21: prefer monthlySearchVolumes array, fall back to avgMonthlySearches
        let avg = Number(m.avgMonthlySearches ?? 0)
        if (!avg && m.monthlySearchVolumes?.length) {
          const total = m.monthlySearchVolumes.reduce(
            (s, v) => s + Number(v.monthlySearches ?? 0),
            0
          )
          avg = Math.round(total / m.monthlySearchVolumes.length)
        }

        const COMP_MAP: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'> = {
          LOW: 'LOW',
          MEDIUM: 'MEDIUM',
          HIGH: 'HIGH',
        }
        const entry: PlannerKeyword = {
          keyword: r.text,
          avgMonthlySearches: avg,
          competition: COMP_MAP[m.competition ?? ''] ?? 'UNSPECIFIED',
          competitionIndex: Number(m.competitionIndex ?? 0),
          lowTopBidMicros: Math.round(low),
          highTopBidMicros: Math.round(high),
          suggestedCpc: Math.round((low + high) / 2),
        }
        plannerMap.set(r.text.toLowerCase(), entry)
      }
    } catch (e) {
      console.error('[kw-generate] planner chunk error:', e)
    }
  }

  console.log(
    `[kw-generate] planner returned ${plannerMap.size} keyword ideas for ${keywords.length} seeds`
  )
  console.log('[kw-generate] planner keys (all):', Array.from(plannerMap.keys()))
  return plannerMap
}

// Thai location words that appear in seeds but not in Planner results
const THAI_LOCATION_WORDS = [
  'กรุงเทพ',
  'กรุงเทพมหานคร',
  'กทม',
  'เชียงใหม่',
  'ภูเก็ต',
  'พัทยา',
  'ชลบุรี',
  'นนทบุรี',
  'ปทุมธานี',
  'สมุทรปราการ',
  'ทั่วไทย',
  'ทั่วประเทศ',
  'ประเทศไทย',
  'ไทย',
  'bangkok',
  'thailand',
]

// Normalize Thai keyword: lowercase, remove location words, normalize common spelling variants
function normalizeThai(kw: string): string {
  let s = kw.toLowerCase().trim()
  // Google Keyword Planner inserts spaces between Thai syllables — strip all spaces for comparison
  s = s.replace(/\s+/g, '')
  // Remove location modifiers
  for (const loc of THAI_LOCATION_WORDS) {
    s = s.replace(new RegExp(loc.replace(/\s+/g, ''), 'g'), '')
  }
  // Normalize common Thai spelling variants (no-space form)
  s = s
    .replace(/โซล่าเซลล์/g, 'โซลาร์เซลล์')
    .replace(/โซล่าเซล/g, 'โซลาร์เซลล์')
    .replace(/โซลาเซล/g, 'โซลาร์เซลล์')
    .replace(/โซล่า/g, 'โซลาร์')
    .replace(/แผงโซลาร์เซลล์/g, 'โซลาร์เซลล์')
    .replace(/แผงโซลาเซล/g, 'โซลาร์เซลล์')
    .replace(/แผงโซลาร์(?!เซลล์)/g, 'โซลาร์เซลล์')
    .replace(/solarcell/g, 'solarcell')
    .replace(/solarrooftop/g, 'solarrooftop')
  return s.trim()
}

// Score how well a planner key matches our seed keyword (higher = better match)
function matchScore(seed: string, plannerKey: string): number {
  const ns = normalizeThai(seed)
  const np = normalizeThai(plannerKey)
  if (ns === np) return 100
  if (np.includes(ns) || ns.includes(np)) return 80
  // Partial containment with length ratio bonus
  const longer = Math.max(ns.length, np.length)
  const shorter = Math.min(ns.length, np.length)
  if (longer > 0 && shorter / longer >= 0.6) return 60
  return 0
}

// Find best planner match using normalized Thai text + token overlap
function findPlannerMatch(
  keyword: string,
  plannerMap: Map<string, PlannerKeyword>
): PlannerKeyword | undefined {
  const kl = keyword.toLowerCase().trim()

  // 1. Exact match
  if (plannerMap.has(kl)) return plannerMap.get(kl)

  // 2. Normalized exact match
  const norm = normalizeThai(kl)
  for (const [key, val] of Array.from(plannerMap.entries())) {
    if (normalizeThai(key) === norm) return val
  }

  // 3. Substring match (original)
  for (const [key, val] of Array.from(plannerMap.entries())) {
    if (key.includes(kl) || kl.includes(key)) return val
  }

  // 4. Best token overlap (threshold ≥ 50 score)
  let bestScore = 49
  let bestVal: PlannerKeyword | undefined
  for (const [key, val] of Array.from(plannerMap.entries())) {
    const s = matchScore(kl, key)
    if (s > bestScore) {
      bestScore = s
      bestVal = val
    }
  }
  if (bestVal) {
    console.log(`[kw-generate] fuzzy match: "${kl}" → score ${bestScore}`)
  }
  return bestVal
}

// Build keyword list using AI — AI generates structure, Planner provides real data
async function buildKeywordsWithAI(
  businessName: string,
  productService: string,
  location: string,
  objective: string,
  competitors: string
): Promise<{ keywords: ResearchKeyword[]; negativeKeywords: string[] }> {
  const competitorSection = competitors
    ? `- คู่แข่ง (ที่ user ระบุ): ${competitors}`
    : `- คู่แข่ง: ไม่ได้ระบุ — ให้คุณค้นหาคู่แข่งหลักในอุตสาหกรรม "${productService}" ในประเทศไทยเอง 3-5 ราย แล้วสร้าง competitor keywords`

  const prompt = `คุณเป็น Google Ads Keyword Research Expert + Media Buyer สำหรับตลาดไทย

ทำ keyword research สำหรับ:
- ธุรกิจ: ${businessName}
- สินค้า/บริการ: ${productService}
- พื้นที่: ${location}
- Objective: ${objective}
${competitorSection}

วิเคราะห์ธุรกิจนี้แล้วสร้าง **Seed Keywords 15-20 คำ** ที่หลากหลายและ specific ที่สุด เพื่อนำไปขยายใน Google Ads Keyword Planner ต่อ:

กลุ่ม keywords (เลือกเฉพาะกลุ่มที่เกี่ยวข้อง):
1. brand — ชื่อแบรนด์และ variations (2-3 kw)
2. service — บริการหลัก รวม intent ซื้อ/จอง/ราคา/ใกล้ฉัน (6-8 kw)
3. generic — คำกว้าง broad reach (2-3 kw)
4. competitor — ชื่อแบรนด์คู่แข่ง ${!competitors ? '— ให้หาเองจาก market knowledge' : ''} (2-3 kw)

กฎ matchType:
- ทุก keyword ใช้ PHRASE เป็น default
- ห้ามใช้ EXACT ทุกกรณี

Negative Keywords — สร้าง 8-12 คำที่ไม่ควรโฆษณา (DIY, ฟรี, งาน/รับสมัคร, informational เกินไป)

ตอบ JSON เท่านั้น:
{
  "keywords":[{"keyword":"...","matchType":"PHRASE","group":"service","intent":"high","selected":true}],
  "negativeKeywords":["คำที่ไม่ต้องการ 1"]
}`

  // Google Search grounding: lets Gemini look up real competitors + search trends for this industry
  const genResult = await generateVertexText({
    model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash',
    system: `${EXECUTIVE_GROWTH_SKILL}\n\n${KEYWORD_RESEARCH_CONTEXT}`,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 65536,
    useGrounding: true,
  })
  const inp = genResult.usage.inputTokens ?? 0
  const out = genResult.usage.outputTokens ?? 0
  if (inp > 0 || out > 0) {
    void logAiCost({
      route: '/api/keyword-research/generate',
      model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash',
      inputTokens: inp,
      outputTokens: out,
      estimatedUSD: (inp / 1e6) * 0.075 + (out / 1e6) * 0.3,
    })
  }
  const text = genResult.text
  // Extract JSON — try full match first, then try to find keywords array directly
  let parsed: { keywords?: unknown[]; negativeKeywords?: unknown[] } | null = null
  const fullMatch = text.match(/\{[\s\S]*\}/)
  if (fullMatch) {
    try {
      parsed = JSON.parse(fullMatch[0]) as { keywords?: unknown[]; negativeKeywords?: unknown[] }
    } catch {
      /* try repair below */
    }
  }
  // If full JSON failed, extract just the keywords array
  if (!parsed?.keywords) {
    const arrMatch = text.match(/"keywords"\s*:\s*(\[[\s\S]*?\])\s*[,}]/)
    if (arrMatch) {
      try {
        parsed = { keywords: JSON.parse(arrMatch[1]) as unknown[] }
      } catch {
        /* ignore */
      }
    }
  }
  if (!parsed?.keywords || !Array.isArray(parsed.keywords)) {
    console.error('[kw-generate] AI raw response:', text.slice(0, 500))
    throw new Error('AI did not return valid JSON keywords array')
  }

  const VALID_GROUPS = ['brand', 'product', 'service', 'generic', 'competitor']
  const keywords = parsed.keywords
    .map((k: unknown) => {
      const kk = k as Record<string, unknown>
      // Remap legacy groups to correct ones
      const rawGroup = String(kk.group ?? '')
      const group =
        rawGroup === 'high_intent' || rawGroup === 'problem_intent'
          ? 'service'
          : VALID_GROUPS.includes(rawGroup)
            ? rawGroup
            : 'service'
      return {
        keyword: String(kk.keyword ?? ''),
        matchType: (['PHRASE', 'BROAD'].includes(String(kk.matchType))
          ? kk.matchType
          : 'PHRASE') as ResearchKeyword['matchType'],
        group: group as ResearchKeyword['group'],
        intent: (['high', 'medium', 'low'].includes(String(kk.intent))
          ? kk.intent
          : 'medium') as ResearchKeyword['intent'],
        volume: 'กลาง' as const,
        competition: 'MEDIUM' as const,
        cpcEst: 0,
        selected: Boolean(kk.selected ?? true),
      }
    })
    .filter((k) => k.keyword)

  const negativeKeywords = Array.isArray(parsed.negativeKeywords)
    ? parsed.negativeKeywords.map((n) => String(n)).filter(Boolean)
    : []

  return { keywords, negativeKeywords }
}

function volLabel(n: number): ResearchKeyword['volume'] {
  return n >= 1000 ? 'สูง' : n >= 200 ? 'กลาง' : 'ต่ำ'
}

const COMP_MAP: Record<string, ResearchKeyword['competition']> = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
}

// Score keyword quality for ranking — higher = better candidate to show user
function scoreKeyword(kw: ResearchKeyword): number {
  const vol = kw.avgMonthlySearches ?? 0
  const volScore = vol > 0 ? Math.min(60, Math.round(Math.log10(vol + 1) * 20)) : 0
  const compScore = kw.competition === 'LOW' ? 20 : kw.competition === 'MEDIUM' ? 12 : 5
  const intentScore = kw.intent === 'high' ? 10 : kw.intent === 'medium' ? 5 : 2
  const sourceScore = kw.dataSource === 'google_ads' ? 10 : 0
  return volScore + compScore + intentScore + sourceScore
}

export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const body = await req.json()
    const input = schema.parse(body)
    const {
      businessName,
      productService,
      location,
      objective,
      competitors,
      customerId: inputCustomerId,
    } = input

    const accessToken = (session as unknown as Record<string, unknown>)?.accessToken as
      | string
      | undefined
    const customerId = inputCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

    if (!skipAuth && !accessToken) {
      return NextResponse.json(
        { error: 'ต้องเข้าสู่ระบบก่อนใช้ Keyword Research' },
        { status: 401 }
      )
    }
    if (!customerId) {
      return NextResponse.json({ error: 'ไม่พบ Google Ads Customer ID' }, { status: 400 })
    }

    // Step 1: AI generates keyword list structure + negative keywords
    const { keywords: aiKeywords, negativeKeywords } = await buildKeywordsWithAI(
      businessName,
      productService,
      location,
      objective,
      competitors ?? ''
    )

    // Step 2: Fetch REAL volume + CPC from Google Ads Keyword Planner
    // Also send normalized versions (stripped of location words) as additional seeds
    const nonNegKeywords = aiKeywords.map((k) => k.keyword)
    const normalizedSeeds = Array.from(
      new Set(
        nonNegKeywords
          .map((k) => {
            const norm = normalizeThai(k)
            return norm !== k.toLowerCase().trim() ? norm : null
          })
          .filter((k): k is string => !!k && k.length >= 3)
      )
    )
    const allSeeds = Array.from(new Set([...nonNegKeywords, ...normalizedSeeds]))
    const plannerMap = await fetchFromKeywordPlanner(
      allSeeds,
      accessToken ?? '',
      customerId,
      location
    )

    // Step 3: Merge Planner data into keywords
    const enriched: ResearchKeyword[] = aiKeywords.map((kw) => {
      const real = findPlannerMatch(kw.keyword, plannerMap)
      if (!real) {
        console.log(`[kw-generate] no planner match for: "${kw.keyword}"`)
        // No planner data = unknown volume → use BROAD to maximise reach
        return {
          ...kw,
          matchType: 'BROAD' as const,
          lowVolumeBroad: true,
          dataSource: 'ai_estimate' as const,
        }
      }

      const vol = real.avgMonthlySearches
      // Default PHRASE for all; downgrade to BROAD only when volume < 100 (not enough data for PHRASE to work well)
      let matchType: ResearchKeyword['matchType'] = 'PHRASE'
      if (vol < 100) {
        matchType = 'BROAD'
      }

      return {
        ...kw,
        matchType,
        avgMonthlySearches: vol,
        lowTopBid: real.lowTopBidMicros,
        highTopBid: real.highTopBidMicros,
        competitionIndex: real.competitionIndex,
        competition: COMP_MAP[real.competition] ?? kw.competition,
        volume: volLabel(vol),
        cpcEst: real.suggestedCpc > 0 ? real.suggestedCpc : kw.cpcEst,
        dataSource: 'google_ads' as const,
        lowVolumeBroad: kw.group !== 'brand' && vol < 100,
      }
    })

    // Sort by score descending, then limit to top 20 results
    const MAX_KEYWORDS = 20
    const PRE_SELECT = 10 // auto-select top 10; rest unchecked

    const scored = enriched.map((kw) => ({ kw, score: scoreKeyword(kw) }))
    scored.sort((a, b) => b.score - a.score)

    const finalKeywords = scored.slice(0, MAX_KEYWORDS).map(({ kw }, idx) => ({
      ...kw,
      selected: idx < PRE_SELECT,
    }))

    const broadCount = finalKeywords.filter((k) => k.matchType === 'BROAD').length
    const realCount = finalKeywords.filter((k) => k.dataSource === 'google_ads').length

    return NextResponse.json({
      keywords: finalKeywords,
      negativeKeywords,
      analysis: null,
      input,
      meta: {
        realCount,
        broadCount,
        total: finalKeywords.length,
        source: realCount > 0 ? 'google_ads_keyword_planner' : 'ai_only',
        plannerIds: plannerMap.size,
      },
    })
  } catch (err) {
    console.error('[kw-generate]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
