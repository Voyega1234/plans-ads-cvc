import { NextRequest, NextResponse } from 'next/server'
import { INTAKE_ANALYSIS_PROMPT } from '@/lib/ai/prompts'
import { safeCallAI, isRealAI } from '@/lib/ai/provider'
import { z } from 'zod'

const schema = z.object({
  brief: z.record(z.unknown()),
  taskType: z.enum(['media-plan']).default('media-plan'),
})

export interface IntakeQuestion {
  id: string
  question: string
  type: 'text' | 'select' | 'multiselect' | 'yesno'
  options: string[] | null
  required: boolean
  category: string
}

export interface IntakeAnalysis {
  businessType: string
  businessTypeReason: string
  missingCritical: string[]
  canProceed: boolean
  proceedWithAssumptions: boolean
  assumptions: string[]
  questions: IntakeQuestion[]
  intakeMode: 'full' | 'quick' | 'launch'
}

function classifyBusiness(brief: Record<string, unknown>): string {
  const product = ((brief.productService as string) || '').toLowerCase()
  const biz = ((brief.businessName as string) || '').toLowerCase()
  const combined = product + ' ' + biz

  if (combined.match(/วีซ่า|visa|ท่องเที่ยว|travel|tour|immigration|ต่างประเทศ/)) return 'Travel / Visa / Tourism Service'
  if (combined.match(/คอนโด|บ้าน|อสังหา|real estate|property|โครงการ/)) return 'Real Estate / Property'
  if (combined.match(/คลินิก|โรงพยาบาล|แพทย์|ทันตกรรม|จัดฟัน|clinic|hospital|beauty|สปา|wellness|ความงาม/)) return 'Healthcare / Beauty / Wellness'
  if (combined.match(/course|คอร์ส|อบรม|training|สถาบัน|สอน|เรียน|certificate/)) return 'Education / Course / Training'
  if (combined.match(/app|แอป|saas|software|platform|ระบบ|subscription/)) return 'App / Platform / SaaS'
  if (combined.match(/ร้านอาหาร|restaurant|โรงแรม|hotel|resort|café|กาแฟ|สาขา|branch/)) return 'Restaurant / Retail / Offline Branch'
  if (combined.match(/shop|store|ร้าน|สินค้า|product|ขาย|ecommerce|marketplace|sku/)) return 'eCommerce / Online Store'
  if (combined.match(/b2b|enterprise|corporate|ธุรกิจ|บริษัท|consulting|ที่ปรึกษา/)) return 'B2B / High-Ticket Service'
  if (combined.match(/local|ใกล้ฉัน|สาขา|branch|ช่าง|ซ่อม|service/)) return 'Local Service Business'
  return 'Lead Generation Service'
}

function buildFallbackAnalysis(
  brief: Record<string, unknown>,
  taskType: string
): IntakeAnalysis {
  const objective = (brief.objective as string) || ''
  const budget = brief.monthlyBudget as number | undefined
  const businessType = classifyBusiness(brief)
  const missing: string[] = []

  if (!brief.businessName) missing.push('businessName')
  if (!brief.productService) missing.push('productService')
  if (!brief.objective) missing.push('objective')
  if (!brief.monthlyBudget) missing.push('monthlyBudget')
  if (!brief.targetLocation) missing.push('targetLocation')
  if (!brief.websiteUrl) missing.push('websiteUrl')
  if (!brief.conversionGoal) missing.push('conversionGoal')

  const canProceed = missing.length < 3

  const questions: IntakeQuestion[] = []

  if (!brief.objective) {
    questions.push({
      id: 'objective',
      question: 'เป้าหมายหลักของแคมเปญคืออะไรครับ?',
      type: 'select',
      options: ['Lead', 'Sales / Purchase', 'Store Visit', 'App Install', 'Awareness', 'Traffic'],
      required: true,
      category: 'objective',
    })
  }

  if (!brief.monthlyBudget) {
    questions.push({
      id: 'monthlyBudget',
      question: 'งบโฆษณาต่อเดือนเท่าไหร่ครับ (THB)?',
      type: 'select',
      options: ['ต่ำกว่า 10,000', '10,000–30,000', '30,000–50,000', '50,000–100,000', 'มากกว่า 100,000'],
      required: true,
      category: 'budget',
    })
  }

  if (!brief.conversionGoal) {
    questions.push({
      id: 'conversionGoal',
      question: 'Conversion หลักที่ต้องการวัดคืออะไร?',
      type: 'multiselect',
      options: ['Form Submit', 'Phone Call', 'LINE Click', 'Purchase', 'Booking', 'App Install', 'Chat'],
      required: true,
      category: 'objective',
    })
  }

  questions.push({
    id: 'trackingReady',
    question: 'ติดตั้ง Google Ads Conversion Tracking และ GA4 แล้วหรือยัง?',
    type: 'select',
    options: ['ติดตั้งครบแล้ว', 'ติดตั้งบางส่วน', 'ยังไม่ได้ติดตั้ง', 'ไม่แน่ใจ'],
    required: true,
    category: 'tracking',
  })

  questions.push({
    id: 'remarketingReady',
    question: 'เว็บไซต์มี Traffic พอสำหรับ Remarketing ไหม? (ประมาณ 100+ คน/เดือน)',
    type: 'select',
    options: ['มีเยอะมาก (500+ คน/เดือน)', 'มีพอประมาณ (100–500 คน/เดือน)', 'น้อยมาก (ต่ำกว่า 100 คน/เดือน)', 'เพิ่งเปิดเว็บใหม่'],
    required: false,
    category: 'remarketing',
  })

  if (businessType === 'eCommerce / Online Store') {
    questions.push({
      id: 'merchantCenterReady',
      question: 'มี Google Merchant Center และ Product Feed พร้อมไหม?',
      type: 'select',
      options: ['พร้อมแล้ว (Feed อัปโหลดแล้ว)', 'มี Merchant Center แต่ยังไม่ได้ทำ Feed', 'ยังไม่มี', 'ไม่แน่ใจ'],
      required: true,
      category: 'ecommerce',
    })
  }

  if (businessType === 'Local Service Business') {
    questions.push({
      id: 'googleBusinessProfile',
      question: 'มี Google Business Profile (Google Maps) แล้วไหม?',
      type: 'yesno',
      options: null,
      required: false,
      category: 'local',
    })
  }

  questions.push({
    id: 'creativeReady',
    question: 'มีรูปภาพหรือวิดีโอสำหรับโฆษณาพร้อมไหม?',
    type: 'select',
    options: ['พร้อมทั้งรูปและวิดีโอ', 'มีแค่รูปภาพ', 'ยังไม่มี ต้องสร้างใหม่', 'ใช้ Google สร้างให้ได้เลย'],
    required: false,
    category: 'creative',
  })

  if (!budget || budget < 10000) {
    questions.push({
      id: 'budgetFlexibility',
      question: 'งบโฆษณาสามารถปรับเพิ่มได้ถ้า ROI ดีหรือไม่?',
      type: 'yesno',
      options: null,
      required: false,
      category: 'budget',
    })
  }

  if (objective === 'LEADS' || !objective) {
    questions.push({
      id: 'leadQuality',
      question: 'Lead ที่ดีต้องมีคุณสมบัติอะไร? (เพื่อตั้ง targeting ให้ถูกต้อง)',
      type: 'text',
      options: null,
      required: false,
      category: 'objective',
    })
  }

  return {
    businessType,
    businessTypeReason: `ธุรกิจนี้เป็น ${businessType} เพราะข้อมูลผลิตภัณฑ์/บริการชี้ไปในทิศทางนี้`,
    missingCritical: missing,
    canProceed,
    proceedWithAssumptions: missing.length > 0,
    assumptions: missing.map(f => `ข้อมูล ${f} ยังไม่มี — ระบบจะใช้ค่าเริ่มต้นจากตลาดไทย`),
    questions: questions.slice(0, 10),
    intakeMode: missing.length > 4 ? 'full' : 'quick',
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { brief, taskType } = schema.parse(body)

    if (isRealAI()) {
      const prompt = INTAKE_ANALYSIS_PROMPT
        .replace('{{BRIEF}}', JSON.stringify(brief, null, 2))
        .replace('{{TASK_TYPE}}', taskType)

      const result = await safeCallAI(
        prompt,
        (raw) => {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (!parsed.businessType || !Array.isArray(parsed.questions)) return null
          return parsed as IntakeAnalysis
        },
        () => buildFallbackAnalysis(brief, taskType),
        { temperature: 0.2, tier: 'standard' }
      )
      return NextResponse.json(result)
    }

    return NextResponse.json(buildFallbackAnalysis(brief, taskType))
  } catch (err) {
    console.error('[intake/analyze]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
