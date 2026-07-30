import NextAuth from 'next-auth'
import type { User } from 'next-auth'
import { authConfig } from './auth.config'
import { prisma } from './prisma'

/**
 * INVARIANT ทั้งระบบ: session.user.id ต้องมีอยู่จริงในตาราง `User` เสมอ
 *
 * API route เกือบทุกตัวกรอง query ด้วย userId นี้ และหลายตาราง (MediaPlan, Brief,
 * PushJob, AutomationRule, AutomationAlert, ChatSession) มี FK ชี้ไป User.id
 * ถ้า id ใน session ไม่มีใน DB → เกิด 404 ปลอม ("Media plan not found"),
 * รายการว่าง, และ FK violation ตอน create ทั่วทั้งแอป
 *
 * ฟังก์ชันนี้จึงรันทุกครั้งตอน sign-in (ครั้งเดียวต่อ login, ฝั่ง Node เท่านั้น):
 * - ถ้ามี User เดิมที่ email ตรงกัน (เช่น row จากยุคที่ใช้ Prisma adapter)
 *   → ใช้ id เดิม เพื่อให้ข้อมูลเก่าที่ผูกไว้กลับมาเชื่อมได้
 * - ถ้าไม่มี → สร้าง row ใหม่ด้วย Google sub เป็น id
 *
 * ห้ามถอด logic นี้ออกโดยไม่ทบทวนทุก route ที่ใช้ getUserId()
 * และห้าม import ไฟล์นี้จาก middleware.ts (Edge) — middleware ต้องใช้ auth.config.ts
 */
async function ensureDbUserId(user: User): Promise<string> {
  const fallback = user.id ?? ''
  try {
    const email = user.email ?? ''
    const existing = email
      ? await prisma.user.findFirst({ where: { email }, select: { id: true } })
      : null
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name:  user.name  ?? undefined,
          image: user.image ?? undefined,
        },
      }).catch(() => {})
      return existing.id
    }
    const created = await prisma.user.create({
      data: {
        ...(user.id ? { id: user.id } : {}),
        email: email || null,
        name:  user.name,
        image: user.image,
      },
      select: { id: true },
    })
    return created.id
  } catch (e) {
    // sign-in ยังผ่านได้ แต่ invariant เสีย — จะโผล่ใน /api/health/auth-db
    console.error('[auth] ensureDbUserId failed — userId invariant at risk:', e)
    return fallback
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      // base callback: เซ็ต token.id ชั่วคราว + เก็บ/refresh Google tokens
      const token = await authConfig.callbacks!.jwt!(params)
      // ตอน sign-in ครั้งแรกเท่านั้น (params.user มีค่า) — ยึด id จาก DB เป็นความจริง
      if (params.user && token) {
        token.id = await ensureDbUserId(params.user)
      }
      return token
    },
  },
})
