import { KeywordAudiencePlan, MediaPlanJson, PMaxSignal } from '@/types'
import { KEYWORD_AUDIENCE_PROMPT } from './prompts'
import { safeCallAI, isRealAI } from './provider'
import { validateKwPlan } from './schemas'

// Industry keyword seeds — expand from product text
function deriveKeywordSeeds(product: string, businessName: string): {
  nonBrand: string[]
  brand: string[]
  informational: string[]
} {
  const s = product.toLowerCase()
  const bn = businessName.toLowerCase()

  // Brand terms
  const brand = [
    bn,
    bn.replace(/\s+/g, ''),
    `${bn} ราคา`,
    `${bn} รีวิว`,
  ].slice(0, 4)

  // Match industry patterns
  if (s.includes('คอนโด') || s.includes('condo') || s.includes('อสังหา')) {
    return {
      nonBrand: [
        'คอนโดใกล้ BTS', 'คอนโดราคาถูก', 'ซื้อคอนโด', 'คอนโดมิเนียม กรุงเทพ',
        'คอนโดน่าลงทุน', 'โครงการคอนโด', 'condo bangkok', 'คอนโดใกล้รถไฟฟ้า',
        'จอง คอนโด', 'คอนโด 1 ห้องนอน',
      ],
      brand,
      informational: ['รีวิว คอนโด', 'คอนโด vs บ้าน', 'ซื้อคอนโดต้องรู้อะไร'],
    }
  }
  if (s.includes('วีซ่า') || s.includes('visa')) {
    return {
      nonBrand: [
        'ยื่นวีซ่า', 'บริการยื่นวีซ่า', 'ตัวแทนยื่นวีซ่า', 'วีซ่าท่องเที่ยว',
        'visa service', 'รับยื่นวีซ่า', 'วีซ่ายุโรป', 'schengen visa',
      ],
      brand,
      informational: ['ขั้นตอนยื่นวีซ่า', 'เอกสารวีซ่า', 'ค่าใช้จ่ายวีซ่า'],
    }
  }
  if (s.includes('ประกัน') || s.includes('insurance')) {
    return {
      nonBrand: [
        'ประกันชีวิต', 'ประกันรถ', 'ประกันสุขภาพ', 'เบี้ยประกัน',
        'ซื้อประกัน', 'ประกันราคาถูก', 'life insurance thailand',
      ],
      brand,
      informational: ['ประกันชีวิตคืออะไร', 'เปรียบเทียบประกัน'],
    }
  }
  if (s.includes('สินเชื่อ') || s.includes('กู้') || s.includes('loan')) {
    return {
      nonBrand: [
        'สินเชื่อส่วนบุคคล', 'กู้เงิน', 'สินเชื่อรถ', 'สินเชื่อบ้าน',
        'personal loan', 'กู้ด่วน', 'สินเชื่อดอกเบี้ยต่ำ',
      ],
      brand,
      informational: ['สินเชื่อคืออะไร', 'วิธีกู้เงิน', 'เปรียบเทียบสินเชื่อ'],
    }
  }
  if (s.includes('ทันตกรรม') || s.includes('ฟัน') || s.includes('dental') || s.includes('จัดฟัน') || s.includes('ฟอกสีฟัน')) {
    return {
      nonBrand: [
        'คลินิกทันตกรรมใกล้ฉัน', 'จัดฟัน ราคา', 'ฟอกสีฟัน', 'รักษารากฟัน',
        'ใส่ฟัน implant', 'ถอนฟัน', 'ทันตแพทย์ใกล้บ้าน', 'dental clinic bangkok',
      ],
      brand,
      informational: ['จัดฟันแบบใสดีไหม', 'ฟอกสีฟันเจ็บไหม', 'รากฟันเทียมราคาเท่าไหร่'],
    }
  }
  if (s.includes('คลินิก') || s.includes('โรงพยาบาล') || s.includes('แพทย์') || s.includes('clinic')) {
    return {
      nonBrand: [
        'คลินิกใกล้ฉัน', 'หมอผิวหนัง', 'รักษาสิว', 'ผ่าตัด', 'ตรวจสุขภาพ',
        'คลินิกความงาม', 'laser หน้าใส', 'filler botox',
      ],
      brand,
      informational: ['วิธีรักษาสิว', 'laser กี่ครั้ง', 'filler อยู่ได้นานแค่ไหน'],
    }
  }
  if (s.includes('โรงเรียนนานาชาติ') || s.includes('international school') || s.includes('นานาชาติ') || s.includes('academy') || s.includes('bilingual')) {
    return {
      nonBrand: [
        'โรงเรียนนานาชาติ กรุงเทพ', 'สมัครเรียนนานาชาติ', 'โรงเรียนนานาชาติ รับสมัคร',
        'international school admission thailand', 'โรงเรียนสองภาษา รับสมัคร',
        'โรงเรียนนานาชาติ ค่าเทอม', 'โรงเรียน IB ไทย', 'international school open house',
      ],
      brand,
      informational: [
        'โรงเรียนนานาชาติ คืออะไร', 'โรงเรียนนานาชาติ vs ไทย', 'ค่าใช้จ่ายโรงเรียนนานาชาติ',
        'เปรียบเทียบโรงเรียนนานาชาติ', 'โรงเรียนนานาชาติ ดีไหม',
      ],
    }
  }
  if (s.includes('รถ') || s.includes('car') || s.includes('ยานยนต์')) {
    return {
      nonBrand: [
        'รถยนต์ใหม่', 'ราคารถ', 'รถ EV', 'ผ่อนรถ', 'เช่ารถ',
        'car showroom', 'รถมือสอง', 'รถ sedan',
      ],
      brand,
      informational: ['รีวิวรถ', 'เปรียบเทียบรถ', 'รถคันไหนดี'],
    }
  }

  // Generic fallback — extract meaningful words from product
  const words = product
    .replace(/[^\wก-๙\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)

  return {
    nonBrand: [
      ...words.map((w) => `บริการ${w}`),
      ...words.map((w) => `${w}ราคาถูก`),
      product.split(' ').slice(0, 3).join(' '),
    ].slice(0, 8),
    brand,
    informational: words.map((w) => `${w}คืออะไร`).slice(0, 3),
  }
}

function deriveInMarketSegments(product: string): string[] {
  const s = product.toLowerCase()
  if (s.includes('คอนโด') || s.includes('อสังหา')) return ['Real Estate', 'Residential Properties', 'Home Buyers']
  if (s.includes('วีซ่า') || s.includes('visa')) return ['International Travel', 'Travel Services', 'Visa Services']
  if (s.includes('ประกัน') || s.includes('insurance')) return ['Insurance', 'Life Insurance', 'Health Insurance']
  if (s.includes('สินเชื่อ') || s.includes('กู้')) return ['Personal Finance', 'Loans', 'Banking Services']
  if (s.includes('ทันตกรรม') || s.includes('dental')) return ['Dental Services', 'Healthcare', 'Beauty & Wellness']
  if (s.includes('คลินิก') || s.includes('clinic')) return ['Healthcare', 'Beauty & Wellness', 'Medical Services']
  if (s.includes('รถ') || s.includes('car')) return ['Automotive', 'Vehicle Purchase', 'Car Dealers']
  if (s.includes('ซอฟต์แวร์') || s.includes('software') || s.includes('saas')) return ['Business Software', 'Enterprise Tech', 'SaaS']
  return ['Business Services', 'Professional Services']
}

export async function generateKeywordAudiencePlan(
  mediaPlan: MediaPlanJson,
  brief: Record<string, unknown>,
  clientMemoryContext?: string
): Promise<KeywordAudiencePlan> {
  if (isRealAI()) {
    const campaigns = mediaPlan.campaignMix.map((c) => ({ name: c.campaignName, type: c.type, objective: c.objective }))
    const memoryBlock = clientMemoryContext ? `## Client Memory\n${clientMemoryContext}\n` : ''
    const prompt = KEYWORD_AUDIENCE_PROMPT
      .replace('{{MEMORY}}', memoryBlock)
      .replace('{{BRIEF}}', JSON.stringify(brief, null, 2))
      .replace('{{CAMPAIGNS}}', JSON.stringify(campaigns, null, 2))

    return safeCallAI(
      prompt,
      (raw) => validateKwPlan(raw) as KeywordAudiencePlan | null,
      () => mockKwPlan(mediaPlan, brief),
      { temperature: 0.3 }
    )
  }

  return mockKwPlan(mediaPlan, brief)
}

async function mockKwPlan(mediaPlan: MediaPlanJson, brief: Record<string, unknown>): Promise<KeywordAudiencePlan> {
  // ── Dynamic mock — derived from brief + mediaPlan ────────────────────────
  const businessName = (brief.businessName as string) || 'Business'
  const product      = (brief.product as string) || ''
  const websiteUrl   = (brief.websiteUrl as string) || 'https://example.com'
  const domain       = websiteUrl.replace(/https?:\/\//, '').replace(/\/.*/, '')

  const seeds = deriveKeywordSeeds(product, businessName)

  const keywordGroups: KeywordAudiencePlan['keywordGroups'] = []

  // Competitor keyword seeds — derived from brand terms of known competitors
  const competitorSeeds = [
    `${businessName} vs คู่แข่ง`, `ทางเลือกแทน ${businessName}`,
    `${product.split(' ')[0]} ราคาถูกกว่า`, `${product.split(' ')[0]} เปรียบเทียบ`,
  ]

  // Product/Service seeds — specific features
  const productWords = product.replace(/[^\wก-๙\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  const productSeeds = [
    ...productWords.slice(0, 2).map((w) => `${w} ราคา`),
    ...productWords.slice(0, 2).map((w) => `${w} คุณภาพดี`),
    `${product.slice(0, 20)} แนะนำ`,
  ]
  const serviceSeeds = [
    ...seeds.informational,
    `${product.slice(0, 20)} ดีไหม`,
    `เลือก ${product.split(' ')[0]}`,
  ]

  for (const campaign of mediaPlan.campaignMix) {
    const type  = campaign.type
    const theme = campaign.theme

    if (type === 'SEARCH') {
      // 1 campaign = 1 adgroup, theme-specific keywords, all PHRASE default
      if (theme === 'Brand') {
        keywordGroups.push({
          campaignName: campaign.campaignName,
          adGroupName:  `${businessName} - Brand`,
          keywords: seeds.brand.map((kw) => ({
            keyword: kw, matchType: 'PHRASE' as const, intent: 'high' as const,
            avgMonthlySearches: Math.floor(Math.random() * 800) + 200,
            competition: 'LOW' as const, suggestedBid: 5,
          })),
        })
      } else if (theme === 'Competitor') {
        keywordGroups.push({
          campaignName: campaign.campaignName,
          adGroupName:  `${businessName} - Competitor`,
          keywords: competitorSeeds.map((kw) => ({
            keyword: kw, matchType: 'PHRASE' as const, intent: 'high' as const,
            avgMonthlySearches: Math.floor(Math.random() * 2000) + 300,
            competition: 'HIGH' as const, suggestedBid: Math.floor(Math.random() * 25) + 20,
          })),
        })
      } else if (theme === 'Product') {
        keywordGroups.push({
          campaignName: campaign.campaignName,
          adGroupName:  `${businessName} - Product`,
          keywords: productSeeds.map((kw) => ({
            keyword: kw, matchType: 'PHRASE' as const, intent: 'high' as const,
            avgMonthlySearches: Math.floor(Math.random() * 3000) + 500,
            competition: 'MEDIUM' as const, suggestedBid: Math.floor(Math.random() * 20) + 10,
          })),
        })
      } else if (theme === 'Service') {
        keywordGroups.push({
          campaignName: campaign.campaignName,
          adGroupName:  `${businessName} - Service`,
          keywords: serviceSeeds.map((kw) => ({
            keyword: kw, matchType: 'PHRASE' as const, intent: 'medium' as const,
            avgMonthlySearches: Math.floor(Math.random() * 4000) + 600,
            competition: 'MEDIUM' as const, suggestedBid: Math.floor(Math.random() * 15) + 8,
          })),
        })
      } else {
        // Generic / no theme — high-intent non-brand
        keywordGroups.push({
          campaignName: campaign.campaignName,
          adGroupName:  `${businessName} - Generic`,
          keywords: seeds.nonBrand.map((kw, i) => ({
            keyword: kw,
            matchType: 'PHRASE' as const,
            intent: 'high' as const,
            avgMonthlySearches: Math.floor(Math.random() * 8000) + 1000,
            competition: (i < 2 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM',
            suggestedBid: Math.floor(Math.random() * 30) + 15,
          })),
        })
      }
    }

    if (type === 'DISPLAY') {
      keywordGroups.push({
        campaignName: campaign.campaignName,
        adGroupName:  `Remarketing - All Visitors 30d`,
        keywords:     [],
      })
    }
  }

  const audienceSegments: KeywordAudiencePlan['audienceSegments'] = [
    {
      campaignName: mediaPlan.campaignMix.find((c) => c.type === 'DISPLAY')?.campaignName ?? mediaPlan.campaignMix[0].campaignName,
      name:        `${businessName} - All Website Visitors (30d)`,
      type:        'REMARKETING',
      source:      'Google Ads Tag / GA4',
      description: 'All visitors to the website in the last 30 days',
      urls:        [domain],
    },
    {
      campaignName: mediaPlan.campaignMix.find((c) => c.type === 'DISPLAY')?.campaignName ?? mediaPlan.campaignMix[0].campaignName,
      name:        `${businessName} - Engaged But No Convert (30d)`,
      type:        'REMARKETING',
      source:      'GA4 Audience',
      description: 'Visitors who spent more than 30s but did not convert — warm leads',
      urls:        [domain],
    },
    {
      campaignName: mediaPlan.campaignMix.find((c) => c.type === 'PERFORMANCE_MAX')?.campaignName ?? mediaPlan.campaignMix[0].campaignName,
      name:        `Custom Intent - ${businessName} Seekers`,
      type:        'CUSTOM_INTENT',
      source:      'Custom Intent',
      description: `People actively searching for ${product.slice(0, 40)}`,
      keywords:    seeds.nonBrand.slice(0, 5),
    },
    {
      campaignName: mediaPlan.campaignMix[0].campaignName,
      name:        'In-Market Segment (Relevant)',
      type:        'IN_MARKET',
      source:      'Google Audience',
      description: 'Google in-market audience relevant to this industry',
    },
    {
      campaignName: mediaPlan.campaignMix[0].campaignName,
      name:        `Similar to ${businessName} Converters`,
      type:        'SIMILAR',
      source:      'Google Ads Tag',
      description: 'Similar audiences to past converters (observation mode)',
    },
  ]

  // ── PMax Audience Signals ────────────────────────────────────────────────────
  const pmaxCampaigns = mediaPlan.campaignMix.filter((c) => c.type === 'PERFORMANCE_MAX')
  const pmaxSignals: PMaxSignal[] = pmaxCampaigns.map((camp) => ({
    campaignName: camp.campaignName,
    audienceSignals: {
      customIntent: seeds.nonBrand.slice(0, 8),
      searchThemes: [],
      customerList:  ['CRM email list', 'Past inquiries list', 'LINE OA followers'],
      remarketing:   [
        `${businessName} - All Website Visitors (30d)`,
        `${businessName} - Engaged But No Convert (30d)`,
        `${businessName} - Past Converters (180d)`,
      ],
      inMarket: deriveInMarketSegments(product),
      demographics: {
        ageRanges:       ['AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54'],
        genders:         ['MALE', 'FEMALE'],
        householdIncome: ['TOP_10_PERCENT', 'UPPER_25_PERCENT'],
      },
    },
    assetSuggestions: {
      headlines: [
        businessName.slice(0, 30),
        seeds.nonBrand[0]?.slice(0, 30) ?? businessName.slice(0, 30),
        seeds.nonBrand[1]?.slice(0, 30) ?? 'บริการมืออาชีพ',
      ],
      descriptions: [
        `${product.slice(0, 60)} บริการครบวงจร`,
        `ติดต่อ${businessName} เพื่อรับคำปรึกษาฟรีวันนี้`,
      ],
      imageThemes: [
        `Hero image: ${businessName} logo + product/service visual`,
        'Lifestyle: ลูกค้าใช้งานบริการ หรือผลลัพธ์หลังใช้',
        'Social proof: รีวิว / testimonial / certificate',
        'Square 1:1 — 1200x1200px สำหรับ Display',
        'Landscape 1.91:1 — 1200x628px สำหรับ YouTube',
      ],
    },
  }))

  // Industry-appropriate negative keywords
  const negatives = ['ฟรี', 'free', 'diy', 'ด้วยตัวเอง', 'สอน', 'tutorial', 'สมัครงาน', 'pantip', 'ตัวอย่าง', 'pdf']

  return {
    keywordGroups,
    audienceSegments,
    pmaxSignals,
    negativeKeywords: negatives,
    recommendations: [
      `Review search terms ทุกสัปดาห์เพื่อเพิ่ม negative keywords`,
      `สร้าง remarketing list 7/14/30 วัน จาก GA4`,
      `ใช้ Customer Match หากมี email list จาก CRM`,
      `ตั้ง observation audience ก่อน targeting เพื่อเก็บ data`,
      `A/B test broad match keywords ใน campaign แยกพร้อม target CPA`,
    ],
  }
}
