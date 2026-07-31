import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'
import { LT_CLIENT_COOKIE, verifyClientToken } from '@/lib/line-tracking/clientToken'

// ── MERGED middleware — supersedes BOTH previous versions ────────────────────
// 1) plans-ads auth fix: Edge-safe NextAuth via auth.config.ts (no prisma in the
//    Edge bundle — importing '@/lib/auth' here breaks sign-in).
// 2) Line Tracking version: public tracking exemptions + client-viewer cookie.
// The deployed middleware (1) dropped the exemptions of (2), which 401'd the
// LINE webhook and login-walled /embed.js, /go, /t, /line — killing click
// tracking and lead ingestion in production. This file restores them ON TOP of
// the edge-safe auth base, and adds the new /liff endpoints.
//
// clientToken.ts is jose-only (Web Crypto) — safe for the Edge runtime.
const { auth } = NextAuth(authConfig)

// Login is always required to reach the app (no guest access).
// Line Tracking external endpoints — called by LINE servers, ad-click redirects,
// the visitor's browser, and the conversion cron. They have no session and can't
// pass an interactive login, so they are exempt from the login gate. They are NOT
// open doors: the LINE webhook verifies X-Line-Signature, the LIFF API verifies
// the token with LINE, and the conversion cron checks CRON_SECRET.
const PUBLIC_TRACKING_PREFIXES = [
  '/go/', '/s/', '/t/', '/line/', '/embed.js', '/liff/',
  '/api/webhooks/', '/api/track/', '/api/conversions/', '/api/liff/',
]
// Line Tracking client-viewer login/logout — must be reachable with no next-auth
// session AND no lt_client cookie yet (that's the whole point of a login page).
const CLIENT_AUTH_PREFIXES = [
  '/line-tracking/client-login',
  '/api/line-tracking/client-login',
  '/api/line-tracking/client-logout',
]

function isPublicTracking(pathname: string): boolean {
  return PUBLIC_TRACKING_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
}
function isClientAuthPath(pathname: string): boolean {
  return CLIENT_AUTH_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
}

export default auth(async (req) => {
  const pathname = req.nextUrl.pathname
  const isLoggedIn = !!req.auth
  const isAuthPage = pathname.startsWith('/auth')
  const isAuthApi = pathname.startsWith('/api/auth')
  const isPublic = isPublicTracking(pathname)
  const isClientAuth = isClientAuthPath(pathname)

  // Forward the pathname to server components (used by the Line Tracking layout
  // to recognize the client-login page without gating it behind a session).
  const headers = new Headers(req.headers)
  headers.set('x-lt-pathname', pathname)
  const withPathname = () => NextResponse.next({ request: { headers } })

  if (isLoggedIn || isAuthPage || isAuthApi || isPublic || isClientAuth) {
    return withPathname()
  }

  // No staff (next-auth) session. Check for a Line Tracking client-viewer cookie —
  // a separate, contained cookie mechanism. Staff behavior is unaffected.
  const clientToken = req.cookies.get(LT_CLIENT_COOKIE)?.value
  const clientSession = clientToken ? await verifyClientToken(clientToken) : null

  if (clientSession) {
    const allowedPrefix = `/line-tracking/projects/${clientSession.projectId}`
    const isAllowed = pathname === allowedPrefix || pathname.startsWith(`${allowedPrefix}/`)
    if (isAllowed) {
      return withPathname()
    }
    return Response.redirect(new URL(allowedPrefix, req.nextUrl))
  }

  // Neither next-auth session nor a valid client cookie.
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Unauthorized — login required' }, { status: 401 })
  }
  return Response.redirect(new URL('/auth/signin', req.nextUrl))
})

export const config = {
  // /uploads = ad creative images — must be readable by the server-side Google Ads
  // pusher (no session cookie); auth-gating them made every image push fail as "ขาดรูป"
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
}
