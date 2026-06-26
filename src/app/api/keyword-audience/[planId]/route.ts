import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { KeywordAudiencePlan } from '@/types'

export async function GET(_req: NextRequest, { params }: { params: { planId: string } }) {
  try {
    const [keywords, audiences] = await Promise.all([
      prisma.keywordIdea.findMany({ where: { mediaPlanId: params.planId }, orderBy: { campaignName: 'asc' } }),
      prisma.audienceSegment.findMany({ where: { mediaPlanId: params.planId } }),
    ])

    // Group keywords
    const groups = new Map<string, { campaignName: string; adGroupName: string; keywords: unknown[] }>()
    for (const kw of keywords) {
      const key = `${kw.campaignName}__${kw.adGroupName}`
      if (!groups.has(key)) {
        groups.set(key, { campaignName: kw.campaignName, adGroupName: kw.adGroupName, keywords: [] })
      }
      groups.get(key)!.keywords.push({
        id: kw.id,
        keyword: kw.keyword,
        matchType: kw.matchType,
        intent: kw.intent || 'medium',
        avgMonthlySearches: kw.avgMonthlySearches,
        competition: kw.competition,
        suggestedBid: kw.lowTopOfPageBid,
      })
    }

    const result: KeywordAudiencePlan = {
      keywordGroups: Array.from(groups.values()) as KeywordAudiencePlan['keywordGroups'],
      audienceSegments: audiences.map((a) => ({
        campaignName: a.campaignName,
        name: a.name,
        type: a.type as 'REMARKETING' | 'SIMILAR' | 'IN_MARKET' | 'CUSTOM_INTENT' | 'CUSTOMER_LIST',
        source: a.source,
        description: a.description || undefined,
        keywords: a.keywords ? JSON.parse(a.keywords) : undefined,
        urls: a.urls ? JSON.parse(a.urls) : undefined,
      })),
      negativeKeywords: [],
      recommendations: [],
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch keyword audience plan' }, { status: 500 })
  }
}

// POST /api/keyword-audience/[planId]
// Body: { campaignName, keywords: [{ keyword, matchType, intent, avgMonthlySearches, competition, lowTopOfPageBid }], replace?: boolean }
export async function POST(req: NextRequest, { params }: { params: { planId: string } }) {
  try {
    const body = await req.json() as {
      campaignName: string
      keywords: Array<{
        keyword: string
        matchType: string
        intent?: string
        avgMonthlySearches?: number
        competition?: string
        lowTopOfPageBid?: number
        highTopOfPageBid?: number
        score?: number
      }>
      replace?: boolean  // true = delete existing for this campaign first
    }

    const { campaignName, keywords, replace = false } = body
    if (!campaignName || !keywords?.length) {
      return NextResponse.json({ error: 'campaignName and keywords required' }, { status: 400 })
    }

    // Verify media plan exists
    const plan = await prisma.mediaPlan.findUnique({ where: { id: params.planId } })
    if (!plan) return NextResponse.json({ error: 'Media plan not found' }, { status: 404 })

    if (replace) {
      await prisma.keywordIdea.deleteMany({
        where: { mediaPlanId: params.planId, campaignName },
      })
    }

    // Upsert: delete duplicates then insert
    const existing = await prisma.keywordIdea.findMany({
      where: { mediaPlanId: params.planId, campaignName },
      select: { keyword: true, matchType: true },
    })
    const existingSet = new Set(existing.map((e) => `${e.keyword}__${e.matchType}`))

    const newKeywords = keywords.filter(
      (k) => !existingSet.has(`${k.keyword}__${k.matchType}`)
    )

    if (newKeywords.length > 0) {
      await prisma.keywordIdea.createMany({
        data: newKeywords.map((k) => ({
          mediaPlanId:        params.planId,
          campaignName,
          adGroupName:        campaignName,  // default ad group = campaign name
          keyword:            k.keyword,
          matchType:          k.matchType ?? 'EXACT',
          intent:             k.intent ?? null,
          avgMonthlySearches: k.avgMonthlySearches ?? null,
          competition:        k.competition ?? null,
          lowTopOfPageBid:    k.lowTopOfPageBid ?? null,
          highTopOfPageBid:   k.highTopOfPageBid ?? null,
          score:              k.score ?? null,
          action:             'include',
        })),
      })
    }

    return NextResponse.json({
      saved: newKeywords.length,
      skipped: keywords.length - newKeywords.length,
      total: keywords.length,
    })
  } catch (e) {
    console.error('[keyword-audience] POST error:', e)
    return NextResponse.json({ error: 'Failed to save keywords' }, { status: 500 })
  }
}

// DELETE /api/keyword-audience/[planId]?keywordId=xxx
export async function DELETE(req: NextRequest, { params }: { params: { planId: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const keywordId = searchParams.get('keywordId')
    if (!keywordId) return NextResponse.json({ error: 'keywordId required' }, { status: 400 })

    await prisma.keywordIdea.delete({ where: { id: keywordId, mediaPlanId: params.planId } })
    return NextResponse.json({ deleted: true })
  } catch (e) {
    console.error('[keyword-audience] DELETE error:', e)
    return NextResponse.json({ error: 'Failed to delete keyword' }, { status: 500 })
  }
}
