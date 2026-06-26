import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { ResearchKeyword as BaseResearchKeyword, KeywordAnalysis } from '@/app/api/keyword-research/generate/route'
import { EXECUTIVE_GROWTH_SKILL, KEYWORD_ANALYSIS_CONTEXT } from '@/lib/ai/prompts'
import { logAiCost } from '@/lib/ai/provider'
// Analyze route accepts keywords that may include 'negative' group from standalone planner
type ResearchKeyword = Omit<BaseResearchKeyword, 'group'> & { group: BaseResearchKeyword['group'] | 'negative' }

export interface MarketAnalysis extends KeywordAnalysis {
  marketOverview:    string          // ภาพรวมตลาดและ demand (paragraph)
  marketSignals:     MarketSignal[]  // structured signals
  competitors:       CompetitorInfo[]
  doList:            string[]        // ควรทำ
  dontList:          string[]        // ไม่ควรทำ
  opportunityScore:  number          // 1-10
  difficultyScore:   number          // 1-10
  marketTrend:       'growing' | 'stable' | 'declining' | 'seasonal'
  buyerJourney:      string          // ลักษณะ buyer journey ของอุตสาหกรรมนี้
  uniqueAngle:       string          // มุมที่ธุรกิจนี้ควรใช้สู้คู่แข่ง
}

export interface MarketSignal {
  icon:    string   // emoji
  label:   string   // ชื่อ signal
  value:   string   // ค่า/สถานะ
  detail:  string   // อธิบาย
  color:   'green' | 'yellow' | 'red' | 'blue' | 'purple'
}

export interface CompetitorInfo {
  name:         string
  type:         'direct' | 'indirect'
  strength:     string   // จุดแข็ง
  weakness?:    string
  bidStrategy?: string   // วิธี bid ที่ประมาณ
}

export async function POST(req: NextRequest) {
  await auth()

  const { keywords, businessName, productService, location, objective, competitors } = await req.json() as {
    keywords:       ResearchKeyword[]
    businessName:   string
    productService: string
    location:       string
    objective:      string
    competitors?:   string
  }

  if (!keywords?.length) {
    return NextResponse.json({ error: 'ต้องระบุ keywords' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(buildFallbackAnalysis(keywords, businessName, productService, competitors), { status: 200 })
  }

  const nonNeg   = keywords.filter(k => k.group !== 'negative' && k.selected)
  const topByVol = [...nonNeg].sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0)).slice(0, 15)
  const avgCPC   = nonNeg.filter(k => k.cpcEst > 0).reduce((s, k) => s + k.cpcEst, 0) / (nonNeg.filter(k => k.cpcEst > 0).length || 1)

  const kwSummary = topByVol.map(k =>
    `- [${k.matchType}][${k.group}] "${k.keyword}": ${k.avgMonthlySearches?.toLocaleString() ?? 'N/A'} searches/mo | CPC ฿${k.cpcEst} | competition: ${k.competition}${k.competitionIndex ? ` (${k.competitionIndex})` : ''}`
  ).join('\n')

  const negKws = keywords.filter(k => k.group === 'negative').map(k => k.keyword).slice(0, 20).join(', ')

  const competitorCtx = competitors
    ? `คู่แข่งที่ระบุโดย client: ${competitors}`
    : `ยังไม่ได้ระบุคู่แข่ง — ให้วิเคราะห์จากความรู้คุณ`

  const totalSearchVol = topByVol.reduce((s, k) => s + (k.avgMonthlySearches ?? 0), 0)
  const highCompCount  = nonNeg.filter(k => k.competition === 'HIGH').length
  const lowVolCount    = nonNeg.filter(k => (k.avgMonthlySearches ?? 0) < 100).length

  const prompt = `คุณเป็น Senior Digital Marketing Strategist ที่เชี่ยวชาญตลาดออนไลน์ไทย มีประสบการณ์วางกลยุทธ์ Google Ads, SEO, และ online consumer behavior ให้แบรนด์ชั้นนำมากกว่า 10 ปี

## ข้อมูลธุรกิจ
- ชื่อ: ${businessName}
- สินค้า/บริการ: ${productService}
- พื้นที่เป้าหมาย: ${location}
- Marketing Objective: ${objective}
- ${competitorCtx}

## Keyword Data สรุป
- จำนวน keywords ที่เลือก: ${nonNeg.length} keywords
- Total search volume/เดือน: ~${totalSearchVol.toLocaleString()} searches
- High competition keywords: ${highCompCount}/${nonNeg.length} (${Math.round(highCompCount/nonNeg.length*100)}%)
- Low volume keywords (< 100/mo): ${lowVolCount} keywords
- Avg CPC: ฿${Math.round(avgCPC)}

## Keywords รายละเอียด (top ${topByVol.length} by volume)
${kwSummary}

## Negative Keywords: ${negKws || 'ยังไม่มี'}

---

วิเคราะห์แบบนักกลยุทธ์ที่เข้าใจตลาดออนไลน์ไทยจริงๆ ไม่ใช่แค่ข้อมูลทั่วไป — ให้ insight ที่ actionable และเจาะจงสำหรับธุรกิจนี้โดยเฉพาะ

ตอบ JSON เท่านั้น (ไม่มี markdown):
{
  "summary": "วิเคราะห์ keyword landscape ใน 2-3 ประโยค — บอก competition level จริงๆ, ใคร search, search intent หลักคืออะไร, โอกาสหรือ red flag ที่เห็นจาก data",

  "marketOverview": "ภาพรวมตลาดแบบนักกลยุทธ์: เขียน 4-5 ประโยคที่ให้ insight จริงๆ เช่น ตลาดนี้อยู่ใน stage ไหน (growing/mature/declining), demand มาจากไหน (B2B/B2C/impulse/research-heavy), seasonality ที่สำคัญ, digital behavior ของลูกค้ากลุ่มนี้ในไทย, และบอกว่าตอนนี้เป็นช่วงเวลาที่ดีในการลงทุน Google Ads หรือไม่ เพราะอะไร",

  "marketTrend": "growing | stable | declining | seasonal",

  "buyerJourney": "อธิบาย buyer journey ของลูกค้าในอุตสาหกรรมนี้: เริ่มจาก awareness ถึง conversion ใช้เวลานานแค่ไหน, research หนักแค่ไหนก่อนซื้อ, touchpoint ไหนสำคัญ, price sensitivity เป็นอย่างไร — 2-3 ประโยค",

  "uniqueAngle": "มุมที่ ${businessName} ควรใช้สู้คู่แข่งใน Google Ads: ให้ 1 insight ที่เจาะจงและ actionable จริงๆ เช่น angle ของ ad copy, positioning, หรือ audience targeting ที่คู่แข่งยังไม่ได้ใช้",

  "marketSignals": [
    {
      "icon": "📊",
      "label": "Search Demand",
      "value": "สูง/ปานกลาง/ต่ำ",
      "detail": "อธิบายว่า search volume นี้หมายความว่าอะไรในเชิงธุรกิจ มี demand จริงหรือ informational เท่านั้น",
      "color": "green | yellow | red | blue | purple"
    },
    {
      "icon": "💰",
      "label": "CPC Efficiency",
      "value": "฿XX avg",
      "detail": "CPC นี้แพงหรือถูกสำหรับอุตสาหกรรมนี้ ROI คุ้มไหมถ้า conversion rate ปกติของ industry นี้คือ X%",
      "color": "..."
    },
    {
      "icon": "🏆",
      "label": "Competition Level",
      "value": "High/Medium/Low",
      "detail": "ใครกำลังแย่ง traffic อยู่ และ ${businessName} มีโอกาสที่ gap ไหน",
      "color": "..."
    },
    {
      "icon": "📈",
      "label": "Market Trend",
      "value": "Growing/Stable/Seasonal",
      "detail": "trend ของอุตสาหกรรมนี้ในไทยปัจจุบัน ขยับขึ้นหรือลง มี catalyst อะไรที่ driving demand",
      "color": "..."
    },
    {
      "icon": "🎯",
      "label": "Intent Quality",
      "value": "Commercial/Informational/Mixed",
      "detail": "keyword เหล่านี้ ready-to-buy หรือยังอยู่ช่วง research — ส่งผลต่อ conversion rate และ landing page strategy อย่างไร",
      "color": "..."
    },
    {
      "icon": "⚡",
      "label": "Quick Win Potential",
      "value": "มี/ไม่มี/ปานกลาง",
      "detail": "มี keyword ที่ low-hanging fruit ไหม — volume พอ competition ต่ำ intent ชัด สามารถชนะได้เร็วภายใน 1-2 เดือน",
      "color": "..."
    }
  ],

  "topKeywords": ["keyword ที่ควร bid สูงสุด 5 ตัว — เลือกจาก high intent + reasonable CPC + search volume"],

  "budgetAdvice": "แนะนำ budget ที่ realisitic สำหรับธุรกิจขนาดนี้: บอก range daily budget, monthly estimate, แบ่ง allocation เป็น % เช่น 60% high-intent PHRASE, 30% brand, 10% BROAD exploration — และบอก minimum budget ที่ต้องใช้เพื่อให้ algorithm เรียนรู้ได้",

  "matchTypeAdvice": "กลยุทธ์ match type ที่เหมาะกับธุรกิจนี้ — ใช้ PHRASE เป็น default, ใช้ BROAD เฉพาะ keyword ที่ volume < 100/เดือน (ห้าม EXACT ทุกกรณี) — อธิบายว่าทำไม mix นี้เหมาะกับ objective และ budget ที่มี",

  "negativeAdvice": "negative keywords ที่ critical สำหรับอุตสาหกรรมนี้โดยเฉพาะ: แบ่งเป็น category เช่น job seekers, free seekers, wrong geo, wrong product — ระบุ pattern ที่ต้องระวัง",

  "strategyTips": [
    "tip ที่ 1 — เจาะจงสำหรับธุรกิจนี้ ไม่ใช่ generic advice",
    "tip ที่ 2 — เกี่ยวกับ bidding strategy ที่เหมาะกับ objective และ data ที่เห็น",
    "tip ที่ 3 — landing page / ad copy angle ที่จะชนะใน market นี้",
    "tip ที่ 4 — audience targeting หรือ remarketing ที่ควรทำ",
    "tip ที่ 5 — timing หรือ scheduling ที่ smart สำหรับ industry นี้"
  ],

  "doList": [
    "สิ่งที่ควรทำในช่วง 30 วันแรก — เจาะจง actionable มีตัวเลขถ้าเป็นไปได้",
    "...",
    "...",
    "...",
    "..."
  ],

  "dontList": [
    "common mistake ที่คนทำพลาดในอุตสาหกรรมนี้ — เจาะจง ไม่ใช่ generic",
    "ห้ามใช้ EXACT match — ใช้ PHRASE หรือ BROAD เท่านั้น",
    "...",
    "..."
  ],

  "opportunityScore": 7,
  "difficultyScore": 6,

  "competitors": [
    {
      "name": "ชื่อคู่แข่งจริง (ทั้งที่ client บอก + ที่คุณรู้จากอุตสาหกรรมนี้ในไทย)",
      "type": "direct",
      "strength": "จุดแข็งหลักที่ทำให้คนเลือกคู่แข่งรายนี้",
      "weakness": "จุดอ่อนที่ ${businessName} สามารถ capitalize ได้",
      "bidStrategy": "น่าจะ bid แบบไหน เช่น aggressive brand + generic, หรือ focus long-tail เท่านั้น"
    }
  ]
}`

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    // Google Search grounding: Gemini looks up real competitor landscape + market demand signals
    const geminiModel = genAI.getGenerativeModel({
      model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash',
      systemInstruction: `${EXECUTIVE_GROWTH_SKILL}\n\n${KEYWORD_ANALYSIS_CONTEXT}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    })
    // Grounding cannot coexist with responseMimeType — extract JSON manually
    const genResult = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 65536 },
    })
    const usage = genResult.response.usageMetadata
    if (usage) {
      const inp = usage.promptTokenCount ?? 0
      const out = usage.candidatesTokenCount ?? 0
      void logAiCost({ route: '/api/keyword-research/analyze', model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash', inputTokens: inp, outputTokens: out, estimatedUSD: (inp / 1e6) * 0.075 + (out / 1e6) * 0.30 })
    }
    const text  = genResult.response.text()
    const clean = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim()
    // Find outermost JSON object
    const start = clean.indexOf('{')
    const end   = clean.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('no JSON')
    const match = [clean.slice(start, end + 1)]
    if (!match[0]) throw new Error('no JSON')

    const parsed = JSON.parse(match[0]!) as MarketAnalysis
    return NextResponse.json(parsed)
  } catch (e) {
    console.error('[kw-analyze] error:', e)
    return NextResponse.json(buildFallbackAnalysis(keywords, businessName, productService, competitors))
  }
}

function buildFallbackAnalysis(
  keywords: ResearchKeyword[],
  businessName: string,
  productService: string,
  competitors?: string,
): MarketAnalysis {
  const nonNeg = keywords.filter(k => k.group !== 'negative')
  const avgCPC = nonNeg.filter(k => k.cpcEst > 0).reduce((s, k) => s + k.cpcEst, 0) / (nonNeg.filter(k => k.cpcEst > 0).length || 1)
  const highComp = nonNeg.filter(k => k.competition === 'HIGH').length
  const compNames = competitors ? competitors.split(',').map(s => s.trim()).filter(Boolean) : []

  const compLevel = highComp > nonNeg.length / 2 ? 'สูง' : 'ปานกลาง'
  return {
    summary:        `${businessName} ให้บริการ ${productService} มี ${nonNeg.length} keywords ที่วิเคราะห์ avg CPC ฿${Math.round(avgCPC)} — competition ระดับ${compLevel}`,
    marketOverview: `ตลาด ${productService} ในไทยมี competition ระดับ${compLevel} จาก ${highComp}/${nonNeg.length} keywords ที่อยู่ใน HIGH competition zone ซึ่งบ่งชี้ว่ามีผู้เล่นหลายรายกำลัง bid อยู่ในตลาดนี้อย่างจริงจัง avg CPC ฿${Math.round(avgCPC)} ถือว่าอยู่ในระดับที่ต้องวางแผน budget รอบคอบ ควรเน้น PHRASE match และ high-intent keywords ก่อนขยาย reach`,
    marketTrend:    'stable' as const,
    buyerJourney:   `ลูกค้าของ ${productService} มักผ่าน research phase ก่อนตัดสินใจ — ควรมี landing page ที่ตอบ objection หลักและมี social proof ที่ชัดเจน`,
    uniqueAngle:    `โฟกัสที่ pain point เฉพาะที่คู่แข่งยังไม่พูดถึงใน ad copy — ทดสอบ benefit-led headline แทน feature-led`,
    marketSignals: [
      { icon: '📊', label: 'Search Demand', value: nonNeg.reduce((s, k) => s + (k.avgMonthlySearches ?? 0), 0) > 10000 ? 'สูง' : 'ปานกลาง', detail: `รวม ~${nonNeg.reduce((s, k) => s + (k.avgMonthlySearches ?? 0), 0).toLocaleString()} searches/เดือนจาก ${nonNeg.length} keywords`, color: 'green' as const },
      { icon: '💰', label: 'CPC Efficiency', value: `฿${Math.round(avgCPC)} avg`, detail: `CPC เฉลี่ย ฿${Math.round(avgCPC)} — ต้องมี conversion rate > ${Math.round(avgCPC / 500 * 100) / 100}% เพื่อให้ ROI คุ้ม`, color: avgCPC > 100 ? 'red' as const : avgCPC > 50 ? 'yellow' as const : 'green' as const },
      { icon: '🏆', label: 'Competition Level', value: compLevel, detail: `${highComp} จาก ${nonNeg.length} keywords มี HIGH competition — ต้องการ Quality Score ที่ดีเพื่อลด CPC`, color: highComp > nonNeg.length / 2 ? 'red' as const : 'yellow' as const },
      { icon: '🎯', label: 'Intent Quality', value: 'Mixed', detail: 'มีทั้ง high-intent (เปรียบเทียบ/ซื้อ) และ informational — แยก ad group ตาม intent', color: 'blue' as const },
    ],
    topKeywords:    nonNeg.sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0)).slice(0, 5).map(k => k.keyword),
    budgetAdvice:   `แนะนำเริ่มต้น ฿${Math.round(avgCPC * 20)}-${Math.round(avgCPC * 40)}/วัน (minimum สำหรับ algorithm เรียนรู้) แบ่ง 60% high-intent PHRASE keywords, 30% brand/product terms, 10% BROAD exploration`,
    matchTypeAdvice:'ใช้ PHRASE match เป็น default เพื่อควบคุม quality — ขยายเป็น BROAD สำหรับ keyword volume < 100/เดือน เพื่อเพิ่ม reach ห้ามใช้ EXACT match ทุกกรณี',
    negativeAdvice: 'เพิ่ม negative (PHRASE): ฟรี, DIY, สมัครงาน, ขายส่ง, มือสอง, ราคาส่ง, วิธีทำ, download, template',
    strategyTips:   ['เริ่มด้วย PHRASE match ที่มี high intent ก่อน วัดผล 14 วันแล้วค่อยขยาย', 'ตั้ง conversion tracking ก่อน launch เพื่อให้ Smart Bidding มีข้อมูล', 'สร้าง landing page แยกตาม ad group ไม่ใช้ homepage', 'ตั้ง ad schedule ตาม peak hour ของ industry นี้', 'ใช้ Responsive Search Ads ทดสอบ headline อย่างน้อย 8-10 variations'],
    doList:         ['ตั้ง conversion tracking และ Google Analytics 4 ก่อน launch', 'สร้าง negative keyword list (PHRASE) จาก search term report หลัง 7 วัน', 'แบ่ง ad group ตาม search intent อย่างน้อย 3 groups: brand, product, generic', 'ทดสอบ 2-3 ad copy variations ต่อ ad group เพื่อหา winner', 'ตั้ง automated rule แจ้งเตือนถ้า CPA เกิน target'],
    dontList:       ['ห้ามใช้ EXACT match — ใช้ PHRASE หรือ BROAD เท่านั้น', 'อย่า pause campaign ก่อนได้ข้อมูลอย่างน้อย 2 สัปดาห์และ 50+ clicks', 'อย่า bid สูงทุก keyword เท่ากัน — priority ตาม intent', 'อย่าใช้ broad match กับ campaign ที่ budget จำกัด'],
    opportunityScore: Math.max(4, 8 - Math.round(highComp / nonNeg.length * 4)),
    difficultyScore:  Math.min(9, 3 + Math.round(highComp / nonNeg.length * 6)),
    competitors: compNames.map(name => ({
      name,
      type: 'direct' as const,
      strength: 'ยังไม่ได้วิเคราะห์ — กด Analyze อีกครั้งเพื่อให้ AI วิเคราะห์คู่แข่ง',
    })),
  }
}
