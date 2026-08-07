// Staff emails allowed to CREATE Line Tracking client logins. Only these people can
// mint client-viewer credentials (a security decision — a client login grants outside
// visibility into a project's data).
export const LT_CLIENT_ADMINS = [
  'apps@convertcake.com',
  'bob@convertcake.com',
  'varn@convertcake.com',
]

export function canManageClients(email: string | null | undefined): boolean {
  return !!email && LT_CLIENT_ADMINS.includes(email.toLowerCase())
}

// ── Super viewers ─────────────────────────────────────────────────────────────
// อีเมลทีมกลางที่ต้องเห็น "ทุกโปรเจกต์" ใน Line Tracking เสมอ (เพื่อช่วยทีมได้)
// — คำสั่งเจ้าของระบบ 5 ส.ค. 2026 · ทุกจุดที่กรองรายชื่อโปรเจกต์ตามผู้ใช้
// ต้องเช็ค canSeeAllProjects() ก่อนกรองเสมอ
export const LT_SUPER_VIEWERS = [
  'bob@convertcake.com',
  'apps@convertcake.com',
]

export function canSeeAllProjects(email: string | null | undefined): boolean {
  return !!email && LT_SUPER_VIEWERS.includes(email.toLowerCase())
}
