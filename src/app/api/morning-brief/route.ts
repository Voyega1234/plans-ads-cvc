import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { getAccessibleCustomers } from '@/lib/google-ads/accounts'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'

export interface BriefAlert {
  id: string
  level: 'critical' | 'warning' | 'ok'
  campaignName: string
  accountId?: string
  accountName?: string
  blueprintId?: string
  mediaPlanId?: string
  title: string
  detail: string
  metric?: string
  metricDelta?: string
  action: string
  category: 'tracking' | 'qa' | 'budget' | 'performance' | 'copy' | 'general'
}

export interface AccountHealth {
  accountId: string
  accountName: string
  status: 'healthy' | 'warning' | 'critical' | 'paused'
  spend30d: number
  conversions: number
  cpa: number
  activeCampaigns: number
  pausedCampaigns: number
  alerts: string[]
  recommendation: string
}

export interface MorningBriefData {
  generatedAt: string
  date: string
  totalAlerts: number
  criticalCount: number
  warningCount: number
  okCount: number
  alerts: BriefAlert[]
  accountHealths: AccountHealth[]
  aiSummary: string
  recommendations: string[]
  source: string
}

interface CampaignRow {
  name: string; status: string; bidding: string
  cost: number; impressions: number; clicks: number; conversions: number
  ctr: number; cpc: number; cpa: number; convRate: number
}

async function fetchAccountCampaigns(customerId: string, token: string): Promise<CampaignRow[]> {
  const devToken        = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
  if (!devToken || !token) return []

  const cid   = customerId.replace(/-/g, '')
  const query = `
    SELECT
      campaign.name,
      campaign.status,
      campaign.bidding_strategy_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 30
  `.trim()

  const attempts = loginCustomerId ? [loginCustomerId, ''] : ['']
  let body = ''
  let ok   = false

  for (const lcid of attempts) {
    const headers: Record<string, string> = {
      Authorization:     `Bearer ${token}`,
      'developer-token': devToken,
      'Content-Type':    'application/json',
    }
    if (lcid) headers['login-customer-id'] = lcid
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }), signal: AbortSignal.timeout(8000) }
    )
    body = await res.text().catch(() => '')
    if (res.ok) { ok = true; break }
    console.log('[morning-brief] fetchAccountCampaigns', cid, 'lcid:', lcid || 'none', 'status:', res.status)
  }

  if (!ok) return []

  const data = JSON.parse(body) as {
    results?: Array<{
      campaign: { name: string; status: string; biddingStrategyType: string }
      metrics: {
        costMicros: string; impressions: string; clicks: string; conversions: string
        ctr: string; averageCpc: string; costPerConversion: string
      }
    }>
  }

  return (data.results ?? []).map((r) => {
    const cost   = Number(r.metrics.costMicros ?? 0) / 1e6
    const conv   = Number(r.metrics.conversions ?? 0)
    const clicks = Number(r.metrics.clicks ?? 0)
    return {
      name:        r.campaign.name,
      status:      r.campaign.status,
      bidding:     r.campaign.biddingStrategyType,
      cost,
      impressions: Number(r.metrics.impressions ?? 0),
      clicks,
      conversions: conv,
      ctr:         Number(r.metrics.ctr ?? 0) * 100,
      cpc:         Number(r.metrics.averageCpc ?? 0) / 1e6,
      cpa:         conv > 0 ? cost / conv : 0,
      convRate:    clicks > 0 ? (conv / clicks) * 100 : 0,
    }
  })
}

function evaluateAccountHealth(
  accountId: string,
  accountName: string,
  campaigns: CampaignRow[]
): AccountHealth {
  const totalSpend  = campaigns.reduce((s, c) => s + c.cost, 0)
  const totalConv   = campaigns.reduce((s, c) => s + c.conversions, 0)
  const blendedCPA  = totalConv > 0 ? totalSpend / totalConv : 0
  const active      = campaigns.filter((c) => c.status === 'ENABLED').length
  const paused      = campaigns.filter((c) => c.status === 'PAUSED').length

  const alertMsgs: string[] = []
  let status: AccountHealth['status'] = 'healthy'

  if (campaigns.length > 0 && active === 0) {
    alertMsgs.push(`${paused} campaigns หยุดทำงานทั้งหมด`)
    status = 'paused'
  } else if (active > 0 && totalSpend === 0) {
    alertMsgs.push('มี active campaigns แต่ไม่มี spend — ตรวจสอบ budget หรือ payment')
    status = 'critical'
  }

  for (const c of campaigns.filter((c) => c.status === 'ENABLED')) {
    if (c.impressions > 500 && c.ctr < 1) {
      alertMsgs.push(`${c.name}: CTR ต่ำ (${c.ctr.toFixed(2)}%)`)
      if (status === 'healthy') status = 'warning'
    }
    if (c.cpa > 2000 && c.cpa > 0) {
      alertMsgs.push(`${c.name}: CPA สูง (฿${c.cpa.toFixed(0)})`)
      status = 'critical'
    }
    if (c.clicks > 100 && c.conversions === 0) {
      alertMsgs.push(`${c.name}: ${c.clicks} clicks ไม่มี conversion — ตรวจ tracking`)
      if (status === 'healthy') status = 'warning'
    }
  }

  const rec = status === 'paused'
    ? 'ตรวจสอบว่า campaign ถูก pause โดยตั้งใจหรือไม่ ถ้าต้องการเปิดให้ enable ใน Google Ads'
    : status === 'critical'
    ? 'ต้องแก้ไขด่วน — ตรวจ CPA, bidding strategy และ landing page conversion rate'
    : status === 'warning'
    ? 'มีบาง campaign ที่ควร optimize — ปรับ ad copy หรือ negative keywords'
    : 'Account อยู่ในสถานะดี — ติดตาม performance ต่อเนื่อง'

  return {
    accountId, accountName, status,
    spend30d:        totalSpend,
    conversions:     totalConv,
    cpa:             blendedCPA,
    activeCampaigns: active,
    pausedCampaigns: paused,
    alerts:          alertMsgs,
    recommendation:  rec,
  }
}

export async function GET() {
  try {
    // auth, DB query, and token refresh are all independent — run in parallel
    const [session, blueprints, adsTokenResult] = await Promise.all([
      auth() as Promise<Session | null>,
      prisma.campaignBlueprint.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          mediaPlan: { include: { brief: true } },
          qaChecks:  true,
          pushJobs:  { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      getGoogleAdsAccessToken().catch(() => undefined),
    ])
    const userId   = getUserId(session)
    const alerts: BriefAlert[] = []

    for (const bp of blueprints) {
      const brief   = bp.mediaPlan?.brief
      const bizName = brief?.businessName ?? 'Unknown'
      const planId  = bp.mediaPlanId

      const failedQA = bp.qaChecks.filter((q) => q.status === 'fail')
      if (failedQA.length > 0) {
        alerts.push({
          id: `qa-${bp.id}`, level: 'critical', campaignName: bizName,
          blueprintId: bp.id, mediaPlanId: planId,
          title: `QA Fail: ${failedQA[0].checkName}`,
          detail: failedQA.map((q) => q.checkName).join(', '),
          action: 'แก้ไข QA issues ก่อน push campaign', category: 'qa',
        })
      }

      if (bp.pushJobs[0]?.status === 'failed') {
        alerts.push({
          id: `push-${bp.id}`, level: 'critical', campaignName: bizName,
          blueprintId: bp.id, mediaPlanId: planId,
          title: 'Push Failed', detail: 'การ push campaign ล่าสุดล้มเหลว',
          action: 'ตรวจสอบ error และ push ใหม่', category: 'general',
        })
      }

      if (brief && !brief.googleAdsCustomerId) {
        alerts.push({
          id: `nocid-${bp.id}`, level: 'warning', campaignName: bizName,
          mediaPlanId: planId, title: 'ยังไม่ได้ผูก Google Ads Customer ID',
          detail: 'Campaign นี้ยังไม่มี Customer ID — ยังไม่สามารถ push ได้',
          action: 'ระบุ Customer ID ใน Brief', category: 'general',
        })
      }
    }

    // ── Real account health from Google Ads ────────────────────────────────
    const accountHealths: AccountHealth[] = []
    const adsToken = adsTokenResult

    // Use session token to list only accounts accessible to this user
    const sessionToken = (session as unknown as Record<string, unknown>)?.accessToken as string | undefined

    if (adsToken) {
      // Use session token for account listing, MCC token for campaign data
      // Wrap entire block in a 20s timeout so the page never hangs indefinitely
      const listToken = sessionToken ?? adsToken
      await Promise.race([
        (async () => {
          const accounts = await getAccessibleCustomers(listToken, !!sessionToken).catch(() => [])
          await Promise.all(
            accounts.slice(0, 8).map(async (acc) => {
              const campaigns = await fetchAccountCampaigns(acc.id, adsToken!).catch(() => [])
              const health    = evaluateAccountHealth(acc.id, acc.descriptiveName, campaigns)
              accountHealths.push(health)

              for (const msg of health.alerts.slice(0, 2)) {
                alerts.push({
                  id:           `ads-${acc.id}-${msg.slice(0, 20)}`,
                  level:        health.status === 'critical' ? 'critical' : 'warning',
                  campaignName: acc.descriptiveName,
                  accountId:    acc.id,
                  accountName:  acc.descriptiveName,
                  title:        msg,
                  detail:       `${acc.descriptiveName} (${acc.id})`,
                  action:       health.recommendation,
                  category:     'performance',
                })
              }
            })
          )
        })(),
        new Promise<void>((resolve) => setTimeout(resolve, 20000)), // 20s hard cap
      ])
    }

    alerts.sort((a, b) => ({ critical: 0, warning: 1, ok: 2 }[a.level] - { critical: 0, warning: 1, ok: 2 }[b.level]))

    const criticalCount = alerts.filter((a) => a.level === 'critical').length
    const warningCount  = alerts.filter((a) => a.level === 'warning').length
    const okCount       = alerts.filter((a) => a.level === 'ok').length

    const recommendations: string[] = []
    if (criticalCount > 0) recommendations.push('แก้ไข QA issues / push failures ก่อน launch')
    if (accountHealths.some((h) => h.status === 'critical')) recommendations.push('มี account ที่ต้องการความสนใจด่วน — เช็ค CPA และ conversion')
    if (accountHealths.some((h) => h.activeCampaigns > 0 && h.spend30d === 0)) recommendations.push('ตรวจสอบ campaign ที่ active แต่ไม่มี spend — อาจมีปัญหา budget หรือ payment')
    recommendations.push('ทบทวน search terms report ทุกสัปดาห์ และเพิ่ม negative keywords')
    recommendations.push('ตรวจ Quality Score keywords ต่ำกว่า 6 → ปรับ ad copy ให้ตรงกับ intent')

    void userId

    return NextResponse.json({
      generatedAt:    new Date().toISOString(),
      date:           new Date().toISOString().slice(0, 10),
      totalAlerts:    alerts.length,
      criticalCount,
      warningCount,
      okCount,
      alerts:         alerts.slice(0, 20),
      accountHealths,
      aiSummary:      '',
      recommendations,
      source:         adsToken ? 'Google Ads API (live)' : 'DB only',
    } satisfies MorningBriefData)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
