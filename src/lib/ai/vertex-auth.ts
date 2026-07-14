/**
 * Vertex AI ผ่าน OIDC (Vercel Workload Identity Federation → GCP)
 * — เรียก Gemini โดยไม่ต้องวาง GEMINI_API_KEY: Vercel ออก OIDC token ให้ runtime
 *   แลกเป็น GCP access token ผ่าน STS + impersonate service account
 *
 * เปิดใช้เมื่อครบ env ทั้งชุด (ตั้งใน Vercel หลัง connect OIDC กับ GCP):
 *   GCP_PROJECT_ID · GCP_PROJECT_NUMBER · GCP_WORKLOAD_IDENTITY_POOL_ID
 *   GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID · GCP_SERVICE_ACCOUNT_EMAIL
 *   (optional) VERTEX_LOCATION — default global
 * ไม่ครบ = fallback ไป provider อื่นหรือ mock
 */

export function isVertexConfigured(): boolean {
  return !!(
    process.env.GCP_PROJECT_ID &&
    process.env.GCP_PROJECT_NUMBER &&
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID &&
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID &&
    process.env.GCP_SERVICE_ACCOUNT_EMAIL
  )
}

export const VERTEX_LOCATION = () => process.env.VERTEX_LOCATION ?? process.env.GCP_LOCATION ?? 'global'
export const VERTEX_PROJECT = () => process.env.GCP_PROJECT_ID ?? ''
export const VERTEX_AUDIENCE = () =>
  process.env.GCP_AUDIENCE ??
  `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`

let cache: { token: string; expiresAt: number } | null = null

export async function getVertexAccessToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt) return cache.token

  const { ExternalAccountClient } = await import('google-auth-library')
  const { getVercelOidcToken } = await import('@vercel/oidc')

  const audience = VERTEX_AUDIENCE()
  const getSubjectToken = process.env.GCP_AUDIENCE
    ? () => getVercelOidcToken({ audience })
    : getVercelOidcToken

  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken },
  })
  if (!client) throw new Error('Vertex OIDC: สร้าง auth client ไม่สำเร็จ — เช็ค GCP_* env')
  client.scopes = ['https://www.googleapis.com/auth/cloud-platform']

  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Vertex OIDC: ไม่ได้ access token — เช็ค Workload Identity binding')

  cache = { token, expiresAt: Date.now() + 50 * 60 * 1000 }  // token ~60 นาที เผื่อ margin
  return token
}

export type VertexPart = {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

export type VertexContent = {
  role: 'user' | 'model'
  parts: VertexPart[]
}

export async function generateVertexContent(opts: {
  model: string
  contents: VertexContent[]
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  responseMimeType?: 'application/json'
  useGrounding?: boolean
  labels?: Record<string, string>
}) {
  const token = await getVertexAccessToken()
  const location = VERTEX_LOCATION()
  const endpoint = location === 'global'
    ? 'https://aiplatform.googleapis.com'
    : `https://${location}-aiplatform.googleapis.com`
  const url = `${endpoint}/v1/projects/${VERTEX_PROJECT()}/locations/${location}/publishers/google/models/${opts.model}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(opts.systemPrompt ? { systemInstruction: { parts: [{ text: opts.systemPrompt }] } } : {}),
      contents: opts.contents,
      ...(opts.labels ? { labels: opts.labels } : {}),
      ...(opts.useGrounding ? { tools: [{ googleSearch: {} }] } : {}),
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 65536,
        ...(opts.responseMimeType && !opts.useGrounding ? { responseMimeType: opts.responseMimeType } : {}),
      },
    }),
  })
  if (!res.ok) throw new Error(`Vertex AI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json() as Promise<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }>
}

export function vertexText(data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }) {
  return (data.candidates?.[0]?.content?.parts ?? []).map(pt => pt.text ?? '').join('')
}
