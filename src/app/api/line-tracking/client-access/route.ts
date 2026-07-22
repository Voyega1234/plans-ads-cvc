import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthSession } from '@/lib/session'
import { createClientAccess } from '@/lib/line-tracking/clientAuth'
import { canManageClients } from '@/lib/line-tracking/clientAdmins'

// Manage Line Tracking client logins. STAFF ONLY, and further restricted to the
// allowlisted admin emails (src/lib/line-tracking/clientAdmins.ts). A client login
// grants outside visibility into a project's data, so minting one is privileged.

async function requireAdmin() {
  const session = await getAuthSession()
  const email = session?.user?.email ?? null
  if (!session?.user?.id) return { error: 'unauthorized', status: 401 as const }
  if (!canManageClients(email)) return { error: 'forbidden — ไม่มีสิทธิ์สร้าง client login', status: 403 as const }
  return { email }
}

// GET ?projectId=... → list client logins for a project (no password hashes)
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  const clients = await prisma.ltClientAccess.findMany({
    where: { projectId },
    select: { id: true, username: true, label: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ clients })
}

// POST { username, password, projectId, label } → create a client login
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await req.json().catch(() => null)) as
    | { username?: string; password?: string; projectId?: string; label?: string }
    | null
  const username = body?.username?.trim()
  const password = body?.password
  const projectId = body?.projectId
  if (!username || !password || !projectId) {
    return NextResponse.json({ error: 'username, password, projectId are required' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' }, { status: 400 })
  }
  // project must exist; username must be unique
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
  const dup = await prisma.ltClientAccess.findUnique({ where: { username } })
  if (dup) return NextResponse.json({ error: 'username นี้ถูกใช้แล้ว' }, { status: 409 })

  const created = await createClientAccess({ username, password, projectId, label: body?.label })
  return NextResponse.json({ ok: true, id: created.id, username: created.username })
}

// DELETE ?id=... → revoke a client login
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.ltClientAccess.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
