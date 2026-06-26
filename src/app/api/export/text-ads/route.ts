import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { CampaignBlueprintJson, AdGroup, AdCopy, RsaAdCopy, PMaxAssetGroup, DisplayAdCopy } from '@/types'

// ── CSV helpers ────────────────────────────────────────────────────────────────

function csvCell(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return ''
  const str = String(s)
  // Escape quotes and wrap if contains comma/newline/quote
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function csvRow(cells: (string | number | undefined | null)[]): string {
  return cells.map(csvCell).join(',')
}

// ── RSA row builder ────────────────────────────────────────────────────────────

function buildRsaRows(
  campaignName: string,
  adGroupName: string,
  rsa: RsaAdCopy,
  campaignType: string
): string[] {
  const rows: string[] = []
  const h = rsa.headlines ?? []
  const d = rsa.descriptions ?? []

  // One row per headline (up to 15)
  for (let i = 0; i < Math.min(h.length, 15); i++) {
    rows.push(csvRow([
      campaignName,
      campaignType,
      adGroupName,
      'RSA',
      `Headline ${i + 1}`,
      h[i] ?? '',
      h[i] ? h[i].length : 0,
      h[i] ? (h[i].length <= 30 ? 'OK' : 'TOO LONG') : '',
      '',
      rsa.finalUrl ?? '',
      rsa.displayPath1 ?? '',
      rsa.displayPath2 ?? '',
    ]))
  }

  // One row per description (up to 4)
  for (let i = 0; i < Math.min(d.length, 4); i++) {
    rows.push(csvRow([
      campaignName,
      campaignType,
      adGroupName,
      'RSA',
      `Description ${i + 1}`,
      d[i] ?? '',
      d[i] ? d[i].length : 0,
      d[i] ? (d[i].length <= 90 ? 'OK' : 'TOO LONG') : '',
      '',
      rsa.finalUrl ?? '',
      '',
      '',
    ]))
  }

  return rows
}

function buildPMaxRows(
  campaignName: string,
  assetGroup: PMaxAssetGroup
): string[] {
  const rows: string[] = []
  const h  = assetGroup.headlines ?? []
  const lh = assetGroup.longHeadlines ?? []
  const d  = assetGroup.descriptions ?? []

  for (let i = 0; i < Math.min(h.length, 15); i++) {
    rows.push(csvRow([
      campaignName, 'PERFORMANCE_MAX', assetGroup.assetGroupName, 'PMax Asset Group',
      `Headline ${i + 1}`, h[i] ?? '', h[i] ? h[i].length : 0,
      h[i] ? (h[i].length <= 30 ? 'OK' : 'TOO LONG') : '',
      '',
      assetGroup.finalUrl ?? '', '', '',
    ]))
  }
  for (let i = 0; i < Math.min(lh.length, 5); i++) {
    rows.push(csvRow([
      campaignName, 'PERFORMANCE_MAX', assetGroup.assetGroupName, 'PMax Asset Group',
      `Long Headline ${i + 1}`, lh[i] ?? '', lh[i] ? lh[i].length : 0,
      lh[i] ? (lh[i].length <= 90 ? 'OK' : 'TOO LONG') : '',
      '',
      assetGroup.finalUrl ?? '', '', '',
    ]))
  }
  for (let i = 0; i < Math.min(d.length, 4); i++) {
    rows.push(csvRow([
      campaignName, 'PERFORMANCE_MAX', assetGroup.assetGroupName, 'PMax Asset Group',
      `Description ${i + 1}`, d[i] ?? '', d[i] ? d[i].length : 0,
      d[i] ? (d[i].length <= 90 ? 'OK' : 'TOO LONG') : '',
      '',
      assetGroup.finalUrl ?? '', '', '',
    ]))
  }

  // Audience signals (informational rows)
  const customIntent = assetGroup.audienceSignals?.customIntent ?? []
  if (customIntent.length > 0) {
    rows.push(csvRow([
      campaignName, 'PERFORMANCE_MAX', assetGroup.assetGroupName, 'PMax Asset Group',
      'Audience Signal (Custom Intent)', customIntent.join(' | '), '', '',
      '', assetGroup.finalUrl ?? '', '', '',
    ]))
  }

  return rows
}

function buildDisplayRows(
  campaignName: string,
  adGroupName: string,
  display: DisplayAdCopy
): string[] {
  const rows: string[] = []
  const h  = display.headlines ?? []
  const lh = display.longHeadlines ?? []
  const d  = display.descriptions ?? []

  for (let i = 0; i < Math.min(h.length, 5); i++) {
    rows.push(csvRow([
      campaignName, 'DISPLAY', adGroupName, 'Responsive Display',
      `Headline ${i + 1}`, h[i] ?? '', h[i] ? h[i].length : 0,
      h[i] ? (h[i].length <= 30 ? 'OK' : 'TOO LONG') : '',
      '',
      display.finalUrl ?? '', '', '',
    ]))
  }
  for (let i = 0; i < Math.min(lh.length, 1); i++) {
    rows.push(csvRow([
      campaignName, 'DISPLAY', adGroupName, 'Responsive Display',
      'Long Headline', lh[i] ?? '', lh[i] ? lh[i].length : 0,
      lh[i] ? (lh[i].length <= 90 ? 'OK' : 'TOO LONG') : '',
      '',
      display.finalUrl ?? '', '', '',
    ]))
  }
  for (let i = 0; i < Math.min(d.length, 2); i++) {
    rows.push(csvRow([
      campaignName, 'DISPLAY', adGroupName, 'Responsive Display',
      `Description ${i + 1}`, d[i] ?? '', d[i] ? d[i].length : 0,
      d[i] ? (d[i].length <= 90 ? 'OK' : 'TOO LONG') : '',
      '',
      display.finalUrl ?? '', '', '',
    ]))
  }

  return rows
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const blueprintId = searchParams.get('blueprintId')
  const mediaPlanId = searchParams.get('mediaPlanId')
  const format      = searchParams.get('format') ?? 'csv'  // csv | json

  try {
    // Load blueprint
    let bp
    if (blueprintId) {
      bp = await prisma.campaignBlueprint.findFirst({
        where: { id: blueprintId },
        include: { mediaPlan: { include: { brief: true } } },
      })
    } else if (mediaPlanId) {
      bp = await prisma.campaignBlueprint.findFirst({
        where: { mediaPlanId },
        include: { mediaPlan: { include: { brief: true } } },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!bp) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
    }

    const bpJson: CampaignBlueprintJson = JSON.parse(bp.blueprintJson as string)
    const businessName = bp.mediaPlan?.brief?.businessName ?? 'Campaign'
    const date = new Date().toISOString().slice(0, 10)
    const filename = `${businessName.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}_ads_export_${date}`

    // Load keywords from DB for the media plan
    const planId = bp.mediaPlanId
    const keywordIdeas = planId
      ? await prisma.keywordIdea.findMany({
          where: { mediaPlanId: planId },
          orderBy: [{ campaignName: 'asc' }, { adGroupName: 'asc' }, { keyword: 'asc' }],
        })
      : []

    // ── JSON export ──────────────────────────────────────────────────────────
    if (format === 'json') {
      const output = {
        businessName,
        exportedAt:  new Date().toISOString(),
        blueprintId: bp.id,
        campaigns: (bpJson.campaigns ?? []).map((c) => {
          // Get keywords for this campaign from DB
          const campKws = keywordIdeas.filter((k) => k.campaignName === c.campaignName)

          return {
            campaignName: c.campaignName,
            campaignType: c.campaignType,
            adGroups: (c.adGroups ?? []).map((ag: AdGroup) => {
              const agKws = campKws.filter((k) => k.adGroupName === ag.adGroupName)
              return {
                adGroupName: ag.adGroupName,
                keywords: agKws.length > 0
                  ? agKws.map((k) => ({ keyword: k.keyword, matchType: k.matchType, intent: k.intent }))
                  : (ag.keywords ?? []).map((kw) => ({ keyword: kw, matchType: 'BROAD', intent: '' })),
                ads: (ag.ads ?? []).map((ad: AdCopy) => ({
                  rsa:     ad.rsa ?? null,
                  pmax:    ad.pmax ?? null,
                  display: ad.display ?? null,
                  legacy: {
                    headline1:    ad.headline1,
                    headline2:    ad.headline2,
                    headline3:    ad.headline3,
                    description1: ad.description1,
                    description2: ad.description2,
                    finalUrl:     ad.finalUrl,
                  },
                })),
              }
            }),
          }
        }),
        keywordSummary: {
          total: keywordIdeas.length,
          byMatchType: {
            EXACT:  keywordIdeas.filter((k) => k.matchType === 'EXACT').length,
            PHRASE: keywordIdeas.filter((k) => k.matchType === 'PHRASE').length,
            BROAD:  keywordIdeas.filter((k) => k.matchType === 'BROAD').length,
          },
        },
      }
      return NextResponse.json(output, {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}.json"`,
        },
      })
    }

    // ── CSV export ───────────────────────────────────────────────────────────
    const HEADER = csvRow([
      'Campaign Name', 'Campaign Type', 'Ad Group / Asset Group', 'Ad Format',
      'Asset Type', 'Text', 'Char Count', 'Status',
      'Notes', 'Final URL', 'Display Path 1', 'Display Path 2',
    ])

    const dataRows: string[] = []

    for (const campaign of bpJson.campaigns ?? []) {
      const cname = campaign.campaignName ?? ''
      const ctype = campaign.campaignType ?? ''

      for (const ag of campaign.adGroups ?? []) {
        const agName = ag.adGroupName ?? ''

        for (const ad of ag.ads ?? []) {
          // RSA
          if (ad.rsa) {
            dataRows.push(...buildRsaRows(cname, agName, ad.rsa, ctype))
          }
          // PMax asset group
          if (ad.pmax) {
            dataRows.push(...buildPMaxRows(cname, ad.pmax))
          }
          // Display
          if (ad.display) {
            dataRows.push(...buildDisplayRows(cname, agName, ad.display))
          }
          // Fallback legacy ad
          if (!ad.rsa && !ad.pmax && !ad.display) {
            ;[
              ['Headline 1', ad.headline1, 30],
              ['Headline 2', ad.headline2, 30],
              ['Headline 3', ad.headline3, 30],
              ['Description 1', ad.description1, 90],
              ['Description 2', ad.description2, 90],
            ].forEach(([assetType, text, limit]) => {
              dataRows.push(csvRow([
                cname, ctype, agName, 'Text Ad',
                assetType, text ?? '',
                text ? (text as string).length : 0,
                text ? ((text as string).length <= (limit as number) ? 'OK' : 'TOO LONG') : '',
                '',
                ad.finalUrl ?? '', '', '',
              ]))
            })
          }
        }
      }
    }

    // ── Keyword section ──────────────────────────────────────────────────────
    const KW_HEADER = csvRow([
      'Campaign Name', 'Ad Group', 'Keyword', 'Match Type', 'Intent',
      'Avg Monthly Searches', 'Competition', 'Suggested Bid (THB)', 'Action',
    ])

    const kwRows = keywordIdeas.map((k) =>
      csvRow([
        k.campaignName,
        k.adGroupName,
        k.keyword,
        k.matchType,
        k.intent ?? '',
        k.avgMonthlySearches ?? '',
        k.competition ?? '',
        k.lowTopOfPageBid ?? '',
        k.action ?? 'include',
      ])
    )

    const csv = [
      '=== TEXT ADS EXPORT ===',
      HEADER,
      ...dataRows,
      '',
      '=== KEYWORDS ===',
      KW_HEADER,
      ...kwRows,
    ].join('\n')

    const bom = '﻿' // UTF-8 BOM for Excel Thai support

    return new Response(bom + csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
