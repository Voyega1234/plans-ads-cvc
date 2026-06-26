/**
 * Google Service Account Authentication using Web Crypto API (no extra packages).
 * Supports Node 18+ and Next.js edge runtime.
 */

function base64urlEncode(data: string | Uint8Array): string {
  let bytes: Uint8Array
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data)
  } else {
    bytes = data
  }
  // Convert to base64 then to base64url
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parsePemKey(pem: string): string {
  // Remove PEM header/footer and whitespace
  return pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/\\n/g, '\n')
    .replace(/\s+/g, '')
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Creates a Google service account access token using Web Crypto API (no extra packages).
 * @param clientEmail  Service account email
 * @param privateKey   PEM-format private key (\\n-escaped is fine)
 * @param scope        OAuth2 scope(s), space-separated
 */
export async function getServiceAccountToken(
  clientEmail: string,
  privateKey: string,
  scope: string
): Promise<string> {
  if (!clientEmail || !privateKey) {
    throw new Error('Service account credentials not configured (clientEmail / privateKey missing)')
  }

  const now = Math.floor(Date.now() / 1000)

  // Build JWT header + payload
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64urlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )

  const signingInput = `${header}.${payload}`

  // Import the private key
  const pemBody = parsePemKey(privateKey)
  const keyBuffer = base64ToArrayBuffer(pemBody)

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  // Sign
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const signature = base64urlEncode(new Uint8Array(signatureBuffer))
  const jwt = `${signingInput}.${signature}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Service account token exchange failed: ${tokenRes.status} ${err.slice(0, 300)}`)
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    throw new Error(`No access_token in response: ${JSON.stringify(tokenData)}`)
  }

  return tokenData.access_token
}
