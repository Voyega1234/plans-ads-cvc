import { auth } from './auth'
import type { Session } from 'next-auth'

export async function getAuthSession() {
  return auth() as Promise<Session | null>
}

export async function requireSession() {
  const session = await (auth() as Promise<Session | null>)
  if (!session?.user?.id) throw new Error('Unauthorized')
  return session
}

export function getUserId(session: Session | null | undefined): string {
  return (session?.user as Record<string, unknown> | null | undefined)?.id as string ?? ''
}

export function getAccessToken(session: Session | null | undefined): string | undefined {
  return (session as unknown as Record<string, unknown> | null | undefined)?.accessToken as string | undefined
}
