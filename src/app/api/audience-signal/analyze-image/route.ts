import { NextRequest, NextResponse } from 'next/server'
import { getProvider, logAiCost } from '@/lib/ai/provider'
import { generateVertexText } from '@/lib/ai/vertex'
import { z } from 'zod'
import { EXECUTIVE_GROWTH_SKILL, AUDIENCE_SIGNAL_CONTEXT } from '@/lib/ai/prompts'

const schema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  campaignName: z.string(),
  businessName: z.string(),
  productService: z.string(),
})

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

const MOCK_RESULT = {
  keywords: [
    'สินค้าแบรนด์เนม',
    'ของแต่งบ้าน',
    'แฟชั่นไลฟ์สไตล์',
    'ราคาดี',
    'สั่งออนไลน์',
    'คุณภาพพรีเมียม',
    'ดีไซน์สวย',
    'ส่งฟรี',
    'ของขวัญ',
    'ไลฟ์สไตล์',
    'สินค้าใหม่',
    'ยอดนิยม',
    'ขายดี',
    'รีวิวดี',
    'best quality',
    'home decor',
    'trendy',
    'premium product',
    'affordable',
    'fast delivery',
  ],
  themes: [
    'สินค้าคุณภาพสูง',
    'ดีไซน์ทันสมัย',
    'ราคาคุ้มค่า',
    'ประสบการณ์ผู้ใช้ดี',
    'น่าเชื่อถือ',
    'ส่งฟรีทั่วไทย',
    'มีรับประกัน',
    'เลือกซื้อออนไลน์',
    'lifestyle product',
  ],
  inMarket: [
    'Retail > Apparel & Accessories',
    'Home & Garden > Home Improvement',
    'Beauty & Personal Care',
  ],
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = schema.parse(body)

    if (getProvider() !== 'vertex') {
      return NextResponse.json(MOCK_RESULT)
    }

    const prompt = `วิเคราะห์รูปภาพนี้เพื่อหา Audience Signals สำหรับ Google Ads Performance Max

บริบทแคมเปญ:
- แคมเปญ: ${input.campaignName}
- ธุรกิจ: ${input.businessName}
- สินค้า/บริการ: ${input.productService}

จากรูปที่เห็น ให้วิเคราะห์และสร้าง audience signals ให้ครบที่สุด:
1. กลุ่มลูกค้าที่น่าจะสนใจ สไตล์ไลฟ์สไตล์ demographic
2. สิ่งที่เห็นในรูป (สินค้า บรรยากาศ สไตล์)
3. Intent ของคนที่จะซื้อ รวมถึง commercial intent keywords

ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{
  "keywords": ["keyword1", "keyword2", ...],
  "themes": ["theme1", "theme2", ...],
  "inMarket": ["segment1", ...]
}

keywords: ให้ครบ 20 search terms ภาษาไทย/อังกฤษ ที่คนกำลังจะซื้อ รวม long-tail และ commercial intent
themes: ให้ครบ 10 search themes ที่เกี่ยวข้องกับธุรกิจและรูปนี้
inMarket: เลือกจาก Google In-Market segments ที่ตรงที่สุดให้มากที่สุด เช่น "Retail > Apparel & Accessories", "Real Estate > Residential Properties", "Financial Services > Personal Loans", "Travel > International Travel", "Automotive > New Vehicles", "Home & Garden > Home Improvement", "Beauty & Personal Care", "Health & Fitness", "Education > Online Courses", "Business Services > B2B Services"`

    const genResult = await generateVertexText({
      model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash',
      system: `${EXECUTIVE_GROWTH_SKILL}\n\n${AUDIENCE_SIGNAL_CONTEXT}`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: input.mediaType,
              data: { type: 'data', data: input.imageBase64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      temperature: 0.3,
      maxOutputTokens: 65536,
    })
    const inp = genResult.usage.inputTokens ?? 0
    const out = genResult.usage.outputTokens ?? 0
    if (inp > 0 || out > 0) {
      void logAiCost({
        route: '/api/audience-signal/analyze-image',
        model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash',
        inputTokens: inp,
        outputTokens: out,
        estimatedUSD: (inp / 1e6) * 0.075 + (out / 1e6) * 0.3,
      })
    }
    const text = genResult.text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = JSON.parse(jsonMatch[0]) as {
      keywords?: string[]
      themes?: string[]
      inMarket?: string[]
    }

    return NextResponse.json({
      keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 20) : [],
      themes: Array.isArray(result.themes) ? result.themes.slice(0, 10) : [],
      inMarket: Array.isArray(result.inMarket) ? result.inMarket : [],
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }
    console.error('[analyze-image]', err)
    return NextResponse.json({ error: 'Failed to analyze image' }, { status: 500 })
  }
}
