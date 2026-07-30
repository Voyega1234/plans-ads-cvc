import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * ตัวเฝ้า invariant ของระบบ auth ↔ DB (ดู comment ใน src/lib/auth.ts)
 *
 * เปิดดูได้ที่ /api/health/auth-db — ถ้า ok: false แปลว่า invariant เริ่มเสีย
 * และอาการแบบ "Media plan not found" / FK violation กำลังจะกลับมา
 * ผูกเข้า morning-brief.sh หรือ uptime monitor ได้เลย
 */
export async function GET() {
  try {
    const session = await auth()
    const sessionUserId = getUserId(session)

    const [userCount, sessionUserInDb, orphanPlans, orphanBriefs, orphanJobs, orphanBlueprints] =
      await Promise.all([
        prisma.user.count(),
        sessionUserId
          ? prisma.user.findUnique({ where: { id: sessionUserId }, select: { id: true } })
          : Promise.resolve(null),
        prisma.mediaPlan.count({ where: { userId: null } }),
        prisma.brief.count({ where: { userId: null } }),
        prisma.pushJob.count({ where: { userId: null } }),
        prisma.campaignBlueprint.count({ where: { userId: null } }),
      ])

    // CampaignBlueprint ไม่มี FK — เช็คเพิ่มว่ามี row ชี้ user ที่ไม่มีจริงหรือไม่
    const userIds = (await prisma.user.findMany({ select: { id: true } })).map(u => u.id)
    const danglingBlueprints = userIds.length > 0
      ? await prisma.campaignBlueprint.count({
          where: { userId: { not: null, notIn: userIds } },
        })
      : 0

    const sessionLinked = !sessionUserId || !!sessionUserInDb
    const orphanTotal = orphanPlans + orphanBriefs + orphanJobs + orphanBlueprints + danglingBlueprints
    const ok = userCount > 0 && sessionLinked

    return NextResponse.json({
      ok,
      userCount,
      session: sessionUserId
        ? { userId: sessionUserId, linkedToDb: !!sessionUserInDb }
        : null,
      orphans: {
        mediaPlans: orphanPlans,
        briefs: orphanBriefs,
        pushJobs: orphanJobs,
        campaignBlueprints: orphanBlueprints,
        danglingBlueprints,
        total: orphanTotal,
      },
      hint: !ok
        ? 'session id ไม่มีในตาราง User — เช็ค ensureDbUserId ใน src/lib/auth.ts แล้ว sign-out/sign-in ใหม่'
        : orphanTotal > 0
          ? `มีข้อมูลเก่าไร้เจ้าของ ${orphanTotal} แถว — รัน backfill.sql เพื่อผูกกลับ`
          : 'invariant ปกติ',
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
