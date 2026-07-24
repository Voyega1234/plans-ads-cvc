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
  //
  // Deleting a cookie is just a Set-Cookie with Max-Age=0, and the browser applies the
  // SAME rules to it as to any other Set-Cookie. next-auth names its production cookie
  // `__Secure-authjs.session-token`, and the `__Secure-` prefix is only honoured when
  // the Secure attribute is present — so a bare `cookies().delete(name)` (which emits
  // no Secure) is silently REJECTED and the staff session survives. The client viewer
  // then renders with a live staff session and gets the full MercyOS chrome plus every
  // other client's data. Hence: delete by writing an expired cookie with the attributes
  // spelled out. Secure is set only for the `__Secure-` names, so the plain-HTTP names
  // used in local dev are still removable there.
  //
  // Matching on the live cookie jar (rather than a hardcoded list) also covers the
  // numbered chunks next-auth splits large session cookies into (`…session-token.0`).
  const STAFF_SESSION_COOKIE = /^(__Secure-)?(authjs|next-auth)\.session-token(\.\d+)?$/
  for (const { name } of cookieStore.getAll()) {
    if (!STAFF_SESSION_COOKIE.test(name)) continue
    cookieStore.set(name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: name.startsWith('__Secure-'),
    })
  }

  return NextResponse.json({ ok: true, projectId: record.projectId })
}

async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(LT_CLIENT_COOKIE)
  return NextResponse.json({ ok: true })
}
