import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import { z } from 'zod'
import type { Session } from 'next-auth'
import { sendAutomationEmail, automationEmailHtml } from '@/lib/email'
import { conditionSentence, scopeSentence, ACTION_LABELS } from '@/lib/automation/labels'

const ruleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['keyword_pause', 'budget_adjust', 'alert', 'bid_adjust', 'campaign_pause', 'label']),
  // โหมดเงื่อนไข metric (เดิม) หรือโหมดตั้งเวลา (ใหม่ — เปิด/ปิดแคมเปญตามวัน-เวลา)
  trigger: z.enum(['metric', 'schedule']).default('metric'),
  metric: z.string().optional(),
  operator: z.enum(['>', '<', '>=', '<=']).optional(),
  value: z.number().optional(),
  window: z.string().default('7d'),
  schedule: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
  // ขอบเขต: เลือกระดับแคมเปญได้ (ไม่ส่ง = ทั้ง account)
  scope: z.object({
    customerId: z.string().optional(),
    accountName: z.string().optional(),
    campaignIds: z.array(z.string()).optional(),
    campaignNames: z.array(z.string()).optional(),
  }).optional(),
  // อีเมลผู้รับแจ้งเตือน (พิมพ์เพิ่มได้หลายอีเมล)
  emails: z.array(z.string().email()).max(10).optional(),
  action: z.string().min(1),
}).refine(
  (r) => r.trigger === 'schedule' ? !!r.schedule : (!!r.metric && !!r.operator && r.value !== undefined),
  { message: 'metric rules ต้องมี metric/operator/value — schedule rules ต้องมี schedule.time' }
)

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

    const conditionJson = JSON.stringify({
      metric: input.metric,
      operator: input.operator,
      value: input.value,
      window: input.window,
      trigger: input.trigger,
      ...(input.schedule ? { schedule: input.schedule } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
    })
    const actionJson = JSON.stringify({
      action: input.action,
      ...(input.emails?.length ? { notify: { emails: input.emails } } : {}),
    })

    const rule = await prisma.automationRule.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        conditionJson,
        actionJson,
        enabled: true,
      },
    })

    // แจ้งอีเมลทันทีว่า "ตั้งค่าอะไรไว้" (ถ้าใส่อีเมลไว้) — ไม่ block การบันทึก
    let emailDetail = ''
    if (input.emails?.length) {
      const emailResult = await sendAutomationEmail(
        input.emails,
        `[Ads Automation] ตั้งกฎใหม่: ${input.name}`,
        automationEmailHtml({
          heading: `ตั้งกฎอัตโนมัติใหม่แล้ว: "${input.name}"`,
          lines: [
            { label: 'เงื่อนไข', value: conditionSentence(conditionJson) },
            { label: 'ขอบเขต', value: scopeSentence(conditionJson) },
            { label: 'Action', value: ACTION_LABELS[input.action] ?? input.action },
            { label: 'Account', value: input.scope?.accountName ?? input.scope?.customerId ?? '(เลือกตอนรัน)' },
            { label: 'แจ้งเตือนไปที่', value: input.emails.join(', ') },
          ],
          footer: 'ระบบจะส่งอีเมลแจ้งอีกครั้งทันทีหลังกฎนี้ทำงาน (execute action) จริง',
        })
      ).catch(() => ({ sent: false, detail: 'ส่งอีเมลไม่สำเร็จ' }))
      emailDetail = emailResult.detail
    }

    return NextResponse.json({ ...rule, emailDetail }, { status: 201 })
  } catch (err) {
    console.error('[automation/rules POST]', err)
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const skipAuth = process.env.SKIP_AUTH === 'true'
  const session = skipAuth ? null : await (auth() as Promise<Session | null>)
  const userId = skipAuth ? null : getUserId(session)
  if (!skipAuth && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rules = await prisma.automationRule.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: 'desc' },
  })
  // ?withMeta=1 → แนบสถานะโหมด (จำลอง/จริง) — caller เดิมที่รับ array ไม่กระทบ
  if (new URL(req.url).searchParams.get('withMeta') === '1') {
    return NextResponse.json({ rules, mutateEnabled: process.env.AUTOMATION_MUTATE === 'true' })
  }
  return NextResponse.json(rules)
}
