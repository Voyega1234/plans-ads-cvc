import { NextRequest, NextResponse } from 'next/server'
import { listGtmTags, updateGtmTag } from '@/lib/gtm'

// Back-fills the REAL Google Ads conversion ID + label into the AW conversion tags
// that were pushed with placeholders (AW-XXXXXXXXX / XXXXX). Called right after the
// conversion actions get created — this is what makes conversions actually fire.

interface Mapping { eventName: string; awId: string; label: string }

interface Body {
  accountId:   string
  containerId: string
  workspaceId: string
  mappings:    Mapping[]
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-access-token') ?? undefined
  try {
    const { accountId, containerId, workspaceId, mappings } = await req.json() as Body
    if (!accountId || !containerId || !workspaceId) {
      return NextResponse.json({ error: 'accountId, containerId, workspaceId required' }, { status: 400 })
    }
    const valid = (mappings ?? []).filter(m => m.eventName && m.awId && m.label)
    if (valid.length === 0) {
      return NextResponse.json({ error: 'no valid mappings (ต้องมี awId + label จาก create-conversion)' }, { status: 400 })
    }

    const tags = await listGtmTags(accountId, containerId, workspaceId, token) as Array<{
      tagId: string; name: string; type: string; fingerprint?: string
      parameter?: Array<{ type: string; key: string; value?: string }>
      firingTriggerId?: string[]
    }>

    const log: string[] = []
    let updated = 0
    for (const tag of tags) {
      if (tag.type !== 'awct') continue
      // GTM tag names: "CVC - GG Ads - {event}" or legacy "Google Ads - {event}"
      const mapping = valid.find(m => tag.name.endsWith(m.eventName) || tag.name.includes(m.eventName))
      if (!mapping) { log.push(`⚠ ไม่พบ mapping สำหรับ tag: ${tag.name}`); continue }

      const params = (tag.parameter ?? []).filter(p => p.key !== 'conversionId' && p.key !== 'conversionLabel')
      params.push({ type: 'template', key: 'conversionId', value: mapping.awId })
      params.push({ type: 'template', key: 'conversionLabel', value: mapping.label })

      await updateGtmTag(accountId, containerId, workspaceId, tag.tagId, {
        name: tag.name,
        type: tag.type,
        parameter: params,
        firingTriggerId: tag.firingTriggerId ?? [],
      }, tag.fingerprint ?? '', token)
      updated++
      log.push(`✓ ${tag.name} → ${mapping.awId}/${mapping.label}`)
    }

    return NextResponse.json({ success: true, updated, log })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
