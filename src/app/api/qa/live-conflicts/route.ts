/**
 * QA live-conflict check — เทียบแคมเปญที่กำลังจะ push กับของที่ "รันอยู่จริง" ในบัญชี
 * POST /api/qa/live-conflicts
 * body: { customerId, campaigns: [{ name, type, keywords: string[], audiences: string[] }] }
 *
 * เช็ค 3 อย่างกับแคมเปญ ENABLED ในบัญชี:
 *  1. ชื่อแคมเปญซ้ำ (exact, case-insensitive)         → fail
 *  2. keyword ซ้ำกับ keyword ที่ ENABLED อยู่           → warn (จะแข่งประมูลกันเอง)
 *  3. audience (user list / in-market) ซ้ำ              → warn (คนกลุ่มเดียวกันเห็นโฆษณาซ้ำ)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? '').replace(/-/g, '')

interface DraftCampaign { name: string; type: string; keywords?: string[]; audiences?: string[] }
export interface LiveConflict { campaign: string; label: string; severity: 'fail' | 'warn'; message: string }

async function gaql(cid: string, token: string, query: string): Promise<Record<string, any>[]> {
  const res = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'developer-token': DEV_TOKEN,
      'Content-Type': 'application/json',
      ...(LOGIN_CID ? { 'login-customer-id': LOGIN_CID } : {}),
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`GAQL ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const chunks = await res.json() as Array<{ results?: Record<string, any>[] }>
  return chunks.flatMap(c => c.results ?? [])
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
// audience เทียบทั้งชื่อเต็มและ segment สุดท้ายของ path + ตัด prefix "In-Market:"
const audKeys = (s: string): string[] => {
  const base = norm(s).replace(/^(in[\s-]?market|affinity)\s*[:>\-–]\s*/i, '').trim()
  const last = base.split('/').pop()!.trim()
  return last && last !== base ? [base, last] : [base]
}

export async function POST(req: NextRequest) {
  try {
    const { customerId, campaigns } = await req.json() as { customerId?: string; campaigns?: DraftCampaign[] }
    if (!customerId || !Array.isArray(campaigns) || campaigns.length === 0) {
      return NextResponse.json({ error: 'customerId and campaigns required' }, { status: 400 })
    }
    if (isMockMode()) return NextResponse.json({ conflicts: [], liveCampaigns: 0 })

    const cid = customerId.replace(/-/g, '')
    const token = await getGoogleAdsAccessToken()

    // ── ดึงของที่รันอยู่จริง (ENABLED เท่านั้น) ──
    const [liveCamps, liveKws, liveAudCriteria, userLists, interests] = await Promise.all([
      gaql(cid, token, `SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = 'ENABLED'`),
      gaql(cid, token, `SELECT campaign.name, ad_group_criterion.keyword.text FROM keyword_view
        WHERE campaign.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE`),
      gaql(cid, token, `SELECT campaign.name, ad_group_criterion.type, ad_group_criterion.user_list.user_list, ad_group_criterion.user_interest.user_interest_category
        FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND ad_group_criterion.type IN ('USER_LIST','USER_INTEREST') AND ad_group_criterion.status = 'ENABLED'`),
      gaql(cid, token, `SELECT user_list.resource_name, user_list.name FROM user_list`).catch(() => []),
      gaql(cid, token, `SELECT user_interest.user_interest_id, user_interest.name FROM user_interest WHERE user_interest.taxonomy_type IN ('IN_MARKET','AFFINITY')`).catch(() => []),
    ])

    const liveNames = new Map(liveCamps.map(r => [norm(r.campaign.name), r.campaign.name]))

    // keyword → set ของแคมเปญ live ที่ใช้อยู่
    const liveKwMap = new Map<string, Set<string>>()
    for (const r of liveKws) {
      const k = norm(r.adGroupCriterion?.keyword?.text ?? '')
      if (!k) continue
      if (!liveKwMap.has(k)) liveKwMap.set(k, new Set())
      liveKwMap.get(k)!.add(r.campaign.name)
    }

    // audience name → set ของแคมเปญ live
    const listName = new Map(userLists.map(r => [r.userList.resourceName, r.userList.name]))
    const interestName = new Map(interests.map(r => [`customers/${cid}/userInterests/${r.userInterest.userInterestId}`, r.userInterest.name]))
    const liveAudMap = new Map<string, Set<string>>()
    for (const r of liveAudCriteria) {
      const rn = r.adGroupCriterion?.userList?.userList ?? r.adGroupCriterion?.userInterest?.userInterestCategory ?? ''
      const nm = listName.get(rn) ?? interestName.get(rn)
      if (!nm) continue
      for (const key of audKeys(nm)) {
        if (!liveAudMap.has(key)) liveAudMap.set(key, new Set())
        liveAudMap.get(key)!.add(r.campaign.name)
      }
    }

    // ── เทียบ draft กับ live ──
    const conflicts: LiveConflict[] = []
    for (const c of campaigns) {
      const dupName = liveNames.get(norm(c.name))
      if (dupName) {
        conflicts.push({ campaign: c.name, label: 'ชื่อซ้ำกับแคมเปญที่รันอยู่', severity: 'fail', message: `มีแคมเปญ ENABLED ชื่อเดียวกันในบัญชีแล้ว ("${dupName}") — เปลี่ยนชื่อหรือหยุดตัวเก่าก่อน` })
      }

      const kwHits: { kw: string; camps: string[] }[] = []
      for (const kw of c.keywords ?? []) {
        const hit = liveKwMap.get(norm(kw))
        if (hit) kwHits.push({ kw, camps: Array.from(hit) })
      }
      if (kwHits.length > 0) {
        const sample = kwHits.slice(0, 5).map(h => `"${h.kw}"`).join(', ')
        const liveSet = Array.from(new Set(kwHits.flatMap(h => h.camps))).slice(0, 3).join(', ')
        conflicts.push({
          campaign: c.name, label: 'Keyword ซ้ำกับแคมเปญที่รันอยู่', severity: 'warn',
          message: `${kwHits.length} keyword ซ้ำ (${sample}${kwHits.length > 5 ? ` +อีก ${kwHits.length - 5}` : ''}) กับ ${liveSet} — จะแข่งประมูลกันเอง ควรใส่ negative หรือตัดออก`,
        })
      }

      const audHits: { aud: string; camps: string[] }[] = []
      for (const aud of c.audiences ?? []) {
        for (const key of audKeys(aud)) {
          const hit = liveAudMap.get(key)
          if (hit) { audHits.push({ aud, camps: Array.from(hit) }); break }
        }
      }
      if (audHits.length > 0) {
        const sample = audHits.slice(0, 4).map(h => `"${h.aud}"`).join(', ')
        conflicts.push({
          campaign: c.name, label: 'Audience ซ้ำกับแคมเปญที่รันอยู่', severity: 'warn',
          message: `${audHits.length} audience ซ้ำ (${sample}) กับแคมเปญที่รันอยู่ — กลุ่มเป้าหมายเดียวกันจะเห็นโฆษณาชนกัน`,
        })
      }
    }

    return NextResponse.json({ conflicts, liveCampaigns: liveCamps.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
