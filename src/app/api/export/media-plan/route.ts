import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'
import type { MediaPlanJson, KeywordGroup } from '@/types'

// Returns CSV export of the media plan for client delivery
export async function GET(req: NextRequest) {
  try {
    const session = await (auth() as Promise<Session | null>)
    const userId = getUserId(session)

    const { searchParams } = new URL(req.url)
    const planId = searchParams.get('planId')
    const format = searchParams.get('format') ?? 'csv'

    if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 })

    const [plan, keywords, audiences] = await Promise.all([
      prisma.mediaPlan.findFirst({
        where: { id: planId, userId },
        include: { brief: true },
      }),
      prisma.keywordIdea.findMany({ where: { mediaPlanId: planId }, orderBy: { campaignName: 'asc' } }),
      prisma.audienceSegment.findMany({ where: { mediaPlanId: planId } }),
    ])

    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const planJson: MediaPlanJson = JSON.parse(plan.planJson)

    if (format === 'csv') {
      const rows: string[] = []

      // === Media Plan Summary ===
      rows.push('MEDIA PLAN SUMMARY')
      rows.push(`Title,${csvEscape(plan.title)}`)
      rows.push(`Objective,${csvEscape(plan.objective)}`)
      rows.push(`Monthly Budget,${plan.monthlyBudget} THB`)
      rows.push(`Status,${plan.status}`)
      rows.push(`Created,${plan.createdAt.toISOString().split('T')[0]}`)
      rows.push('')

      // === Forecast ===
      rows.push('FORECAST (30 DAYS)')
      rows.push('Metric,Value')
      rows.push(`Total Budget,${planJson.forecast.totalMonthlyBudget} THB`)
      rows.push(`Expected Clicks,${planJson.forecast.totalExpectedClicks.toLocaleString()}`)
      rows.push(`Expected Impressions,${planJson.forecast.totalExpectedImpressions.toLocaleString()}`)
      rows.push(`Expected Conversions,${planJson.forecast.totalExpectedConversions}`)
      rows.push(`Blended CPC,${planJson.forecast.blendedCPC} THB`)
      rows.push(`Blended CPA,${planJson.forecast.blendedCPA} THB`)
      rows.push(`Blended CTR,${(planJson.forecast.blendedCTR * 100).toFixed(2)}%`)
      rows.push(`ROAS,${planJson.forecast.roas}x`)
      rows.push('')

      // === Campaign Mix ===
      rows.push('CAMPAIGN MIX')
      rows.push('Campaign Name,Type,Monthly Budget (THB),Budget %,Bid Strategy,Target CPA,Target ROAS,Max CPC,Est. Clicks,Est. Impressions,Est. Conv.')
      for (const c of planJson.campaignMix) {
        rows.push([
          csvEscape(c.campaignName),
          c.type,
          c.monthlyBudget,
          `${c.budgetPercent}%`,
          c.bidStrategy,
          c.targetCPA || '',
          c.targetRoas || '',
          c.maxCpc || '',
          c.expectedClicks,
          c.expectedImpressions,
          c.expectedConversions,
        ].join(','))
      }
      rows.push('')

      // === Keywords ===
      if (keywords.length > 0) {
        rows.push('KEYWORDS')
        rows.push('Campaign,Ad Group,Keyword,Match Type,Intent,Avg Monthly Searches,Competition,Suggested Bid (THB)')
        for (const kw of keywords) {
          rows.push([
            csvEscape(kw.campaignName),
            csvEscape(kw.adGroupName),
            csvEscape(kw.keyword),
            kw.matchType,
            kw.intent || '',
            kw.avgMonthlySearches || '',
            kw.competition || '',
            kw.lowTopOfPageBid || '',
          ].join(','))
        }
        rows.push('')
      }

      // === Audiences ===
      if (audiences.length > 0) {
        rows.push('AUDIENCE SEGMENTS')
        rows.push('Campaign,Name,Type,Source,Description')
        for (const a of audiences) {
          rows.push([
            csvEscape(a.campaignName),
            csvEscape(a.name),
            a.type,
            csvEscape(a.source),
            csvEscape(a.description || ''),
          ].join(','))
        }
        rows.push('')
      }

      // === Strategic Rationale ===
      rows.push('STRATEGIC RATIONALE')
      rows.push(csvEscape(planJson.strategicRationale))
      rows.push('')

      // === Recommendations ===
      rows.push('RECOMMENDATIONS')
      for (const rec of planJson.recommendations) {
        rows.push(csvEscape(rec))
      }

      const csv = rows.join('\n')
      const filename = `media-plan-${plan.title.replace(/[^a-zA-Z0-9]/g, '-')}-${plan.createdAt.toISOString().split('T')[0]}.csv`

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // JSON format for other uses
    const grouped = new Map<string, KeywordGroup>()
    for (const kw of keywords) {
      const key = `${kw.campaignName}__${kw.adGroupName}`
      if (!grouped.has(key)) {
        grouped.set(key, { campaignName: kw.campaignName, adGroupName: kw.adGroupName, keywords: [] })
      }
      grouped.get(key)!.keywords.push({
        keyword: kw.keyword,
        matchType: kw.matchType as 'EXACT' | 'PHRASE' | 'BROAD',
        intent: (kw.intent || 'medium') as 'high' | 'medium' | 'low',
        avgMonthlySearches: kw.avgMonthlySearches ?? undefined,
        competition: (kw.competition || undefined) as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
        suggestedBid: kw.lowTopOfPageBid ?? undefined,
      })
    }

    return NextResponse.json({
      plan: {
        ...plan,
        planJson: planJson,
        keywordGroups: Array.from(grouped.values()),
        audienceSegments: audiences,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}
