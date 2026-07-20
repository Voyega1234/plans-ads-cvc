import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, AD_COPY_CONTEXT } from '@/lib/ai/prompts'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AISuggestRequest {
  adType: string          // 'RSA' | 'RESPONSIVE_DISPLAY' | 'APP' | 'DEMAND_GEN_MULTI_ASSET' | 'DEMAND_GEN_VIDEO' | 'PMAX'
  currentHeadlines: string[]
  currentLongHeadlines?: string[]
  currentDescriptions: string[]
  businessContext: {
    businessName: string
    productService: string
    brandTone: string
    objective: string
  }
  instruction: string
  language?: string
}

interface AISuggestResponse {
  headlines: string[]
  longHeadlines?: string[]
  descriptions: string[]
  rationale: string
}

// ─── สเปคจำนวน/ความยาว text assets ต่อ ad type (ตามเงื่อนไข Google Ads) ─────────
// SEARCH RSA:      15 headlines ≤30 / 4 descriptions ≤90
// PMAX:            15 headlines ≤30 / 5 long headlines ≤90 / 5 descriptions ≤90 (ตัวแรก ≤60)
// DISPLAY (RDA):   5 headlines ≤30 / 1 long headline ≤90 / 5 descriptions ≤90
// DEMAND_GEN:      5 headlines ≤40 / 5 descriptions ≤90 (video มี long headlines ≤90 อีก 5)
// APP:             5 headlines ≤30 / 5 descriptions ≤90

interface AdTypeSpec {
  label: string
  headlineCount: number
  headlineMax: number
  longHeadlineCount: number
  longHeadlineMax: number
  descriptionCount: number
  descriptionMax: number
  extraRule?: string
}

const AD_TYPE_SPECS: Record<string, AdTypeSpec> = {
  RSA: {
    label: 'Responsive Search Ad (Search campaign)',
    headlineCount: 15, headlineMax: 30,
    longHeadlineCount: 0, longHeadlineMax: 0,
    descriptionCount: 4, descriptionMax: 90,
  },
  PMAX: {
    label: 'Performance Max asset group',
    headlineCount: 15, headlineMax: 30,
    longHeadlineCount: 5, longHeadlineMax: 90,
    descriptionCount: 5, descriptionMax: 90,
    extraRule: 'headline อย่างน้อย 1 รายการต้องสั้นไม่เกิน 15 ตัวอักษร และ description รายการแรกต้องไม่เกิน 60 ตัวอักษร',
  },
  RESPONSIVE_DISPLAY: {
    label: 'Responsive Display Ad (Display campaign)',
    headlineCount: 5, headlineMax: 30,
    longHeadlineCount: 1, longHeadlineMax: 90,
    descriptionCount: 5, descriptionMax: 90,
  },
  DEMAND_GEN_MULTI_ASSET: {
    label: 'Demand Gen ad',
    headlineCount: 5, headlineMax: 40,
    longHeadlineCount: 0, longHeadlineMax: 0,
    descriptionCount: 5, descriptionMax: 90,
  },
  DEMAND_GEN_VIDEO: {
    label: 'Demand Gen video responsive ad',
    headlineCount: 5, headlineMax: 40,
    longHeadlineCount: 5, longHeadlineMax: 90,
    descriptionCount: 5, descriptionMax: 90,
  },
  APP: {
    label: 'App campaign ad',
    headlineCount: 5, headlineMax: 30,
    longHeadlineCount: 0, longHeadlineMax: 0,
    descriptionCount: 5, descriptionMax: 90,
  },
}

function specFor(adType: string): AdTypeSpec {
  return AD_TYPE_SPECS[adType] ?? AD_TYPE_SPECS.RSA
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(raw: unknown): AISuggestResponse | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.headlines) || !Array.isArray(obj.descriptions)) return null
  if (typeof obj.rationale !== 'string') return null
  const headlines = (obj.headlines as unknown[]).filter(h => typeof h === 'string') as string[]
  const descriptions = (obj.descriptions as unknown[]).filter(d => typeof d === 'string') as string[]
  const longHeadlines = Array.isArray(obj.longHeadlines)
    ? (obj.longHeadlines as unknown[]).filter(h => typeof h === 'string') as string[]
    : []
  if (headlines.length === 0 || descriptions.length === 0) return null
  return { headlines, longHeadlines, descriptions, rationale: obj.rationale }
}

// ─── Mock fallback ─────────────────────────────────────────────────────────────

function getMockSuggestions(body: AISuggestRequest, spec: AdTypeSpec): AISuggestResponse {
  const name = body.businessContext.businessName || 'สินค้าของเรา'

  const headlinePool = [
    `${name} ราคาพิเศษ`,
    'โปรโมชั่นวันนี้เท่านั้น',
    'ลด 30% ทุกชิ้น',
    'ส่งฟรีทั่วประเทศ',
    'สั่งด่วนรับของเร็ว',
    'คุณภาพเยี่ยม ราคาถูก',
    'อย่าพลาดโอกาสนี้',
    'ลูกค้ากว่า 50K คนไว้ใจ',
    'สินค้าแท้ 100%',
    'รับประกันคุณภาพ',
    'ดีลเด็ดประจำสัปดาห์',
    'ช้อปเลยวันนี้',
    'ของแท้จากผู้ผลิต',
    'บริการหลังการขายดี',
    'คุ้มค่าทุกการสั่งซื้อ',
  ]

  const longHeadlinePool = [
    `${name} — สินค้าคุณภาพราคาโปร สั่งออนไลน์ส่งด่วนทั่วไทย`,
    'โปรโมชั่นพิเศษจำนวนจำกัด สั่งซื้อวันนี้รับส่วนลดทันที',
    'คุณภาพที่ลูกค้ากว่า 50,000 คนไว้วางใจ พร้อมรับประกันของแท้',
    'ส่งฟรีทั่วประเทศ จัดส่งภายใน 1-2 วันทำการ',
    'บริการลูกค้าตลอด 24 ชั่วโมง คืนสินค้าได้ใน 30 วัน',
  ]

  const descriptionPool = [
    `${name} — สินค้าคุณภาพสูง ราคาคุ้มค่า ส่งฟรีทุกออเดอร์`,
    'บริการลูกค้า 24 ชั่วโมง คืนสินค้าได้ภายใน 30 วัน มั่นใจทุกการสั่งซื้อ',
    `ใช้โค้ดพิเศษรับส่วนลดเพิ่ม 10% สำหรับออเดอร์แรกกับ ${name}`,
    'จัดส่งทั่วประเทศภายใน 1-2 วันทำการ สินค้าคุณภาพพร้อมส่ง',
    'สินค้าแท้ 100% รับประกันคุณภาพ พร้อมโปรโมชั่นพิเศษทุกสัปดาห์',
  ]

  return {
    headlines: headlinePool.slice(0, spec.headlineCount).map(h => h.slice(0, spec.headlineMax)),
    longHeadlines: longHeadlinePool.slice(0, spec.longHeadlineCount).map(h => h.slice(0, spec.longHeadlineMax)),
    descriptions: descriptionPool.slice(0, spec.descriptionCount).map(d => d.slice(0, spec.descriptionMax)),
    rationale: `สร้าง headline ${spec.headlineCount} รายการ${spec.longHeadlineCount ? `, long headline ${spec.longHeadlineCount} รายการ` : ''} และ description ${spec.descriptionCount} รายการ ครบตามสเปคของ ${spec.label} โดยเน้น "${body.instruction || 'ประสิทธิภาพสูง'}"`,
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: AISuggestRequest
  try {
    body = await req.json() as AISuggestRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { businessContext, currentHeadlines, currentDescriptions, instruction, language = 'th' } = body
  const currentLongHeadlines = body.currentLongHeadlines ?? []
  const spec = specFor(body.adType)

  const longHeadlineRules = spec.longHeadlineCount > 0
    ? `- Long headline: สร้าง EXACTLY ${spec.longHeadlineCount} รายการ แต่ละรายการ ≤${spec.longHeadlineMax} ตัวอักษร\n`
    : ''

  const prompt = `คุณเป็นผู้เชี่ยวชาญ Google Ads สำหรับตลาดไทย

ประเภทโฆษณา: ${spec.label}

ข้อมูลธุรกิจ:
- ชื่อธุรกิจ: ${businessContext.businessName}
- สินค้า/บริการ: ${businessContext.productService}
- น้ำเสียงแบรนด์: ${businessContext.brandTone}
- เป้าหมาย: ${businessContext.objective}

Ad copy ปัจจุบัน (นำมาปรับปรุง/เขียนเพิ่มให้ครบ):
Headlines: ${currentHeadlines.join(' | ') || '(ยังไม่มี)'}
${spec.longHeadlineCount > 0 ? `Long Headlines: ${currentLongHeadlines.join(' | ') || '(ยังไม่มี)'}\n` : ''}Descriptions: ${currentDescriptions.join(' | ') || '(ยังไม่มี)'}

คำสั่ง: ${instruction}
ภาษา: ${language}

กฎที่ต้องปฏิบัติตามเคร่งครัด (สเปคจริงของ Google Ads สำหรับ ${spec.label}):
- Headline: สร้าง EXACTLY ${spec.headlineCount} รายการ — ห้ามน้อยกว่านี้ ถ้าของเดิมมีไม่ครบให้เขียนเพิ่มจนครบ แต่ละรายการ ≤${spec.headlineMax} ตัวอักษร (นับทั้งภาษาไทยและอังกฤษ)
${longHeadlineRules}- Description: สร้าง EXACTLY ${spec.descriptionCount} รายการ แต่ละรายการ ≤${spec.descriptionMax} ตัวอักษร
${spec.extraRule ? `- ${spec.extraRule}\n` : ''}- ห้ามมีข้อความซ้ำกันในรายการเดียวกัน
- ห้ามใช้ ! หรือ ? ใน headline มากกว่า 1 ครั้ง
- ห้ามใช้ตัวพิมพ์ใหญ่ทั้งหมด

ตอบเป็น JSON เท่านั้น:
{
  "headlines": ["...ครบ ${spec.headlineCount} รายการ..."],
  ${spec.longHeadlineCount > 0 ? `"longHeadlines": ["...ครบ ${spec.longHeadlineCount} รายการ..."],\n  ` : ''}"descriptions": ["...ครบ ${spec.descriptionCount} รายการ..."],
  "rationale": "อธิบายกลยุทธ์สั้นๆ"
}`

  const result = await safeCallAI<AISuggestResponse>(
    prompt,
    validate,
    () => getMockSuggestions(body, spec),
    { temperature: 0.7, maxTokens: 65536, systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${AD_COPY_CONTEXT}` }
  )

  // Enforce char limits + counts ตามสเปคของ ad type — กันบันทึกค่าเกินเข้า Google Ads
  const safeHeadlines = result.headlines
    .map(h => h.slice(0, spec.headlineMax))
    .filter(h => h.length > 0)
    .slice(0, spec.headlineCount)

  const safeLongHeadlines = (result.longHeadlines ?? [])
    .map(h => h.slice(0, spec.longHeadlineMax))
    .filter(h => h.length > 0)
    .slice(0, spec.longHeadlineCount)

  const safeDescriptions = result.descriptions
    .map(d => d.slice(0, spec.descriptionMax))
    .filter(d => d.length > 0)
    .slice(0, spec.descriptionCount)

  return NextResponse.json({
    headlines: safeHeadlines,
    longHeadlines: safeLongHeadlines,
    descriptions: safeDescriptions,
    rationale: result.rationale,
  })
}
