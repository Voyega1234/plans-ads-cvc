import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { z } from 'zod'
import type { Session } from 'next-auth'

const ruleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['keyword_pause', 'budget_adjust', 'alert', 'bid_adjust', 'campaign_pause', 'label']),
  metric: z.string().min(1),
  operator: z.enum(['>', '<', '>=', '<=']),
  value: z.number(),
  window: z.string().default('7d'),
  action: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const session = await (auth() as Promise<Session | null>)
    const userId = getUserId(session)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = ruleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
    }
    const input = parsed.data

    const rule = await prisma.automationRule.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        conditionJson: JSON.stringify({ metric: input.metric, operator: input.operator, value: input.value, window: input.window }),
        actionJson: JSON.stringify({ action: input.action }),
        enabled: true,
      },
    })

    return NextResponse.json(rule, { status: 201 })
  } catch (err) {
    console.error('[automation/rules POST]', err)
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 })
  }
}

export async function GET() {
  const skipAuth = process.env.SKIP_AUTH === 'true'
  const session = skipAuth ? null : await (auth() as Promise<Session | null>)
  const userId = skipAuth ? null : getUserId(session)
  if (!skipAuth && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rules = await prisma.automationRule.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(rules)
}
