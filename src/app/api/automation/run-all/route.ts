/**
 * POST /api/automation/run-all
 * Runs all enabled rules for a given userId + customerId.
 * Called from UI "Run All" button or a scheduled cron.
 *
 * Header X-Cron-Secret=... can be used by a cron job instead of cookie auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { evaluateRule } from '@/lib/google-ads/automation'
import type { Session } from 'next-auth'

export async function POST(req: NextRequest) {
  // Allow cron secret auth as alternative to cookie
  const cronSecret = req.headers.get('x-cron-secret')
  let userId: string

  if (cronSecret && cronSecret === process.env.AUTOMATION_CRON_SECRET) {
    // Cron mode: run for all users (or a specific userId in body)
    const body = await req.json().catch(() => ({})) as { userId?: string; customerId?: string }
    userId = body.userId ?? ''
    if (!userId) {
      // Run for ALL users
      return await runForAllUsers(body.customerId)
    }
    return await runForUser(userId, body.customerId ?? '')
  }

  const session = await (auth() as Promise<Session | null>)
  userId = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { customerId?: string }
  const customerId = body.customerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

  return await runForUser(userId, customerId)
}

async function runForUser(userId: string, customerId: string): Promise<NextResponse> {
  const rules = await prisma.automationRule.findMany({
    where: { userId, enabled: true },
  })

  if (!rules.length) {
    return NextResponse.json({ ran: 0, results: [] })
  }

  const results = await Promise.allSettled(
    rules.map(async (rule) => {
      const evalResult = await evaluateRule(rule, customerId)

      await prisma.automationRule.update({
        where: { id: rule.id },
        data: {
          lastRunAt:      new Date(),
          lastRunResult:  evalResult.result,
          lastRunMessage: evalResult.message,
        },
      })

      if (evalResult.result === 'triggered' && (rule.type === 'alert' || rule.actionJson.includes('send_alert'))) {
        const condition = JSON.parse(rule.conditionJson) as { metric: string; operator: string; value: number; window: string }
        await prisma.automationAlert.create({
          data: {
            userId,
            campaignName: evalResult.campaigns?.join(', ') ?? 'Multiple campaigns',
            severity:     'warning',
            title:        rule.name,
            message:      `${condition.metric} ${condition.operator} ${condition.value} (${condition.window}) — ${evalResult.message}`,
            status:       'open',
          },
        })
      }

      return { ruleId: rule.id, ruleName: rule.name, ...evalResult }
    })
  )

  const out = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { ruleId: 'unknown', result: 'error', message: String(r.reason) }
  )

  const triggered = out.filter((r) => r.result === 'triggered').length
  return NextResponse.json({ ran: rules.length, triggered, results: out })
}

async function runForAllUsers(customerId?: string): Promise<NextResponse> {
  const users = await prisma.user.findMany({ select: { id: true } })
  const allResults: unknown[] = []

  for (const user of users) {
    const res = await runForUser(user.id, customerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '')
    const data = await (res.json() as Promise<{ results: unknown[] }>)
    allResults.push(...(data.results ?? []))
  }

  return NextResponse.json({ ran: allResults.length, results: allResults })
}
