import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok || data.error) throw new Error(String(data.error ?? 'refresh_failed'))
  return {
    accessToken: data.access_token as string,
    expiresAt:   Math.floor(Date.now() / 1000) + (data.expires_in as number ?? 3600),
    refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/adwords',
            'https://www.googleapis.com/auth/analytics.readonly',
            'https://www.googleapis.com/auth/analytics.edit',
            'https://www.googleapis.com/auth/tagmanager.readonly',
            'https://www.googleapis.com/auth/tagmanager.edit.containers',
            'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
            'https://www.googleapis.com/auth/tagmanager.publish',
          ].join(' '),
          access_type: 'offline',
          prompt: 'select_account consent',
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? ''
      return email.endsWith('@convertcake.com')
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
      }
      // First sign-in — store tokens from Google
      if (account?.provider === 'google') {
        token.accessToken  = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt    = account.expires_at
        return token
      }
      // Token still valid — return as-is
      if (Date.now() / 1000 < (token.expiresAt as number ?? 0) - 60) {
        return token
      }
      // Token expired — try to refresh
      try {
        const refreshed = await refreshAccessToken(token.refreshToken as string)
        return { ...token, ...refreshed }
      } catch {
        return { ...token, error: 'RefreshTokenError' }
      }
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      const s = session as unknown as Record<string, unknown>
      s.accessToken  = token.accessToken
      s.refreshToken = token.refreshToken
      if (token.error) s.error = token.error
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
})
