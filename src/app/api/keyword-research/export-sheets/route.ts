import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getServiceAccountToken } from '@/lib/google/service-account-auth'

type SheetCell = string | number | null

function isMockMode(): boolean {
  return (
    !process.env.GOOGLE_SHEETS_CLIENT_EMAIL ||
    !process.env.GOOGLE_SHEETS_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_ENABLED !== 'true'
  )
}

async function getSheetsToken(): Promise<string> {
  return getServiceAccountToken(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? '',
    process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? '',
    'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'
  )
}

async function shareFile(fileId: string, userEmail: string, token: string) {
  // Share with specific user first; if that fails (no domain-wide delegation), fall back to anyone-with-link
  const userRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: userEmail }),
  })
  if (!userRes.ok) {
    console.warn('[export-sheets] user share failed, falling back to anyone-with-link:', await userRes.text().catch(() => ''))
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'anyone' }),
    })
  }
}

async function createSpreadsheet(title: string, token: string): Promise<string> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { title } }),
  })
  if (!res.ok) throw new Error(`Create spreadsheet failed: ${res.status}`)
  const data = await res.json() as { spreadsheetId: string }
  return data.spreadsheetId
}

async function batchUpdate(spreadsheetId: string, token: string, ranges: Array<{ range: string; values: SheetCell[][] }>) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: ranges }),
    }
  )
  if (!res.ok) throw new Error(`batchUpdate failed: ${res.status}`)
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

// Sort keywords: first those with real volume (avgMonthlySearches > 0) desc, then zero/no-data
function sortByVolume(kws: Kw[]): Kw[] {
  return [...kws].sort((a, b) => {
    const va = a.avgMonthlySearches ?? 0
    const vb = b.avgMonthlySearches ?? 0
    if (vb !== va) return vb - va
    // secondary: competition HIGH > MEDIUM > LOW
    const compOrder: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 }
    return (compOrder[b.competition] ?? 0) - (compOrder[a.competition] ?? 0)
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

    const title = `Keyword Research — ${body.businessName} (${new Date().toLocaleDateString('th-TH')})`

    if (isMockMode()) {
      return NextResponse.json({
        url: 'https://docs.google.com/spreadsheets/d/mock-keyword-export',
        spreadsheetId: 'mock-keyword-export',
        mock: true,
      })
    }

    const token = await getSheetsToken()
    const spreadsheetId = await createSpreadsheet(title, token)

    const rows: SheetCell[][] = []

    // ── Title block ──────────────────────────────────────────────────────────
    rows.push([`KEYWORD RESEARCH REPORT: ${body.businessName}`])
    rows.push([`สินค้า/บริการ: ${body.productService}`, '', `พื้นที่: ${body.location}`, '', `Objective: ${body.objective}`])
    rows.push([`สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}`])
    rows.push([])

    // ── Forecast ─────────────────────────────────────────────────────────────
    if (body.forecast) {
      const f = body.forecast
      rows.push(['═══ FORECAST ═══════════════════════════════════'])
      rows.push([])
      rows.push(['Metric', 'ค่า'])
      rows.push(['Impressions/เดือน', f.monthlyImpressions.toLocaleString()])
      rows.push(['Clicks/เดือน', f.monthlyClicks.toLocaleString()])
      rows.push(['CTR', `${f.ctr}%`])
      rows.push(['Avg. CPC', `฿${f.cpc}`])
      rows.push(['Est. Spend/เดือน', `฿${f.actualSpend.toLocaleString()}`])
      rows.push(['Budget Utilized', `${f.budgetUtilized}%`])
      rows.push([])

      if (f.devices?.length) {
        rows.push(['Device', '% Share', 'Clicks/เดือน'])
        for (const d of f.devices) rows.push([d.label, `${d.pct}%`, d.clicks])
        rows.push([])
      }
      if (f.locations?.length) {
        rows.push(['Location', '% Share'])
        for (const loc of f.locations) rows.push([loc.label, `${loc.pct}%`])
        rows.push([])
      }
    }

    // ── Keywords — grouped by category, sorted by volume desc ────────────────
    rows.push(['═══ KEYWORDS ════════════════════════════════════'])
    rows.push([])

    const GROUP_ORDER = ['brand', 'product', 'service', 'generic', 'competitor']
    const positiveKws = body.keywords.filter(k => k.group !== 'negative')
    const negKws = body.keywords.filter(k => k.group === 'negative')

    const byGroup: Record<string, Kw[]> = {}
    for (const k of positiveKws) {
      if (!byGroup[k.group]) byGroup[k.group] = []
      byGroup[k.group].push(k)
    }

    const orderedGroups = [
      ...GROUP_ORDER.filter(g => byGroup[g]?.length),
      ...Object.keys(byGroup).filter(g => !GROUP_ORDER.includes(g)),
    ]

    for (const group of orderedGroups) {
      const kws = sortByVolume(byGroup[group])
      const label = GROUP_LABEL_TH[group] ?? group
      rows.push([`── ${label} (${kws.length} keywords) ──`])
      rows.push(['Keyword', 'Match Type', 'Searches/mo', 'Competition', 'CPC Est.', 'Volume', 'Selected'])
      for (const k of kws) {
        rows.push([
          k.keyword,
          k.matchType,
          k.avgMonthlySearches ? k.avgMonthlySearches.toLocaleString() : '—',
          k.competition,
          k.cpcEst > 0 ? `฿${k.cpcEst}` : '—',
          k.volume,
          k.selected ? 'Yes' : '',
        ])
      }
      rows.push([])
    }

    if (negKws.length > 0) {
      rows.push([`── Negative Keywords (${negKws.length}) ──`])
      rows.push(['Keyword', 'Match Type'])
      for (const k of sortByVolume(negKws)) rows.push([k.keyword, k.matchType])
      rows.push([])
    }

    // ── AI Market Analysis ────────────────────────────────────────────────────
    if (body.analysis) {
      const a = body.analysis
      rows.push(['═══ MARKET ANALYSIS ══════════════════════════'])
      rows.push([])

      if (a.opportunityScore || a.difficultyScore || a.marketTrend) {
        rows.push(['โอกาส (Opportunity)', `${a.opportunityScore ?? '—'}/10`, 'ความยาก (Difficulty)', `${a.difficultyScore ?? '—'}/10`, 'Market Trend', a.marketTrend ?? '—'])
        rows.push([])
      }

      if (a.summary) {
        rows.push(['SUMMARY'])
        rows.push([a.summary])
        rows.push([])
      }

      if (a.marketOverview) {
        rows.push(['MARKET OVERVIEW'])
        rows.push([a.marketOverview])
        rows.push([])
      }

      if (a.buyerJourney) {
        rows.push(['BUYER JOURNEY'])
        rows.push([a.buyerJourney])
        rows.push([])
      }

      if (a.uniqueAngle) {
        rows.push(['WINNING ANGLE'])
        rows.push([a.uniqueAngle])
        rows.push([])
      }

      if (a.marketSignals?.length) {
        rows.push(['Market Signals'])
        rows.push(['Icon', 'Label', 'Value', 'Detail'])
        for (const s of a.marketSignals) rows.push([s.icon, s.label, s.value, s.detail])
        rows.push([])
      }

      if (a.topKeywords?.length) {
        rows.push(['TOP KEYWORDS ที่ควร Bid สูง'])
        for (const kw of a.topKeywords) rows.push(['', kw])
        rows.push([])
      }

      if (a.budgetAdvice) {
        rows.push(['BUDGET ADVICE'])
        rows.push([a.budgetAdvice])
        rows.push([])
      }

      if (a.matchTypeAdvice) {
        rows.push(['MATCH TYPE STRATEGY'])
        rows.push([a.matchTypeAdvice])
        rows.push([])
      }

      if (a.negativeAdvice) {
        rows.push(['NEGATIVE KEYWORD ADVICE'])
        rows.push([a.negativeAdvice])
        rows.push([])
      }

      if (a.competitors?.length) {
        rows.push(['COMPETITORS'])
        rows.push(['ชื่อ', 'ประเภท', 'จุดแข็ง', 'จุดอ่อน', 'Bid Strategy'])
        for (const c of a.competitors) rows.push([c.name, c.type === 'direct' ? 'คู่แข่งตรง' : 'ทางอ้อม', c.strength, c.weakness ?? '—', c.bidStrategy ?? '—'])
        rows.push([])
      }

      if (a.strategyTips?.length) {
        rows.push(['STRATEGY TIPS (30 วัน)'])
        for (const tip of a.strategyTips) rows.push(['', tip])
        rows.push([])
      }

      if (a.doList?.length) {
        rows.push(['ควรทำ (DO)'])
        for (const item of a.doList) rows.push(['', `✓ ${item}`])
        rows.push([])
      }

      if (a.dontList?.length) {
        rows.push(['ไม่ควรทำ (DON\'T)'])
        for (const item of a.dontList) rows.push(['', `✕ ${item}`])
      }
    }

    await batchUpdate(spreadsheetId, token, [{
      range: 'Sheet1!A1',
      values: rows,
    }])

    // Share with the logged-in user so they can open it
    if (userEmail) await shareFile(spreadsheetId, userEmail, token)

    return NextResponse.json({
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      spreadsheetId,
    })
  } catch (err) {
    console.error('[export-sheets]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 500 })
  }
}
