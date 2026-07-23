/**
 * Market Share / Visibility Share — จาก Google Ads Impression Share metrics
 * GET /api/reports/market-share?customerId=xxx&dateRange=LAST_30_DAYS|CUSTOM_a_b
 *
 * หมายเหตุความหมาย: "Market Share" ที่นี่ = Visibility/Auction Share จาก Impression Share
 * ไม่ใช่ส่วนแบ่งตลาดจริงของธุรกิจ (route + UI ใช้คำตามนี้เสมอ)
 * · Google รายงานค่า IS ต่ำกว่า 10% เป็น 0.0999 → แสดงเป็น "< 10%"
 * · PMax ไม่มี IS metrics → ข้ามพร้อมระบุใน unavailable
 */

export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'
import { gaqlDuring } from '@/lib/google-ads/reporting'
import { callAI } from '@/lib/ai/provider'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

export interface MarketShareCampaign {
  name: string
  channel: 'SEARCH' | 'DISPLAY'
  impressions: number
  impressionShare: number | null       // 0..1 (0.0999 = "<10%")
  lostBudget: number | null
  lostRank: number | null
  topShare: number | null
  absTopShare: number | null
}

async function gaql(cid: string, token: string, query: string): Promise<any[]> {
  const res = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'developer-token': DEV_TOKEN, 'Content-Type': 'application/json', ...(LOGIN_CID ? { 'login-customer-id': LOGIN_CID } : {}) },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`GAQL ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return ((await res.json()) as Array<{ results?: any[] }>).flatMap(c => c.results ?? [])
}

async function fetchIS(cid: string, token: string, during: string): Promise<MarketShareCampaign[]> {
  const rows = await gaql(cid, token, `
    SELECT campaign.name, campaign.advertising_channel_type, metrics.impressions,
           metrics.search_impression_share, metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share, metrics.search_top_impression_share,
           metrics.search_absolute_top_impression_share,
           metrics.content_impression_share, metrics.content_budget_lost_impression_share,
           metrics.content_rank_lost_impression_share
    FROM campaign
    WHERE ${during} AND campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type IN ('SEARCH','DISPLAY')
      AND metrics.impressions > 0`)
  return rows.map(r => {
    const m = r.metrics ?? {}
    const isSearch = r.campaign.advertisingChannelType === 'SEARCH'
    const num = (v: unknown) => (v === undefined || v === null) ? null : Number(v)
    return {
      name: r.campaign.name,
      channel: isSearch ? 'SEARCH' as const : 'DISPLAY' as const,
      impressions: Number(m.impressions ?? 0),
      impressionShare: num(isSearch ? m.searchImpressionShare : m.contentImpressionShare),
      lostBudget: num(isSearch ? m.searchBudgetLostImpressionShare : m.contentBudgetLostImpressionShare),
      lostRank: num(isSearch ? m.searchRankLostImpressionShare : m.contentRankLostImpressionShare),
      topShare: isSearch ? num(m.searchTopImpressionShare) : null,
      absTopShare: isSearch ? num(m.searchAbsoluteTopImpressionShare) : null,
    }
  })
}

// รวมเป็นภาพรวมช่องทาง: ถ่วงน้ำหนักด้วย eligible impressions (impr / IS)
function aggregate(camps: MarketShareCampaign[], channel: 'SEARCH' | 'DISPLAY') {
  const rows = camps.filter(c => c.channel === channel && c.impressionShare && c.impressionShare > 0)
  if (rows.length === 0) return null
  let impr = 0, eligible = 0, lostB = 0, lostR = 0, top = 0, absTop = 0
  for (const c of rows) {
    const el = c.impressions / c.impressionShare!
    impr += c.impressions; eligible += el
    lostB += (c.lostBudget ?? 0) * el
    lostR += (c.lostRank ?? 0) * el
    top += (c.topShare ?? 0) * c.impressions
    absTop += (c.absTopShare ?? 0) * c.impressions
  }
  return {
    impressionShare: impr / eligible,
    lostBudget: lostB / eligible,
    lostRank: lostR / eligible,
    topShare: channel === 'SEARCH' && impr > 0 ? top / impr : null,
    absTopShare: channel === 'SEARCH' && impr > 0 ? absTop / impr : null,
    impressions: impr,
    campaigns: rows.length,
  }
}

// ช่วงก่อนหน้า (ความยาวเท่ากัน) สำหรับ trend
function prevRange(dateRange: string): string | null {
  const m = dateRange.match(/^CUSTOM_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/)
  const day = 24 * 3600 * 1000
  let start: Date, end: Date
  if (m) { start = new Date(m[1]); end = new Date(m[2]) }
  else {
    const days = dateRange === 'LAST_7_DAYS' ? 7 : dateRange === 'LAST_14_DAYS' ? 14 : dateRange === 'LAST_90_DAYS' ? 90 : 30
    end = new Date(Date.now() - day); start = new Date(end.getTime() - (days - 1) * day)
    if (!['LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS'].includes(dateRange)) return null
  }
  const len = end.getTime() - start.getTime() + day
  const pEnd = new Date(start.getTime() - day), pStart = new Date(start.getTime() - len)
  const f = (x: Date) => x.toISOString().slice(0, 10)
  return `segments.date BETWEEN '${f(pStart)}' AND '${f(pEnd)}'`
}

// AI บางครั้งตอบเป็น JSON {"summary":"..."} หรือห่อ ```fence``` ทั้งที่สั่งให้ตอบเนื้อความเปล่า
function extractPlainText(raw: string): string {
  let t = (raw ?? '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim()
  if (t.startsWith('{')) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>
      const firstStr = Object.values(obj).find(v => typeof v === 'string' && v.length > 20)
      if (typeof firstStr === 'string') return firstStr.trim()
    } catch { /* ไม่ใช่ JSON สมบูรณ์ — ใช้ตามเดิม */ }
  }
  return t
}

const pct = (v: number | null | undefined) => v == null ? 'N/A' : v <= 0.1 && v >= 0.0999 ? '< 10%' : `${(v * 100).toFixed(1)}%`

function ruleBasedSummary(sv: ReturnType<typeof aggregate>, dv: ReturnType<typeof aggregate>): { summary: string; recommendations: string[] } {
  if (!sv && !dv) return { summary: 'ยังไม่มีข้อมูล Impression Share ในช่วงที่เลือก (แคมเปญอาจยังไม่มี impressions หรือเป็น PMax ซึ่ง Google ไม่รายงาน IS)', recommendations: [] }
  const recs: string[] = []
  let text = ''
  if (sv) {
    text += `แคมเปญ Search มี Visibility Share ประมาณ ${pct(sv.impressionShare)} ของโอกาสแสดงผลทั้งหมดที่เข้าเงื่อนไข `
    const b = sv.lostBudget ?? 0, r = sv.lostRank ?? 0
    if (b > r && b > 0.05) {
      text += `โดยส่วนที่เสียไปหลักๆ มาจากงบประมาณ (${pct(b)}) มากกว่าอันดับโฆษณา (${pct(r)}) สะท้อนว่ามี demand ให้เก็บเพิ่มแต่ถูกจำกัดด้วยงบ `
      recs.push(`Lost IS (Budget) ${pct(b)} — พิจารณาเพิ่มงบแคมเปญที่ Conversion Rate ดี หรือโยกงบจากแคมเปญ CPA สูง`)
    } else if (r > 0.05) {
      text += `โดยส่วนที่เสียไปหลักๆ มาจากอันดับโฆษณา (${pct(r)}) มากกว่างบ (${pct(b)}) `
      recs.push(`Lost IS (Rank) ${pct(r)} — ปรับปรุง Ad Rank: Quality Score, ความเกี่ยวข้องของ ad copy/keyword, landing page experience หรือทบทวน bidding strategy`)
    }
    if (sv.topShare != null) text += `โฆษณาขึ้นตำแหน่งบน ${pct(sv.topShare)} และตำแหน่งบนสุด ${pct(sv.absTopShare)} `
  }
  if (dv) text += `ฝั่ง Display มี Visibility Share ${pct(dv.impressionShare)}`
  recs.push('ติดตาม Impression Share ต่อเนื่อง 7-14 วันหลังปรับงบ/bid เพราะระบบอาจเข้า learning phase ชั่วคราว')
  return { summary: text.trim(), recommendations: recs }
}

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId')
  const dateRange = req.nextUrl.searchParams.get('dateRange') ?? 'LAST_30_DAYS'
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  if (isMockMode()) return NextResponse.json({ overview: null, campaigns: [], unavailable: ['mock mode'], aiSummary: '', recommendations: [] })

  try {
    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')
    const campaigns = await fetchIS(cid, token, gaqlDuring(dateRange))
    const search = aggregate(campaigns, 'SEARCH')
    const display = aggregate(campaigns, 'DISPLAY')

    // trend เทียบช่วงก่อนหน้า (ถ้าคำนวณช่วงได้)
    let prev: { search: ReturnType<typeof aggregate>; display: ReturnType<typeof aggregate> } | null = null
    const pr = prevRange(dateRange)
    if (pr) {
      try {
        const prevCamps = await fetchIS(cid, token, pr)
        prev = { search: aggregate(prevCamps, 'SEARCH'), display: aggregate(prevCamps, 'DISPLAY') }
      } catch { /* trend optional */ }
    }

    const unavailable: string[] = []
    if (!search) unavailable.push('Search Impression Share (ไม่มีแคมเปญ Search ที่มี impressions ในช่วงนี้)')
    if (!display) unavailable.push('Display Impression Share (ไม่มีแคมเปญ Display ที่มี impressions ในช่วงนี้)')
    unavailable.push('Performance Max — Google ไม่รายงาน Impression Share สำหรับ PMax')

    const rule = ruleBasedSummary(search, display)
    // AI สรุปภาษารายงานลูกค้า — fail → ใช้ rule-based
    let aiSummary = rule.summary
    if (search || display) {
      try {
        const raw = await callAI(
          `คุณคือ Performance Marketer เขียนสรุป Visibility Share สำหรับรายงานลูกค้า (ภาษาไทย 1 ย่อหน้า ≤120 คำ)
ข้อมูล: Search IS ${pct(search?.impressionShare)} · Lost by Budget ${pct(search?.lostBudget)} · Lost by Rank ${pct(search?.lostRank)} · Top ${pct(search?.topShare)} · Abs.Top ${pct(search?.absTopShare)} · Display IS ${pct(display?.impressionShare)}${prev?.search ? ` · ช่วงก่อนหน้า Search IS ${pct(prev.search.impressionShare)}` : ''}
กติกา: ใช้คำว่า "Visibility Share/โอกาสแสดงผล" ห้ามอ้างว่าเป็นส่วนแบ่งตลาดจริง · บอกว่าเสียโอกาสจาก Budget หรือ Rank มากกว่า พร้อมคำแนะนำที่ตรงสาเหตุ · ห้ามประดิษฐ์ตัวเลข · ตอบเฉพาะเนื้อความ ไม่ต้องมีหัวข้อ`,
          { tier: 'standard' }
        )
        const cleaned = extractPlainText(raw)
        if (cleaned && cleaned.length > 40) aiSummary = cleaned
      } catch { /* ใช้ rule-based */ }
    }

    return NextResponse.json({
      overview: { search, display },
      prev,
      campaigns: campaigns.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
      aiSummary,
      recommendations: rule.recommendations,
      unavailable,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
