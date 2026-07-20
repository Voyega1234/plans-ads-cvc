import { NextRequest, NextResponse } from 'next/server'
import { isMockMode } from '@/lib/google-ads/client'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { safeCallAI } from '@/lib/ai/provider'
import { z } from 'zod'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SearchTermRow {
  searchTerm: string
  impressions: number
  clicks: number
  cost: number          // บาท
  conversions: number
  alreadyNegative: boolean
}

export interface CampaignSearchTerms {
  campaignId: string
  campaignName: string
  campaignResourceName: string
  terms: SearchTermRow[]
}

export interface NegativeSuggestion {
  term: string
  reason: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function adsHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': DEV_TOKEN,
    'Content-Type': 'application/json',
  }
  if (LOGIN_CID) h['login-customer-id'] = LOGIN_CID
  return h
}

async function searchStream<T>(cid: string, query: string, token: string): Promise<T[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
    { method: 'POST', headers: adsHeaders(token), body: JSON.stringify({ query }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google Ads API error (${res.status}): ${txt.slice(0, 400)}`)
  }
  const batches = await res.json() as Array<{ results?: T[] }>
  const out: T[] = []
  for (const b of batches) for (const r of b.results ?? []) out.push(r)
  return out
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

function getMockData(): CampaignSearchTerms[] {
  return [
    {
      campaignId: '111111',
      campaignName: 'CVC | Search | Brand',
      campaignResourceName: 'customers/mock/campaigns/111111',
      terms: [
        { searchTerm: 'ครีมกันแดด ยี่ห้อไหนดี', impressions: 4200, clicks: 210, cost: 1850, conversions: 12, alreadyNegative: false },
        { searchTerm: 'ครีมกันแดด ฟรี', impressions: 900, clicks: 85, cost: 720, conversions: 0, alreadyNegative: false },
        { searchTerm: 'ครีมกันแดด อันตราย', impressions: 650, clicks: 40, cost: 380, conversions: 0, alreadyNegative: false },
        { searchTerm: 'วิธีทำครีมกันแดดเอง', impressions: 400, clicks: 25, cost: 210, conversions: 0, alreadyNegative: false },
        { searchTerm: 'ครีมกันแดด รีวิว', impressions: 3100, clicks: 160, cost: 1320, conversions: 8, alreadyNegative: false },
      ],
    },
    {
      campaignId: '222222',
      campaignName: 'CVC | Search | Generic',
      campaignResourceName: 'customers/mock/campaigns/222222',
      terms: [
        { searchTerm: 'สมัครงาน โรงงานครีม', impressions: 300, clicks: 42, cost: 350, conversions: 0, alreadyNegative: false },
        { searchTerm: 'ครีมบำรุงผิว ราคาส่ง', impressions: 2500, clicks: 130, cost: 990, conversions: 6, alreadyNegative: false },
        { searchTerm: 'ครีม แจกฟรี', impressions: 800, clicks: 60, cost: 450, conversions: 0, alreadyNegative: true },
      ],
    },
  ]
}

// ─── GET — ดึง search terms ของทุกแคมเปญใน account (30 วันล่าสุด) ────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
  }

  if (isMockMode()) {
    return NextResponse.json({ campaigns: getMockData() })
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')

    type TermRow = {
      campaign?: { id?: string; name?: string; resourceName?: string }
      searchTermView?: { searchTerm?: string }
      metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: string }
    }
    const rows = await searchStream<TermRow>(
      cid,
      `SELECT campaign.id, campaign.name, campaign.resource_name,
        search_term_view.search_term,
        metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
       FROM search_term_view
       WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
       ORDER BY metrics.cost_micros DESC
       LIMIT 2000`,
      token
    )

    // negative keywords ระดับแคมเปญที่มีอยู่แล้ว — ไว้ mark ในตารางและกันเพิ่มซ้ำ
    type NegRow = {
      campaign?: { id?: string }
      campaignCriterion?: { keyword?: { text?: string } }
    }
    const negRows = await searchStream<NegRow>(
      cid,
      `SELECT campaign.id, campaign_criterion.keyword.text
       FROM campaign_criterion
       WHERE campaign_criterion.negative = TRUE
         AND campaign_criterion.type = 'KEYWORD'
         AND campaign_criterion.status != 'REMOVED'`,
      token
    ).catch(() => [] as NegRow[])

    const negByCampaign = new Map<string, Set<string>>()
    for (const r of negRows) {
      const cId = r.campaign?.id ?? ''
      const text = (r.campaignCriterion?.keyword?.text ?? '').toLowerCase()
      if (!cId || !text) continue
      if (!negByCampaign.has(cId)) negByCampaign.set(cId, new Set())
      negByCampaign.get(cId)!.add(text)
    }

    const map = new Map<string, CampaignSearchTerms>()
    for (const r of rows) {
      const c = r.campaign
      const term = r.searchTermView?.searchTerm ?? ''
      if (!c?.id || !term) continue
      if (!map.has(c.id)) {
        map.set(c.id, {
          campaignId: c.id,
          campaignName: c.name ?? c.id,
          campaignResourceName: c.resourceName ?? `customers/${cid}/campaigns/${c.id}`,
          terms: [],
        })
      }
      const negatives = negByCampaign.get(c.id)
      map.get(c.id)!.terms.push({
        searchTerm: term,
        impressions: Number(r.metrics?.impressions ?? 0),
        clicks: Number(r.metrics?.clicks ?? 0),
        cost: Math.round(Number(r.metrics?.costMicros ?? 0) / 1_000_000),
        conversions: Math.round(Number(r.metrics?.conversions ?? 0)),
        alreadyNegative: negatives?.has(term.toLowerCase()) ?? false,
      })
    }

    return NextResponse.json({ campaigns: Array.from(map.values()) })
  } catch (err) {
    console.error('[negative-keywords GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

// ─── POST — action: suggest (ให้ระบบคัด) | apply (สร้าง negative จริง) ───────────

const suggestSchema = z.object({
  action: z.literal('suggest'),
  campaignName: z.string(),
  terms: z.array(z.object({
    searchTerm: z.string(),
    impressions: z.number(),
    clicks: z.number(),
    cost: z.number(),
    conversions: z.number(),
  })),
})

const applySchema = z.object({
  action: z.literal('apply'),
  customerId: z.string().min(1),
  campaignResourceName: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1).max(200),
})

// Heuristic ของ media buyer: คลิกแล้วไม่มี conversion และเปลืองงบ = candidate
function heuristicSuggest(terms: z.infer<typeof suggestSchema>['terms']): NegativeSuggestion[] {
  return terms
    .filter(t => t.conversions === 0 && (t.clicks >= 3 || t.cost >= 100))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 30)
    .map(t => ({
      term: t.searchTerm,
      reason: `${t.clicks} clicks / ฿${t.cost.toLocaleString()} โดยไม่มี conversion ใน 30 วัน`,
    }))
}

function validateSuggestions(raw: unknown): NegativeSuggestion[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.suggestions)) return null
  const out: NegativeSuggestion[] = []
  for (const s of obj.suggestions as unknown[]) {
    if (typeof s !== 'object' || s === null) continue
    const o = s as Record<string, unknown>
    if (typeof o.term === 'string' && o.term.trim()) {
      out.push({ term: o.term, reason: typeof o.reason === 'string' ? o.reason : '' })
    }
  }
  return out.length > 0 ? out : null
}

async function handleSuggest(body: z.infer<typeof suggestSchema>) {
  // ส่งเฉพาะ term ที่ยังไม่ negative และมี click จริงให้ AI พิจารณา
  const candidates = body.terms.filter(t => t.clicks > 0)
  if (!candidates.length) {
    return NextResponse.json({ suggestions: [] })
  }

  const termList = candidates
    .map(t => `- "${t.searchTerm}" — ${t.impressions} impr, ${t.clicks} clicks, ฿${t.cost}, ${t.conversions} conversions`)
    .join('\n')

  const prompt = `คุณเป็น Media Buyer มืออาชีพที่ดูแล Google Ads มามากกว่า 10 ปี
กำลังคัด Negative Keywords ให้แคมเปญ "${body.campaignName}"

Search terms จริงจาก 30 วันล่าสุด:
${termList}

เกณฑ์การคัด (เลือกเฉพาะที่ควรเป็น negative จริงๆ):
1. เจตนาไม่ตรงกับการซื้อ เช่น หางาน, ทำเอง/DIY, ฟรี, ความหมายอื่นของคำ
2. ใช้งบไปพอสมควรแต่ไม่มี conversion เลย
3. อย่าตัดคำที่มี conversion หรือเป็น search term ที่เกี่ยวข้องกับสินค้าโดยตรง (เช่น รีวิว, เปรียบเทียบ อาจยังอยู่ในเส้นทางการซื้อ)

ตอบเป็น JSON เท่านั้น:
{
  "suggestions": [
    { "term": "search term เดิมเป๊ะๆ", "reason": "เหตุผลสั้นๆ ภาษาไทย" }
  ]
}`

  const suggestions = await safeCallAI<NegativeSuggestion[]>(
    prompt,
    validateSuggestions,
    () => heuristicSuggest(candidates),
    { temperature: 0.2, maxTokens: 8192 }
  )

  // กัน AI ตอบ term ที่ไม่มีอยู่จริงในลิสต์
  const validTerms = new Set(candidates.map(t => t.searchTerm))
  return NextResponse.json({ suggestions: suggestions.filter(s => validTerms.has(s.term)) })
}

async function handleApply(body: z.infer<typeof applySchema>) {
  if (isMockMode()) {
    return NextResponse.json({
      success: true, mock: true,
      added: body.keywords.length,
      message: `[Mock] เพิ่ม ${body.keywords.length} negative keywords (phrase match) แล้ว`,
    })
  }

  const token = await getGoogleAdsAccessToken()
  const cid = body.customerId.replace(/-/g, '')

  // สร้างเป็น campaign-level negative keyword แบบ PHRASE match ตาม requirement
  const ops = body.keywords.map(text => ({
    campaignCriterionOperation: {
      create: {
        campaign: body.campaignResourceName,
        negative: true,
        keyword: { text, matchType: 'PHRASE' },
      },
    },
  }))

  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
    { method: 'POST', headers: adsHeaders(token), body: JSON.stringify({ mutateOperations: ops }) }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google Ads mutate failed (${res.status}): ${txt.slice(0, 2000)}`)
  }

  const result = await res.json()
  return NextResponse.json({ success: true, added: body.keywords.length, result })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { action?: string }
    if (body.action === 'suggest') {
      return await handleSuggest(suggestSchema.parse(body))
    }
    if (body.action === 'apply') {
      return await handleApply(applySchema.parse(body))
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[negative-keywords POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
