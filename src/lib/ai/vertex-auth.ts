/**
 * Vertex AI ผ่าน OIDC (Vercel Workload Identity Federation → GCP)
 * — เรียก Gemini โดยไม่ต้องวาง GEMINI_API_KEY: Vercel ออก OIDC token ให้ runtime
 *   แลกเป็น GCP access token ผ่าน STS + impersonate service account
 *
 * เปิดใช้เมื่อครบ env ทั้งชุด (ตั้งใน Vercel หลัง connect OIDC กับ GCP):
 *   GCP_PROJECT_ID · GCP_PROJECT_NUMBER · GCP_WORKLOAD_IDENTITY_POOL_ID
 *   GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID · GCP_SERVICE_ACCOUNT_EMAIL
 *   (optional) VERTEX_LOCATION — default us-central1
 * ไม่ครบ = โหมดเดิมทุกอย่าง (GEMINI_API_KEY / ANTHROPIC_API_KEY)
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

// Default to the GLOBAL endpoint: Gemini 3.x models (gemini-3.5-flash, etc.) are served
// there and are NOT available in every single region — a regional default like us-central1
// returns 404 for them. Override with VERTEX_LOCATION only if you need data residency.
export const VERTEX_LOCATION = () => process.env.VERTEX_LOCATION ?? 'global'
export const VERTEX_PROJECT = () => process.env.GCP_PROJECT_ID ?? ''

let cache: { token: string; expiresAt: number } | null = null

export async function getVertexAccessToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt) return cache.token

  const { ExternalAccountClient } = await import('google-auth-library')
  const { getVercelOidcToken } = await import('@vercel/oidc')

  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: getVercelOidcToken },
  })
  if (!client) throw new Error('Vertex OIDC: สร้าง auth client ไม่สำเร็จ — เช็ค GCP_* env')
  client.scopes = ['https://www.googleapis.com/auth/cloud-platform']

  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Vertex OIDC: ไม่ได้ access token — เช็ค Workload Identity binding')

  cache = { token, expiresAt: Date.now() + 50 * 60 * 1000 }  // token ~60 นาที เผื่อ margin
  return token
}
