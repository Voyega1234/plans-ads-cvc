import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, AD_COPY_CONTEXT } from '@/lib/ai/prompts'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AISuggestRequest {
  adType: string
  currentHeadlines: string[]
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
  descriptions: string[]
  rationale: string
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(raw: unknown): AISuggestResponse | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.headlines) || !Array.isArray(obj.descriptions)) return null
  if (typeof obj.rationale !== 'string') return null
  const headlines = (obj.headlines as unknown[]).filter(h => typeof h === 'string') as string[]
  const descriptions = (obj.descriptions as unknown[]).filter(d => typeof d === 'string') as string[]
  if (headlines.length === 0 || descriptions.length === 0) return null
  return { headlines, descriptions, rationale: obj.rationale }
}

// ─── Mock fallback ─────────────────────────────────────────────────────────────

function getMockSuggestions(body: AISuggestRequest): AISuggestResponse {
  const name = body.businessContext.businessName || 'สินค้าของเรา'

  const headlines = [
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
  ]

  const descriptions = [
    `${name} — สินค้าคุณภาพสูง ราคาคุ้มค่า ส่งฟรีทุกออเดอร์ สั่งซื้อเลยวันนี้`,
    'บริการลูกค้า 24 ชั่วโมง คืนสินค้าได้ภายใน 30 วัน มั่นใจทุกการสั่งซื้อ',
    `ใช้โค้ดพิเศษรับส่วนลดเพิ่ม 10% สำหรับออเดอร์แรกกับ ${name}`,
    'จัดส่งทั่วประเทศภายใน 1-2 วันทำการ สินค้าคุณภาพพร้อมส่ง',
  ]

  return {
    headlines,
    descriptions,
    rationale: `สร้าง headline 10 รายการและ description 4 รายการ โดยเน้น "${body.instruction || 'ประสิทธิภาพสูง'}" ตามโจทย์ที่กำหนด แต่ละ headline ไม่เกิน 30 ตัวอักษร และ description ไม่เกิน 90 ตัวอักษร`,
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

  const prompt = `คุณเป็นผู้เชี่ยวชาญ Google Ads สำหรับตลาดไทย

ข้อมูลธุรกิจ:
- ชื่อธุรกิจ: ${businessContext.businessName}
- สินค้า/บริการ: ${businessContext.productService}
- น้ำเสียงแบรนด์: ${businessContext.brandTone}
- เป้าหมาย: ${businessContext.objective}

Ad copy ปัจจุบัน:
Headlines: ${currentHeadlines.join(' | ')}
Descriptions: ${currentDescriptions.join(' | ')}

คำสั่ง: ${instruction}
ภาษา: ${language}

กฎ Google Ads RSA ที่ต้องปฏิบัติตาม:
- Headline: ≤30 ตัวอักษร/รายการ (นับทั้งภาษาไทยและภาษาอังกฤษ)
- Description: ≤90 ตัวอักษร/รายการ
- สร้าง headline 5-10 รายการ
- สร้าง description 3-4 รายการ
- ห้ามใช้ ! หรือ ? ใน headline มากกว่า 1 ครั้ง
- ห้ามใช้ตัวพิมพ์ใหญ่ทั้งหมด

ตอบเป็น JSON เท่านั้น:
{
  "headlines": ["...", "..."],
  "descriptions": ["...", "..."],
  "rationale": "อธิบายกลยุทธ์สั้นๆ"
}`

  const result = await safeCallAI<AISuggestResponse>(
    prompt,
    validate,
    () => getMockSuggestions(body),
    { temperature: 0.7, maxTokens: 65536, systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${AD_COPY_CONTEXT}` }
  )

  // Enforce char limits — trim any that exceed to avoid saving invalid copy
  const HEADLINE_MAX = 30
  const DESC_MAX = 90

  const safeHeadlines = result.headlines
    .map(h => h.slice(0, HEADLINE_MAX))
    .filter(h => h.length > 0)
    .slice(0, 10)

  const safeDescriptions = result.descriptions
    .map(d => d.slice(0, DESC_MAX))
    .filter(d => d.length > 0)
    .slice(0, 4)

  return NextResponse.json({
    headlines: safeHeadlines,
    descriptions: safeDescriptions,
    rationale: result.rationale,
  })
}
