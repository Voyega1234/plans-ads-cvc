import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

// Middleware รันบน Edge runtime — ต้องใช้ auth.config.ts (ไม่มี prisma) เท่านั้น
// ห้าม import '@/lib/auth' ที่นี่: มันดึง prisma เข้า Edge bundle แล้ว sign-in จะพัง
// (สาเหตุเดียวกับตอนที่ Prisma adapter ทำ sign-in ค้างในอดีต)
const { auth } = NextAuth(authConfig)

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
