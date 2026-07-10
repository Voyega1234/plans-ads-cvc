import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export async function GET() {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const userId = skipAuth ? null : getUserId(session)
    const plans = await prisma.mediaPlan.findMany({
      where: userId ? { userId } : {},
      include: { brief: true, blueprints: true },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(plans)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch media plans' }, { status: 500 })
  }
}

// สร้าง plan พร้อม brief minimal — ไม่ผ่าน validation form
export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const userId = skipAuth ? 'system' : getUserId(session)

    const body = await req.json() as {
      businessName?: string
      strategyJson?: string
      planJson?: string
      monthlyBudget?: number
      brief?: Record<string, string | number | null | undefined>
      status?: string
      clientId?: string
    }

    const businessName  = String(body.businessName ?? 'Business')
    const status        = String(body.status ?? 'review')
    const planJson      = typeof body.planJson === 'string' && body.planJson ? body.planJson : '{}'
    const monthlyBudget = Number.isFinite(body.monthlyBudget) ? Number(body.monthlyBudget) : 0

    // Real intake brief from the generator (fall back to placeholders when missing)
    // so the Campaign Generator's Brief step auto-fills with the actual project data.
    const bi = body.brief ?? {}
    const briefStr = (v: unknown, fallback: string) => {
      const s = v == null ? '' : String(v).trim()
      return s.length > 0 ? s : fallback
    }
    const briefOpt = (v: unknown) => {
      const s = v == null ? '' : String(v).trim()
      return s.length > 0 ? s : null
    }

    // ตรวจสอบว่า clientId มีอยู่ใน DB จริง ก่อนใส่
    let resolvedClientId: string | undefined
    if (body.clientId) {
      const clientExists = await prisma.client.findUnique({ where: { id: body.clientId } })
      if (clientExists) resolvedClientId = body.clientId
    }

    // สร้าง brief minimal — ไม่ส่ง userId/clientId เพื่อหลีกเลี่ยง FK violation
    const brief = await prisma.brief.create({
      data: {
        businessName,
        websiteUrl:     briefStr(bi.websiteUrl,     'https://example.com'),
        productService: briefStr(bi.productService, businessName),
        objective:      briefStr(bi.objective,      'LEADS'),
        monthlyBudget,
        currency:       'THB',
        targetLocation: briefStr(bi.targetLocation, 'ประเทศไทย'),
        language:       briefStr(bi.language,        'th'),
        targetAudience: briefStr(bi.targetAudience, 'กลุ่มลูกค้าทั่วไป'),
        conversionGoal: briefStr(bi.conversionGoal, 'เพิ่มยอดขายและ Leads'),
        promotion:      briefOpt(bi.promotion),
        brandTone:      briefOpt(bi.brandTone),
        notes:          briefOpt(bi.notes),
      },
    })

    const plan = await prisma.mediaPlan.create({
      data: {
        briefId:      brief.id,
        title:        `Media Plan - ${businessName} - ${new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`,
        objective:    'LEADS',
        monthlyBudget,
        planJson,
        status,
        strategyJson: body.strategyJson ?? '',
      },
    })

    return NextResponse.json(plan)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
