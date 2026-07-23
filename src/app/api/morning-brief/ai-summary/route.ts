import { NextRequest, NextResponse } from 'next/server'
import { callAI, isRealAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, MORNING_BRIEF_CONTEXT, ACCOUNT_TYPE_REPORTING_SKILL } from '@/lib/ai/prompts'
import type { AccountHealth, BriefAlert } from '@/app/api/morning-brief/route'

export interface AISummaryResult {
  summary: string
  recommendations: AccountRecommendation[]
}

export interface AccountRecommendation {
  accountId: string
  accountName: string
  status: AccountHealth['status']
  actions: RecommendationAction[]
}

export interface RecommendationAction {
  id: string
  priority: 'high' | 'medium' | 'low'
  title: string
  detail: string
  actionLabel: string
  actionUrl?: string
  category: 'budget' | 'bidding' | 'keywords' | 'tracking' | 'creative' | 'general'
}

export async function POST(req: NextRequest) {
  const { accountHealths, alerts } = await req.json() as {
    accountHealths: AccountHealth[]
    alerts: BriefAlert[]
  }

  if (!isRealAI()) {
    return NextResponse.json({
      summary: 'กรุณาตั้งค่า ANTHROPIC_API_KEY เพื่อใช้งาน AI Summary',
      recommendations: buildRuleBasedRecs(accountHealths),
    } satisfies AISummaryResult)
  }

  const acctCtx = accountHealths.map((h) =>
    `${h.accountName} (${h.accountId}): ${h.status.toUpperCase()} | spend ฿${Math.round(h.spend30d).toLocaleString()} | ${h.activeCampaigns} active campaigns | ${h.conversions} conversions${h.cpa > 0 ? ` | CPA ฿${Math.round(h.cpa)}` : ''} | alerts: ${h.alerts.length > 0 ? h.alerts.join('; ') : 'ไม่มี'}`
  ).join('\n')

  const alertCtx = alerts.slice(0, 8).map((a) =>
    `[${a.level.toUpperCase()}] ${a.accountName ?? a.campaignName}: ${a.title}`
  ).join('\n')

  const prompt = `คุณเป็น Senior Google Ads Manager ของ Agency วิเคราะห์ข้อมูล account ด้านล่างและให้คำแนะนำเป็นภาษาไทย
ใช้ Account-Type Reporting Skill — วิเคราะห์ตาม Business Objective ของแต่ละ account ไม่ใช่แบบเดียวกันทุก account

## Account Health (30 วันที่ผ่านมา)
${acctCtx}

## Alerts วันนี้
${alertCtx || 'ไม่มี alerts'}

ตอบ JSON รูปแบบนี้:
{
  "summary": "สรุปภาพรวม 2-3 ประโยค: สถานะโดยรวม, account ที่น่าเป็นห่วงที่สุด, และสิ่งสำคัญที่ต้องทำวันนี้",
  "perAccount": [
    {
      "accountId": "...",
      "actions": [
        {
          "priority": "high|medium|low",
          "title": "หัวข้อสั้น",
          "detail": "รายละเอียดเฉพาะเจาะจง เช่น ปรับ tCPA จาก X เป็น Y, เพิ่ม negative keyword X",
          "actionLabel": "ชื่อปุ่ม เช่น ดู Campaign, ปรับ Budget",
          "category": "budget|bidding|keywords|tracking|creative|general"
        }
      ]
    }
  ]
}`

  try {
    const raw = await callAI(prompt, {
      temperature: 0.3,
      maxTokens: 65536,
      tier: 'quality',
      useGrounding: true,  // Real-time market events that may affect account performance today
      systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${ACCOUNT_TYPE_REPORTING_SKILL}\n\n${MORNING_BRIEF_CONTEXT}`,
    })

    const text  = raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no JSON in response')

    const parsed = JSON.parse(match[0]) as {
      summary: string
      perAccount: Array<{
        accountId: string
        actions: Array<{
          priority: string; title: string; detail: string
          actionLabel: string; category: string
        }>
      }>
    }

    // Validate required top-level fields
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) throw new Error('missing summary')
    if (!Array.isArray(parsed.perAccount)) throw new Error('perAccount must be array')

    const VALID_PRIORITIES = ['high', 'medium', 'low']
    const VALID_CATEGORIES = ['budget', 'bidding', 'keywords', 'tracking', 'creative', 'general']

    const recommendations: AccountRecommendation[] = parsed.perAccount.map((pa) => {
      if (!pa.accountId) throw new Error('perAccount entry missing accountId')
      const health = accountHealths.find((h) => h.accountId === pa.accountId)
      return {
        accountId:   pa.accountId,
        accountName: health?.accountName ?? pa.accountId,
        status:      health?.status ?? 'healthy',
        actions:     (pa.actions ?? []).map((a, i) => ({
          id:          `${pa.accountId}-${i}`,
          priority:    (VALID_PRIORITIES.includes(a.priority) ? a.priority : 'medium') as RecommendationAction['priority'],
          title:       (a.title ?? '').slice(0, 100),
          detail:      (a.detail ?? '').slice(0, 500),
          actionLabel: (a.actionLabel ?? 'ดูรายละเอียด').slice(0, 30),
          actionUrl:   `/clients/${pa.accountId}`,
          category:    (VALID_CATEGORIES.includes(a.category) ? a.category : 'general') as RecommendationAction['category'],
        })).filter(a => a.title),
      }
    })

    return NextResponse.json({ summary: parsed.summary, recommendations } satisfies AISummaryResult)
  } catch (e) {
    console.error('[ai-summary] error:', e)
    return NextResponse.json({
      summary: buildFallbackSummary(accountHealths, alerts),
      recommendations: buildRuleBasedRecs(accountHealths),
    } satisfies AISummaryResult)
  }
}

function buildFallbackSummary(accounts: AccountHealth[], alerts: BriefAlert[]): string {
  const h = accounts.filter((a) => a.status === 'healthy').length
  const c = accounts.filter((a) => a.status === 'critical').length
  const w = accounts.filter((a) => a.status === 'warning').length
  const parts = [`${accounts.length} accounts: ${h} healthy${w > 0 ? `, ${w} warning` : ''}${c > 0 ? `, ${c} critical` : ''}`]
  if (c > 0) parts.push('มี account ที่ต้องแก้ไขด่วน')
  if (alerts.filter((a) => a.level === 'critical').length > 0) parts.push(`${alerts.filter((a) => a.level === 'critical').length} critical alerts รอการแก้ไข`)
  return parts.join(' · ')
}

function buildRuleBasedRecs(accounts: AccountHealth[]): AccountRecommendation[] {
  return accounts.map((h) => {
    const actions: RecommendationAction[] = []

    if (h.status === 'paused') {
      actions.push({
        id: `${h.accountId}-paused`, priority: 'high',
        title: 'Campaign ทั้งหมดถูก Pause',
        detail: `${h.pausedCampaigns} campaigns หยุดอยู่ — ตรวจสอบว่าตั้งใจ pause หรือไม่`,
        actionLabel: 'ดู Campaigns', actionUrl: `/clients/${h.accountId}`, category: 'general',
      })
    }
    if (h.activeCampaigns > 0 && h.spend30d === 0) {
      actions.push({
        id: `${h.accountId}-nospend`, priority: 'high',
        title: 'Active แต่ไม่มี Spend',
        detail: 'มี campaign ที่ active แต่ไม่มีการใช้จ่าย — ตรวจสอบ budget, payment method หรือ bid floor',
        actionLabel: 'ตรวจสอบ', actionUrl: `/clients/${h.accountId}`, category: 'budget',
      })
    }
    for (const alert of h.alerts.slice(0, 2)) {
      actions.push({
        id: `${h.accountId}-alert-${actions.length}`, priority: 'medium',
        title: alert, detail: h.recommendation,
        actionLabel: 'ดูรายละเอียด', actionUrl: `/clients/${h.accountId}`, category: 'general',
      })
    }
    if (actions.length === 0) {
      actions.push({
        id: `${h.accountId}-ok`, priority: 'low',
        title: 'Account อยู่ในสถานะดี',
        detail: 'ติดตาม performance ต่อเนื่อง และพิจารณา scale budget หาก ROAS ดี',
        actionLabel: 'ดู Performance', actionUrl: `/clients/${h.accountId}`, category: 'general',
      })
    }
    return { accountId: h.accountId, accountName: h.accountName, status: h.status, actions }
  })
}
