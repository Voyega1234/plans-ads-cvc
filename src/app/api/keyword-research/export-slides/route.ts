import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getServiceAccountToken } from '@/lib/google/service-account-auth'

const SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations'
const DRIVE_SCOPE  = 'https://www.googleapis.com/auth/drive.file'

function isMockMode(): boolean {
  return (
    !process.env.GOOGLE_SHEETS_CLIENT_EMAIL ||
    !process.env.GOOGLE_SHEETS_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_ENABLED !== 'true'
  )
}

async function getSlidesToken(): Promise<string> {
  return getServiceAccountToken(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? '',
    process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? '',
    `${SLIDES_SCOPE} ${DRIVE_SCOPE}`
  )
}

async function createPresentation(title: string, token: string): Promise<string> {
  const res = await fetch('https://slides.googleapis.com/v1/presentations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Create presentation failed: ${res.status} ${err.slice(0, 200)}`)
  }
  const data = await res.json() as { presentationId: string; slides: Array<{ objectId: string }> }
  return data.presentationId
}

interface SlideRequest {
  [key: string]: unknown
}

async function shareFile(fileId: string, userEmail: string, token: string) {
  // Share with specific user first; if that fails (no domain-wide delegation), fall back to anyone-with-link
  const userRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: userEmail }),
  })
  if (!userRes.ok) {
    console.warn('[export-slides] user share failed, falling back to anyone-with-link:', await userRes.text().catch(() => ''))
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'anyone' }),
    })
  }
}

async function batchUpdateSlides(presentationId: string, token: string, requests: SlideRequest[]) {
  const res = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Slides batchUpdate failed: ${res.status} ${err.slice(0, 200)}`)
  }
}

function makeSlide(slideId: string): SlideRequest {
  return {
    createSlide: {
      objectId: slideId,
      insertionIndex: 999,
      slideLayoutReference: { predefinedLayout: 'BLANK' },
    }
  }
}

function makeTextBox(objectId: string, slideId: string, x: number, y: number, w: number, h: number, fontSize: number, bold: boolean, text: string, color?: string): SlideRequest[] {
  const hexColor = color ? { red: parseInt(color.slice(1,3),16)/255, green: parseInt(color.slice(3,5),16)/255, blue: parseInt(color.slice(5,7),16)/255 } : { red: 0.1, green: 0.1, blue: 0.1 }
  return [
    {
      createShape: {
        objectId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: w, unit: 'PT' }, height: { magnitude: h, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'PT' },
        },
      }
    },
    {
      insertText: { objectId, insertionIndex: 0, text }
    },
    {
      updateTextStyle: {
        objectId,
        style: {
          bold,
          fontSize: { magnitude: fontSize, unit: 'PT' },
          foregroundColor: { opaqueColor: { rgbColor: hexColor } },
        },
        textRange: { type: 'ALL' },
        fields: 'bold,fontSize,foregroundColor',
      }
    },
  ]
}

function makeRect(objectId: string, slideId: string, x: number, y: number, w: number, h: number, hexColor: string): SlideRequest {
  const r = parseInt(hexColor.slice(1,3),16)/255
  const g = parseInt(hexColor.slice(3,5),16)/255
  const b = parseInt(hexColor.slice(5,7),16)/255
  return {
    createShape: {
      objectId,
      shapeType: 'RECTANGLE',
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: w, unit: 'PT' }, height: { magnitude: h, unit: 'PT' } },
        transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'PT' },
      },
    },
  }
}

// Helper to set shape fill color as a separate request
function fillRect(objectId: string, hexColor: string): SlideRequest {
  const r = parseInt(hexColor.slice(1,3),16)/255
  const g = parseInt(hexColor.slice(3,5),16)/255
  const b = parseInt(hexColor.slice(5,7),16)/255
  return {
    updateShapeProperties: {
      objectId,
      shapeProperties: {
        shapeBackgroundFill: {
          solidFill: { color: { rgbColor: { red: r, green: g, blue: b } } }
        }
      },
      fields: 'shapeBackgroundFill',
    }
  }
}

type Kw = {
  keyword: string; matchType: string; group: string; volume: string
  competition: string; cpcEst: number; avgMonthlySearches?: number; selected: boolean
}
type FullAnalysis = {
  summary?: string; marketOverview?: string; budgetAdvice?: string
  matchTypeAdvice?: string; negativeAdvice?: string
  strategyTips?: string[]; doList?: string[]; dontList?: string[]
  opportunityScore?: number; difficultyScore?: number
  marketTrend?: string; buyerJourney?: string; uniqueAngle?: string
  topKeywords?: string[]
  competitors?: Array<{ name: string; type: string; strength: string; weakness?: string; bidStrategy?: string }>
  marketSignals?: Array<{ icon: string; label: string; value: string; detail: string }>
}
function sortByVolume(kws: Kw[]): Kw[] {
  return [...kws].sort((a, b) => {
    const va = a.avgMonthlySearches ?? 0
    const vb = b.avgMonthlySearches ?? 0
    if (vb !== va) return vb - va
    const co: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 }
    return (co[b.competition] ?? 0) - (co[a.competition] ?? 0)
  })
}
const GROUP_LABEL_TH: Record<string, string> = {
  brand: 'Brand', product: 'Product', service: 'Service',
  generic: 'Generic', competitor: 'Competitor', negative: 'Negative',
  high_intent: 'Service', problem_intent: 'Service',
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userEmail = session?.user?.email ?? ''
    const body = await req.json() as {
      businessName: string
      productService: string
      location: string
      objective: string
      keywords: Kw[]
      forecast?: {
        monthlyImpressions: number; monthlyClicks: number; ctr: string; cpc: number
        actualSpend: number; budgetUtilized: number
        devices: Array<{ label: string; pct: number; clicks: number }>
        locations: Array<{ label: string; pct: number }>
      } | null
      analysis?: FullAnalysis | null
    }

    const title = `Keyword Research — ${body.businessName}`

    if (isMockMode()) {
      return NextResponse.json({
        url: 'https://docs.google.com/presentation/d/mock-keyword-slides',
        presentationId: 'mock-keyword-slides',
        mock: true,
      })
    }

    const token = await getSlidesToken()
    const presentationId = await createPresentation(title, token)

    const requests: SlideRequest[] = []
    let slideCount = 0

    // ── Slide 1: Title ───────────────────────────────────────────────────────
    const s1 = `slide_${++slideCount}`
    requests.push(makeSlide(s1))
    requests.push(makeRect(`rect_s1_bg`, s1, 0, 0, 720, 405, '#1e3a5f'))
    requests.push(fillRect(`rect_s1_bg`, '#1e3a5f'))
    requests.push(...makeTextBox(`s1_title`, s1, 60, 130, 600, 60, 32, true, body.businessName, '#ffffff'))
    requests.push(...makeTextBox(`s1_sub`, s1, 60, 200, 600, 30, 16, false, `${body.productService} · ${body.location}`, '#93c5fd'))
    requests.push(...makeTextBox(`s1_obj`, s1, 60, 240, 600, 24, 13, false, `Objective: ${body.objective} · ${new Date().toLocaleDateString('th-TH')}`, '#60a5fa'))

    // ── Slide 2: Forecast ────────────────────────────────────────────────────
    if (body.forecast) {
      const f = body.forecast
      const s2 = `slide_${++slideCount}`
      requests.push(makeSlide(s2))
      requests.push(...makeTextBox(`s2_h`, s2, 40, 20, 640, 36, 20, true, 'Forecast Summary'))

      const metrics = [
        { label: 'Impressions/เดือน', value: f.monthlyImpressions >= 1000 ? `${(f.monthlyImpressions/1000).toFixed(1)}K` : `${f.monthlyImpressions}` },
        { label: 'Clicks/เดือน', value: f.monthlyClicks.toLocaleString() },
        { label: 'CTR', value: `${f.ctr}%` },
        { label: 'Avg. CPC', value: `฿${f.cpc}` },
        { label: 'Est. Spend/เดือน', value: `฿${f.actualSpend.toLocaleString()}` },
        { label: 'Budget Utilized', value: `${f.budgetUtilized}%` },
      ]
      const cardW = 104, cardH = 72, gap = 6, startX = 40, startY = 68
      metrics.forEach((m, i) => {
        const x = startX + i * (cardW + gap)
        const cardId = `s2_card${i}`
        requests.push(makeRect(cardId, s2, x, startY, cardW, cardH, '#f0f4ff'))
        requests.push(fillRect(cardId, '#f0f4ff'))
        requests.push(...makeTextBox(`s2_val${i}`, s2, x+6, startY+8, cardW-12, 28, 16, true, m.value, '#1e40af'))
        requests.push(...makeTextBox(`s2_lbl${i}`, s2, x+6, startY+40, cardW-12, 24, 8, false, m.label, '#6b7280'))
      })

      requests.push(...makeTextBox(`s2_dev_h`, s2, 40, 160, 300, 22, 12, true, 'Device Breakdown'))
      f.devices.forEach((d, i) => {
        requests.push(...makeTextBox(`s2_dev${i}`, s2, 40, 186 + i*20, 300, 18, 10, false, `${d.label}: ${d.pct}%  (${d.clicks.toLocaleString()} clicks)`, '#374151'))
      })

      requests.push(...makeTextBox(`s2_loc_h`, s2, 380, 160, 300, 22, 12, true, 'Top Locations'))
      f.locations.forEach((loc, i) => {
        requests.push(...makeTextBox(`s2_loc${i}`, s2, 380, 186 + i*20, 300, 18, 10, false, `${loc.label}: ${loc.pct}%`, '#374151'))
      })
    }

    // ── Slide 3+: Keywords by group (sorted by volume) ───────────────────────
    const GROUP_ORDER = ['brand', 'product', 'service', 'generic', 'competitor']
    const allPositive = body.keywords.filter(k => k.group !== 'negative')
    const negKws      = body.keywords.filter(k => k.group === 'negative')

    const byGroup: Record<string, Kw[]> = {}
    for (const k of allPositive) {
      if (!byGroup[k.group]) byGroup[k.group] = []
      byGroup[k.group].push(k)
    }
    const orderedGroups = [
      ...GROUP_ORDER.filter(g => byGroup[g]?.length),
      ...Object.keys(byGroup).filter(g => !GROUP_ORDER.includes(g)),
    ]

    // Overview slide
    const totalSelected = allPositive.filter(k => k.selected).length
    const phraseCount = allPositive.filter(k => k.matchType === 'PHRASE').length
    const broadCount  = allPositive.filter(k => k.matchType === 'BROAD').length
    const sOv = `slide_${++slideCount}`
    requests.push(makeSlide(sOv))
    requests.push(...makeTextBox(`sov_h`, sOv, 40, 20, 640, 36, 20, true, 'Keywords Overview'))
    requests.push(...makeTextBox(`sov_stats`, sOv, 40, 68, 640, 20, 11, false,
      `Selected: ${totalSelected}  ·  PHRASE: ${phraseCount}  ·  BROAD: ${broadCount}  ·  Negatives: ${negKws.length}  ·  Groups: ${orderedGroups.length}`,
      '#6b7280'))

    // Top 12 by volume across all groups
    const topKws = sortByVolume(allPositive).slice(0, 12)
    topKws.forEach((kw, i) => {
      const col = Math.floor(i / 6)
      const row = i % 6
      const x = 40 + col * 340
      const y = 100 + row * 46
      const badgeId = `sov_badge${i}`
      const badgeColor = kw.matchType === 'PHRASE' ? '#dbeafe' : '#fff7ed'
      requests.push(makeRect(badgeId, sOv, x, y, 60, 18, badgeColor))
      requests.push(fillRect(badgeId, badgeColor))
      requests.push(...makeTextBox(`sov_mt${i}`, sOv, x+4, y+3, 52, 14, 7, true, kw.matchType, kw.matchType === 'PHRASE' ? '#1d4ed8' : '#c2410c'))
      requests.push(...makeTextBox(`sov_kw${i}`, sOv, x+66, y, 262, 20, 10, false,
        `${kw.keyword}${kw.avgMonthlySearches ? ` (${kw.avgMonthlySearches.toLocaleString()}/mo)` : ''}`, '#111827'))
    })

    // Per-group slides (up to 14 kws per slide)
    for (const group of orderedGroups) {
      const kws = sortByVolume(byGroup[group]).slice(0, 14)
      const label = GROUP_LABEL_TH[group] ?? group
      const sg = `slide_${++slideCount}`
      requests.push(makeSlide(sg))
      requests.push(...makeTextBox(`sg_h_${group}`, sg, 40, 20, 640, 30, 16, true, `Keywords: ${label}`))
      requests.push(...makeTextBox(`sg_sub_${group}`, sg, 40, 55, 640, 18, 10, false,
        `${kws.length} keywords · เรียงตาม Volume มากไปน้อย`, '#6b7280'))
      kws.forEach((kw, i) => {
        const col = Math.floor(i / 7)
        const row = i % 7
        const x = 40 + col * 340
        const y = 80 + row * 42
        const volColor = (kw.avgMonthlySearches ?? 0) >= 1000 ? '#059669' : (kw.avgMonthlySearches ?? 0) >= 100 ? '#d97706' : '#9ca3af'
        requests.push(...makeTextBox(`sg_vol_${group}_${i}`, sg, x, y, 80, 18, 9, true,
          kw.avgMonthlySearches ? kw.avgMonthlySearches.toLocaleString() : '—', volColor))
        requests.push(...makeTextBox(`sg_kw_${group}_${i}`, sg, x+82, y, 240, 18, 10, false,
          `[${kw.matchType}] ${kw.keyword}`, '#111827'))
      })
    }

    // ── Slide: AI Market Analysis ────────────────────────────────────────────
    if (body.analysis) {
      const a = body.analysis

      // Slide: Overview + scores
      const sa1 = `slide_${++slideCount}`
      requests.push(makeSlide(sa1))
      requests.push(...makeTextBox(`sa1_h`, sa1, 40, 20, 640, 36, 20, true, 'AI Market Analysis'))
      let ay = 68
      if (a.opportunityScore || a.difficultyScore || a.marketTrend) {
        const scoreText = `Opportunity: ${a.opportunityScore ?? '—'}/10  ·  Difficulty: ${a.difficultyScore ?? '—'}/10  ·  Trend: ${a.marketTrend ?? '—'}`
        requests.push(...makeTextBox(`sa1_scores`, sa1, 40, ay, 640, 24, 12, true, scoreText, '#1e40af'))
        ay += 32
      }
      if (a.summary) {
        requests.push(...makeTextBox(`sa1_sum_h`, sa1, 40, ay, 640, 18, 10, true, 'SUMMARY', '#374151'))
        ay += 20
        requests.push(...makeTextBox(`sa1_sum`, sa1, 40, ay, 640, 50, 10, false, a.summary, '#4b5563'))
        ay += 58
      }
      if (a.marketOverview) {
        requests.push(...makeTextBox(`sa1_mo_h`, sa1, 40, ay, 640, 18, 10, true, 'MARKET OVERVIEW', '#374151'))
        ay += 20
        requests.push(...makeTextBox(`sa1_mo`, sa1, 40, ay, 640, 50, 10, false, a.marketOverview, '#4b5563'))
        ay += 56
      }
      if (a.buyerJourney) {
        requests.push(...makeTextBox(`sa1_bj_h`, sa1, 40, ay, 640, 18, 10, true, 'BUYER JOURNEY', '#374151'))
        ay += 20
        requests.push(...makeTextBox(`sa1_bj`, sa1, 40, ay, 640, 36, 10, false, a.buyerJourney, '#4b5563'))
      }

      // Slide: Winning angle + strategy
      if (a.uniqueAngle || a.matchTypeAdvice || a.budgetAdvice || a.negativeAdvice) {
        const sa2 = `slide_${++slideCount}`
        requests.push(makeSlide(sa2))
        requests.push(...makeTextBox(`sa2_h`, sa2, 40, 20, 640, 36, 20, true, 'Strategy & Recommendations'))
        let by = 68
        if (a.uniqueAngle) {
          requests.push(...makeTextBox(`sa2_ua_h`, sa2, 40, by, 640, 16, 10, true, '⚡ WINNING ANGLE', '#92400e'))
          by += 18
          requests.push(...makeTextBox(`sa2_ua`, sa2, 40, by, 640, 32, 10, false, a.uniqueAngle, '#78350f'))
          by += 38
        }
        if (a.matchTypeAdvice) {
          requests.push(...makeTextBox(`sa2_mt_h`, sa2, 40, by, 300, 16, 10, true, 'MATCH TYPE STRATEGY', '#374151'))
          by += 18
          requests.push(...makeTextBox(`sa2_mt`, sa2, 40, by, 640, 28, 10, false, a.matchTypeAdvice, '#4b5563'))
          by += 34
        }
        if (a.budgetAdvice) {
          requests.push(...makeTextBox(`sa2_bud_h`, sa2, 40, by, 300, 16, 10, true, 'BUDGET ADVICE', '#374151'))
          by += 18
          requests.push(...makeTextBox(`sa2_bud`, sa2, 40, by, 640, 28, 10, false, a.budgetAdvice, '#4b5563'))
          by += 34
        }
        if (a.negativeAdvice) {
          requests.push(...makeTextBox(`sa2_neg_h`, sa2, 40, by, 300, 16, 10, true, 'NEGATIVE KEYWORD ADVICE', '#374151'))
          by += 18
          requests.push(...makeTextBox(`sa2_neg`, sa2, 40, by, 640, 28, 10, false, a.negativeAdvice, '#4b5563'))
        }
      }

      // Slide: Do/Don't
      if ((a.doList?.length ?? 0) + (a.dontList?.length ?? 0) > 0) {
        const sd = `slide_${++slideCount}`
        requests.push(makeSlide(sd))
        requests.push(...makeTextBox(`sd_h`, sd, 40, 20, 640, 36, 20, true, 'DO / DON\'T List'))

        let dyL = 68, dyR = 68
        if (a.doList?.length) {
          requests.push(...makeTextBox(`sd_do_h`, sd, 40, dyL, 300, 22, 12, true, '✅ ควรทำ', '#065f46'))
          dyL += 28
          a.doList.slice(0, 8).forEach((item, i) => {
            requests.push(...makeTextBox(`sd_do${i}`, sd, 40, dyL, 300, 24, 10, false, `• ${item}`, '#064e3b'))
            dyL += 28
          })
        }
        if (a.dontList?.length) {
          requests.push(...makeTextBox(`sd_dont_h`, sd, 380, dyR, 300, 22, 12, true, '❌ ห้ามทำ', '#991b1b'))
          dyR += 28
          a.dontList.slice(0, 8).forEach((item, i) => {
            requests.push(...makeTextBox(`sd_dont${i}`, sd, 380, dyR, 300, 24, 10, false, `• ${item}`, '#7f1d1d'))
            dyR += 28
          })
        }
      }

      // Slide: Competitors
      if (a.competitors?.length) {
        const sc = `slide_${++slideCount}`
        requests.push(makeSlide(sc))
        requests.push(...makeTextBox(`sc_h`, sc, 40, 20, 640, 36, 20, true, 'Competitor Analysis'))
        a.competitors.slice(0, 6).forEach((c, i) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const x = 40 + col * 340
          const y = 72 + row * 100
          requests.push(...makeTextBox(`sc_name${i}`, sc, x, y, 300, 22, 12, true, `${c.name} (${c.type === 'direct' ? 'คู่แข่งตรง' : 'ทางอ้อม'})`, '#111827'))
          requests.push(...makeTextBox(`sc_str${i}`, sc, x, y+24, 300, 18, 9, false, `💪 ${c.strength}`, '#065f46'))
          if (c.weakness) requests.push(...makeTextBox(`sc_wk${i}`, sc, x, y+44, 300, 18, 9, false, `⚠️ ${c.weakness}`, '#991b1b'))
          if (c.bidStrategy) requests.push(...makeTextBox(`sc_bid${i}`, sc, x, y+64, 300, 18, 9, false, `💡 ${c.bidStrategy}`, '#1e40af'))
        })
      }

      // Slide: Strategy Tips
      if (a.strategyTips?.length) {
        const st = `slide_${++slideCount}`
        requests.push(makeSlide(st))
        requests.push(...makeTextBox(`st_h`, st, 40, 20, 640, 36, 20, true, 'Strategy Tips — 30 วันแรก'))
        a.strategyTips.slice(0, 8).forEach((tip, i) => {
          requests.push(...makeTextBox(`st_tip${i}`, st, 40, 70 + i * 36, 640, 30, 11, false, `${i+1}. ${tip}`, '#1f2937'))
        })
      }
    }

    await batchUpdateSlides(presentationId, token, requests)

    // Share with the logged-in user so they can open it
    if (userEmail) await shareFile(presentationId, userEmail, token)

    return NextResponse.json({
      url: `https://docs.google.com/presentation/d/${presentationId}`,
      presentationId,
    })
  } catch (err) {
    console.error('[export-slides]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 500 })
  }
}
