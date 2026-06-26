import { NextRequest, NextResponse } from 'next/server'
import { MEDIA_PLAN_STRATEGY_PROMPT } from '@/lib/ai/prompts'
import { safeCallAI, isRealAI } from '@/lib/ai/provider'
import { z } from 'zod'

const schema = z.object({
  brief: z.record(z.unknown()),
  intakeAnswers: z.record(z.unknown()).optional(),
  businessType: z.string(),
})

export interface MediaPlanStrategy {
  businessType: string
  intakeSummary: {
    businessType: string
    productService: string
    objective: string
    monthlyBudget: number
    targetLocation: string
    targetAudience: string
    mainConversion: string
    websiteUrl: string
    trackingStatus: 'ready' | 'partial' | 'not_ready' | 'unknown'
    remarketingReadiness: 'ready' | 'small_audience' | 'not_ready' | 'unknown'
    productFeedStatus: 'ready' | 'not_ready' | 'not_applicable' | 'unknown'
    creativeReadiness: 'ready' | 'partial' | 'not_ready' | 'unknown'
    timeline: string
    keyAssumptions: string[]
  }
  recommendedStrategy: string
  budgetAllocation: {
    campaignType: string
    funnelStage: string
    budgetPct: number
    monthlyBudget: number
    dailyBudget: number
    mainKpi: string
    strategicRole: string
  }[]
  campaignStructure: {
    search: { name: string; theme: string; adGroups: string[]; keywordThemes: string[] }[]
    pmax: { name: string; assetGroups: string[]; audienceSignals: string[] }[]
    remarketing: { name: string; audience: string; lookbackWindow: number; messageAngle: string }[]
    demandGen: { name: string; audience: string; creativeAngle: string; funnelStage: string }[]
    other: unknown[]
  }
  funnelMapping: {
    funnelStage: string
    audience: string
    campaignType: string
    messageAngle: string
    conversionGoal: string
  }[]
  measurementPlan: {
    primaryConversion: string
    secondaryConversion: string
    microConversion: string
    trackingRisks: string[]
  }
  creativeRequirements: {
    searchAds: string
    pmaxAssets: string
    displayAssets: string
    videoAssets: string
    extensions: string[]
  }
  optimizationPlan: {
    week1_2: string[]
    week3_4: string[]
    month2plus: string[]
  }
  risks: string[]
  executiveSummary: string
}

function buildFallbackStrategy(
  brief: Record<string, unknown>,
  intakeAnswers: Record<string, unknown>,
  businessType: string
): MediaPlanStrategy {
  const budget = (brief.monthlyBudget as number) || 30000
  const objective = (brief.objective as string) || 'LEADS'
  const bizName = (brief.businessName as string) || 'Business'
  const location = (brief.targetLocation as string) || 'ประเทศไทย'
  const conversion = (brief.conversionGoal as string) || intakeAnswers.conversionGoal as string || 'Form Submit'
  const trackingAnswer = intakeAnswers.trackingReady as string || ''
  const remarketingAnswer = intakeAnswers.remarketingReady as string || ''
  const creativeAnswer = intakeAnswers.creativeReady as string || ''

  const trackingStatus = trackingAnswer.includes('ครบ') ? 'ready'
    : trackingAnswer.includes('บางส่วน') ? 'partial'
    : trackingAnswer.includes('ไม่ได้') ? 'not_ready' : 'unknown'

  const remarketingReadiness = remarketingAnswer.includes('เยอะ') ? 'ready'
    : remarketingAnswer.includes('พอประมาณ') ? 'ready'
    : remarketingAnswer.includes('น้อย') ? 'small_audience'
    : remarketingAnswer.includes('ใหม่') ? 'not_ready' : 'unknown'

  const creativeReadiness = creativeAnswer.includes('ทั้งรูปและวิดีโอ') ? 'ready'
    : creativeAnswer.includes('แค่รูป') ? 'partial'
    : creativeAnswer.includes('ยังไม่มี') ? 'not_ready' : 'unknown'

  const isEcomm = businessType.includes('eCommerce')
  const isLocal = businessType.includes('Local')
  const isBrand = businessType.includes('Brand Awareness')
  const isTravel = businessType.includes('Travel')
  const isBtB = businessType.includes('B2B')

  let searchPct = 50, pmaxPct = 25, remarketingPct = 15, demandGenPct = 10
  if (isEcomm)   { searchPct = 25; pmaxPct = 45; remarketingPct = 20; demandGenPct = 10 }
  if (isLocal)   { searchPct = 60; pmaxPct = 20; remarketingPct = 12; demandGenPct = 8  }
  if (isBrand)   { searchPct = 20; pmaxPct = 15; remarketingPct = 10; demandGenPct = 55 }
  if (isTravel)  { searchPct = 60; pmaxPct = 15; remarketingPct = 15; demandGenPct = 10 }
  if (isBtB)     { searchPct = 55; pmaxPct = 15; remarketingPct = 20; demandGenPct = 10 }
  if (objective === 'AWARENESS') { searchPct = 20; pmaxPct = 15; remarketingPct = 10; demandGenPct = 55 }

  const slugBiz = bizName.slice(0, 20)
  const objLabel = objective === 'LEADS' ? 'Lead' : objective === 'SALES' ? 'Sale' : objective === 'AWARENESS' ? 'Aware' : 'Traffic'

  return {
    businessType,
    intakeSummary: {
      businessType,
      productService: (brief.productService as string) || '',
      objective,
      monthlyBudget: budget,
      targetLocation: location,
      targetAudience: (brief.targetAudience as string) || '',
      mainConversion: conversion,
      websiteUrl: (brief.websiteUrl as string) || '',
      trackingStatus,
      remarketingReadiness,
      productFeedStatus: isEcomm ? (intakeAnswers.merchantCenterReady as string || '').includes('พร้อม') ? 'ready' : 'not_ready' : 'not_applicable',
      creativeReadiness,
      timeline: (intakeAnswers.campaignTimeline as string) || (brief.duration as string) || 'ไม่ระบุ',
      keyAssumptions: [
        trackingStatus === 'not_ready' ? 'ยังไม่มี Conversion Tracking — ต้องติดตั้งก่อน Scale' : null,
        remarketingReadiness === 'small_audience' ? 'Audience ยังน้อย — เริ่ม Remarketing หลัง Traffic สะสมถึง 100+ คน' : null,
        creativeReadiness === 'not_ready' ? 'ยังไม่มี Creative Assets — เริ่มจาก Search ก่อน' : null,
      ].filter(Boolean) as string[],
    },
    recommendedStrategy: `สำหรับ ${businessType} ที่มี objective ${objLabel} แนะนำให้เน้น Search เป็นหลัก (${searchPct}%) เพื่อจับ High-Intent traffic ก่อน Performance Max (${pmaxPct}%) ช่วย Scale ข้ามช่องทาง Remarketing (${remarketingPct}%) ดึงคนที่เคยสนใจกลับมา และ Demand Gen (${demandGenPct}%) สร้าง Awareness ให้ Funnel ต้นน้ำ`,
    budgetAllocation: [
      { campaignType: 'Search', funnelStage: 'Conversion', budgetPct: searchPct, monthlyBudget: Math.round(budget * searchPct / 100), dailyBudget: Math.round(budget * searchPct / 100 / 30), mainKpi: 'CPA / Lead', strategicRole: 'จับ High-Intent Search ที่พร้อมซื้อหรือติดต่อ' },
      { campaignType: 'Performance Max', funnelStage: 'Conversion', budgetPct: pmaxPct, monthlyBudget: Math.round(budget * pmaxPct / 100), dailyBudget: Math.round(budget * pmaxPct / 100 / 30), mainKpi: 'Conversion / ROAS', strategicRole: 'Scale ข้ามทุก Google Channel ด้วย AI Bidding' },
      { campaignType: 'Display Remarketing', funnelStage: 'Retention', budgetPct: remarketingPct, monthlyBudget: Math.round(budget * remarketingPct / 100), dailyBudget: Math.round(budget * remarketingPct / 100 / 30), mainKpi: 'CVR', strategicRole: 'ดึงคนที่เคยเข้าเว็บกลับมา Convert' },
      { campaignType: 'Demand Gen', funnelStage: 'Awareness', budgetPct: demandGenPct, monthlyBudget: Math.round(budget * demandGenPct / 100), dailyBudget: Math.round(budget * demandGenPct / 100 / 30), mainKpi: 'Reach / CTR', strategicRole: 'Social-style Discovery บน YouTube/Gmail/Discover' },
    ],
    campaignStructure: {
      search: [
        { name: `CVC - SEM | Generic | ${slugBiz} | ${objLabel}`, theme: 'Generic', adGroups: ['Generic Intent', 'Problem-Aware', 'Action-Ready'], keywordThemes: ['high-intent generic', 'problem solution', 'comparison'] },
        { name: `CVC - SEM | Brand | ${slugBiz} | ${objLabel}`, theme: 'Brand', adGroups: ['Brand Protection'], keywordThemes: ['brand name', 'brand + service'] },
      ],
      pmax: [
        { name: `CVC - PMax | ${slugBiz} | ${objLabel}`, assetGroups: ['Primary Asset Group', 'Remarketing Asset Group'], audienceSignals: ['Website Visitors', 'Similar Audiences', 'In-Market Segments'] },
      ],
      remarketing: [
        { name: `CVC - GDN | Remarketing | ${slugBiz} | ${objLabel}`, audience: 'All Website Visitors (30 days)', lookbackWindow: 30, messageAngle: 'กลับมาดูสิ่งที่คุณสนใจ — ติดต่อเราได้เลย' },
      ],
      demandGen: [
        { name: `CVC - DemandGen | ${slugBiz} | ${objLabel}`, audience: 'Similar to Converters + In-Market', creativeAngle: 'Visual Discovery + USP', funnelStage: 'Awareness → Consideration' },
      ],
      other: [],
    },
    funnelMapping: [
      { funnelStage: 'Awareness', audience: 'New Audience', campaignType: 'Demand Gen / YouTube', messageAngle: 'สร้าง brand awareness และ interest', conversionGoal: 'Video View / Click' },
      { funnelStage: 'Consideration', audience: 'In-Market Searchers', campaignType: 'Search Generic', messageAngle: 'ตอบ pain point + แสดง USP', conversionGoal: 'CTR / Engagement' },
      { funnelStage: 'Conversion', audience: 'High-Intent Searchers', campaignType: 'Search + PMax', messageAngle: 'CTA ชัดเจน + Offer + Trust', conversionGoal: conversion },
      { funnelStage: 'Retention', audience: 'Past Visitors / Customers', campaignType: 'Remarketing', messageAngle: 'Remind + เสนอ incentive', conversionGoal: 'Re-conversion' },
    ],
    measurementPlan: {
      primaryConversion: conversion,
      secondaryConversion: 'Website Engagement (30s+)',
      microConversion: 'Contact Page View / Pricing Page View',
      trackingRisks: [
        trackingStatus === 'not_ready' ? 'ยังไม่มี Conversion Tracking — Google Ads จะ Optimize ตาม Clicks อย่างเดียว ไม่ใช่ Conversion' : '',
        trackingStatus === 'partial' ? 'Tracking ติดตั้งบางส่วน — ตรวจสอบว่า Primary Conversion ครบ 100% หรือยัง' : '',
        'ตรวจสอบ Thank You Page หรือ Event Tracking ก่อน Launch ทุกครั้ง',
      ].filter(Boolean),
    },
    creativeRequirements: {
      searchAds: 'RSA: 15 Headlines (≤30 chars) + 4 Descriptions (≤90 chars) ต่อ Campaign',
      pmaxAssets: '15 Headlines + 5 Long Headlines + 4-5 Descriptions + 3-5 Images + Logo',
      displayAssets: '5 Headlines + 1 Long Headline + 5 Descriptions + Images 1200x628, 300x250',
      videoAssets: creativeReadiness === 'not_ready' ? 'ยังไม่มี Video — ข้ามส่วน YouTube/Demand Gen ก่อน' : '15-30 sec video สำหรับ Demand Gen / YouTube',
      extensions: ['Sitelinks (4+)', 'Callouts (4+)', 'Call Extension', 'Lead Form Extension'],
    },
    optimizationPlan: {
      week1_2: ['ตรวจ Conversion Tracking ทุกวัน', 'ดู Search Terms — เพิ่ม Negative Keywords', 'เช็ค CTR แต่ละ Ad Group', 'ตรวจ Budget Delivery'],
      week3_4: ['ปรับ Negative Keywords ต่อเนื่อง', 'ปรับ Budget ตาม CPA เริ่มต้น', 'ตัด Assets ที่ Low-performing ใน PMax', 'เพิ่ม Remarketing Audience ถ้าพอ'],
      month2plus: ['Scale Campaign ที่ CPA ดี', 'เพิ่ม PMax Budget ถ้า Conversion Stable', 'แยก Campaign ตาม Product/Service ที่ขายดี', 'Test Demand Gen ถ้า Creative พร้อม'],
    },
    risks: [
      trackingStatus === 'not_ready' ? 'Conversion Tracking ยังไม่พร้อม — Scale ก่อนมีข้อมูลจะทำให้เสียงบโดยไม่รู้ว่าได้ผล' : '',
      remarketingReadiness === 'not_ready' ? 'Remarketing Audience ยังไม่มี — ต้องสะสม Traffic ก่อน 1-2 เดือน' : '',
      creativeReadiness === 'not_ready' ? 'ยังไม่มี Creative Assets — PMax และ Demand Gen จะ Perform ได้ไม่เต็มที่' : '',
      'Budget ที่ต่ำเกินไปอาจทำให้ Algorithm เรียนรู้ช้า — ควรมี Daily Budget ≥ 10× Target CPA',
    ].filter(Boolean),
    executiveSummary: `แผนนี้ออกแบบสำหรับ ${businessType} ที่ต้องการ ${objLabel} ด้วยงบ ${budget.toLocaleString()} THB/เดือน กลยุทธ์หลักคือ Search Campaign (${searchPct}%) เพื่อจับ High-Intent Traffic ก่อน จากนั้น Performance Max (${pmaxPct}%) จะ Scale ข้ามช่องทาง Remarketing (${remarketingPct}%) ดึงคนที่สนใจกลับมา Convert และ Demand Gen (${demandGenPct}%) สร้าง Awareness ให้ Funnel ต้นน้ำ — แผนนี้จะ Optimize ต่อเนื่องตาม Data จริงในช่วง 30-60 วันแรก`,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { brief, intakeAnswers = {}, businessType } = schema.parse(body)

    const combinedBrief = { ...brief, ...intakeAnswers }

    if (isRealAI()) {
      const prompt = MEDIA_PLAN_STRATEGY_PROMPT
        .replace('{{BRIEF}}', JSON.stringify(combinedBrief, null, 2))
        .replace('{{BUSINESS_TYPE}}', businessType)

      const result = await safeCallAI(
        prompt,
        (raw) => {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (!parsed.businessType || !parsed.budgetAllocation) return null
          return parsed as MediaPlanStrategy
        },
        () => buildFallbackStrategy(brief, intakeAnswers, businessType),
        { temperature: 0.3, tier: 'quality' }
      )
      return NextResponse.json(result)
    }

    return NextResponse.json(buildFallbackStrategy(brief, intakeAnswers, businessType))
  } catch (err) {
    console.error('[intake/generate-plan]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
