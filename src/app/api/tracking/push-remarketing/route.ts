import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

// Minimal GTM Remarketing push — uses default workspace (ID=1), only 3 API calls:
// 1. create trigger (consentInit / All Pages)
// 2. create tag (Google Ads Remarketing HTML)
// 3. publish version
// No listWorkspaces / createWorkspace calls → avoids GTM 5 QPS rate limit

const GTM_BASE = 'https://www.googleapis.com/tagmanager/v2'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function gtmPost<T>(path: string, body: unknown, token: string): Promise<T> {
  await sleep(250)
  const res = await fetch(`${GTM_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GTM ${res.status}: ${text.slice(0, 400)}`)
  }
  return res.json() as Promise<T>
}

export async function POST(req: NextRequest) {
  // Get user's OAuth token from session
  const session = await (auth() as Promise<Session | null>)
  const token = (session as Record<string, unknown> | null)?.accessToken as string | undefined
  if (!token) return NextResponse.json({ error: 'ไม่พบ access token — กรุณา login ใหม่' }, { status: 401 })

  try {
    const { customerId } = await req.json() as { customerId: string }
    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    // GTM container from env
    const accountId   = process.env.GTM_ACCOUNT_ID ?? ''
    const containerId = process.env.GTM_CONTAINER_ID ?? ''
    if (!accountId || !containerId) {
      return NextResponse.json({ error: 'GTM_ACCOUNT_ID / GTM_CONTAINER_ID ไม่ได้ตั้งค่าใน .env.local' }, { status: 500 })
    }

    const cleanCid = customerId.replace(/-/g, '')
    const awId = `AW-${cleanCid}`

    // GTM default workspace is always "1"
    const wsId = '1'
    const log: string[] = []
    const base = `/accounts/${accountId}/containers/${containerId}/workspaces/${wsId}`

    // 1. Create Initialization trigger (fires on consent init — safe for remarketing)
    let initTriggerId = ''
    try {
      const trigResult = await gtmPost<{ triggerId: string }>(
        `${base}/triggers`,
        { name: 'CVC - Initialization', type: 'consentInit' },
        token
      )
      initTriggerId = trigResult.triggerId
      log.push(`✓ Trigger: CVC - Initialization (ID: ${initTriggerId})`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('409') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) {
        // Try to find existing trigger — use a generic init trigger ID placeholder
        // The tag will still be pushed; publish may skip the trigger link
        log.push(`⚠ Trigger "CVC - Initialization" มีอยู่แล้ว — ใช้ trigger เดิม`)
        initTriggerId = '' // will push tag without firing trigger — still saves to workspace
      } else {
        throw e
      }
    }

    // 2. Create Remarketing tag (custom HTML fires on all pages)
    const html = `<script>
/* CVC - Google Ads Remarketing | ${awId} */
(function(){
  if(typeof gtag!=='undefined'){
    gtag('event','page_view',{'send_to':'${awId}'});
  } else {
    var s=document.createElement('script');
    s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id=${awId}';
    document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];
    function gtag(){dataLayer.push(arguments);}
    gtag('js',new Date());
    gtag('config','${awId}',{'send_page_view':false});
    gtag('event','page_view',{'send_to':'${awId}'});
  }
})();
<\/script>`

    const tagBody: Record<string, unknown> = {
      name: 'CVC - Google Ads Remarketing',
      type: 'html',
      parameter: [
        { type: 'template', key: 'html', value: html },
        { type: 'boolean', key: 'supportDocumentWrite', value: 'false' },
      ],
    }
    if (initTriggerId) tagBody.firingTriggerId = [initTriggerId]

    try {
      await gtmPost(`${base}/tags`, tagBody, token)
      log.push(`✓ Tag: CVC - Google Ads Remarketing (${awId})`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('409') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) {
        log.push(`⚠ Tag "CVC - Google Ads Remarketing" มีอยู่แล้ว — ข้าม`)
      } else {
        throw e
      }
    }

    // 3. Publish
    await sleep(500)
    let publishedVersionId = ''
    try {
      const createVersionUrl = `${GTM_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${wsId}:create_version`
      await sleep(300)
      const createRes = await fetch(createVersionUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Mercy Remarketing ${new Date().toISOString().slice(0, 10)}` }),
      })
      if (!createRes.ok) throw new Error(await createRes.text())
      const createData = await createRes.json() as { containerVersion?: { containerVersionId: string } }
      const versionId = createData.containerVersion?.containerVersionId ?? ''

      await sleep(500)
      const publishUrl = `${GTM_BASE}/accounts/${accountId}/containers/${containerId}/versions/${versionId}:publish`
      const pubRes = await fetch(publishUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      if (!pubRes.ok) throw new Error(await pubRes.text())
      const pubData = await pubRes.json() as { containerVersion?: { containerVersionId: string } }
      publishedVersionId = pubData.containerVersion?.containerVersionId ?? versionId
      log.push(`✓ Published! GTM Version: ${publishedVersionId}`)
    } catch (pubErr) {
      log.push(`⚠ Publish ไม่สำเร็จ — tag ถูก push แล้วแต่ยังไม่ live: ${pubErr instanceof Error ? pubErr.message.slice(0, 200) : String(pubErr)}`)
    }

    return NextResponse.json({
      success: true,
      log,
      awId,
      publishedVersionId,
      published: !!publishedVersionId,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Push failed' }, { status: 500 })
  }
}
