import { auth } from '@/lib/auth'

// Login is always required to reach the app (no guest access).
// SKIP_AUTH only controls per-user data scoping inside API routes (kept shared for the
// agency team), NOT whether login is enforced — those two concerns are decoupled here.
export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth')

  if (!isLoggedIn && !isAuthPage && !isAuthApi) {
    // For page navigations, redirect to the sign-in page; for API/data calls return 401
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized — login required' }, { status: 401 })
    }
    return Response.redirect(new URL('/auth/signin', req.nextUrl))
  }
})

export const config = {
  // /uploads = ad creative images — must be readable by the server-side Google Ads
  // pusher (no session cookie); auth-gating them made every image push fail as "ขาดรูป"
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
}
