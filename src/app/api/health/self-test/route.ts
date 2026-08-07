import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { planPolicyRetry } from '@/lib/google-ads/campaign-builder'
import { getConnectionConfig } from '@/lib/line-tracking/services/connectionStore'
import type { LineConfig } from '@/lib/line-tracking/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * ระบบทดสอบตัวเอง — /api/health/self-test
 *
 * ทำไมต้องมี: ที่ผ่านมาบั๊กสามตัว (login-wall ทับ /embed.js, userId ใน JWT ไม่ตรง DB
 * จน `prisma.brief.create()` ชน FK, และ GAQL ที่ลืม SELECT ฟิลด์ที่ใช้ใน WHERE)
 * ทั้งหมด **คอมไพล์ผ่าน type-check ผ่าน build ผ่าน** แล้วไปพังตอนผู้ใช้กดปุ่มจริง
 * เพราะสัญญาที่พังอยู่คนละชั้นกับที่ TypeScript มองเห็น: ชั้น "แอปคุยกับ DB / กับ
 * Google Ads / กับ LINE" ตรวจได้ทางเดียวคือยิงของจริงแล้วดูว่าตอบอะไรกลับมา
 *
 * endpoint นี้ทำแบบนั้นให้ — ยิงจริงทุกเส้นทางที่เคยพัง แล้วบอก PASS/FAIL
 * ผูกกับ cron / uptime monitor / morning-brief.sh ได้เลย ระบบจะรู้ตัวว่าพังก่อนลูกค้า
 *
 * ทุกเทสถูกออกแบบให้ **ไม่ทิ้งข้อมูลจริงไว้**: GAQL เป็น query อ่านอย่างเดียว,
 * LINE ยิง payload ที่ `events: []` (ไม่มี event → ไม่มี LineUser/Lead/Conversion เกิดขึ้น)
 *
 * พารามิเตอร์ (ไม่บังคับ):
 *   ?customerId=1234567890   ตรวจ GAQL กับบัญชี Google Ads นี้
 *   ?projectId=<id>          ตรวจ LINE webhook + relay ของโปรเจกต์นี้
 */

type Check = {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  detail: string
}

async function checkAuthInvariant(): Promise<Check[]> {
  const out: Check[] = []
  try {
    const session = await auth()
    // อ่าน id ตรง ๆ แทนการ import @/lib/session เพื่อไม่ต้องแตะไฟล์นั้นในแพ็กเกจนี้
    const sessionUserId =
      ((session?.user as Record<string, unknown> | undefined)?.id as string | undefined) ?? ''
    if (!sessionUserId) {
      out.push({ name: 'auth: session', status: 'SKIP', detail: 'เรียกโดยไม่มี session (cron) — ข้ามการตรวจ session' })
    } else {
      const inDb = await prisma.user.findUnique({ where: { id: sessionUserId }, select: { id: true } })
      out.push({
        name: 'auth: session.user.id มีจริงใน User',
        status: inDb ? 'PASS' : 'FAIL',
        detail: inDb
          ? `userId ${sessionUserId} ผูกกับ DB แล้ว — การ create ที่มี FK ไป User จะไม่ชน`
          : `userId ${sessionUserId} ไม่มีในตาราง User — ทุก create ที่มี FK ไป User จะพัง (เช่น prisma.brief.create) เช็ค resolveDbUserId ใน src/lib/auth.ts`,
      })
    }
    const userCount = await prisma.user.count()
    out.push({
      name: 'auth: มี User ในระบบ',
      status: userCount > 0 ? 'PASS' : 'FAIL',
      detail: `${userCount} คน`,
    })
  } catch (e) {
    out.push({ name: 'auth: ตรวจ invariant', status: 'FAIL', detail: String(e).slice(0, 200) })
  }
  return out
}

/**
 * ยิง GAQL ทุกรูปแบบที่หน้า Campaign Adjustment ใช้ ด้วย LIMIT 1 — ราคาถูกมาก
 * แต่จับ queryError (เช่น EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE) ได้ครบ
 * เพราะ Google ตรวจไวยากรณ์ก่อนอ่านข้อมูลเสมอ
 */
async function checkGaql(customerId: string): Promise<Check[]> {
  if (!customerId) {
    return [{ name: 'google ads: GAQL', status: 'SKIP', detail: 'ไม่ได้ส่ง ?customerId= มา' }]
  }
  const cid = customerId.replace(/-/g, '')
  const queries: Record<string, string> = {
    campaigns:
      'SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name, campaign_budget.amount_micros FROM campaign WHERE campaign.status != \'REMOVED\' LIMIT 1',
    ad_groups:
      'SELECT ad_group.id, ad_group.name, ad_group.resource_name, ad_group.status FROM ad_group WHERE ad_group.status != \'REMOVED\' LIMIT 1',
    keywords:
      'SELECT ad_group.name, ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.status FROM keyword_view WHERE ad_group_criterion.status != \'REMOVED\' LIMIT 1',
    // เส้นทางที่เคยพัง — ฟิลด์ใน WHERE ต้องอยู่ใน SELECT ครบ
    extensions:
      'SELECT campaign.resource_name, campaign_asset.resource_name, campaign_asset.field_type, campaign_asset.status, asset.resource_name, asset.sitelink_asset.link_text, asset.final_urls, asset.callout_asset.callout_text FROM campaign_asset WHERE campaign_asset.field_type IN (\'SITELINK\', \'CALLOUT\') AND campaign_asset.status != \'REMOVED\' LIMIT 1',
    audiences:
      'SELECT campaign_criterion.resource_name, campaign_criterion.type, campaign_criterion.user_list.user_list FROM campaign_criterion WHERE campaign_criterion.type = \'USER_LIST\' LIMIT 1',
  }

  let token: string
  try {
    token = await getGoogleAdsAccessToken()
  } catch (e) {
    return [{ name: 'google ads: access token', status: 'FAIL', detail: String(e).slice(0, 200) }]
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    'Content-Type': 'application/json',
  }
  const loginCid = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? process.env.COMPANY_MCC_CUSTOMER_ID ?? ''
  if (loginCid) headers['login-customer-id'] = loginCid

  const out: Check[] = []
  for (const [name, query] of Object.entries(queries)) {
    try {
      const res = await fetch(
        `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`,
        { method: 'POST', headers, body: JSON.stringify({ query }) }
      )
      if (res.ok) {
        out.push({ name: `google ads: GAQL ${name}`, status: 'PASS', detail: 'query ถูกไวยากรณ์และ Google ตอบ 200' })
      } else {
        const txt = await res.text()
        out.push({
          name: `google ads: GAQL ${name}`,
          status: 'FAIL',
          detail: `HTTP ${res.status} ${txt.slice(0, 240)}`,
        })
      }
    } catch (e) {
      out.push({ name: `google ads: GAQL ${name}`, status: 'FAIL', detail: String(e).slice(0, 200) })
    }
  }
  return out
}

/**
 * ยิง webhook ของตัวเองด้วย payload ที่เซ็นถูกต้อง แล้วดูว่าระบบตอบ 200 ไหม —
 * ครอบคลุมทั้ง Option 1 และ Option 2 เพราะเดินผ่านโค้ดเส้นเดียวกันทุกอย่าง
 * events: [] → ไม่มี event ให้ประมวลผล จึงไม่มีข้อมูลจริงถูกสร้าง/แก้
 */
async function checkLineWebhook(req: NextRequest, projectId: string): Promise<Check[]> {
  if (!projectId) {
    return [{ name: 'line: webhook', status: 'SKIP', detail: 'ไม่ได้ส่ง ?projectId= มา' }]
  }
  const out: Check[] = []
  try {
    const cfg = await getConnectionConfig<LineConfig>(projectId, 'LINE')
    const secret = (cfg.messagingChannelSecret ?? '').trim()
    if (!secret) {
      return [{ name: 'line: webhook', status: 'FAIL', detail: 'โปรเจกต์นี้ยังไม่ได้ตั้ง Messaging Channel Secret' }]
    }
    const origin = new URL(req.url).origin
    const body = JSON.stringify({ destination: `self-test-${Date.now()}`, events: [] })
    const signature = createHmac('sha256', secret).update(body).digest('base64')

    const res = await fetch(`${origin}/api/webhooks/line/${projectId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-line-signature': signature },
      body,
    })
    out.push({
      name: 'line: webhook รับ event ที่เซ็นถูกต้อง',
      status: res.ok ? 'PASS' : 'FAIL',
      detail: res.ok
        ? 'ตอบ 200 — ลายเซ็นผ่าน, endpoint ไม่ถูก login-wall บัง'
        : `HTTP ${res.status} — ถ้าเป็น 401 ให้เช็ค Channel Secret / ถ้า 3xx ไป /auth/signin แปลว่า middleware บังอยู่`,
    })

    // นโยบายปัจจุบัน (เจ้าของระบบสั่ง 3 ส.ค. 2026): "ไม่ปฏิเสธเพราะลายเซ็น"
    // event ที่เซ็นผิดต้องยัง "รับไว้" (200) แต่ต้องถูกบันทึกว่ายืนยันตัวตนไม่ได้
    // เช็คข้อนี้จึงกลับด้านจากเดิม — ถ้าได้ 401 แปลว่าโค้ดที่ deploy ยังเป็นตัวเก่า
    const bad = await fetch(`${origin}/api/webhooks/line/${projectId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-line-signature': 'ZmFrZS1zaWduYXR1cmU=' },
      body,
    })
    out.push({
      name: 'line: รับ event แม้ลายเซ็นไม่ตรง (ตามนโยบายปัจจุบัน)',
      status: bad.ok ? 'PASS' : 'FAIL',
      detail: bad.ok
        ? '⚠️ ตอบ 200 ตามที่ตั้งใจ — endpoint นี้ "ไม่ตรวจลายเซ็น" แล้ว ใครรู้ projectId ก็ยิง Lead ปลอมเข้าได้ (ยอมรับความเสี่ยงนี้แล้ว) event ที่ยืนยันไม่ได้จะขึ้นในล็อกว่า "ยืนยันลายเซ็นไม่ได้"'
        : `ตอบ ${bad.status} — ยังเป็นโค้ดตัวเก่าที่ปฏิเสธลายเซ็นผิดอยู่ (ยังไม่ได้ deploy รอบนี้)`,
    })

    if (cfg.webhookMode === 'relay') {
      const forwardUrl = (cfg.forwardUrl ?? '').trim()
      if (!forwardUrl) {
        out.push({ name: 'line: Option 2 forward URL', status: 'FAIL', detail: 'เลือกโหมด relay แต่ไม่ได้ใส่ Webhook URL เดิมของลูกค้า' })
      } else {
        try {
          const fw = await fetch(forwardUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-line-signature': signature },
            body,
            redirect: 'manual',
          })
          const redirected = fw.status >= 300 && fw.status < 400
          out.push({
            name: 'line: Option 2 forward ถึงบอทเดิมของลูกค้า',
            status: fw.ok ? 'PASS' : redirected ? 'FAIL' : 'FAIL',
            detail: fw.ok
              ? `ปลายทางตอบ ${fw.status}`
              : redirected
                ? `ปลายทางตอบ ${fw.status} redirect ไป ${fw.headers.get('location') ?? '?'} — แก้ URL ให้เป็นปลายทางสุดท้าย (เช่นเติม www) ไม่งั้น event หายทุกครั้ง`
                : fw.status === 508
                  ? 'HTTP 508 Loop Detected — ปลายทาง forward กลับมาที่ระบบนี้อีกที (ตั้ง forward ชนกันสองทาง)'
                  : `ปลายทางตอบ ${fw.status}`,
          })
        } catch (e) {
          out.push({ name: 'line: Option 2 forward ถึงบอทเดิมของลูกค้า', status: 'FAIL', detail: String(e).slice(0, 200) })
        }
      }

      const relayToken = (cfg.relayToken ?? '').trim()
      out.push({
        name: 'line: Option 2 relay token',
        status: !relayToken ? 'SKIP' : relayToken.length >= 16 ? 'PASS' : 'FAIL',
        detail: !relayToken
          ? 'ไม่ได้ตั้ง — โหมดเข้ม ต้องมีลายเซ็น LINE ถูกต้องเท่านั้น (ค่าแนะนำ)'
          : relayToken.length >= 16
            ? 'ตั้งไว้แล้ว — ตัวกลางที่ส่ง x-line-signature ต่อไม่ได้ ใช้ ?k=<token> แทนได้'
            : 'สั้นเกินไป ต้องอย่างน้อย 16 ตัวอักษร ไม่งั้นระบบจะไม่ยอมรับ',
      })
    }
  } catch (e) {
    out.push({ name: 'line: webhook', status: 'FAIL', detail: String(e).slice(0, 200) })
  }
  return out
}

// ── 4) นโยบาย Google Ads: ตัด keyword ที่ผิดออกแล้วยิงใหม่ ───────────────────
// เทสด้วย error payload จริงที่เคยเจอ (3 ส.ค. — keyword ผิดนโยบายที่ operation index 9
// ทำให้ทั้ง batch ถูกตีกลับ → "สร้าง 0/1 campaigns") ไม่ยิง Google จริง ไม่มี side effect
function checkPolicyRetry(): Check[] {
  const out: Check[] = []
  try {
    const kwOp = (text: string) => ({
      adGroupCriterionOperation: { create: { adGroup: 'customers/1/adGroups/2', keyword: { text, matchType: 'PHRASE' } } },
    })
    const ops: unknown[] = [
      { campaignBudgetOperation: { create: {} } },
      { campaignOperation: { create: {} } },
      { adGroupOperation: { create: {} } },
      kwOp('kw0'), kwOp('kw1'), kwOp('kw2'), kwOp('kw3'), kwOp('kw4'), kwOp('kw5'),
      kwOp('คำที่ติดนโยบาย'),
      { adGroupAdOperation: { create: {} } },
    ]
    const errText = JSON.stringify({ error: { code: 400, details: [{ errors: [{
      errorCode: { policyViolationError: 'POLICY_ERROR' },
      message: 'A policy was violated. See PolicyViolationDetails for more detail.',
      details: { policyViolationDetails: {
        key: { policyName: 'TRADEMARKS', violatingText: 'ติดนโยบาย' },
        isExemptible: true,
      } },
      location: { fieldPathElements: [
        { fieldName: 'mutate_operations', index: 9 },
        { fieldName: 'ad_group_criterion_operation' },
        { fieldName: 'create' }, { fieldName: 'keyword' }, { fieldName: 'text' },
      ] },
    }] }] } })

    const hit = planPolicyRetry(errText, ops)
    out.push({
      name: 'ads-policy: ตัดเฉพาะ keyword ที่ผิด',
      status: hit.dropIdx.length === 1 && hit.dropIdx[0] === 9 && hit.blockers.length === 0 ? 'PASS' : 'FAIL',
      detail: `drop=[${hit.dropIdx.join(',')}] blockers=${hit.blockers.length}`,
    })
    out.push({
      name: 'ads-policy: บอกคำที่ติดนโยบายให้ผู้ใช้',
      status: hit.warnings.some(w => w.includes('ติดนโยบาย') && w.includes('TRADEMARKS')) ? 'PASS' : 'FAIL',
      detail: hit.warnings[0]?.slice(0, 160) ?? '(ไม่มี warning)',
    })

    // ผิดที่ campaign เอง → ห้ามตัด (ตัดแล้วของที่ขึ้นกับมันพังต่อ) ต้องรายงานเป็น blocker
    const atCampaign = errText.replace('"index":9', '"index":1')
    const blocked = planPolicyRetry(atCampaign, ops)
    out.push({
      name: 'ads-policy: ไม่ตัด campaign/ad group',
      status: blocked.dropIdx.length === 0 && blocked.blockers.length === 1 ? 'PASS' : 'FAIL',
      detail: `drop=[${blocked.dropIdx.join(',')}] blockers=${blocked.blockers.length}`,
    })

    // error ที่ไม่ใช่ policy และ body ที่ไม่ใช่ JSON ต้องไม่ทำให้ตัดอะไรและต้องไม่ throw
    const other = planPolicyRetry(JSON.stringify({ error: { details: [{ errors: [{ errorCode: { authenticationError: 'X' } }] }] } }), ops)
    const junk = planPolicyRetry('<html>502</html>', ops)
    out.push({
      name: 'ads-policy: error อื่นไม่ถูกแตะ',
      status: other.dropIdx.length === 0 && other.blockers.length === 0 && junk.dropIdx.length === 0 ? 'PASS' : 'FAIL',
      detail: 'non-policy + non-JSON',
    })
  } catch (e) {
    out.push({ name: 'ads-policy', status: 'FAIL', detail: String(e).slice(0, 200) })
  }
  return out
}

// ── Attribution: Line Tracking ยัง "วัดแอด" ได้จริงมั้ย ─────────────────────────
// อาการที่เจ้าของระบบรายงาน (5 ส.ค. 2026): lead หลัง ๆ ขึ้นแค่ "ทักแล้ว" ไม่มี
// ที่มาจากแอดเลย — เช็คจากข้อมูลจริง 7 วันล่าสุดของโปรเจกต์ว่าโซ่ attribution
// (AdClick → Lead.channel) ขาดตรงไหน: ไม่มีคลิกเข้าเลย (ลิงก์โฆษณาไม่วิ่งผ่าน
// tracking link) หรือมีคลิกแต่จับคู่กับ lead ไม่ได้ (หน้าต่างเวลา/LIFF)
async function checkAttribution(projectId: string): Promise<Check[]> {
  const out: Check[] = []
  if (!projectId) {
    return [{ name: 'attribution: วัดแอด', status: 'SKIP', detail: 'ไม่ได้ส่ง projectId มา' }]
  }
  try {
    const { prisma } = await import('@/lib/prisma')
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const [clicks7d, adClicks7d, leads7d, attributed7d, lastClick] = await Promise.all([
      prisma.adClick.count({ where: { projectId, createdAt: { gte: since } } }),
      // คลิกที่มาจากโฆษณาจริง (มี click id ของแพลตฟอร์มใดแพลตฟอร์มหนึ่ง)
      prisma.adClick.count({
        where: {
          projectId, createdAt: { gte: since },
          OR: [{ gclid: { not: null } }, { fbclid: { not: null } }, { ttclid: { not: null } }, { msclkid: { not: null } }],
        },
      }),
      prisma.lead.count({ where: { projectId, createdAt: { gte: since } } }),
      prisma.lead.count({ where: { projectId, createdAt: { gte: since }, channelGroup: { not: 'Direct' } } }),
      prisma.adClick.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ])

    const lastClickTxt = lastClick ? `คลิกล่าสุด ${lastClick.createdAt.toLocaleString('th-TH')}` : 'ไม่เคยมีคลิกเลย'

    if (leads7d === 0) {
      out.push({
        name: 'attribution: วัดแอด (7 วันล่าสุด)',
        status: 'PASS',
        detail: `ยังไม่มี lead ใหม่ใน 7 วัน — คลิกเข้าระบบ ${clicks7d} ครั้ง (${lastClickTxt})`,
      })
    } else if (clicks7d === 0) {
      out.push({
        name: 'attribution: วัดแอด (7 วันล่าสุด)',
        status: 'FAIL',
        detail: `มี lead ${leads7d} รายแต่ "ไม่มีคลิกเข้าระบบเลย" (${lastClickTxt}) — โฆษณาไม่ได้วิ่งผ่าน tracking link/embed ของโปรเจกต์นี้ ให้เช็ค Final URL ของแอดว่ายังชี้ผ่านลิงก์ /t/ หรือหน้าเว็บที่ติด embed.js อยู่หรือเปล่า (ระบบจับคู่ให้ไม่ได้ถ้าไม่มีคลิก จึงขึ้นเป็น "ทักแล้ว"/Direct หมด)`,
      })
    } else if (attributed7d === 0) {
      out.push({
        name: 'attribution: วัดแอด (7 วันล่าสุด)',
        status: 'FAIL',
        detail: `มีคลิก ${clicks7d} (จากแอดจริง ${adClicks7d}) และ lead ${leads7d} ราย แต่จับคู่กันไม่ได้เลยสักราย — เคสนี้มักเกิดจากปุ่ม Add LINE บนเว็บไม่ได้ยิงผ่านลิงก์ tracking (lineClickedAt ไม่ถูกตั้ง หน้าต่างจับคู่เหลือแค่ 30 นาที) หรือคนทักเข้า OA ตรงโดยไม่ผ่านเว็บ`,
      })
    } else {
      out.push({
        name: 'attribution: วัดแอด (7 วันล่าสุด)',
        status: 'PASS',
        detail: `วัดได้ปกติ — lead ${attributed7d}/${leads7d} รายมีที่มา (ไม่ใช่ Direct) · คลิก ${clicks7d} ครั้ง (จากแอดจริง ${adClicks7d})`,
      })
    }
  } catch (e) {
    out.push({ name: 'attribution: วัดแอด', status: 'FAIL', detail: String(e).slice(0, 200) })
  }
  return out
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const projectId = searchParams.get('projectId') ?? ''

  const groups = await Promise.all([
    checkAuthInvariant(),
    checkGaql(customerId),
    checkLineWebhook(req, projectId),
    Promise.resolve(checkPolicyRetry()),
    checkAttribution(projectId),
  ])
  const checks = groups.flat()
  const failed = checks.filter(c => c.status === 'FAIL')

  return NextResponse.json(
    {
      ok: failed.length === 0,
      summary: `PASS ${checks.filter(c => c.status === 'PASS').length} · FAIL ${failed.length} · SKIP ${checks.filter(c => c.status === 'SKIP').length}`,
      failed: failed.map(c => c.name),
      checks,
    },
    { status: failed.length === 0 ? 200 : 500 }
  )
}
