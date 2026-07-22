import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import type { LtClientAccess } from '@prisma/client'
import { LT_CLIENT_COOKIE, signClientToken, verifyClientToken } from './clientToken'
import type { LtClientTokenPayload } from './clientToken'

// Client-level restricted access for Line Tracking: a separate, cookie-based auth
// mechanism for external "client viewers" who log in with username+password and can
// see ONLY their one project's Line Tracking area. Fully independent of src/lib/auth.ts
// (MercyOS staff Google login via next-auth) — do not conflate the two.
//
// The JWT sign/verify logic lives in ./clientToken.ts (edge-runtime-safe, no Node
// `crypto` / `next/headers` / prisma) so it can be imported directly from
// src/middleware.ts. This file re-exports it alongside the server-only pieces
// (password hashing with Node's scrypt, Prisma lookups, cookie reads) that are not
// edge-compatible.

export { LT_CLIENT_COOKIE, signClientToken, verifyClientToken }
export type { LtClientTokenPayload }

const SCRYPT_KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, saltHex, hashHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export async function createClientAccess(input: {
  username: string
  password: string
  projectId: string
  label?: string
}): Promise<LtClientAccess> {
  const passwordHash = hashPassword(input.password)
  return prisma.ltClientAccess.create({
    data: {
      username: input.username,
      passwordHash,
      projectId: input.projectId,
      label: input.label,
    },
  })
}

export async function authenticateClient(username: string, password: string): Promise<LtClientAccess | null> {
  const record = await prisma.ltClientAccess.findUnique({ where: { username } })
  if (!record) return null
  if (!verifyPassword(password, record.passwordHash)) return null
  return record
}

export async function getClientSession(): Promise<LtClientTokenPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(LT_CLIENT_COOKIE)?.value
  if (!token) return null
  return verifyClientToken(token)
}
