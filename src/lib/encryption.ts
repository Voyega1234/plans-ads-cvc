/**
 * AES-256-GCM encryption using Node.js crypto.
 * Requires ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
 * Generate with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_HEX_LENGTH = 64 // 32 bytes = 64 hex chars

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? ''
  if (raw.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_HEX_LENGTH} hex characters (run: openssl rand -hex 32)`
    )
  }
  return Buffer.from(raw, 'hex')
}

export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(24 hex) + tag(32 hex) + ciphertext(hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex')
}

export function decrypt(encryptedText: string): string {
  const key = getKey()
  const iv = Buffer.from(encryptedText.slice(0, 24), 'hex')
  const tag = Buffer.from(encryptedText.slice(24, 56), 'hex')
  const ciphertext = Buffer.from(encryptedText.slice(56), 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}
