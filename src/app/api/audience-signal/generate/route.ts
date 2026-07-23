import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, AUDIENCE_SIGNAL_CONTEXT } from '@/lib/ai/prompts'
import { z } from 'zod'
import type { PMaxSignal } from '@/types'

type AudienceSignalResult = PMaxSignal['audienceSignals']

const schema = z.object({
  campaignName:   z.string(),
  businessName:   z.string(),
  productService: z.string(),
  targetAudience: z.string(),
  objective:      z.string(),
})

const MOCK_SIGNAL: AudienceSignalResult = {
  customIntent: [
    'ซื้อออนไลน์', 'ราคาดี', 'โปรโมชั่น', 'รีวิว', 'เปรียบเทียบราคา',
    'ส่งฟรี', 'ลดราคา', 'สั่งซื้อ', 'ของแท้', 'คุ้มค่า',
    'แนะนำ', 'ดีที่สุด', 'คุณภาพดี', 'ราคาถูก', 'สินค้าใหม่',
    'อยากได้', 'กำลังมองหา', 'ต้องการ', 'สนใจ', 'เปิดดู',
    'ค้นหา', 'หาข้อมูล', 'อ่านรีวิว', 'เช็คราคา', 'เปรียบเทียบ',
    'ซื้อเดี๋ยวนี้', 'รีบซื้อ', 'โปรพิเศษ', 'ลดสูงสุด', 'Flash sale',
    'สินค้าแนะนำ', 'ยอดนิยม', 'ขายดี', 'รีวิวดี', 'rating สูง',
    'น่าเชื่อถือ', 'ของแท้ 100%', 'รับประกัน', 'มีรับประกัน', 'บริการดี',
    'ส่งเร็ว', 'รับสินค้าเร็ว', 'พร้อมส่ง', 'สต็อกมีพร้อม', 'ซื้อได้เลย',
    'best deal', 'good price', 'discount', 'sale now', 'buy now',
  ],
  searchThemes: [
    'สินค้าคุณภาพสูง', 'บริการมืออาชีพ', 'ราคาย่อมเยา', 'รวดเร็วทันใจ',
    'น่าเชื่อถือ', 'ประสบการณ์ดี', 'ลูกค้าพึงพอใจ', 'ส่งตรงถึงบ้าน',
    'มีการรับประกัน', 'ตอบโจทย์ทุกความต้องการ', 'คุ้มค่าเงิน', 'ทีมงานผู้เชี่ยวชาญ',
    'บริการหลังการขาย', 'ผลิตภัณฑ์ยอดนิยม', 'แบรนด์น่าไว้วางใจ',
    'ราคาดีที่สุด', 'ทดลองใช้ฟรี', 'คืนสินค้าได้', 'ชำระหลายวิธี',
    'มีหน้าร้าน', 'จัดส่งทั่วไทย', 'ปรึกษาฟรี', 'ไม่มีค่าธรรมเนียมแอบแฝง',
    'สมัครง่าย', 'ใช้งานง่าย',
  ],
  customerList: [],
  remarketing: [
    'All Website Visitors (30d)',
    'All Website Visitors (90d)',
    'Cart Abandoners',
    'Past Converters',
  ],
  inMarket: ['Retail > Apparel & Accessories', 'Beauty & Personal Care'],
  demographics: {
    ageRanges:       ['25-34', '35-44'],
    genders:         ['Male', 'Female'],
    householdIncome: ['Top 10%', '11-20%', '21-30%'],
  },
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = schema.parse(body)

    const prompt = `คุณเป็น Google Ads Expert ที่เชี่ยวชาญ Performance Max Audience Signals

ข้อมูลแคมเปญ:
- ชื่อแคมเปญ: ${input.campaignName}
- ธุรกิจ: ${input.businessName}
- สินค้า/บริการ: ${input.productService}
- กลุ่มเป้าหมาย: ${input.targetAudience}
- วัตถุประสงค์: ${input.objective}

สร้าง Audience Signals ที่เหมาะสมที่สุดและครบที่สุดสำหรับแคมเปญนี้
- customIntent: ให้ครบ 50 keywords เต็ม (เป็น keywords ที่คนกำลังจะซื้อหรือสนใจ ทั้งไทยและอังกฤษ รวม long-tail, exact match, commercial intent)
- searchThemes: ให้ครบ 25 themes (เป็น topics/ธีมที่เกี่ยวข้องกับธุรกิจ)
- remarketing: เลือกที่เกี่ยวข้องจากรายการ
- inMarket: เลือก Google In-Market segments ที่ตรงกับกลุ่มเป้าหมายให้มากที่สุด
- demographics: เลือกที่เหมาะสมกับธุรกิจนี้

ตอบในรูปแบบ JSON เท่านั้น ไม่มีข้อความอื่น ไม่มี markdown:

{
  "customIntent": ["keyword1", "keyword2", ...],
  "searchThemes": ["theme1", "theme2", ...],
  "customerList": [],
  "remarketing": ["All Website Visitors (30d)", ...],
  "inMarket": ["segment1", ...],
  "demographics": {
    "ageRanges": ["25-34", "35-44"],
    "genders": ["Male", "Female"],
    "householdIncome": ["Top 10%", "11-20%"]
  }
}

remarketing options: All Website Visitors (30d), All Website Visitors (90d), Cart Abandoners, Past Converters, YouTube Viewers, LINE Click Audience, App Users
ageRanges options: 18-24, 25-34, 35-44, 45-54, 55-64, 65+, Unknown
genders options: Male, Female, Unknown
householdIncome options: Top 10%, 11-20%, 21-30%, 31-40%, 41-50%, Lower 50%, Unknown`

    const VALID_AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown']
    const VALID_GENDERS = ['Male', 'Female', 'Unknown']
    const VALID_INCOME = ['Top 10%', '11-20%', '21-30%', '31-40%', '41-50%', 'Lower 50%', 'Unknown']
    const VALID_REMARKETING = ['All Website Visitors (30d)', 'All Website Visitors (90d)', 'Cart Abandoners', 'Past Converters', 'YouTube Viewers', 'LINE Click Audience', 'App Users']

    const signal = await safeCallAI<AudienceSignalResult>(
      prompt,
      (raw) => {
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return null
        let parsed: AudienceSignalResult
        try { parsed = JSON.parse(jsonMatch[0]) as AudienceSignalResult } catch { return null }

        // Require minimum signal quality — PMax needs enough signals to train
        if (!Array.isArray(parsed.customIntent) || parsed.customIntent.length < 10) return null
        if (!Array.isArray(parsed.searchThemes) || parsed.searchThemes.length < 5) return null
        if (!Array.isArray(parsed.inMarket) || parsed.inMarket.length < 1) return null

        // Sanitize: filter empty strings, cap at reasonable limits
        parsed.customIntent = parsed.customIntent.filter((k): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 50)
        parsed.searchThemes = parsed.searchThemes.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 25)
        parsed.remarketing = (parsed.remarketing ?? []).filter((r): r is string => VALID_REMARKETING.includes(r))
        parsed.inMarket = (parsed.inMarket ?? []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 20)
        parsed.customerList = []

        // Validate demographics enums
        if (parsed.demographics) {
          parsed.demographics.ageRanges = (parsed.demographics.ageRanges ?? []).filter(a => VALID_AGE_RANGES.includes(a))
          parsed.demographics.genders = (parsed.demographics.genders ?? []).filter(g => VALID_GENDERS.includes(g))
          parsed.demographics.householdIncome = (parsed.demographics.householdIncome ?? []).filter(i => VALID_INCOME.includes(i))
        }

        return parsed
      },
      () => MOCK_SIGNAL,
      { maxTokens: 65536, systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${AUDIENCE_SIGNAL_CONTEXT}` },
    )

    return NextResponse.json({ signal })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to generate' }, { status: 500 })
  }
}
