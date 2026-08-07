import NextAuth from 'next-auth'
import type { JWT } from 'next-auth/jwt'
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
 * ทำไม id ถึงเพี้ยนได้ตั้งแต่แรก: auth.config.ts ใช้ `session: { strategy: 'jwt' }`
 * และ **ไม่มี Prisma adapter** (ตั้งใจ — เอา adapter ออกเพื่อให้ middleware รันบน Edge ได้)
 * เมื่อไม่มี adapter, Auth.js จะไม่รู้จัก User ใน DB เลย ค่า `user.id` ที่โผล่เข้า
 * callback `jwt` ตอน sign-in จึงเป็น id ที่ Auth.js สร้างเอง (สุ่ม UUID / provider sub)
 * ไม่ใช่ `User.id` ใน Postgres → เขียนลง FK เมื่อไหร่ก็พังเมื่อนั้น
 *
 * ═══ ทำไมของเดิม "แก้แล้วยังพัง" ═══
 * เวอร์ชันก่อนหน้าซ่อม id **เฉพาะตอน sign-in** (`if (params.user)`) ซึ่งถูกต้องสำหรับ
 * คนที่ล็อกอินใหม่หลัง deploy — แต่ session ของ JWT อยู่ในคุกกี้ได้เป็นเดือน
 * ใครที่ถือคุกกี้เก่าอยู่ก่อน deploy จะยังพก id ผิดต่อไปจนกว่าจะ sign-out/sign-in เอง
 * ซึ่งไม่มีทางรู้ว่าต้องทำ → อาการเดิม (FK violation ตอนกด Push) จึงกลับมาอีก
 *
 * เวอร์ชันนี้ซ่อม **ทุก token ที่ยังไม่เคยตรวจ** ไม่ใช่เฉพาะตอน sign-in:
 * คุกกี้เก่าจะถูกซ่อมเงียบ ๆ ใน request ถัดไปที่แตะ session — ผู้ใช้ไม่ต้องทำอะไรเลย
 * และเสียค่า query แค่ครั้งเดียวต่อคุกกี้หนึ่งใบ (ตราประทับ `uidVerified` กันวิ่งซ้ำ)
 *
 * ห้าม import ไฟล์นี้จาก middleware.ts (Edge) — middleware ต้องใช้ auth.config.ts
 */

// เพิ่มเลขนี้เมื่อ logic การ resolve เปลี่ยน เพื่อบังคับให้คุกกี้เก่าถูกตรวจใหม่ทั้งหมด
const UID_VERIFY_VERSION = 2

type UserSeed = {
  id?: string | null
  email?: string | null
  name?: string | null
  image?: string | null
}

/**
 * คืน `User.id` ที่ **มีอยู่จริงใน DB** — หรือ null ถ้าตอบไม่ได้ (DB ล่ม / ไม่มี email)
 * คืน null สำคัญมาก: ผู้เรียกจะได้ไม่ประทับตราว่า "ตรวจแล้ว" แล้วปล่อย id ผิดค้างถาวร
 */
async function resolveDbUserId(seed: UserSeed): Promise<string | null> {
  try {
    // 1) id ที่ถืออยู่ใช้ได้จริงอยู่แล้วหรือเปล่า — เคสปกติของคนที่ล็อกอินหลัง fix
    if (seed.id) {
      const byId = await prisma.user.findUnique({ where: { id: seed.id }, select: { id: true } })
      if (byId) return byId.id
    }
    const email = seed.email ?? ''
    if (!email) return null

    // 2) ผูกกลับด้วย email — ได้ id เดิมจากยุคที่ยังใช้ Prisma adapter คืนมา
    //    ข้อมูลเก่าทั้งหมดที่ผูกกับ id นั้นจึงกลับมาเชื่อมกันเหมือนเดิม
    const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } })
    if (existing) {
      await prisma.user
        .update({
          where: { id: existing.id },
          data: { name: seed.name ?? undefined, image: seed.image ?? undefined },
        })
        .catch(() => {})
      return existing.id
    }

    // 3) ยังไม่เคยมี — สร้างใหม่ (signIn callback กรอง @convertcake.com มาแล้ว)
    const created = await prisma.user.create({
      data: {
        ...(seed.id ? { id: seed.id } : {}),
        email,
        name: seed.name,
        image: seed.image,
      },
      select: { id: true },
    })
    return created.id
  } catch (e) {
    // ไม่ throw — sign-in / การใช้งานต้องไม่ล้มเพราะ DB สะดุด
    // แต่จะไม่ประทับตรา verified → request ถัดไปลองใหม่เอง และโผล่ใน /api/health/auth-db
    console.error('[auth] resolveDbUserId failed — userId invariant at risk:', e)
    return null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      // callback เดิม: เซ็ต token.id ชั่วคราว + เก็บ/refresh Google tokens
      const token = (await authConfig.callbacks!.jwt!(params)) as JWT | null
      if (!token) return token

      // ซ่อมเมื่อ (ก) เพิ่ง sign-in หรือ (ข) คุกกี้ใบนี้ยังไม่เคยผ่านการตรวจเวอร์ชันนี้
      const alreadyVerified = (token as Record<string, unknown>).uidVerified === UID_VERIFY_VERSION
      if (params.user || !alreadyVerified) {
        const resolved = await resolveDbUserId({
          id: (params.user?.id ?? (token as Record<string, unknown>).id ?? token.sub) as string | undefined,
          email: (params.user?.email ?? token.email) as string | undefined,
          name: (params.user?.name ?? token.name) as string | undefined,
          image: (params.user?.image ?? token.picture) as string | undefined,
        })
        if (resolved) {
          ;(token as Record<string, unknown>).id = resolved
          ;(token as Record<string, unknown>).uidVerified = UID_VERIFY_VERSION
        }
      }
      return token
    },
  },
})
