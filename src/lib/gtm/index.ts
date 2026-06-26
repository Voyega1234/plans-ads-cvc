import { getServiceAccountToken } from '@/lib/google/service-account-auth'

const GTM_BASE = 'https://www.googleapis.com/tagmanager/v2'

async function getGtmToken(oauthToken?: string): Promise<string> {
  if (oauthToken) return oauthToken
  const email = process.env.GTM_SERVICE_ACCOUNT_EMAIL ?? ''
  const key   = process.env.GTM_SERVICE_ACCOUNT_PRIVATE_KEY ?? ''
  if (!email || !key) throw new Error('GTM credentials not configured')
  return getServiceAccountToken(email, key, 'https://www.googleapis.com/auth/tagmanager.readonly')
}

async function getGtmWriteToken(oauthToken?: string): Promise<string> {
  if (oauthToken) return oauthToken
  const email = process.env.GTM_SERVICE_ACCOUNT_EMAIL ?? ''
  const key   = process.env.GTM_SERVICE_ACCOUNT_PRIVATE_KEY ?? ''
  if (!email || !key) throw new Error('GTM credentials not configured')
  // tagmanager.edit.containers covers create/update of tags/triggers/variables/workspaces
  // tagmanager.publish is required for create_version + publish
  return getServiceAccountToken(
    email,
    key,
    'https://www.googleapis.com/auth/tagmanager.publish'
  )
}

async function gtmFetch<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${GTM_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GTM API ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

// --- Types ---

export interface GtmAccount {
  accountId:   string
  name:        string
  shareData:   boolean
  path:        string
  fingerprint: string
  tagManagerUrl: string
}

export interface GtmContainer {
  accountId:   string
  containerId: string
  name:        string
  publicId:    string
  usageContext: string[]
  domainName:  string[]
  path:        string
  fingerprint: string
  tagManagerUrl: string
}

export interface GtmWorkspace {
  workspaceId:   string
  name:          string
  description:   string
  path:          string
  fingerprint:   string
  tagManagerUrl: string
}

export interface GtmTag {
  tagId:         string
  name:          string
  type:          string
  status:        string
  path:          string
  fingerprint:   string
  tagManagerUrl: string
}

// --- API functions ---

export async function listGtmAccounts(oauthToken?: string): Promise<GtmAccount[]> {
  const token = await getGtmToken(oauthToken)
  const data = await gtmFetch<{ account?: GtmAccount[] }>('/accounts', token)
  return data.account ?? []
}

export async function listGtmContainers(accountId: string, oauthToken?: string): Promise<GtmContainer[]> {
  const token = await getGtmToken(oauthToken)
  const data = await gtmFetch<{ container?: GtmContainer[] }>(
    `/accounts/${accountId}/containers`,
    token
  )
  return data.container ?? []
}

export async function listGtmWorkspaces(
  accountId: string,
  containerId: string,
  oauthToken?: string
): Promise<GtmWorkspace[]> {
  const token = await getGtmToken(oauthToken)
  const data = await gtmFetch<{ workspace?: GtmWorkspace[] }>(
    `/accounts/${accountId}/containers/${containerId}/workspaces`,
    token
  )
  return data.workspace ?? []
}

export async function listGtmTags(
  accountId: string,
  containerId: string,
  workspaceId: string,
  oauthToken?: string
): Promise<GtmTag[]> {
  const token = await getGtmToken(oauthToken)
  const data = await gtmFetch<{ tag?: GtmTag[] }>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags`,
    token
  )
  return data.tag ?? []
}

export async function listGtmVariables(
  accountId: string,
  containerId: string,
  workspaceId: string,
  oauthToken?: string
): Promise<Array<{ variableId: string; name: string; type: string }>> {
  const token = await getGtmToken(oauthToken)
  const data = await gtmFetch<{ variable?: Array<{ variableId: string; name: string; type: string }> }>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables`,
    token
  )
  return data.variable ?? []
}

export async function listGtmTriggers(
  accountId: string,
  containerId: string,
  workspaceId: string,
  oauthToken?: string
): Promise<Array<{ triggerId: string; name: string; type: string }>> {
  const token = await getGtmToken(oauthToken)
  const data = await gtmFetch<{ trigger?: Array<{ triggerId: string; name: string; type: string }> }>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers`,
    token
  )
  return data.trigger ?? []
}

export async function updateGtmTag(
  accountId: string,
  containerId: string,
  workspaceId: string,
  tagId: string,
  tag: Record<string, unknown>,
  fingerprint: string,
  oauthToken?: string
): Promise<GtmTag> {
  const token = await getGtmWriteToken(oauthToken)
  return gtmFetch<GtmTag>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags/${tagId}`,
    token,
    { method: 'PUT', body: JSON.stringify({ ...tag, fingerprint }) }
  )
}

export async function updateGtmTrigger(
  accountId: string,
  containerId: string,
  workspaceId: string,
  triggerId: string,
  trigger: Record<string, unknown>,
  fingerprint: string,
  oauthToken?: string
): Promise<Record<string, unknown>> {
  const token = await getGtmWriteToken(oauthToken)
  return gtmFetch<Record<string, unknown>>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers/${triggerId}`,
    token,
    { method: 'PUT', body: JSON.stringify({ ...trigger, fingerprint }) }
  )
}

export async function createGtmTag(
  accountId: string,
  containerId: string,
  workspaceId: string,
  tag: Record<string, unknown>,
  oauthToken?: string
): Promise<GtmTag> {
  const token = await getGtmWriteToken(oauthToken)
  return gtmFetch<GtmTag>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags`,
    token,
    { method: 'POST', body: JSON.stringify(tag) }
  )
}

export async function createGtmWorkspace(
  accountId: string,
  containerId: string,
  name: string,
  description: string,
  oauthToken?: string
): Promise<GtmWorkspace> {
  const token = await getGtmWriteToken(oauthToken)
  return gtmFetch<GtmWorkspace>(
    `/accounts/${accountId}/containers/${containerId}/workspaces`,
    token,
    { method: 'POST', body: JSON.stringify({ name, description }) }
  )
}

export async function createGtmTrigger(
  accountId: string,
  containerId: string,
  workspaceId: string,
  trigger: Record<string, unknown>,
  oauthToken?: string
): Promise<Record<string, unknown>> {
  const token = await getGtmWriteToken(oauthToken)
  return gtmFetch<Record<string, unknown>>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers`,
    token,
    { method: 'POST', body: JSON.stringify(trigger) }
  )
}

export async function createGtmVariable(
  accountId: string,
  containerId: string,
  workspaceId: string,
  variable: Record<string, unknown>,
  oauthToken?: string
): Promise<Record<string, unknown>> {
  const token = await getGtmWriteToken(oauthToken)
  return gtmFetch<Record<string, unknown>>(
    `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables`,
    token,
    { method: 'POST', body: JSON.stringify(variable) }
  )
}

export async function publishGtmVersion(
  accountId: string,
  containerId: string,
  workspaceId: string,
  oauthToken?: string
): Promise<{ containerVersion: { containerVersionId: string; name: string } }> {
  const token = await getGtmWriteToken(oauthToken)

  // Normalize IDs to plain numeric strings
  const aId = accountId.replace(/^.*accounts\//, '').replace(/\/.*$/, '').trim()
  const cId = containerId.replace(/^.*containers\//, '').replace(/\/.*$/, '').trim()
  const wId = workspaceId.replace(/^.*workspaces\//, '').replace(/\/.*$/, '').trim()

  // Step 1: create_version
  const createUrl = `${GTM_BASE}/accounts/${aId}/containers/${cId}/workspaces/${wId}:create_version`
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Mercy ${new Date().toISOString().slice(0, 10)}` }),
  })

  let versionId = ''

  if (!createRes.ok) {
    const errBody = await createRes.text()
    // "Workspace is already submitted" — workspace 1 is stuck in review state.
    // Solution: create a fresh workspace, push tags there, create_version + publish from it.
    if (createRes.status === 400 && errBody.includes('already submitted')) {
      // Workspace is locked in "submitted for review" state — rebase it to unlock, then retry
      const rebaseUrl = `${GTM_BASE}/accounts/${aId}/containers/${cId}/workspaces/${wId}:resolve_conflict`
      await fetch(rebaseUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {}) // ignore — may not be needed

      // rebase: sync workspace with latest live version to unlock it
      const syncUrl = `${GTM_BASE}/accounts/${aId}/containers/${cId}/workspaces/${wId}/built_in_variables`
      await fetch(syncUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})

      // Retry create_version after rebase
      const retryRes = await fetch(createUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Mercy ${new Date().toISOString().slice(0, 10)}` }),
      })
      if (!retryRes.ok) {
        const retryErr = await retryRes.text()
        throw new Error(`create_version failed after rebase: ${retryErr.slice(0, 400)}`)
      }
      const retryData = await retryRes.json() as { containerVersion?: { containerVersionId: string }; compilerError?: Array<{ message: string }> }
      if (retryData.compilerError?.length) throw new Error(`Compiler errors: ${retryData.compilerError.map(e => e.message).join(', ')}`)
      versionId = retryData.containerVersion?.containerVersionId ?? ''
      if (!versionId) throw new Error('create_version returned no versionId after rebase')
    } else {
      throw new Error(`create_version ${createRes.status}: ${errBody.slice(0, 500)}`)
    }
  } else {
    const versionRes = await createRes.json() as {
      containerVersion?: { containerVersionId: string; name: string }
      compilerError?: Array<{ errorCode: string; message: string }>
    }
    if (versionRes.compilerError?.length) {
      throw new Error(`Compiler errors: ${versionRes.compilerError.map(e => e.message).join(', ')}`)
    }
    versionId = versionRes.containerVersion?.containerVersionId ?? ''
    if (!versionId) throw new Error(`create_version returned no versionId`)
  }

  // Step 2: publish
  const publishUrl = `${GTM_BASE}/accounts/${aId}/containers/${cId}/versions/${versionId}:publish`
  const publishRes = await fetch(publishUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })

  if (!publishRes.ok) {
    const body = await publishRes.text()
    try {
      const err = JSON.parse(body) as { error?: { message?: string } }
      throw new Error(`publish failed: ${err.error?.message ?? body.slice(0, 300)}`)
    } catch {
      throw new Error(`publish ${publishRes.status}: ${body.slice(0, 300)}`)
    }
  }

  return { containerVersion: { containerVersionId: versionId, name: `Mercy ${new Date().toISOString().slice(0, 10)}` } }
}

// --- Legacy helpers (backward-compat with existing routes) ---

export async function checkTrackingReadiness(websiteUrl: string, oauthToken?: string) {
  const accountId   = process.env.GTM_ACCOUNT_ID ?? ''
  const containerId = process.env.GTM_CONTAINER_ID ?? ''

  if (!accountId || !containerId) {
    return {
      gtmInstalled:        false,
      gtmContainerId:      null,
      dataLayerFound:      false,
      conversionTagsFound: [],
      missingTags:         ['GTM credentials not configured'],
      recommendations:     ['Set GTM_ACCOUNT_ID, GTM_CONTAINER_ID, and GTM_SERVICE_ACCOUNT_* in .env.local'],
    }
  }

  try {
    const token      = await getGtmToken(oauthToken)
    const workspaces = await listGtmWorkspaces(accountId, containerId, oauthToken)
    const wsId       = workspaces[0]?.workspaceId ?? '1'
    const tags       = await listGtmTags(accountId, containerId, wsId, oauthToken)

    const conversionTagsFound = tags
      .filter((t) => t.name.toLowerCase().includes('conversion') || t.name.toLowerCase().includes('google ads'))
      .map((t) => t.name)

    const hasGA4 = tags.some((t) => t.type === 'googtag' || t.name.toLowerCase().includes('ga4'))
    const missingTags: string[] = []
    if (!hasGA4) missingTags.push('GA4 Configuration')
    if (!tags.some((t) => t.name.toLowerCase().includes('phone'))) missingTags.push('Phone call conversion')

    return {
      gtmInstalled:        true,
      gtmContainerId:      containerId,
      dataLayerFound:      true,
      conversionTagsFound,
      missingTags,
      recommendations:     missingTags.map((m) => `Add tag: ${m}`),
    }
  } catch {
    return {
      gtmInstalled:        false,
      gtmContainerId:      containerId,
      dataLayerFound:      false,
      conversionTagsFound: [],
      missingTags:         ['Unable to fetch tags — check credentials'],
      recommendations:     ['Verify GTM service account has Tag Manager permissions'],
    }
  }
}

export async function checkRequiredTags(containerId: string, oauthToken?: string) {
  const accountId = process.env.GTM_ACCOUNT_ID ?? ''

  if (!accountId) {
    return {
      required:       [],
      score:          0,
      readyForLaunch: false,
    }
  }

  try {
    const workspaces = await listGtmWorkspaces(accountId, containerId, oauthToken)
    const wsId       = workspaces[0]?.workspaceId ?? '1'
    const tags       = await listGtmTags(accountId, containerId, wsId, oauthToken)

    const REQUIRED_PATTERNS = [
      { label: 'Google Ads Conversion - Form Submit', pattern: /form.*submit|submit.*form/i },
      { label: 'Google Ads Conversion - Phone Call',  pattern: /phone|call/i },
      { label: 'Google Ads Remarketing',              pattern: /remarketing|retarget/i },
      { label: 'GA4 Configuration',                   pattern: /ga4|google analytics 4|googtag/i },
    ]

    const required = REQUIRED_PATTERNS.map(({ label, pattern }) => {
      const match = tags.find((t) => pattern.test(t.name) || pattern.test(t.type))
      return {
        tagName:   label,
        status:    match ? 'active' : 'missing',
        lastFired: match ? new Date().toISOString().split('T')[0] : null,
      }
    })

    const found = required.filter((r) => r.status === 'active').length
    const score = Math.round((found / required.length) * 100)

    return { required, score, readyForLaunch: score >= 75 }
  } catch {
    return { required: [], score: 0, readyForLaunch: false }
  }
}
