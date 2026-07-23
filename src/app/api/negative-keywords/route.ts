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

export type NegativeMatchType = 'BROAD' | 'PHRASE' | 'EXACT'

export interface NegativeSuggestion {
  searchTerm: string          // search term เดิม (คีย์ของแถวในตาราง)
  negative: string            // คำ/วลีเฉพาะที่ควร negative (ไม่ใช่ทั้งประโยค)
  matchType: NegativeMatchType
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

// จำนวนวันย้อนหลังที่อนุญาต แล้วแปลงเป็นช่วงวันที่ (เขตเวลาไทย) สำหรับ GAQL BETWEEN
const ALLOWED_DAYS = [7, 14, 30, 60, 90] as const
function clampDays(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 30
  // เลือกค่าที่ใกล้ที่สุดในลิสต์ที่อนุญาต (กัน range เกิน 90 วันของ search_term_view)
  return ALLOWED_DAYS.reduce((best, d) => Math.abs(d - n) < Math.abs(best - n) ? d : best, 30)
}
function bangkokDateRange(days: number): { start: string; end: string } {
  // ใช้เวลาปัจจุบันแบบไทย (UTC+7) เพื่อคำนวณช่วงวันที่
  const nowBkk = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const end = new Date(nowBkk)
  const start = new Date(nowBkk)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

// ─── GET — ดึง search terms ของทุกแคมเปญใน account (เลือกจำนวนวันได้) ─────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const days = clampDays(searchParams.get('days'))
  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
  }

  if (isMockMode()) {
    return NextResponse.json({ campaigns: getMockData(), days })
  }

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')
    const { start, end } = bangkokDateRange(days)

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
       WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status != 'REMOVED'
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

    return NextResponse.json({ campaigns: Array.from(map.values()), days })
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

const keywordItem = z.object({
  text: z.string().min(1).max(80),
  matchType: z.enum(['BROAD', 'PHRASE', 'EXACT']).default('PHRASE'),
})

const applySchema = z.object({
  action: z.literal('apply'),
  customerId: z.string().min(1),
  // scope: campaign = เพิ่ม negative ระดับแคมเปญ | account = สร้าง/เพิ่ม shared negative keyword list ระดับ account
  scope: z.enum(['campaign', 'account']).default('campaign'),
  campaignResourceName: z.string().optional(),       // ใช้เมื่อ scope=campaign
  campaignResourceNames: z.array(z.string()).optional(), // ใช้เมื่อ scope=account (แคมเปญที่จะ attach list เข้าไป)
  listName: z.string().max(120).optional(),          // ชื่อ negative list (scope=account)
  // แต่ละรายการคือ "คำ/วลีที่จะ negative" (แก้ไขได้จาก UI) + match type ที่เลือกเอง
  keywords: z.array(keywordItem).min(1).max(200),
})

function dedupeKeywords(keywords: z.infer<typeof keywordItem>[]): z.infer<typeof keywordItem>[] {
  const seen = new Set<string>()
  return keywords.filter(k => {
    const key = `${k.text.toLowerCase()}::${k.matchType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const MATCH_TYPES: NegativeMatchType[] = ['BROAD', 'PHRASE', 'EXACT']
function normalizeMatchType(v: unknown): NegativeMatchType {
  const up = typeof v === 'string' ? v.toUpperCase() : ''
  return (MATCH_TYPES as string[]).includes(up) ? (up as NegativeMatchType) : 'PHRASE'
}

// Heuristic ของ media buyer: คลิกแล้วไม่มี conversion และเปลืองงบ = candidate
// ไม่มี AI จึงไม่รู้ว่าควรตัด "คำไหน" — ตั้ง default เป็นทั้ง term (phrase) ให้ผู้ใช้แก้เหลือเฉพาะคำเองจาก UI
function heuristicSuggest(terms: z.infer<typeof suggestSchema>['terms']): NegativeSuggestion[] {
  return terms
    .filter(t => t.conversions === 0 && (t.clicks >= 3 || t.cost >= 100))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 30)
    .map(t => ({
      searchTerm: t.searchTerm,
      negative: t.searchTerm,
      matchType: 'PHRASE' as NegativeMatchType,
      reason: `${t.clicks} clicks / ฿${t.cost.toLocaleString()} โดยไม่มี conversion ใน 30 วัน (แก้ให้เหลือเฉพาะคำที่ต้องการได้)`,
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
    const searchTerm = typeof o.searchTerm === 'string' ? o.searchTerm.trim() : ''
    const negative = typeof o.negative === 'string' ? o.negative.trim() : ''
    if (!searchTerm || !negative) continue
    out.push({
      searchTerm,
      negative,
      matchType: normalizeMatchType(o.matchType),
      reason: typeof o.reason === 'string' ? o.reason : '',
    })
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

สิ่งที่ต้องทำ: สำหรับ search term ที่ควร negative ให้เลือก "เฉพาะคำ/วลีที่เป็นปัญหา" ออกมา — ห้าม negative ทั้งประโยค
ตัวอย่าง: "ปรึกษาวีซ่าฟรี" ไม่ควร negative ทั้งประโยค ให้ negative แค่คำว่า "ฟรี" (phrase)
เพราะถ้า negative ทั้งประโยคจะบล็อกได้แค่ประโยคนั้น แต่ถ้า negative แค่คำว่า "ฟรี" จะกันคำค้นที่มี "ฟรี" ได้ทั้งหมด

เกณฑ์การคัด (เลือกเฉพาะที่ควรเป็น negative จริงๆ):
1. เจตนาไม่ตรงกับการซื้อ เช่น หางาน, ทำเอง/DIY, ฟรี, ความหมายอื่นของคำ
2. ใช้งบไปพอสมควรแต่ไม่มี conversion เลย
3. อย่าตัดคำที่มี conversion หรือเป็น search term ที่เกี่ยวข้องกับสินค้าโดยตรง (เช่น รีวิว, เปรียบเทียบ อาจยังอยู่ในเส้นทางการซื้อ)

การเลือก matchType ของแต่ละคำ:
- PHRASE (แนะนำเป็นค่าเริ่มต้น): กันทุกคำค้นที่มีวลีนี้อยู่ เช่น "ฟรี"
- EXACT: กันเฉพาะคำค้นที่ตรงเป๊ะ ใช้เมื่อไม่อยากกันคำอื่นที่มีคำนี้
- BROAD: กว้างสุด ใช้เมื่อต้องการกันทุก variation ของคำ

ตอบเป็น JSON เท่านั้น (negative = เฉพาะคำที่จะตัด ต้องเป็นคำที่ปรากฏอยู่ใน searchTerm นั้น):
{
  "suggestions": [
    { "searchTerm": "search term เดิมเป๊ะๆ", "negative": "คำ/วลีที่จะตัด", "matchType": "PHRASE", "reason": "เหตุผลสั้นๆ ภาษาไทย" }
  ]
}`

  const suggestions = await safeCallAI<NegativeSuggestion[]>(
    prompt,
    validateSuggestions,
    () => heuristicSuggest(candidates),
    { temperature: 0.2, maxTokens: 8192 }
  )

  // กัน AI ตอบ searchTerm ที่ไม่มีอยู่จริงในลิสต์
  const validTerms = new Set(candidates.map(t => t.searchTerm))
  return NextResponse.json({ suggestions: suggestions.filter(s => validTerms.has(s.searchTerm)) })
}

async function adsMutate(cid: string, token: string, payload: unknown) {
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:mutate`,
    { method: 'POST', headers: adsHeaders(token), body: JSON.stringify(payload) }
  )
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Google Ads mutate failed (${res.status}): ${raw.slice(0, 2000)}`)
  }
  return raw ? JSON.parse(raw) : {}
}

// scope=campaign — เพิ่ม negative keyword ระดับแคมเปญเดียว
async function applyCampaign(cid: string, token: string, campaign: string, kws: z.infer<typeof keywordItem>[]) {
  const ops = kws.map(k => ({
    campaignCriterionOperation: {
      create: { campaign, negative: true, keyword: { text: k.text, matchType: k.matchType } },
    },
  }))
  const result = await adsMutate(cid, token, { mutateOperations: ops })
  return NextResponse.json({ success: true, scope: 'campaign', added: ops.length, result })
}

// scope=account — สร้าง shared negative keyword list (SharedSet) + ใส่คำ + attach เข้าแคมเปญ
async function applyAccount(
  cid: string, token: string, listName: string, campaigns: string[], kws: z.infer<typeof keywordItem>[]
) {
  // 1) สร้าง SharedSet + SharedCriterion ในคำสั่งเดียว โดยใช้ temp resource name (-1)
  const tempSet = `customers/${cid}/sharedSets/-1`
  const createOps: unknown[] = [
    { sharedSetOperation: { create: { name: listName, type: 'NEGATIVE_KEYWORDS' } } },
    ...kws.map(k => ({
      sharedCriterionOperation: {
        create: { sharedSet: tempSet, keyword: { text: k.text, matchType: k.matchType } },
      },
    })),
  ]
  const createRes = await adsMutate(cid, token, { mutateOperations: createOps })
  const results = (createRes as { mutateOperationResponses?: Array<Record<string, { resourceName?: string }>> }).mutateOperationResponses ?? []
  const sharedSetResource = results[0]?.sharedSetResult?.resourceName
  if (!sharedSetResource) {
    throw new Error('สร้าง negative list ไม่สำเร็จ (ไม่ได้ resourceName ของ SharedSet)')
  }

  // 2) attach list เข้าแคมเปญที่เลือก — ใช้ partialFailure เพราะบางแคมเปญ (Display/Video/PMax) จะ attach ไม่ได้
  let attached = 0
  let attachErrors: string[] = []
  if (campaigns.length > 0) {
    const attachOps = campaigns.map(campaign => ({
      campaignSharedSetOperation: { create: { campaign, sharedSet: sharedSetResource } },
    }))
    const attachRes = await adsMutate(cid, token, { mutateOperations: attachOps, partialFailure: true }) as {
      mutateOperationResponses?: Array<Record<string, { resourceName?: string }>>
      partialFailureError?: { message?: string }
    }
    const resList = attachRes.mutateOperationResponses ?? []
    attached = resList.filter(r => r.campaignSharedSetResult?.resourceName).length
    if (attachRes.partialFailureError?.message) attachErrors = [attachRes.partialFailureError.message.slice(0, 500)]
  }

  return NextResponse.json({
    success: true,
    scope: 'account',
    added: kws.length,
    listName,
    sharedSet: sharedSetResource,
    attachedCampaigns: attached,
    attachErrors,
    message: `สร้าง negative list "${listName}" (${kws.length} คำ) และ attach เข้า ${attached}/${campaigns.length} แคมเปญ`,
  })
}

async function handleApply(body: z.infer<typeof applySchema>) {
  const kws = dedupeKeywords(body.keywords)

  if (isMockMode()) {
    if (body.scope === 'account') {
      const name = body.listName?.trim() || `Negative List (auto)`
      const n = body.campaignResourceNames?.length ?? 0
      return NextResponse.json({
        success: true, mock: true, scope: 'account', added: kws.length,
        listName: name, attachedCampaigns: n, attachErrors: [],
        message: `[Mock] สร้าง negative list "${name}" (${kws.length} คำ) attach เข้า ${n} แคมเปญ`,
      })
    }
    return NextResponse.json({
      success: true, mock: true, scope: 'campaign', added: kws.length,
      message: `[Mock] เพิ่ม ${kws.length} negative keywords ระดับแคมเปญแล้ว`,
    })
  }

  const token = await getGoogleAdsAccessToken()
  const cid = body.customerId.replace(/-/g, '')

  if (body.scope === 'account') {
    const listName = body.listName?.trim() || `Negative List ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
    const campaigns = body.campaignResourceNames ?? []
    return await applyAccount(cid, token, listName, campaigns, kws)
  }

  if (!body.campaignResourceName) {
    return NextResponse.json({ error: 'campaignResourceName is required for scope=campaign' }, { status: 400 })
  }
  return await applyCampaign(cid, token, body.campaignResourceName, kws)
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
