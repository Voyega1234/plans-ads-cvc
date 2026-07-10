import { NextRequest, NextResponse } from 'next/server'
import { LAUNCH_TODAY_STRATEGY_PROMPT } from '@/lib/ai/prompts'
import { safeCallAI, isRealAI } from '@/lib/ai/provider'
import { z } from 'zod'

const schema = z.object({
  brief: z.record(z.unknown()),
  intakeAnswers: z.record(z.unknown()).optional().default({}),
  businessType: z.string().min(1),
})

export interface LaunchCampaign {
  name: string; type: string; theme: string
  dailyBudget: number; monthlyBudget: number
  bidStrategy: string; targetLocation: string; primaryConversion: string
  adGroups: { name: string; keywordThemes: string[]; matchType: string; negativeDirection: string[] }[]
  audienceSignals: string[]
  assetRequirements: { headlines: number; descriptions: number; images: boolean; videos: boolean; extensions: string[] }
  remarketingSetup: { audience: string; lookbackWindow: number; messageAngle: string } | null
}

export interface LaunchStrategy {
  businessType: string
  launchObjective: string
  campaignTypeRecommendation: { primaryCampaign: string; reasoning: string; launchOrder: string[] }
  campaigns: LaunchCampaign[]
  prelaunchChecklist: { item: string; status: 'required' | 'recommended'; risk: 'high' | 'medium' | 'low' }[]
  launchRisks: string[]
  next7DayPlan: { day1_2: string[]; day3_5: string[]; day6_7: string[] }
  keyAssumptions: string[]
}

function buildFallback(brief: Record<string, unknown>, businessType: string): LaunchStrategy {
  const budget = (brief.monthlyBudget as number) || 30000
  const location = (brief.targetLocation as string) || 'ประเทศไทย'
  const conversion = (brief.conversionGoal as string) || 'Form Submit'
  const slug = ((brief.businessName as string) || 'Client').slice(0, 20)
  const obj = ((brief.objective as string) || 'LEADS') === 'SALES' ? 'Sale' : 'Lead'

  return {
    businessType,
    launchObjective: `เปิด Google Search Campaign วันนี้เพื่อจับ high-intent traffic ที่กำลังค้นหาบริการ/สินค้าอยู่ เน้น ${obj} เป็นหลัก ด้วยงบ ฿${budget.toLocaleString()}/เดือน`,
    campaignTypeRecommendation: {
      primaryCampaign: 'SEARCH',
      reasoning: 'Search Campaign เหมาะกับการ launch วันแรกเพราะควบคุม keyword และ audience ได้ชัดเจน วัด conversion ได้ทันที และ learning phase สั้นกว่า PMax',
      launchOrder: ['SEARCH', 'PERFORMANCE_MAX', 'REMARKETING'],
    },
    campaigns: [
      {
        name: `CVC - SEM | Generic | ${slug} | ${obj}`,
        type: 'SEARCH', theme: 'Generic',
        dailyBudget: Math.round(budget * 0.6 / 30),
        monthlyBudget: Math.round(budget * 0.6),
        bidStrategy: 'MAXIMIZE_CONVERSIONS',
        targetLocation: location,
        primaryConversion: conversion,
        adGroups: [
          {
            name: `${slug} | Generic Intent`,
            keywordThemes: ['high-intent generic', 'problem-aware', 'solution-seeking'],
            matchType: 'PHRASE',
            negativeDirection: ['ฟรี', 'งาน', 'pantip', 'รีวิว', 'ราคา'],
          },
        ],
        audienceSignals: ['In-Market: เกี่ยวข้องกับ productService', 'Website Visitors (past 30 days)'],
        assetRequirements: { headlines: 15, descriptions: 4, images: false, videos: false, extensions: ['Sitelinks (4)', 'Callouts (4)', 'Call Extension', 'Lead Form Extension'] },
        remarketingSetup: null,
      },
      {
        name: `CVC - SEM | Brand | ${slug} | ${obj}`,
        type: 'SEARCH', theme: 'Brand',
        dailyBudget: Math.round(budget * 0.1 / 30),
        monthlyBudget: Math.round(budget * 0.1),
        bidStrategy: 'MAXIMIZE_CLICKS',
        targetLocation: location,
        primaryConversion: conversion,
        adGroups: [{ name: `${slug} | Brand`, keywordThemes: ['brand name', 'brand + service'], matchType: 'PHRASE', negativeDirection: [] }],
        audienceSignals: [],
        assetRequirements: { headlines: 15, descriptions: 4, images: false, videos: false, extensions: ['Sitelinks (4)', 'Call Extension'] },
        remarketingSetup: null,
      },
    ],
    prelaunchChecklist: [
      { item: 'Google Ads Conversion Tracking ติดตั้งแล้ว', status: 'required', risk: 'high' },
      { item: 'Landing page พร้อมและ load ได้', status: 'required', risk: 'high' },
      { item: 'Thank You page หรือ Conversion event ทำงานได้', status: 'required', risk: 'high' },
      { item: 'Google Ads account ได้รับ billing แล้ว', status: 'required', risk: 'high' },
      { item: 'RSA ad copy พร้อม (15 headlines + 4 descriptions)', status: 'required', risk: 'medium' },
      { item: 'Sitelink extensions พร้อม', status: 'recommended', risk: 'low' },
      { item: 'Negative keyword list เตรียมไว้', status: 'recommended', risk: 'medium' },
    ],
    launchRisks: [
      'Conversion Tracking ยังไม่ confirmed — campaign จะ optimize ตาม clicks ไม่ใช่ conversions',
      'Budget ต่ำกว่า ฿1,000/วัน อาจทำให้ learning phase ช้ากว่าปกติ',
      'ยังไม่มีข้อมูล negative keywords — อาจเสียงบกับ irrelevant search terms',
    ],
    next7DayPlan: {
      day1_2: ['เปิด campaign · ตรวจ conversion tracking live', 'ดู search terms ที่ trigger ad', 'ตรวจ CTR ว่า ad ปรากฏถูกต้อง'],
      day3_5: ['เพิ่ม negative keywords จาก search terms report', 'ตรวจ landing page bounce rate', 'ดู conversion ว่าเริ่มเข้าหรือยัง'],
      day6_7: ['สรุป CPA เบื้องต้น เทียบกับ target', 'ตัดสินใจปรับ bid strategy ถ้า conversion มาแล้ว 10+', 'วางแผน week 2'],
    },
    keyAssumptions: [
      'Monthly budget ฿' + budget.toLocaleString() + ' — ตัวเลขจาก brief',
      'Search First strategy — เหมาะกับ new account / ยังไม่มี tracking history',
      'Conversion goal: ' + conversion,
    ],
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { brief, intakeAnswers, businessType } = schema.parse(body)
    const combined = { ...brief, ...intakeAnswers }

    if (isRealAI()) {
      const prompt = LAUNCH_TODAY_STRATEGY_PROMPT
        .replace('{{BRIEF}}', JSON.stringify(combined, null, 2))
        .replace('{{BUSINESS_TYPE}}', businessType)

      const result = await safeCallAI(
        prompt,
        (raw) => {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (!parsed.businessType || !Array.isArray(parsed.campaigns)) return null
          return parsed as LaunchStrategy
        },
        () => buildFallback(combined, businessType),
        { temperature: 0.25, tier: 'quality', _route: '/api/intake/launch-strategy', _feature: 'intake', _subfeature: 'launch_strategy' }
      )
      return NextResponse.json(result)
    }

    return NextResponse.json(buildFallback(combined, businessType))
  } catch (err) {
    console.error('[intake/launch-strategy]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
