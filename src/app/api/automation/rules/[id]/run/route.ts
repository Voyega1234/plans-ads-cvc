import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { evaluateRule } from '@/lib/google-ads/automation'
import type { Session } from 'next-auth'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await (auth() as Promise<Session | null>)
  const userId  = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rule = await prisma.automationRule.findFirst({
    where: { id: params.id, userId },
  })
  if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

  // customerId comes from request body (which account to run against)
  const body = await req.json().catch(() => ({})) as { customerId?: string }
  const customerId = body.customerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''

  const evalResult = await evaluateRule(rule, customerId)

  await prisma.automationRule.update({
    where: { id: rule.id },
    data: {
      lastRunAt:      new Date(),
      lastRunResult:  evalResult.result,
      lastRunMessage: evalResult.message,
    },
  })

  // If triggered + it's an alert type — create an AutomationAlert record
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

  return NextResponse.json(evalResult)
}
