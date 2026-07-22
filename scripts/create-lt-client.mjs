#!/usr/bin/env node
/**
 * Admin tool — create a Line Tracking client-viewer credential.
 *
 * Usage:
 *   node scripts/create-lt-client.mjs <username> <password> <projectId> [label]
 *
 * Requires a working DATABASE_URL/DIRECT_URL (Supabase Postgres). Prints the created
 * credential (never prints the plaintext password back — only what was set).
 *
 * NOTE: this script hashes the password with the exact same scheme as
 * src/lib/line-tracking/clientAuth.ts (`hashPassword`): Node's scrypt with a random
 * 16-byte salt, stored as `scrypt$<saltHex>$<hashHex>`. It duplicates that logic
 * (rather than importing the .ts module) so it can run with plain `node`, with no
 * TypeScript loader required. Keep the two in sync if the hashing scheme changes.
 */
import { randomBytes, scryptSync } from 'crypto'
import { PrismaClient } from '@prisma/client'

const SCRYPT_KEYLEN = 64

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

async function main() {
  const [username, password, projectId, label] = process.argv.slice(2)

  if (!username || !password || !projectId) {
    console.error('Usage: node scripts/create-lt-client.mjs <username> <password> <projectId> [label]')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      console.error(`No project found with id "${projectId}"`)
      process.exit(1)
    }

    const passwordHash = hashPassword(password)
    const record = await prisma.ltClientAccess.create({
      data: { username, passwordHash, projectId, label: label ?? null },
    })

    console.log('Created Line Tracking client access:')
    console.log(`  id:        ${record.id}`)
    console.log(`  username:  ${record.username}`)
    console.log(`  project:   ${project.name} (${project.id})`)
    console.log(`  label:     ${record.label ?? '(none)'}`)
    console.log(`  login url: /line-tracking/client-login`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
