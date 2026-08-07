export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { safeCallAI } from '@/lib/ai/provider'

// ── Text Ads Generator ────────────────────────────────────────────────────────
// เขียน Responsive Search Ad จาก brief + keywords + คำสั่ง Do/Don't ของผู้ใช้
// แนบรูปครีเอทีฟให้ AI อ่านประกอบได้ (multimodal ผ่าน callAI ตัวกลาง —
// vertex OIDC เส้นเดิมของระบบ ไม่มีการวาง API key เพิ่ม)

const schema = z.object({
  businessName:   z.string().min(1),
  productService: z.string().default(''),
  finalUrl:       z.string().default(''),
  objective:      z.string().default('leads'),
  dailyBudget:    z.number().optional(),
  keywords:       z.array(z.string()).default([]),
  // อยากได้อะไร / ไม่เอาอะไร
  suggestions:    z.string().default(''),
  exclusions:     z.string().default(''),
  // รูปครีเอทีฟ (data URL) ให้ AI อ่านประกอบ — สูงสุด 3 รูป
  creatives:      z.array(z.string()).max(3).default([]),
  // จำนวนชุดโฆษณาที่อยากได้ (1 ชุด = RSA 1 ตัว)
  numAds:         z.number().min(1).max(3).default(1),
  // ผลรอบก่อน (ตอนกด generate ซ้ำ) — ให้ AI รู้ว่าอันไหนไม่เอา จะได้ไม่เขียนซ้ำ
  previous:       z.array(z.object({
    headlines: z.array(z.string()),
    descriptions: z.array(z.string()),
  })).optional(),
})

export interface GeneratedTextAd {
  headlines: string[]      // 8-15 อัน ≤30 ตัวอักษร
  descriptions: string[]   // 2-4 อัน ≤90 ตัวอักษร
  path1?: string
  path2?: string
}

function dataUrlToImage(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  return { mimeType: m[1], data: m[2] }
}

// ตัดข้อความที่ยาวเกินลิมิตของ Google ทิ้ง (แทนที่จะปล่อยผ่านแล้วไป fail ตอน push)
function sanitizeAd(raw: unknown): GeneratedTextAd | null {
  const a = raw as Record<string, unknown>
  if (!a || !Array.isArray(a.headlines) || !Array.isArray(a.descriptions)) return null
  const headlines = a.headlines.map(h => String(h).trim()).filter(h => h.length > 0 && h.length <= 30).slice(0, 15)
  const descriptions = a.descriptions.map(d => String(d).trim()).filter(d => d.length > 0 && d.length <= 90).slice(0, 4)
  if (headlines.length < 3 || descriptions.length < 2) return null
  const path1 = typeof a.path1 === 'string' ? a.path1.trim().slice(0, 15) : undefined
  const path2 = typeof a.path2 === 'string' ? a.path2.trim().slice(0, 15) : undefined
  return { headlines, descriptions, ...(path1 ? { path1 } : {}), ...(path2 ? { path2 } : {}) }
}

export async function POST(req: NextRequest) {
  try {
    const input = schema.parse(await req.json())

    const images = input.creatives
      .map(dataUrlToImage)
      .filter((im): im is { mimeType: string; data: string } => im !== null)

    const prompt = `คุณเป็น Google Ads copywriter มือหนึ่งสำหรับตลาดไทย เขียน Responsive Search Ad

ข้อมูลธุรกิจ:
- ธุรกิจ/แบรนด์: ${input.businessName}
- สินค้า/บริการ: ${input.productService || input.businessName}
- Objective: ${input.objective}
${input.dailyBudget ? `- งบ: ฿${input.dailyBudget}/วัน` : ''}
${input.finalUrl ? `- Landing page: ${input.finalUrl}` : ''}
${input.keywords.length > 0 ? `- Keywords ที่ต้องสอดคล้อง (ใช้คำพวกนี้ใน headline ให้มากที่สุด): ${input.keywords.join(', ')}` : ''}
${images.length > 0 ? `- มีรูปครีเอทีฟแนบมา ${images.length} รูป — อ่านข้อความ/โปรโมชั่น/ราคา/จุดขายในรูป แล้วเอามาใช้เขียนโฆษณาให้ตรงกัน` : ''}

${input.suggestions.trim() ? `คำสั่งจากผู้ใช้ — ต้องทำ (สำคัญมาก):\n${input.suggestions.trim()}\n` : ''}
${input.exclusions.trim() ? `คำสั่งจากผู้ใช้ — ห้ามทำ/ห้ามใส่ (สำคัญมาก):\n${input.exclusions.trim()}\n` : ''}
${(input.previous ?? []).length > 0 ? `ผลรอบก่อนที่ผู้ใช้ยังไม่ถูกใจ (ห้ามเขียนซ้ำแนวเดิมเป๊ะ ๆ):\n${JSON.stringify(input.previous)}\n` : ''}

กติกา Google (เข้มงวด):
- headlines: ${input.numAds > 1 ? 'ชุดละ' : ''} 12-15 อัน อันละ ≤ 30 ตัวอักษร (นับสระ/วรรณยุกต์ไทยด้วย) ห้ามซ้ำกันเอง
- descriptions: 4 อัน อันละ ≤ 90 ตัวอักษร
- ผสม emotion: CTA ชัด ๆ อย่างน้อย 2, ราคา/โปรโมชั่น (ถ้ามีข้อมูล), จุดขายหลัก, ความน่าเชื่อถือ
- ห้ามใช้เครื่องหมายตกใจเกิน 1 จุดต่อข้อความ ห้ามอักษรพิเศษแปลก ๆ ห้ามคำเกินจริงที่ผิดนโยบาย Google
- path1/path2: คำสั้น ๆ ภาษาไทยหรืออังกฤษ ≤ 15 ตัวอักษร สื่อถึงสินค้า

ตอบ JSON เท่านั้น:
{"ads":[{"headlines":["..."],"descriptions":["..."],"path1":"...","path2":"..."}]}
โดย ads มี ${input.numAds} ชุด`

    const result = await safeCallAI<{ ads: GeneratedTextAd[] }>(
      prompt,
      (raw) => {
        const r = raw as { ads?: unknown[] }
        if (!r || !Array.isArray(r.ads)) return null
        const ads: GeneratedTextAd[] = []
        for (const a of r.ads) {
          const ok = sanitizeAd(a)
          if (ok) ads.push(ok)
        }
        return ads.length > 0 ? { ads } : null
      },
      // dev เท่านั้น (ไม่มี AI provider) — production ไม่ตกมาที่นี่
      () => ({
        ads: [{
          headlines: ['ตัวอย่าง Headline 1', 'ตัวอย่าง Headline 2', 'ตัวอย่าง Headline 3'],
          descriptions: ['ตัวอย่างคำอธิบายที่หนึ่งของโฆษณา', 'ตัวอย่างคำอธิบายที่สองของโฆษณา'],
        }],
      }),
      {
        tier: 'quality',
        temperature: 0.7,
        images,
        _route: '/api/text-ads/generate',
      }
    )

    return NextResponse.json({ ads: result.ads })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 })
    }
    console.error('[text-ads/generate]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
