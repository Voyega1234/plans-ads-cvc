import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

// ── Campaign Generator History ────────────────────────────────────────────────
// อ่านจากข้อมูลที่ระบบเก็บอยู่แล้วทุกครั้งที่ push (CampaignBlueprint + PushJob)
// — ไม่มีตารางใหม่ ไม่มี migration — ตั้งแต่รอบนี้ push-blueprint จะ "archive"
// blueprint เก่าแทนการลบ ประวัติจึงสะสมเป็น card ให้ทีมกลับมาดู/แก้/push ซ้ำได้

export interface HistoryCard {
  pushJobId: string
  blueprintId: string
  mediaPlanId: string
  planTitle: string
  clientName: string
  customerId: string
  mode: string
  status: string
  pushedAt: string | null
  campaignNames: string[]
  campaignCount: number
}

export async function GET(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await auth()
    const userId = skipAuth ? null : getUserId(session)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') // pushJobId → detail

    if (id) {
      const job = await prisma.pushJob.findUnique({
        where: { id },
        include: { blueprint: { include: { mediaPlan: { include: { brief: { include: { client: true } } } } } } },
      })
      if (!job) return NextResponse.json({ error: 'ไม่พบรายการนี้' }, { status: 404 })
      let customerId = ''
      try { customerId = (JSON.parse(job.resultJson ?? '{}') as { _customerId?: string })._customerId ?? '' } catch { /* เก่า */ }
      return NextResponse.json({
        pushJobId: job.id,
        blueprintId: job.campaignBlueprintId,
        mediaPlanId: job.blueprint.mediaPlanId,
        planTitle: job.blueprint.mediaPlan?.title ?? '',
        customerId,
        mode: job.mode,
        status: job.status,
        pushedAt: job.finishedAt?.toISOString() ?? null,
        blueprintJson: JSON.parse(job.blueprint.blueprintJson) as unknown,
      })
    }

    // list — เอาเฉพาะ push ที่ "ถึง Google จริง" (completed/partial) ใหม่สุดก่อน
    const jobs = await prisma.pushJob.findMany({
      where: {
        provider: 'google_ads',
        status: { in: ['completed', 'partial'] },
        ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { blueprint: { include: { mediaPlan: { include: { brief: { include: { client: true } } } } } } },
    })

    const cards: HistoryCard[] = jobs.map(job => {
      let campaignNames: string[] = []
      try {
        const bp = JSON.parse(job.blueprint.blueprintJson) as { campaigns?: Array<{ campaignName?: string }> }
        campaignNames = (bp.campaigns ?? []).map(c => c.campaignName ?? '').filter(Boolean)
      } catch { /* blueprint เพี้ยน — โชว์ card เปล่าดีกว่าล่มทั้งหน้า */ }
      let customerId = ''
      try { customerId = (JSON.parse(job.resultJson ?? '{}') as { _customerId?: string })._customerId ?? '' } catch { /* เก่า */ }
      return {
        pushJobId: job.id,
        blueprintId: job.campaignBlueprintId,
        mediaPlanId: job.blueprint.mediaPlanId,
        planTitle: job.blueprint.mediaPlan?.title ?? '(ไม่มีชื่อแผน)',
        clientName: job.blueprint.mediaPlan?.brief?.client?.name ?? job.blueprint.mediaPlan?.brief?.businessName ?? '',
        customerId,
        mode: job.mode,
        status: job.status,
        pushedAt: job.finishedAt?.toISOString() ?? job.createdAt.toISOString(),
        campaignNames,
        campaignCount: campaignNames.length,
      }
    })

    return NextResponse.json({ cards })
  } catch (err) {
    console.error('[campaign-generator/history GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

// PATCH: บันทึก blueprint ที่แก้แล้ว (แก้ text ads ในหน้า history ก่อน push ซ้ำ)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { blueprintId?: string; blueprintJson?: unknown }
    if (!body.blueprintId || !body.blueprintJson) {
      return NextResponse.json({ error: 'ต้องมี blueprintId และ blueprintJson' }, { status: 400 })
    }
    await prisma.campaignBlueprint.update({
      where: { id: body.blueprintId },
      data: { blueprintJson: JSON.stringify(body.blueprintJson) },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[campaign-generator/history PATCH]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
