import { auth } from '@/lib/auth'

export default auth((req) => {
  if (process.env.SKIP_AUTH === 'true') return
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth')

  if (!isLoggedIn && !isAuthPage && !isAuthApi) {
    return Response.redirect(new URL('/auth/signin', req.nextUrl))
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
