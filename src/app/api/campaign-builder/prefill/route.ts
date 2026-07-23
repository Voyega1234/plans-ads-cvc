import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pullCampaignPerformance } from '@/lib/google-ads/performance-reader'
import { safeCallAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, CAMPAIGN_PREFILL_CONTEXT } from '@/lib/ai/prompts'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userId = getUserId(session)
    const { customerId, accountName } = await req.json()
    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    // Gather context in parallel
    const [perfSnaps, recentBriefs, clientMem] = await Promise.all([
      pullCampaignPerformance(customerId, 'LAST_30_DAYS').catch(() => []),
      prisma.brief.findMany({
        where:   { OR: [{ clientId: customerId }, { user: { id: userId } }] },
        orderBy: { createdAt: 'desc' },
        take:    3,
      }).catch(() => []),
      prisma.clientMemory.findUnique({ where: { clientId: customerId } }).catch(() => null),
    ])

    // Build context string
    const contextParts: string[] = [`Account: ${accountName ?? customerId} (${customerId})`]

    if (clientMem) {
      if (clientMem.industry)      contextParts.push(`Industry: ${clientMem.industry}`)
      if (clientMem.notes)         contextParts.push(`Notes: ${clientMem.notes}`)
      if (clientMem.avgCPC)        contextParts.push(`Avg CPC: ฿${clientMem.avgCPC}`)
      if (clientMem.avgCPA)        contextParts.push(`Avg CPA: ฿${clientMem.avgCPA}`)
      if (clientMem.bestKeywords)  contextParts.push(`Best keywords: ${clientMem.bestKeywords}`)
    }

    if (recentBriefs.length > 0) {
      const b = recentBriefs[0]
      contextParts.push(`Previous brief — Business: ${b.businessName}, Service: ${b.productService}, URL: ${b.websiteUrl}, Objective: ${b.objective}, Budget: ฿${b.monthlyBudget}/mo, Location: ${b.targetLocation}, Audience: ${b.targetAudience}`)
    }

    if (perfSnaps.length > 0) {
      const totalCost = perfSnaps.reduce((a, s) => a + s.cost, 0)
      const totalConv = perfSnaps.reduce((a, s) => a + s.conversions, 0)
      const blendedCPA = totalConv > 0 ? (totalCost / totalConv).toFixed(0) : null
      contextParts.push(`Performance (30d): ฿${totalCost.toLocaleString()} spend, ${totalConv} conv${blendedCPA ? `, CPA ฿${blendedCPA}` : ''}`)
      contextParts.push(`Campaigns: ${perfSnaps.map(s => s.campaignName).join(', ')}`)
    }

    const context = contextParts.join('\n')

    const prompt = `คุณเป็น Google Ads Expert วิเคราะห์ข้อมูล account นี้แล้ว pre-fill form สร้าง campaign ใหม่

${context}

ให้ suggest ค่าที่เหมาะสมสำหรับ campaign ใหม่โดยอ้างอิงจากข้อมูลที่มี:

ตอบ JSON เท่านั้น:
{
  "businessName": "ชื่อธุรกิจ",
  "websiteUrl": "https://...",
  "productService": "อธิบายสินค้า/บริการหลักที่ควร focus (10-50 คำ)",
  "objective": "LEADS|SALES|AWARENESS|TRAFFIC|APP_INSTALLS",
  "monthlyBudget": 1000,
  "targetLocation": "กรุงเทพมหานคร",
  "language": "th",
  "targetAudience": "อธิบายกลุ่มเป้าหมาย (10-30 คำ)",
  "conversionGoal": "form submit / LINE click / phone call",
  "brandTone": "professional / friendly / urgent",
  "aiRationale": "อธิบายสั้นๆ ว่าทำไมถึง suggest แบบนี้ (1-2 ประโยค)"
}`

    const VALID_OBJECTIVES = ['LEADS', 'SALES', 'AWARENESS', 'TRAFFIC', 'APP_INSTALLS']
    const VALID_BRAND_TONES = ['professional', 'friendly', 'urgent', 'luxury', 'casual', 'authoritative']

    const result = await safeCallAI(
      prompt,
      (raw) => {
        if (typeof raw !== 'object' || raw === null) return null
        const r = raw as Record<string, unknown>
        // Required fields — campaign cannot be created without these
        if (!r.businessName || typeof r.businessName !== 'string' || !r.businessName.trim()) return null
        if (!r.websiteUrl || typeof r.websiteUrl !== 'string') return null
        if (!r.productService || typeof r.productService !== 'string' || !r.productService.trim()) return null
        // Validate URL format (must start with http/https)
        if (!/^https?:\/\/.+/.test(r.websiteUrl as string)) return null
        // Validate objective enum
        if (r.objective && !VALID_OBJECTIVES.includes(r.objective as string)) {
          r.objective = 'LEADS'
        }
        // Budget must be positive number
        if (r.monthlyBudget !== undefined) {
          const budget = Number(r.monthlyBudget)
          if (isNaN(budget) || budget < 0) r.monthlyBudget = 1000
          else r.monthlyBudget = budget
        }
        // Normalize brand tone
        if (r.brandTone && !VALID_BRAND_TONES.includes(r.brandTone as string)) {
          r.brandTone = 'professional'
        }
        return r
      },
      () => {
        const b = recentBriefs[0]
        return {
          businessName:   b?.businessName   ?? accountName ?? customerId,
          websiteUrl:     b?.websiteUrl      ?? 'https://example.com',
          productService: b?.productService  ?? 'บริการหลักของธุรกิจ',
          objective:      b?.objective       ?? 'LEADS',
          monthlyBudget:  b?.monthlyBudget   ?? 1000,
          targetLocation: b?.targetLocation  ?? 'กรุงเทพมหานคร',
          language:       'th',
          targetAudience: b?.targetAudience  ?? 'กลุ่มเป้าหมายหลักของธุรกิจ',
          conversionGoal: b?.conversionGoal  ?? 'form submit',
          brandTone:      b?.brandTone       ?? 'professional',
          aiRationale:    'ดึงข้อมูลจาก brief ล่าสุดของ account นี้',
        }
      },
      { maxTokens: 65536, systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${CAMPAIGN_PREFILL_CONTEXT}` }
    )

    return NextResponse.json({ prefill: result, context: contextParts })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
