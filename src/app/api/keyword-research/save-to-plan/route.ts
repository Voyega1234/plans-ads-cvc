import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

// POST /api/keyword-research/save-to-plan
// Body:
//   action: 'existing' → save to existing mediaPlanId, campaignName required
//   action: 'new'      → create new Brief + MediaPlan, then save keywords
export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session  = skipAuth ? null : await auth()
    const userId   = skipAuth ? null : getUserId(session)

    const body = await req.json() as {
      action: 'existing' | 'new'
      // existing
      mediaPlanId?: string
      campaignName?: string
      // new
      businessName?: string
      productService?: string
      location?: string
      objective?: string
      monthlyBudget?: number
      // keywords
      keywords: Array<{
        keyword: string
        matchType: string
        group: string
        avgMonthlySearches?: number
        competition?: string
        cpcEst?: number
      }>
    }

    const positiveKws = body.keywords.filter(k => k.group !== 'negative')
    if (!positiveKws.length) {
      return NextResponse.json({ error: 'No keywords selected' }, { status: 400 })
    }

    let planId: string
    let campaignName: string

    if (body.action === 'existing') {
      if (!body.mediaPlanId || !body.campaignName) {
        return NextResponse.json({ error: 'mediaPlanId and campaignName required' }, { status: 400 })
      }
      const plan = await prisma.mediaPlan.findFirst({ where: userId ? { id: body.mediaPlanId, userId } : { id: body.mediaPlanId } })
      if (!plan) return NextResponse.json({ error: 'Media plan not found' }, { status: 404 })
      planId = body.mediaPlanId
      campaignName = body.campaignName

    } else {
      // Create Brief + MediaPlan
      const biz = body.businessName || 'Untitled'
      const prod = body.productService || biz
      const loc = body.location || 'Thailand'
      const obj = body.objective || 'leads'
      const budget = body.monthlyBudget || 30000

      const brief = await prisma.brief.create({
        data: {
          ...(userId ? { userId } : {}),
          businessName: biz,
          websiteUrl:   '',
          productService: prod,
          objective:    obj,
          monthlyBudget: budget,
          currency:     'THB',
          targetLocation: loc,
          language:     'th',
          targetAudience: '',
          conversionGoal: obj,
        },
      })

      const mediaPlan = await prisma.mediaPlan.create({
        data: {
          briefId:      brief.id,
          ...(userId ? { userId } : {}),
          title:        `${biz} — Keyword Research`,
          objective:    obj,
          monthlyBudget: budget,
          currency:     'THB',
          planJson:     JSON.stringify({ campaigns: [] }),
          status:       'draft',
        },
      })
      planId = mediaPlan.id
      campaignName = prod
    }

    // Save positive keywords
    await prisma.keywordIdea.createMany({
      data: positiveKws.map(k => ({
        mediaPlanId:       planId,
        campaignName,
        adGroupName:       k.group || 'General',
        keyword:           k.keyword,
        matchType:         k.matchType,
        intent:            k.group,
        avgMonthlySearches: k.avgMonthlySearches ?? null,
        competition:       k.competition ?? null,
        lowTopOfPageBid:   k.cpcEst ?? null,
        action:            'include',
      })),
    })

    return NextResponse.json({ planId, campaignName, count: positiveKws.length })
  } catch (err) {
    console.error('[save-to-plan]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
