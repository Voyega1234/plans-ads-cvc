import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { LT_CLIENT_COOKIE } from '@/lib/line-tracking/clientAuth'

// Clears the Line Tracking client-viewer cookie. Separate from MercyOS staff logout.
// Redirects back to the client login page (called from a <form> in ClientShell).

export async function POST(req: Request) {
  const cookieStore = await cookies()
  cookieStore.delete(LT_CLIENT_COOKIE)
  return NextResponse.redirect(new URL('/line-tracking/client-login', req.url), 303)
}
