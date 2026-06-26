import { NextRequest, NextResponse } from 'next/server'
import {
  createGtmWorkspace,
  listGtmWorkspaces,
  listGtmTags,
  listGtmTriggers,
  createGtmVariable,
  createGtmTrigger,
  createGtmTag,
  publishGtmVersion,
} from '@/lib/gtm'
import type { GtmWorkspace as AppGtmWorkspace } from '@/lib/tracking-types'

interface PushBody {
  accountId:              string
  containerId:            string
  workspace:              AppGtmWorkspace
  workspaceId?:           string  // pass to skip listWorkspaces API call entirely
  ga4MeasurementId?:      string
  googleAdsConversionId?: string
  googleAdsRemarketingId?: string
  pushRemarketing?:        boolean
  pushConversionLinker?:   boolean
}

// GTM API has a 5 QPS limit — throttle all calls
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function gtmCall<T>(fn: () => Promise<T>, label: string): Promise<T> {
  await sleep(300) // 300ms between calls = max ~3 QPS, safely under 5 QPS limit
  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        const backoff = attempt * 3000 // 3s, 6s, 9s
        console.warn(`[GTM 429] ${label} — retry ${attempt}/3 in ${backoff}ms`)
        await sleep(backoff)
        lastErr = e
      } else {
        throw e
      }
    }
  }
  throw lastErr
}

function buildGtmTagBody(
  tag: AppGtmWorkspace['tags'][0],
  triggerIds: Record<string, string>,
  ga4MeasurementId?: string,
  googleAdsConversionId?: string
) {
  const params = tag.parameters ?? {}
  const firingTriggerIds = (tag.triggers ?? [])
    .map((tName) => triggerIds[tName])
    .filter(Boolean)

  if (tag.type === 'GA4_CONFIG') {
    return {
      name: tag.name,
      type: 'googtag',
      parameter: [
        { type: 'template', key: 'id', value: ga4MeasurementId ?? String(params.measurementId ?? '{{GA4 Measurement ID}}') },
      ],
      firingTriggerId: firingTriggerIds,
    }
  }

  if (tag.type === 'GA4_EVENT') {
    return {
      name: tag.name,
      type: 'gaawe',
      parameter: [
        { type: 'template', key: 'eventName', value: String(params.eventName ?? '') },
        { type: 'template', key: 'measurementIdOverride', value: ga4MeasurementId ?? '{{GA4 Measurement ID}}' },
        ...(Object.entries(params)
          .filter(([k]) => k !== 'eventName')
          .map(([k, v]) => ({ type: 'template', key: k, value: String(v) }))),
      ],
      firingTriggerId: firingTriggerIds,
    }
  }

  if (tag.type === 'AW_CONVERSION') {
    const convId = googleAdsConversionId ?? 'AW-XXXXXXXXX'
    return {
      name: tag.name,
      type: 'awct',
      parameter: [
        { type: 'template', key: 'conversionId', value: convId },
        { type: 'template', key: 'conversionLabel', value: String(params.conversionLabel ?? 'XXXXX') },
      ],
      firingTriggerId: firingTriggerIds,
    }
  }

  // Fallback: custom HTML
  return {
    name: tag.name,
    type: 'html',
    parameter: [
      { type: 'template', key: 'html', value: `<!-- ${tag.name} -->\n<script>console.log('${String(params.eventName ?? tag.name)}');</script>` },
    ],
    firingTriggerId: firingTriggerIds,
  }
}

function buildGtmTriggerBody(trigger: AppGtmWorkspace['triggers'][0]) {
  if (trigger.type === 'PAGEVIEW') {
    if (!trigger.conditions || trigger.conditions.length === 0) {
      return { name: trigger.name, type: 'pageview' }
    }
    return {
      name: trigger.name,
      type: 'pageview',
      filter: trigger.conditions.map((c) => ({
        type: 'contains',
        parameter: [
          { type: 'template', key: 'arg0', value: `{{${c.variable}}}` },
          { type: 'template', key: 'arg1', value: c.value },
        ],
      })),
    }
  }

  if (trigger.type === 'FORM') {
    return {
      name: trigger.name,
      type: 'formSubmission',
      waitForTags: [{ type: 'boolean', key: 'value', value: 'true' }],
      checkValidation: [{ type: 'boolean', key: 'value', value: 'false' }],
    }
  }

  if (trigger.type === 'CLICK') {
    if (!trigger.conditions || trigger.conditions.length === 0) {
      return { name: trigger.name, type: 'linkClick' }
    }
    const cond = trigger.conditions[0]
    const opMap: Record<string, string> = { contains: 'contains', startsWith: 'startsWith', equals: 'equals' }
    return {
      name: trigger.name,
      type: 'linkClick',
      filter: [{
        type: opMap[cond.operator] ?? 'contains',
        parameter: [
          { type: 'template', key: 'arg0', value: `{{${cond.variable}}}` },
          { type: 'template', key: 'arg1', value: cond.value },
        ],
      }],
    }
  }

  return {
    name: trigger.name,
    type: 'customEvent',
    customEventFilter: [{
      type: 'equals',
      parameter: [
        { type: 'template', key: 'arg0', value: '{{_event}}' },
        { type: 'template', key: 'arg1', value: trigger.conditions?.[0]?.value ?? trigger.name },
      ],
    }],
  }
}

function buildInitTriggerBody(name: string) {
  return { name, type: 'consentInit' }
}

function buildConversionLinkerTagBody(initTriggerId: string) {
  const html = `<script>
/* CVC - Conversion Linker */
(function(){
  if(typeof gtag !== 'undefined'){
    gtag('set', 'linker', { 'accept_incoming': true });
  }
  if(window.google_tag_data){ window.google_tag_data.gl = window.google_tag_data.gl || {}; }
})();
<\/script>`
  return {
    name: 'CVC - Conversion Linker',
    type: 'html',
    parameter: [
      { type: 'template', key: 'html', value: html },
      { type: 'boolean',  key: 'supportDocumentWrite', value: 'false' },
    ],
    firingTriggerId: [initTriggerId],
  }
}

function buildRemarketingTagBody(initTriggerId: string, remarketingId: string) {
  const awId = remarketingId.startsWith('AW-') ? remarketingId : `AW-${remarketingId.replace(/^AW-/i, '')}`
  const html = `<script>
/* CVC - Google Ads Remarketing */
(function(){
  if(typeof gtag !== 'undefined'){
    gtag('event', 'page_view', { 'send_to': '${awId}' });
  } else {
    var s=document.createElement('script');
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
  return {
    name: 'CVC - Google Ads Remarketing',
    type: 'html',
    parameter: [
      { type: 'template', key: 'html', value: html },
      { type: 'boolean',  key: 'supportDocumentWrite', value: 'false' },
    ],
    firingTriggerId: [initTriggerId],
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-access-token') ?? undefined
  if (!token) return NextResponse.json({ error: 'No access token' }, { status: 401 })

  try {
    const body = await req.json() as PushBody
    const {
      accountId, containerId, workspace,
      ga4MeasurementId, googleAdsConversionId,
      googleAdsRemarketingId, pushRemarketing, pushConversionLinker,
    } = body

    const log: string[] = []

    // 1. Resolve workspace — skip listWorkspaces if caller passes workspaceId directly
    const WS_NAME = 'Mercy Tracking'
    let workspaceId = body.workspaceId ?? ''

    if (workspaceId) {
      log.push(`✓ Using workspace ID: ${workspaceId} (caller-supplied, skipped list)`)
    } else {
      const existingWorkspaces = await gtmCall(
        () => listGtmWorkspaces(accountId, containerId, token),
        'listWorkspaces'
      )
      const existingWs = existingWorkspaces.find(w => w.name === WS_NAME || w.name.startsWith(WS_NAME))

      if (existingWs) {
        workspaceId = existingWs.workspaceId
        log.push(`✓ Using workspace: ${existingWs.name} (ID: ${workspaceId})`)
      } else {
        const ws = await gtmCall(
          () => createGtmWorkspace(accountId, containerId, WS_NAME, 'Auto-generated by Convert Cake', token),
          'createWorkspace'
        )
        workspaceId = ws.workspaceId
        log.push(`✓ Workspace created: ${WS_NAME} (ID: ${workspaceId})`)
      }
    }

    // 2. Create variables — throttled, skip on duplicate name error
    const varDefs = [
      { name: 'DL - Event',     type: 'v', parameter: [{ type: 'template', key: 'name', value: 'event' }] },
      { name: 'DL - Form ID',   type: 'v', parameter: [{ type: 'template', key: 'name', value: 'formId' }] },
      { name: 'DL - Form Name', type: 'v', parameter: [{ type: 'template', key: 'name', value: 'formName' }] },
      { name: 'JS - Page URL',  type: 'u', parameter: [{ type: 'template', key: 'component', value: 'URL' }] },
    ]
    if (ga4MeasurementId) {
      varDefs.push({ name: 'GA4 Measurement ID', type: 'c', parameter: [{ type: 'template', key: 'value', value: ga4MeasurementId }] })
    }
    for (const v of varDefs) {
      try {
        await gtmCall(() => createGtmVariable(accountId, containerId, workspaceId, v, token), `var:${v.name}`)
        log.push(`✓ Variable: ${v.name}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('409')) {
          log.push(`⚠ Variable already exists — skipping: ${v.name}`)
        } else {
          log.push(`⚠ Variable ${v.name}: ${msg.slice(0, 120)}`)
        }
      }
    }

    // 3. Check existing tags + triggers in workspace — skip creation if already there
    const existingTags = await gtmCall(
      () => listGtmTags(accountId, containerId, workspaceId, token),
      'listTags'
    )
    const existingTriggers = await gtmCall(
      () => listGtmTriggers(accountId, containerId, workspaceId, token),
      'listTriggers'
    )
    const existingTagNames = new Set(existingTags.map(t => t.name))
    const existingTriggerMap: Record<string, string> = {}
    for (const t of existingTriggers) existingTriggerMap[t.name] = t.triggerId

    log.push(`ℹ existing tags: [${Array.from(existingTagNames).join(', ') || 'none'}]`)

    const triggerIdMap: Record<string, string> = { ...existingTriggerMap }

    // 4. Create trigger only if missing
    const needsInitTrigger = pushRemarketing || pushConversionLinker
    let initTriggerId = ''
    if (needsInitTrigger) {
      const initTrigName = 'Initialization - All Pages'
      if (existingTriggerMap[initTrigName]) {
        initTriggerId = existingTriggerMap[initTrigName]
        log.push(`✓ Trigger already exists: ${initTrigName} (ID: ${initTriggerId})`)
      } else {
        try {
          const initResult = await gtmCall(
            () => createGtmTrigger(accountId, containerId, workspaceId, buildInitTriggerBody(initTrigName), token),
            `trigger:${initTrigName}`
          ) as Record<string, unknown>
          initTriggerId = String(initResult.triggerId ?? '')
          triggerIdMap[initTrigName] = initTriggerId
          log.push(`✓ Trigger created: ${initTrigName} (ID: ${initTriggerId})`)
        } catch (e) {
          log.push(`⚠ Trigger ${initTrigName}: ${e instanceof Error ? e.message.slice(0, 120) : ''}`)
        }
      }
    }

    for (const trigger of workspace.triggers ?? []) {
      if (existingTriggerMap[trigger.name]) {
        triggerIdMap[trigger.name] = existingTriggerMap[trigger.name]
        log.push(`✓ Trigger already exists: ${trigger.name}`)
      } else {
        try {
          const result = await gtmCall(
            () => createGtmTrigger(accountId, containerId, workspaceId, buildGtmTriggerBody(trigger), token),
            `trigger:${trigger.name}`
          ) as Record<string, unknown>
          triggerIdMap[trigger.name] = String(result.triggerId ?? '')
          log.push(`✓ Trigger created: ${trigger.name}`)
        } catch (e) {
          log.push(`⚠ Trigger ${trigger.name}: ${e instanceof Error ? e.message.slice(0, 120) : ''}`)
        }
      }
    }

    // 5. Create workspace tags — skip if name already exists
    for (const tag of workspace.tags ?? []) {
      if (existingTagNames.has(tag.name)) {
        log.push(`✓ Tag already exists — skipping: ${tag.name}`)
      } else {
        try {
          const tagBody = buildGtmTagBody(tag, triggerIdMap, ga4MeasurementId, googleAdsConversionId)
          await gtmCall(() => createGtmTag(accountId, containerId, workspaceId, tagBody, token), `tag:${tag.name}`)
          log.push(`✓ Tag created: ${tag.name}`)
        } catch (e) {
          log.push(`⚠ Tag ${tag.name}: ${e instanceof Error ? e.message.slice(0, 120) : ''}`)
        }
      }
    }

    // 6. Conversion Linker tag
    if (pushConversionLinker) {
      const clTagName = 'CVC - Conversion Linker'
      if (existingTagNames.has(clTagName)) {
        log.push(`✓ Tag already exists — skipping: ${clTagName}`)
      } else if (initTriggerId) {
        try {
          await gtmCall(() => createGtmTag(accountId, containerId, workspaceId, buildConversionLinkerTagBody(initTriggerId), token), `tag:${clTagName}`)
          log.push(`✓ Tag created: ${clTagName}`)
        } catch (e) {
          log.push(`⚠ Tag Conversion Linker: ${e instanceof Error ? e.message.slice(0, 120) : ''}`)
        }
      }
    }

    // 7. Google Ads Remarketing tag
    if (pushRemarketing) {
      const rmTagName = 'CVC - Google Ads Remarketing'
      const awRemarketingId = googleAdsRemarketingId ?? googleAdsConversionId ?? ''
      if (!awRemarketingId) {
        log.push('⚠ Tag Remarketing: ไม่มี Conversion ID — ข้าม')
      } else if (existingTagNames.has(rmTagName)) {
        log.push(`✓ Tag already exists — skipping: ${rmTagName} (${awRemarketingId})`)
      } else if (initTriggerId) {
        try {
          await gtmCall(() => createGtmTag(accountId, containerId, workspaceId, buildRemarketingTagBody(initTriggerId, awRemarketingId), token), `tag:${rmTagName}`)
          log.push(`✓ Tag created: ${rmTagName} (${awRemarketingId})`)
        } catch (e) {
          log.push(`⚠ Tag Remarketing: ${e instanceof Error ? e.message.slice(0, 120) : ''}`)
        }
      }
    }

    // 7. Publish
    await sleep(500) // extra buffer before publish
    let publishedVersionId = ''
    try {
      const pubResult = await gtmCall(
        () => publishGtmVersion(accountId, containerId, workspaceId, token),
        'publishVersion'
      )
      publishedVersionId = pubResult.containerVersion.containerVersionId
      log.push(`✓ Published! GTM Version: ${publishedVersionId}`)
    } catch (pubErr) {
      log.push(`⚠ Publish failed (tags pushed but not live): ${pubErr instanceof Error ? pubErr.message.slice(0, 200) : String(pubErr)}`)
    }

    return NextResponse.json({
      success: true,
      workspaceId,
      publishedVersionId,
      log,
      tagCount:     (workspace.tags ?? []).length,
      triggerCount: (workspace.triggers ?? []).length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Push failed' }, { status: 500 })
  }
}
