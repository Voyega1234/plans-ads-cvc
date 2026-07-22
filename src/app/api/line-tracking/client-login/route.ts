import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { authenticateClient, signClientToken, LT_CLIENT_COOKIE } from '@/lib/line-tracking/clientAuth'

// Login endpoint for Line Tracking client viewers. Separate from MercyOS staff
// next-auth login — issues a signed cookie scoping the caller to a single project.

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.get('action') === 'logout') {
    return logout()
  }

  const body = await req.json().catch(() => null) as { username?: string; password?: string } | null
  const username = body?.username?.trim()
  const password = body?.password
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
  }

  const record = await authenticateClient(username, password)
  if (!record) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  // Paused project → client access is suspended (e.g. contract ended). Staff can re-enable
  // by setting the project back to LIVE. Login is rejected while paused.
  const project = await prisma.project.findUnique({
    where: { id: record.projectId },
    select: { status: true },
  })
  if (!project || project.status === 'PAUSED') {
    return NextResponse.json({ error: 'บัญชีนี้ถูกระงับการเข้าถึงชั่วคราว กรุณาติดต่อผู้ดูแล' }, { status: 403 })
  }

  const token = await signClientToken({ username: record.username, projectId: record.projectId })
  const cookieStore = await cookies()
  cookieStore.set(LT_CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  // Logging in as a client switches the browser fully to client mode — clear any
  // staff (next-auth) session so the client never sees the MercyOS chrome, even in
  // the same browser that was used for staff dev-login/Google login.
  for (const name of [
    'authjs.session-token', '__Secure-authjs.session-token',
    'next-auth.session-token', '__Secure-next-auth.session-token',
  ]) cookieStore.delete(name)

  return NextResponse.json({ ok: true, projectId: record.projectId })
}

async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(LT_CLIENT_COOKIE)
  return NextResponse.json({ ok: true })
}
