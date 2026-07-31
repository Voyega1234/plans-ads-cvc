import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'

// AI keyword suggestions for a SEARCH campaign, grounded on what is already
// running: existing keywords + the campaign's actual ad copy. Reuses the same
// AI provider (Vertex OIDC) as ai-suggest — this route only CALLS it.

interface KeywordSuggestRequest {
  campaignName: string
  existingKeywords: { text: string; matchType: string; status: string }[]
  adHeadlines?: string[]
  adDescriptions?: string[]
  instruction?: string // สิ่งที่อยากปรับ เช่น "เน้นคนหาราคา", "ตัดคำที่กว้างไป"
  language?: string
}

interface KeywordSuggestion {
  text: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
  reason: string
}

interface KeywordSuggestResponse {
  add: KeywordSuggestion[]
  pauseOrRemove: { text: string; reason: string }[]
  rationale: string
}

function validate(raw: unknown): KeywordSuggestResponse | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.add) || !Array.isArray(obj.pauseOrRemove) || typeof obj.rationale !== 'string') return null
  const add: KeywordSuggestion[] = []
  for (const a of obj.add as unknown[]) {
    const o = a as Record<string, unknown>
    if (typeof o?.text !== 'string' || !o.text.trim()) continue
    add.push({
      text: o.text.trim(),
      matchType: (['EXACT', 'PHRASE', 'BROAD'].includes(String(o.matchType)) ? o.matchType : 'PHRASE') as KeywordSuggestion['matchType'],
      reason: typeof o.reason === 'string' ? o.reason : '',
    })
  }
  const pauseOrRemove: { text: string; reason: string }[] = []
  for (const p of obj.pauseOrRemove as unknown[]) {
    const o = p as Record<string, unknown>
    if (typeof o?.text !== 'string' || !o.text.trim()) continue
    pauseOrRemove.push({ text: o.text.trim(), reason: typeof o.reason === 'string' ? o.reason : '' })
  }
  return { add, pauseOrRemove, rationale: obj.rationale }
}

// Production policy: NO fabricated suggestions. If the AI provider is down we
// return an empty result with an honest message instead of template keywords —
// nothing fake ever reaches a real push.
function getUnavailableFallback(): KeywordSuggestResponse {
  return {
    add: [],
    pauseOrRemove: [],
    rationale: 'AI provider ไม่พร้อมใช้งานขณะนี้ — ยังไม่มีคำแนะนำ กดลองใหม่อีกครั้ง (ไม่มีการสร้างคำแนะนำสำรองปลอม)',
  }
}

export async function POST(req: NextRequest) {
  let body: KeywordSuggestRequest
  try {
    body = await req.json() as KeywordSuggestRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!Array.isArray(body.existingKeywords)) {
    return NextResponse.json({ error: 'existingKeywords is required' }, { status: 400 })
  }

  const kwLines = body.existingKeywords
    .map(k => `- "${k.text}" [${k.matchType}] (${k.status})`)
    .join('\n') || '(ยังไม่มี keyword)'

  const prompt = `คุณคือผู้เชี่ยวชาญ Google Ads Search ภาษาไทย วิเคราะห์แคมเปญนี้แล้วเสนอการปรับ keyword

แคมเปญ: ${body.campaignName}

## Keyword ที่รันอยู่ตอนนี้ (แหล่งข้อมูลหลัก — วิเคราะห์ก่อนเสนอ)
${kwLines}

## Ad copy จริงของแคมเปญ (ใช้เข้าใจธุรกิจ/จุดขาย — ห้ามเดาธุรกิจนอกเหนือจากนี้)
Headlines: ${(body.adHeadlines ?? []).join(' | ') || '(ไม่มีข้อมูล)'}
Descriptions: ${(body.adDescriptions ?? []).join(' | ') || '(ไม่มีข้อมูล)'}

${body.instruction ? `## สิ่งที่ผู้ใช้อยากปรับ\n${body.instruction}\n` : ''}
## กฎ
- เสนอ keyword ใหม่ 5-10 คำ ที่ "ต่อยอดจากธุรกิจจริง" ตาม keyword/ad เดิม — ห้ามเดาสินค้า/บริการที่ไม่มีหลักฐาน
- ห้ามเสนอคำที่ซ้ำหรือใกล้เคียงกับที่มีอยู่แล้ว
- เลือก matchType ให้เหมาะ: EXACT สำหรับคำ intent สูง, PHRASE สำหรับคำทั่วไป, BROAD เฉพาะเมื่อเหมาะจริง
- ชี้ keyword เดิมที่ควร "พัก/ลบ" (กว้างเกินไป, ไม่ตรง intent, ซ้ำซ้อน) พร้อมเหตุผล — เฉพาะที่มีเหตุผลชัด ไม่ต้องหาให้ครบ
- ภาษา: ${body.language ?? 'th'}

ตอบเป็น JSON เท่านั้น (ไม่มี markdown):
{
  "add": [{ "text": "...", "matchType": "EXACT|PHRASE|BROAD", "reason": "..." }],
  "pauseOrRemove": [{ "text": "คำเดิมที่ควรพัก/ลบ", "reason": "..." }],
  "rationale": "สรุปแนวคิดการปรับสั้นๆ"
}`

  const result = await safeCallAI<KeywordSuggestResponse>(
    prompt,
    validate,
    getUnavailableFallback,
    { temperature: 0.5, maxTokens: 8192 }
  )

  return NextResponse.json({
    add: result.add.slice(0, 10),
    pauseOrRemove: result.pauseOrRemove.slice(0, 10),
    rationale: result.rationale,
  })
}
