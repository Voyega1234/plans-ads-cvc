// ── System learning สำหรับ Keyword Research ───────────────────────────────────
//
// เก็บ feedback ที่ผู้ใช้พิมพ์ตอนกด "วิเคราะห์ใหม่" (เช่น "ไม่เอาคำที่ซ้ำแคมเปญ X",
// "โฟกัส painpoint ปวดหลัง") ลง DB แล้วดึงกลับมาใส่ prompt ทุกครั้งที่ generate
// ให้ธุรกิจเดิม — ระบบจึง "จำ" ได้ข้ามรอบและข้ามเครื่อง
//
// ตารางถูกสร้างเองอัตโนมัติครั้งแรกที่ใช้ (CREATE TABLE IF NOT EXISTS) —
// ตั้งใจไม่แตะ schema.prisma เพื่อไม่ต้องรอ migration มือ ซึ่งขั้นตอนแบบนั้น
// เคยถูกข้ามมาแล้ว (ดู README ข้อ 19.5) — โค้ดนี้ heal ตัวเองในคำขอแรก

async function ensureFeedbackTable() {
  const { prisma } = await import('@/lib/prisma')
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KeywordFeedback" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "businessKey" TEXT NOT NULL,
      "feedback" TEXT NOT NULL,
      "context" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )`)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "KeywordFeedback_businessKey_idx" ON "KeywordFeedback" ("businessKey")`)
}

const businessKeyOf = (businessName: string) =>
  businessName.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 120)

/** บันทึก feedback หนึ่งรายการ — ห้าม throw (learning เป็น best-effort เสมอ) */
export async function saveKeywordFeedback(businessName: string, feedback: string, context?: string) {
  const text = feedback.trim()
  if (!businessName.trim() || !text) return
  try {
    await ensureFeedbackTable()
    const { prisma } = await import('@/lib/prisma')
    await prisma.$executeRaw`INSERT INTO "KeywordFeedback" ("businessKey", "feedback", "context")
      VALUES (${businessKeyOf(businessName)}, ${text.slice(0, 2000)}, ${context ?? null})`
  } catch (e) {
    console.error('[kw-feedback] save failed (non-fatal):', e)
  }
}

/** feedback ล่าสุดของธุรกิจนี้ (ใหม่สุดก่อน สูงสุด 10) — คืน [] เมื่อพัง */
export async function loadKeywordFeedback(businessName: string): Promise<string[]> {
  if (!businessName.trim()) return []
  try {
    await ensureFeedbackTable()
    const { prisma } = await import('@/lib/prisma')
    const rows = await prisma.$queryRaw<Array<{ feedback: string }>>`
      SELECT "feedback" FROM "KeywordFeedback"
      WHERE "businessKey" = ${businessKeyOf(businessName)}
      ORDER BY "createdAt" DESC LIMIT 10`
    return rows.map(r => r.feedback)
  } catch (e) {
    console.error('[kw-feedback] load failed (non-fatal):', e)
    return []
  }
}
