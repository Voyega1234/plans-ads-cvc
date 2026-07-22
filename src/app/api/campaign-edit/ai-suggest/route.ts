import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'
import { COPYWRITING_SKILL, AD_COPY_CONTEXT } from '@/lib/ai/prompts'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AISuggestRequest {
  adType: string          // 'RSA' | 'RESPONSIVE_DISPLAY' | 'APP' | 'DEMAND_GEN_MULTI_ASSET' | 'DEMAND_GEN_VIDEO' | 'PMAX'
  currentHeadlines: string[]
  currentLongHeadlines?: string[]
  currentDescriptions: string[]
  businessContext: {
    businessName: string
    productService?: string
    brandTone?: string
    objective?: string
  }
  instruction: string
  // Adjustment brief — what to CHANGE (product/audience/tone are inferred from the existing ads).
  adjustments?: {
    promotion?: string   // โปรโมชั่น/ข้อเสนอใหม่
    emphasis?: string    // เน้น angle ไหน
    mustInclude?: string // คำที่ต้องมี
    avoid?: string       // คำ/ข้อความที่ห้ามใช้
  }
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

// Grounded fallback (used only when the AI provider is unavailable): builds from the
// EXISTING ad copy + the user's adjustment brief instead of generic e-commerce filler,
// so it stays on-topic for this business.
function getMockSuggestions(body: AISuggestRequest, spec: AdTypeSpec): AISuggestResponse {
  const name = body.businessContext.businessName || 'บริการของเรา'
  const adj = body.adjustments ?? {}

  const uniq = (arr: string[], n: number, max: number) => {
    const out: string[] = []
    for (const raw of arr) {
      const v = (raw ?? '').trim().slice(0, max)
      if (v && !out.includes(v)) out.push(v)
      if (out.length >= n) break
    }
    return out
  }

  // seed from the real ad + the brief; pad with neutral, service-oriented lines (NOT e-commerce)
  const briefHeads = [adj.promotion, adj.mustInclude].filter(Boolean) as string[]
  const headSeed = [
    ...body.currentHeadlines.filter(h => h.trim()),
    ...briefHeads,
    name,
    `ปรึกษา ${name} ฟรี`,
    'ทีมงานมืออาชีพ',
    'สอบถามเพิ่มเติมวันนี้',
    adj.emphasis ? `เด่นเรื่อง${adj.emphasis}` : 'บริการครบวงจร',
    'ให้คำปรึกษาโดยผู้เชี่ยวชาญ',
    'ดูแลทุกขั้นตอน',
    'นัดหมายง่าย สะดวก',
    'ตอบไว บริการจริงใจ',
    'ประสบการณ์ตรงกับงานของคุณ',
    'เริ่มต้นวันนี้',
  ]
  const descSeed = [
    ...body.currentDescriptions.filter(d => d.trim()),
    adj.promotion ? `${adj.promotion} — ปรึกษา ${name} ได้เลยวันนี้` : `${name} ให้คำปรึกษาโดยผู้เชี่ยวชาญ ดูแลครบทุกขั้นตอน`,
    'ทีมงานมืออาชีพพร้อมช่วยเหลือ ตอบทุกคำถามอย่างจริงใจ',
    adj.emphasis ? `เราเน้นเรื่อง${adj.emphasis} เพื่อผลลัพธ์ที่ดีที่สุดสำหรับคุณ` : 'บริการครบวงจร นัดหมายสะดวก ติดต่อได้ทันที',
    'ประสบการณ์ตรงกับงานของคุณ สอบถามรายละเอียดเพิ่มเติมได้',
  ]
  const longSeed = [
    ...(body.currentLongHeadlines ?? []).filter(h => h.trim()),
    adj.promotion ? `${name} — ${adj.promotion} ปรึกษาฟรีก่อนตัดสินใจ` : `${name} ให้คำปรึกษาโดยผู้เชี่ยวชาญ ดูแลครบทุกขั้นตอน`,
    'ทีมงานมืออาชีพพร้อมดูแลคุณทุกขั้นตอน ตั้งแต่เริ่มจนจบ',
  ]

  return {
    headlines: uniq(headSeed, spec.headlineCount, spec.headlineMax),
    longHeadlines: uniq(longSeed, spec.longHeadlineCount, spec.longHeadlineMax),
    descriptions: uniq(descSeed, spec.descriptionCount, spec.descriptionMax),
    rationale: `[ตัวอย่างสำรอง — AI provider ไม่พร้อมใช้งาน] อิงจาก ad เดิม + สิ่งที่ระบุ${adj.promotion ? ` (โปร: ${adj.promotion})` : ''}${adj.emphasis ? `, เน้น ${adj.emphasis}` : ''} · เมื่อเชื่อม Gemini/Vertex บนโปรดักชันจะเขียนคุณภาพเต็มตาม brief`,
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
  const adj = body.adjustments ?? {}
  const spec = specFor(body.adType)

  const longHeadlineRules = spec.longHeadlineCount > 0
    ? `- Long headline: สร้าง EXACTLY ${spec.longHeadlineCount} รายการ แต่ละรายการ ≤${spec.longHeadlineMax} ตัวอักษร\n`
    : ''

  // สิ่งที่ผู้ใช้อยากปรับ (มีเท่าที่กรอกมา) — บริบทธุรกิจ/สินค้า/โทน ให้ AI อ่านจาก ad เดิมเอง
  const adjustmentLines = [
    instruction ? `- สิ่งที่อยากปรับ: ${instruction}` : '',
    adj.promotion ? `- โปรโมชั่น/ข้อเสนอใหม่ที่ต้องใส่: ${adj.promotion}` : '',
    adj.emphasis ? `- อยากให้เน้น angle: ${adj.emphasis}` : '',
    adj.mustInclude ? `- คำ/ข้อความที่ต้องมี: ${adj.mustInclude}` : '',
    adj.avoid ? `- คำ/ข้อความที่ห้ามใช้: ${adj.avoid}` : '',
  ].filter(Boolean).join('\n')

  const hasCurrent = currentHeadlines.length > 0 || currentDescriptions.length > 0

  const prompt = `ประเภทโฆษณา: ${spec.label}
ชื่อธุรกิจ: ${businessContext.businessName || '(อ่านจาก ad เดิม)'}

## Ad เดิมของแคมเปญนี้ (นี่คือแหล่งข้อมูลหลัก — ต้องอ่านและวิเคราะห์ก่อนเขียน)
Headlines: ${currentHeadlines.join(' | ') || '(ยังไม่มี)'}
${spec.longHeadlineCount > 0 ? `Long Headlines: ${currentLongHeadlines.join(' | ') || '(ยังไม่มี)'}\n` : ''}Descriptions: ${currentDescriptions.join(' | ') || '(ยังไม่มี)'}

## ขั้นตอนที่ต้องทำ
1) ${hasCurrent
    ? 'วิเคราะห์ ad เดิมด้านบนก่อน เพื่อเข้าใจ: สินค้า/บริการ, กลุ่มเป้าหมาย, น้ำเสียง/โทนแบรนด์, จุดขาย และ keyword ที่ใช้อยู่ — ยึดบริบทนี้เป็นหลัก ห้ามเปลี่ยนธุรกิจหรือแต่งจุดขายที่ ad เดิมไม่มี'
    : 'ยังไม่มี ad เดิม — เขียนจากชื่อธุรกิจและสิ่งที่ผู้ใช้ระบุด้านล่างเท่านั้น ห้ามแต่งข้อมูลที่ไม่ได้ให้มา'}
2) คงจุดแข็ง/ข้อความที่ดีของ ad เดิมไว้ แล้วปรับ/เพิ่มเฉพาะตามที่ผู้ใช้สั่งด้านล่างนี้:
${adjustmentLines || '- (ผู้ใช้ไม่ได้ระบุการปรับเฉพาะ — ปรับปรุงคุณภาพการเขียนของ ad เดิมให้คมขึ้น โดยคงบริบทเดิม)'}

## กฎการเขียน (สำคัญที่สุด — ให้ตรงกับข้อมูลจริง)
- ทุก Headline/Description ต้อง "อิงข้อมูลจริง" จาก ad เดิม + สิ่งที่ผู้ใช้ระบุ — ห้ามใช้ข้อความ generic ลอยๆ (เช่น "คุณภาพเยี่ยม ราคาถูก" ที่ไม่เกี่ยวกับธุรกิจนี้)
- ห้ามแต่งโปรโมชั่น/ตัวเลข/การเคลม ที่ ad เดิมหรือผู้ใช้ไม่ได้ให้มา
- ถ้าผู้ใช้ระบุโปร/คำที่ต้องมี → ต้องใส่ให้เห็นชัดในหลาย asset
- ถ้าผู้ใช้ระบุคำที่ห้ามใช้ → ห้ามปรากฏเลย

## สเปคจำนวน/ความยาว (Google Ads — ${spec.label}) ต้องครบเป๊ะ
- Headline: EXACTLY ${spec.headlineCount} รายการ แต่ละรายการ ≤${spec.headlineMax} ตัวอักษร (นับไทย+อังกฤษตัวต่อตัว)
${longHeadlineRules}- Description: EXACTLY ${spec.descriptionCount} รายการ แต่ละรายการ ≤${spec.descriptionMax} ตัวอักษร
${spec.extraRule ? `- ${spec.extraRule}\n` : ''}- ห้ามข้อความซ้ำกัน · ห้าม ! หรือ ? เกิน 1 ครั้งใน headline · ห้ามตัวพิมพ์ใหญ่ทั้งหมด · ห้าม emoji ใน headline
- ภาษา: ${language}

ตอบเป็น JSON เท่านั้น (ไม่มี markdown):
{
  "headlines": ["...ครบ ${spec.headlineCount} รายการ..."],
  ${spec.longHeadlineCount > 0 ? `"longHeadlines": ["...ครบ ${spec.longHeadlineCount} รายการ..."],\n  ` : ''}"descriptions": ["...ครบ ${spec.descriptionCount} รายการ..."],
  "rationale": "อธิบายสั้นๆ ว่าปรับอะไรจาก ad เดิม และอิงข้อมูลไหน"
}`

  const result = await safeCallAI<AISuggestResponse>(
    prompt,
    validate,
    () => getMockSuggestions(body, spec),
    { temperature: 0.7, maxTokens: 65536, systemPrompt: `${COPYWRITING_SKILL}\n\n${AD_COPY_CONTEXT}` }
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
