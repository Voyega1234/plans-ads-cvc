import { SignJWT, jwtVerify } from 'jose'

// Edge-runtime-safe half of the Line Tracking client-viewer auth mechanism: only
// depends on `jose` (Web Crypto based), so it is safe to import from src/middleware.ts.
// Do NOT add imports here that aren't edge-compatible (no `node:crypto`, no
// `next/headers`, no `@/lib/prisma`) — those live in ./clientAuth.ts instead, which
// re-exports everything from this module for convenience in server-only code.

export const LT_CLIENT_COOKIE = 'lt_client'

export interface LtClientTokenPayload {
  username: string
  projectId: string
}

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET or AUTH_SECRET must be set for Line Tracking client auth')
  return new TextEncoder().encode(secret)
}

export async function signClientToken(payload: LtClientTokenPayload): Promise<string> {
  return new SignJWT({ username: payload.username, projectId: payload.projectId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyClientToken(token: string): Promise<LtClientTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const username = payload.username
    const projectId = payload.projectId
    if (typeof username !== 'string' || typeof projectId !== 'string') return null
    return { username, projectId }
  } catch {
    return null
  }
}
