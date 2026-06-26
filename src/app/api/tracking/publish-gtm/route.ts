import { NextRequest, NextResponse } from 'next/server'
import { publishGtmVersion } from '@/lib/gtm'

const GTM_BASE = 'https://www.googleapis.com/tagmanager/v2'

// Fetch the latest live version of a container to publish
async function getLatestVersionId(accountId: string, containerId: string, token: string): Promise<string | null> {
  const res = await fetch(
    `${GTM_BASE}/accounts/${accountId}/containers/${containerId}/versions`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return null
  const data = await res.json() as {
    containerVersion?: Array<{ containerVersionId: string; deleted?: boolean }>
  }
  const versions = (data.containerVersion ?? []).filter(v => !v.deleted)
  if (versions.length === 0) return null
  // Last in list is newest
  return versions[versions.length - 1].containerVersionId
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-access-token') ?? undefined
  if (!token) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  try {
    const body = await req.json() as { accountId?: string; containerId?: string; workspaceId?: string }
    const { accountId, containerId, workspaceId } = body

    if (!accountId || !containerId || !workspaceId) {
      return NextResponse.json(
        { error: `Missing: ${[!accountId && 'accountId', !containerId && 'containerId', !workspaceId && 'workspaceId'].filter(Boolean).join(', ')}` },
        { status: 400 }
      )
    }

    let versionId: string | null = null
    let versionName = ''

    try {
      const result = await publishGtmVersion(accountId, containerId, workspaceId, token)
      versionId = result.containerVersion.containerVersionId
      versionName = result.containerVersion.name
    } catch (createErr) {
      const msg = createErr instanceof Error ? createErr.message : ''

      // If workspace has no pending changes, create_version may fail or publish may 404
      // Fall back: publish the latest existing version directly
      if (msg.includes('NOT_FOUND') || msg.includes('404') || msg.includes('permission denied') || msg.includes('no versionId')) {
        const latestId = await getLatestVersionId(accountId, containerId, token)
        if (!latestId) throw new Error(`Workspace has no changes and no existing version to publish. Push tags first.`)

        const aId = accountId.replace(/^.*accounts\//, '').replace(/\/.*$/, '')
        const cId = containerId.replace(/^.*containers\//, '').replace(/\/.*$/, '')
        const publishRes = await fetch(
          `${GTM_BASE}/accounts/${aId}/containers/${cId}/versions/${latestId}:publish`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          }
        )
        if (!publishRes.ok) {
          const errBody = await publishRes.text()
          try {
            const errJson = JSON.parse(errBody) as { error?: { message?: string } }
            throw new Error(`publish failed: ${errJson.error?.message ?? errBody.slice(0, 300)}`)
          } catch { throw new Error(`publish ${publishRes.status}: ${errBody.slice(0, 300)}`) }
        }
        versionId = latestId
        versionName = 'latest'
      } else {
        throw createErr
      }
    }

    return NextResponse.json({
      success: true,
      versionId,
      versionName,
      message: `GTM Version ${versionId} published successfully`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Publish failed'
    console.error('[publish-gtm]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
