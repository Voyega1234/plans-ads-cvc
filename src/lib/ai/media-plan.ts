import { CampaignMixItem, MediaPlanJson } from '@/types'
import { MEDIA_PLAN_PROMPT } from './prompts'
import { safeCallAI, isRealAI } from './provider'
import { validateMediaPlan } from './schemas'

// Campaign mix ratios by objective
// Search campaigns are split by keyword theme: Generic / Brand / Competitor / Product / Service
// Each theme = 1 campaign = 1 ad group (Google Ads best practice for tight relevance & QS)
const MIX_BY_OBJECTIVE: Record<string, { type: string; role: string; theme?: string; pct: number; cpaMultiplier: number }[]> = {
  LEADS: [
    { type: 'SEARCH',          theme: 'Generic',    role: 'High-intent generic keywords',               pct: 18, cpaMultiplier: 1.0 },
    { type: 'SEARCH',          theme: 'Brand',      role: 'Protect brand terms',                        pct:  7, cpaMultiplier: 0.5 },
    { type: 'SEARCH',          theme: 'Competitor', role: 'Capture competitor search traffic',           pct:  7, cpaMultiplier: 1.3 },
    { type: 'PERFORMANCE_MAX', theme: undefined,    role: 'Automated AI bidding across all channels',   pct: 28, cpaMultiplier: 1.1 },
    { type: 'DISPLAY',         theme: 'Remarketing', role: 'Remarketing — แสดงโฆษณาซ้ำหา visitors ที่เคยเข้าเว็บ (ต่ำสุด 100 users/30วัน)', pct: 15, cpaMultiplier: 1.5 },
    { type: 'SEARCH',          theme: 'Product',    role: 'Product/service specific keywords',          pct:  8, cpaMultiplier: 1.0 },
    { type: 'SEARCH',          theme: 'Service',    role: 'Service category & informational keywords',  pct:  7, cpaMultiplier: 1.1 },
    { type: 'DEMAND_GEN',      theme: undefined,    role: 'Social-style discovery ads on YouTube/Gmail/Discover', pct: 10, cpaMultiplier: 1.8 },
  ],
  SALES: [
    { type: 'SHOPPING',        theme: undefined,    role: 'Showcase products with price & image',       pct: 40, cpaMultiplier: 1.0 },
    { type: 'PERFORMANCE_MAX', theme: undefined,    role: 'Automated AI bidding across all channels',   pct: 35, cpaMultiplier: 1.0 },
    { type: 'SEARCH',          theme: 'Generic',    role: 'Capture high-intent buyers',                 pct: 15, cpaMultiplier: 1.2 },
    { type: 'SEARCH',          theme: 'Brand',      role: 'Protect brand terms',                        pct: 10, cpaMultiplier: 0.5 },
  ],
  AWARENESS: [
    { type: 'YOUTUBE',         theme: undefined,    role: 'Brand video reach',                          pct: 40, cpaMultiplier: 3.0 },
    { type: 'DISPLAY',         theme: undefined,    role: 'Visual brand awareness across GDN',          pct: 35, cpaMultiplier: 2.5 },
    { type: 'DEMAND_GEN',      theme: undefined,    role: 'Social-style discovery ads',                 pct: 25, cpaMultiplier: 2.0 },
  ],
  TRAFFIC: [
    { type: 'SEARCH',          theme: 'Generic',    role: 'Capture high-intent search traffic',         pct: 22, cpaMultiplier: 1.0 },
    { type: 'SEARCH',          theme: 'Brand',      role: 'Protect brand terms',                        pct:  7, cpaMultiplier: 0.5 },
    { type: 'SEARCH',          theme: 'Competitor', role: 'Capture competitor search traffic',           pct:  7, cpaMultiplier: 1.2 },
    { type: 'PERFORMANCE_MAX', theme: undefined,    role: 'Automated traffic across channels',           pct: 30, cpaMultiplier: 1.0 },
    { type: 'DISPLAY',         theme: 'Remarketing', role: 'Remarketing — แสดงโฆษณาซ้ำหา visitors ที่เคยเข้าเว็บ', pct: 12, cpaMultiplier: 1.2 },
    { type: 'SEARCH',          theme: 'Product',    role: 'Product/service specific keywords',          pct:  9, cpaMultiplier: 1.0 },
    { type: 'DEMAND_GEN',      theme: undefined,    role: 'Social-style discovery ads on YouTube/Gmail/Discover', pct: 13, cpaMultiplier: 1.5 },
  ],
  APP_INSTALLS: [
    { type: 'APP_CAMPAIGN',    theme: undefined,    role: 'Drive app installs across all channels',     pct: 70, cpaMultiplier: 1.0 },
    { type: 'YOUTUBE',         theme: undefined,    role: 'App promo video ads',                        pct: 30, cpaMultiplier: 1.2 },
  ],
}

// Rough CPC estimates by business type & objective (THB)
function estimateCPC(productService: string, objective: string): number {
  const s = productService.toLowerCase()
  // Dental must come before generic clinic — higher CPC due to treatment keywords
  if (s.includes('ทันตกรรม') || s.includes('จัดฟัน') || s.includes('รากฟันเทียม') || s.includes('ครอบฟัน') || s.includes('dental') || s.includes('invisalign')) return 90
  if (s.includes('คอนโด') || s.includes('บ้าน') || s.includes('อสังหา') || s.includes('real estate')) return 45
  if (s.includes('ประกัน') || s.includes('insurance')) return 60
  if (s.includes('สินเชื่อ') || s.includes('loan') || s.includes('กู้')) return 70
  if (s.includes('รถ') || s.includes('car') || s.includes('auto')) return 35
  if (s.includes('วีซ่า') || s.includes('visa')) return 30
  if (s.includes('โรงพยาบาล') || s.includes('clinic') || s.includes('คลินิก') || s.includes('แพทย์')) return 50
  if (s.includes('ซอฟต์แวร์') || s.includes('software') || s.includes('saas')) return 50
  if (s.includes('ทนาย') || s.includes('กฎหมาย') || s.includes('legal')) return 55
  if (s.includes('ความงาม') || s.includes('สปา') || s.includes('beauty') || s.includes('salon')) return 35
  if (s.includes('อาหาร') || s.includes('ร้านอาหาร') || s.includes('restaurant')) return 15
  if (s.includes('โรงแรม') || s.includes('hotel') || s.includes('resort')) return 40
  if (objective === 'AWARENESS') return 3
  return 20
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9ก-๙\s]/g, '').trim().slice(0, 25)
}

export async function generateMediaPlan(
  brief: Record<string, unknown>,
  clientMemoryContext?: string,
  allowedTypes?: string[]
): Promise<MediaPlanJson> {
  if (isRealAI()) {
    const memoryBlock = clientMemoryContext ? `## Client Memory\n${clientMemoryContext}\n` : ''
    const kwBlock = (brief.selectedKeywords as unknown[] | undefined)?.length
      ? `\n## Selected Keywords (from Keyword Research step)\n${JSON.stringify(brief.selectedKeywords, null, 2)}\n`
      : ''
    const typeBlock = allowedTypes?.length
      ? `\n## Campaign Type Restriction\nสร้างเฉพาะ campaign type ต่อไปนี้เท่านั้น: ${allowedTypes.join(', ')}\n`
      : ''
    const prompt = (MEDIA_PLAN_PROMPT + kwBlock + typeBlock)
      .replace('{{MEMORY}}', memoryBlock)
      .replace('{{BRIEF}}', JSON.stringify({ ...brief, selectedKeywords: undefined }, null, 2))

    return safeCallAI(
      prompt,
      (raw) => validateMediaPlan(raw) as MediaPlanJson | null,
      () => mockMediaPlan(brief, allowedTypes),
      { temperature: 0.3, tier: 'quality' }
    )
  }

  return mockMediaPlan(brief, allowedTypes)
}

interface SelectedKw { keyword: string; matchType: string; group: string; intent?: string; avgMonthlySearches?: number; cpcEst?: number }

function mockMediaPlan(brief: Record<string, unknown>, allowedTypes?: string[]): MediaPlanJson {
  // ── Dynamic mock — derived entirely from brief ──────────────────────────
  const budget       = (brief.monthlyBudget as number) || 1500
  const objective    = (brief.objective as string) || 'LEADS'
  const businessName = (brief.businessName as string) || 'Business'
  const product      = (brief.productService as string) || ''
  const location     = (brief.targetLocation as string) || 'Thailand'
  const language     = (brief.language as string) || 'th'
  const brandTone    = (brief.brandTone as string) || 'Professional'
  const selectedKws  = (brief.selectedKeywords as SelectedKw[] | undefined) ?? []

  const estCPC = selectedKws.length > 0
    ? Math.round(selectedKws.filter(k => k.cpcEst && k.cpcEst > 0).reduce((s, k) => s + (k.cpcEst ?? 0), 0) / Math.max(1, selectedKws.filter(k => k.cpcEst && k.cpcEst > 0).length)) || estimateCPC(product, objective)
    : estimateCPC(product, objective)

  // Build campaign mix based on selected keyword groups
  const hasGroup = (g: string) => selectedKws.some(k => k.group === g)
  const baseMix  = MIX_BY_OBJECTIVE[objective] ?? MIX_BY_OBJECTIVE['LEADS']

  // Filter by template-allowed types first (hard constraint from template selection)
  const typeFilteredMix = allowedTypes?.length
    ? baseMix.filter(m => allowedTypes.includes(m.type))
    : baseMix

  // Filter Search campaigns to only those matching keyword groups user selected
  const filteredMix = typeFilteredMix.filter(m => {
    if (m.type !== 'SEARCH') return true
    if (!m.theme) return true
    if (selectedKws.length === 0) return true
    const themeToGroup: Record<string, string> = {
      Generic:    'generic',
      Brand:      'brand',
      Competitor: 'competitor',
      Product:    'product',
      Service:    'service',
    }
    return hasGroup(themeToGroup[m.theme] ?? m.theme.toLowerCase())
  })

  // Redistribute percentages so they still sum to 100
  const origTotal = filteredMix.reduce((s, m) => s + m.pct, 0)
  const mix = filteredMix.map(m => ({ ...m, pct: Math.round(m.pct * 100 / origTotal) }))

  // Assign campaign names — MUST start with CVC - followed by channel type
  // Format: CVC - <Channel> | <Theme> | <BizName> | <Obj>
  const typeLabel: Record<string, string> = {
    SEARCH: 'SEM', PERFORMANCE_MAX: 'PMax', DISPLAY: 'GDN',
    SHOPPING: 'Shopping', YOUTUBE: 'YouTube', DEMAND_GEN: 'DemandGen',
    APP_CAMPAIGN: 'App',
  }
  const themeLabel: Record<string, string> = {
    Generic: 'Generic', Brand: 'Brand', Competitor: 'Competitor',
    Product: 'Product', Service: 'Service',
  }
  const objLabel = objective === 'LEADS' ? 'Lead' : objective === 'SALES' ? 'Sale' : objective === 'AWARENESS' ? 'Aware' : objective === 'TRAFFIC' ? 'Traffic' : objective
  const campaignLabels = mix.map((m) => {
    const tl = typeLabel[m.type] ?? m.type
    const th = m.theme ? ` | ${themeLabel[m.theme] ?? m.theme}` : ''
    return `CVC - ${tl}${th} | ${slugify(businessName)} | ${objLabel}`
  })

  let totalConv = 0
  let totalClicks = 0
  let totalImpressions = 0

  const campaignMix = mix.map((m, i) => {
    // budget = monthlyBudget → daily = monthly * pct% / 30
    const monthlyBudget = Math.round(budget * m.pct / 100)
    const dailyBudget   = Math.round(monthlyBudget / 30)
    const convRate      = m.type === 'DISPLAY' ? 0.5 : m.type === 'YOUTUBE' ? 0.3 : m.type === 'PERFORMANCE_MAX' ? 2.0 : m.theme === 'Brand' ? 8.0 : 2.5
    const baseCPA       = Math.round(estCPC / (convRate / 100) * m.cpaMultiplier)
    const clicks        = Math.round(monthlyBudget / estCPC)
    const ctr           = m.type === 'DISPLAY' ? 0.8 : m.type === 'YOUTUBE' ? 0.5 : 4.5
    const impressions   = Math.round(clicks / (ctr / 100))
    const conversions   = Math.round(clicks * convRate / 100)

    totalConv        += conversions
    totalClicks      += clicks
    totalImpressions += impressions

    return {
      campaignName:         campaignLabels[i],
      type:                 m.type as CampaignMixItem['type'],
      theme:                m.theme as CampaignMixItem['theme'],
      objective:            m.role,
      monthlyBudget,
      dailyBudget,
      budgetPercent:        m.pct,
      targetCPA:            baseCPA,
      expectedClicks:       clicks,
      expectedImpressions:  impressions,
      expectedConversions:  conversions,
      bidStrategy:          objective === 'AWARENESS' ? 'TARGET_CPM'
                          : m.type === 'PERFORMANCE_MAX' || m.type === 'DISPLAY' || m.type === 'DEMAND_GEN' || m.type === 'VIDEO' || m.type === 'YOUTUBE' ? 'MAXIMIZE_CONVERSIONS'
                          : 'MAXIMIZE_CLICKS',
      networks:             [m.type === 'DISPLAY' ? 'DISPLAY' : m.type === 'YOUTUBE' ? 'YOUTUBE' : 'SEARCH'],
      targeting: {
        locations: [location],
        languages: [language, 'en'].filter((v, i, a) => a.indexOf(v) === i),
        devices:   ['MOBILE', 'DESKTOP', 'TABLET'],
      },
    }
  })

  return {
    campaignMix,
    forecast: {
      totalMonthlyBudget:       budget,
      totalExpectedConversions: totalConv,
      blendedCPA:               totalConv > 0 ? Math.round(budget / totalConv) : 0,
      totalExpectedClicks:      totalClicks,
      totalExpectedImpressions: totalImpressions,
      blendedCTR:               totalImpressions > 0 ? +((totalClicks / totalImpressions) * 100).toFixed(2) : 0,
      blendedCPC:               totalClicks > 0 ? +(budget / totalClicks).toFixed(2) : 0,
      roas:                     objective === 'SALES' ? 3.5 : 0,
    },
    strategicRationale: `แผนนี้ออกแบบสำหรับ ${businessName} เป้าหมาย ${objective} งบประมาณ ${budget.toLocaleString()} THB/เดือน ใช้กลยุทธ์ ${mix.length} campaigns ครอบคลุมทุก funnel stage ตั้งแต่ high-intent search จนถึง remarketing`,
    recommendations: [
      `ใช้ Responsive Search Ads พร้อม 15 headlines ที่สื่อถึง ${businessName} และ USP หลัก`,
      `ตั้ง conversion tracking สำหรับ ${(brief.conversionGoal as string) || 'form/call/chat'} ก่อน launch`,
      `สร้าง remarketing audience จาก website visitors 30 วัน`,
      `ใช้ ${brandTone} tone ในทุก ad copy`,
      `Review search terms report ทุกสัปดาห์เพื่อ add negative keywords`,
    ],
  }
}
