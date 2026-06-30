import { getVercelOidcToken } from '@vercel/oidc'
import { createVertex, type GoogleVertexProvider } from '@ai-sdk/google-vertex'
import { generateText, type ModelMessage } from 'ai'
import type { ExternalAccountClientOptions } from 'google-auth-library'

const SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt'
const TOKEN_URL = 'https://sts.googleapis.com/v1/token'

const REQUIRED_ENV = [
  'GCP_PROJECT_ID',
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
] as const

let cachedVertex: { key: string; provider: GoogleVertexProvider } | null = null

export function getMissingVertexOidcEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key])
}

export function hasVertexOidcConfig(): boolean {
  return getMissingVertexOidcEnv().length === 0
}

export function getVertexLocation(): string {
  return process.env.GCP_VERTEX_LOCATION ?? process.env.GOOGLE_VERTEX_LOCATION ?? 'us-central1'
}

function getVertexOidcCredentials(): ExternalAccountClientOptions {
  const projectNumber = process.env.GCP_PROJECT_NUMBER!
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID!
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL!

  return {
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: SUBJECT_TOKEN_TYPE,
    token_url: TOKEN_URL,
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: async () => getVercelOidcToken(),
    },
  }
}

export function getVertexProvider(): GoogleVertexProvider {
  const missing = getMissingVertexOidcEnv()
  if (missing.length > 0) {
    throw new Error(`Missing Vertex OIDC env vars: ${missing.join(', ')}`)
  }

  const project = process.env.GCP_PROJECT_ID!
  const location = getVertexLocation()
  const key = [
    project,
    location,
    process.env.GCP_PROJECT_NUMBER,
    process.env.GCP_SERVICE_ACCOUNT_EMAIL,
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID,
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
  ].join('|')

  if (cachedVertex?.key === key) return cachedVertex.provider

  const provider = createVertex({
    project,
    location,
    googleAuthOptions: {
      projectId: project,
      credentials: getVertexOidcCredentials(),
    },
  })

  cachedVertex = { key, provider }
  return provider
}

export async function generateVertexText(options: {
  model: string
  prompt?: string
  messages?: ModelMessage[]
  system?: string
  temperature?: number
  maxOutputTokens?: number
  useGrounding?: boolean
}) {
  const vertex = getVertexProvider()
  const tools = options.useGrounding
    ? { googleSearch: vertex.tools.googleSearch({ searchTypes: { webSearch: {} } }) }
    : undefined

  const common = {
    model: vertex(options.model),
    system: options.system,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    ...(tools ? { tools } : {}),
  }

  if (options.messages) {
    return generateText({
      ...common,
      messages: options.messages,
    })
  }

  return generateText({
    ...common,
    prompt: options.prompt ?? '',
  })
}
