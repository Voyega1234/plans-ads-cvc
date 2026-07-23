/**
 * QA Policy Check — ประเมินความเสี่ยง Google Ads Policy
 * POST /api/qa/policy-check
 * body: {
 *   customerId?: string        // ถ้าส่งมา → ดึงสถานะ policy จริงของ ads ในบัญชีมารวมด้วย
 *   campaigns: [{ name, type, finalUrl, headlines[], descriptions[], keywords[] }]
 * }
 *
 * ผล: items[] = { campaign, target, category, riskLevel, reason, evidence, fix,
 *                clientExplanation, status } + liveChecked + overallNote
 * กติกา: ห้ามบอกว่า "ผ่านแน่นอน" — ใช้ "ไม่พบความเสี่ยงที่ชัดเจนจากข้อมูลที่มี" เสมอ
 */

export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

export interface PolicyItem {
  campaign: string
  target: string            // 'Ad Copy' | 'Keyword' | 'Landing Page' | 'Live Ad'
  category: string          // Misrepresentation, Healthcare, Financial products, ...
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  reason: string
  evidence: string
  fix: string
  clientExplanation: string
  status: 'PASSED' | 'WARNING' | 'FAILED' | 'NEEDS_REVIEW'
}

interface DraftCampaign { name: string; type?: string; finalUrl?: string; headlines?: string[]; descriptions?: string[]; keywords?: string[] }

const POLICY_CATEGORIES = 'Misrepresentation, Destination requirements, Editorial standards, Healthcare/medicine, Financial products, Gambling, Alcohol, Adult content, Trademark/copyright, Personalized advertising (sensitive categories), Circumventing systems, Restricted products/services'

// ── สถานะ policy จริงจาก ads ที่มีอยู่ในบัญชี ──
async function fetchLivePolicy(customerId: string): Promise<PolicyItem[]> {
  const token = await getGoogleAdsAccessToken()
  const cid = customerId.replace(/-/g, '')
  const res = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'developer-token': DEV_TOKEN, 'Content-Type': 'application/json', ...(LOGIN_CID ? { 'login-customer-id': LOGIN_CID } : {}) },
    body: JSON.stringify({ query: `
      SELECT campaign.name, ad_group.name, ad_group_ad.ad.id,
             ad_group_ad.policy_summary.approval_status,
             ad_group_ad.policy_summary.review_status,
             ad_group_ad.policy_summary.policy_topic_entries
      FROM ad_group_ad
      WHERE campaign.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED'
      LIMIT 500` }),
  })
  if (!res.ok) throw new Error(`GAQL policy ${res.status}`)
  const rows = ((await res.json()) as Array<{ results?: any[] }>).flatMap(c => c.results ?? [])

  const items: PolicyItem[] = []
  for (const r of rows) {
    const ps = r.adGroupAd?.policySummary ?? {}
    const approval = ps.approvalStatus ?? ''
    const review = ps.reviewStatus ?? ''
    const topics = (ps.policyTopicEntries ?? []) as Array<{ topic?: string; type?: string }>
    if (approval === 'APPROVED' && topics.length === 0) continue
    const topicStr = topics.map(t => `${t.topic ?? ''}(${t.type ?? ''})`).join(', ') || approval
    const isDisapproved = approval === 'DISAPPROVED'
    const isLimited = approval === 'APPROVED_LIMITED'
    const underReview = review === 'UNDER_REVIEW' || review === 'ELIGIBLE_MAY_SERVE'
    items.push({
      campaign: r.campaign?.name ?? '',
      target: `Live Ad (${r.adGroup?.name ?? ''} #${r.adGroupAd?.ad?.id ?? ''})`,
      category: topics[0]?.topic ?? approval,
      riskLevel: isDisapproved ? 'HIGH' : isLimited ? 'MEDIUM' : 'LOW',
      reason: isDisapproved ? `โฆษณาถูกปฏิเสธ (disapproved) — policy: ${topicStr}`
        : isLimited ? `โฆษณาแสดงผลแบบจำกัด (limited by policy) — ${topicStr}`
        : underReview ? 'อยู่ระหว่างการตรวจสอบของ Google (under review)'
        : `สถานะ: ${approval} ${topicStr}`,
      evidence: topicStr,
      fix: isDisapproved ? 'แก้ ad copy/landing page ตาม policy ที่ระบุ แล้วส่ง appeal หรือสร้าง ad ใหม่'
        : isLimited ? 'ตรวจว่าข้อจำกัดกระทบกลุ่มเป้าหมายหลักหรือไม่ — ถ้ากระทบ ปรับเนื้อหาให้พ้นหมวดจำกัด'
        : 'รอผลตรวจของ Google — ยังไม่ต้องแก้',
      clientExplanation: isDisapproved
        ? `โฆษณาในแคมเปญ ${r.campaign?.name} ถูกระบบ Google ปฏิเสธด้วยเหตุผลด้านนโยบาย (${topics[0]?.topic ?? 'ตามที่ระบบระบุ'}) ทีมกำลังปรับแก้เพื่อส่งตรวจใหม่ ระหว่างนี้โฆษณาตัวดังกล่าวจะไม่แสดงผล`
        : `โฆษณาบางตัวในแคมเปญ ${r.campaign?.name} มีข้อจำกัดการแสดงผลจากนโยบายของ Google ทีมติดตามอยู่และจะปรับแก้หากกระทบผลลัพธ์`,
      status: isDisapproved ? 'FAILED' : isLimited ? 'WARNING' : 'NEEDS_REVIEW',
    })
  }
  return items
}

// ── AI ประเมิน draft (ก่อน push) ──
async function analyzeDrafts(campaigns: DraftCampaign[]): Promise<{ items: PolicyItem[]; note: string }> {
  const desc = campaigns.map(c => `แคมเปญ "${c.name}" (${c.type ?? ''})
  Landing: ${c.finalUrl ?? '-'}
  Headlines: ${(c.headlines ?? []).slice(0, 15).join(' | ')}
  Descriptions: ${(c.descriptions ?? []).slice(0, 5).join(' | ')}
  Keywords: ${(c.keywords ?? []).slice(0, 30).join(', ')}`).join('\n\n')

  return safeCallAI<{ items: PolicyItem[]; note: string }>(
    `คุณคือผู้เชี่ยวชาญ Google Ads Policy ตรวจความเสี่ยงของแคมเปญ "ก่อน push" จากข้อมูลด้านล่าง

หมวด policy ที่ต้องพิจารณา: ${POLICY_CATEGORIES}

${desc}

กติกาสำคัญ:
- รายงานเฉพาะความเสี่ยงที่มีหลักฐานจากข้อความ/คีย์เวิร์ด/URL ที่ให้มาจริง — ห้ามเดา ห้ามแต่งหมวดที่ไม่เกี่ยว
- คำการันตี/superlative เกินจริง ("ที่สุด", "100%", "รับประกันผ่าน") = Misrepresentation/Editorial risk
- บริการวีซ่า/กฎหมาย/การเงิน/สุขภาพ → ระวังหมวด restricted + คำเคลมผลลัพธ์
- ไม่มีความเสี่ยง → items เป็น [] และ note = "ไม่พบความเสี่ยงด้าน policy ที่ชัดเจนจากข้อมูลที่ตรวจได้ แต่ควรตรวจซ้ำเมื่อมีการเปลี่ยน copy, landing page หรือ asset ใหม่"
- ห้ามใช้คำว่า "ผ่านแน่นอน"

ตอบเป็น JSON เท่านั้น:
{"items":[{"campaign":"...","target":"Ad Copy|Keyword|Landing Page","category":"...","riskLevel":"LOW|MEDIUM|HIGH","reason":"...","evidence":"ข้อความ/คำที่เป็นหลักฐาน","fix":"วิธีแก้ที่ทำได้จริง","clientExplanation":"อธิบายลูกค้าแบบเข้าใจง่าย 1-2 ประโยค","status":"WARNING|NEEDS_REVIEW|FAILED"}],"note":"..."}`,
    (raw) => {
      const r = raw as { items?: PolicyItem[]; note?: string }
      if (!r || !Array.isArray(r.items)) return null
      const ok = r.items.every(i => i.campaign && i.category && ['LOW', 'MEDIUM', 'HIGH'].includes(i.riskLevel))
      return ok ? { items: r.items, note: r.note ?? '' } : null
    },
    () => ({ items: [], note: 'ไม่พบความเสี่ยงด้าน policy ที่ชัดเจนจากข้อมูลที่ตรวจได้ (mock) แต่ควรตรวจซ้ำเมื่อมีการเปลี่ยน copy, landing page หรือ asset ใหม่' }),
    { tier: 'standard' }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { customerId?: string; campaigns?: DraftCampaign[] }
    const campaigns = body.campaigns ?? []
    if (campaigns.length === 0 && !body.customerId) {
      return NextResponse.json({ error: 'campaigns or customerId required' }, { status: 400 })
    }

    const draft = campaigns.length > 0
      ? await analyzeDrafts(campaigns)
      : { items: [] as PolicyItem[], note: '' }

    let liveItems: PolicyItem[] = []
    let liveChecked = false
    if (body.customerId && !isMockMode()) {
      try {
        liveItems = await fetchLivePolicy(body.customerId)
        liveChecked = true
      } catch { /* live check optional — บัญชีอาจไม่มี ads */ }
    }

    const items = [...draft.items, ...liveItems]
    const overallNote = items.length === 0
      ? (draft.note || 'ไม่พบความเสี่ยงด้าน policy ที่ชัดเจนจากข้อมูลที่ตรวจได้ แต่ควรตรวจซ้ำเมื่อมีการเปลี่ยน copy, landing page หรือ asset ใหม่')
      : draft.note

    return NextResponse.json({ items, liveChecked, overallNote })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
