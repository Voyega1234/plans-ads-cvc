/**
 * Optimization Log — ดึง Change History จริงจาก Google Ads (change_event)
 * GET /api/optimization-log?customerId=xxx&dateRange=LAST_7_DAYS|TODAY|...|CUSTOM_YYYY-MM-DD_YYYY-MM-DD
 *
 * ข้อจำกัดของ Google Ads API (v21):
 *  - change_event ย้อนหลังได้สูงสุด ~30 วัน → ช่วงที่เกินจะถูก clamp พร้อม flag `clamped`
 *  - ต้องมี WHERE change_date_time + LIMIT เสมอ
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { isMockMode } from '@/lib/google-ads/client'

const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const LOGIN_CID = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

export interface OptimizationLogEntry {
  id: string
  dateTime: string          // "2026-07-05 14:22:01"
  campaign: string | null
  adGroup: string | null
  resourceType: string      // CAMPAIGN_BUDGET, AD_GROUP_CRITERION, ...
  operation: string         // CREATE / UPDATE / REMOVE
  changedBy: string         // user email
  clientType: string        // GOOGLE_ADS_WEB_CLIENT / GOOGLE_ADS_API ...
  changedFields: string[]
  changes: { field: string; before: string; after: string }[]
  impact: 'LOW' | 'MEDIUM' | 'HIGH'
  detail: string            // สรุปสั้น 1 บรรทัด (rule-based)
  count: number             // รายการซ้ำถูก group (เช่น bulk create asset ×640)
}

// ── date range → [start, end] (YYYY-MM-DD HH:mm:ss) ──
function resolveRange(dateRange: string): { start: Date; end: Date; label: string } {
  const now = new Date()
  const d = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const today = d(now)
  const endOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 59)
  const m = dateRange.match(/^CUSTOM_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/)
  if (m) return { start: new Date(`${m[1]}T00:00:00`), end: new Date(`${m[2]}T23:59:59`), label: `${m[1]} – ${m[2]}` }
  switch (dateRange) {
    case 'TODAY':        return { start: today, end: endOfDay(today), label: 'วันนี้' }
    case 'YESTERDAY': {  const y = new Date(today); y.setDate(y.getDate() - 1); return { start: y, end: endOfDay(y), label: 'เมื่อวาน' } }
    case 'LAST_7_DAYS':  { const s = new Date(today); s.setDate(s.getDate() - 6);  return { start: s, end: endOfDay(today), label: '7 วันล่าสุด' } }
    case 'LAST_14_DAYS': { const s = new Date(today); s.setDate(s.getDate() - 13); return { start: s, end: endOfDay(today), label: '14 วันล่าสุด' } }
    case 'LAST_MONTH': { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { start: s, end: endOfDay(e), label: 'เดือนที่แล้ว' } }
    case 'THIS_MONTH': { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { start: s, end: endOfDay(today), label: 'เดือนนี้' } }
    case 'LAST_30_DAYS':
    default:             { const s = new Date(today); s.setDate(s.getDate() - 29); return { start: s, end: endOfDay(today), label: '30 วันล่าสุด' } }
  }
}

const fmtDT = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}:${String(x.getSeconds()).padStart(2, '0')}`

// ── impact heuristic ──
function impactOf(resourceType: string, fields: string[]): OptimizationLogEntry['impact'] {
  const f = fields.join(',')
  if (resourceType === 'CAMPAIGN_BUDGET' || resourceType === 'BIDDING_STRATEGY') return 'HIGH'
  if (resourceType === 'CAMPAIGN' && /status|bidding|target_cpa|target_roas|budget/.test(f)) return 'HIGH'
  if (['CAMPAIGN', 'AD_GROUP', 'AD_GROUP_AD', 'AD_GROUP_CRITERION', 'CAMPAIGN_CRITERION', 'AD_GROUP_BID_MODIFIER'].includes(resourceType)) return 'MEDIUM'
  return 'LOW'
}

// ดึงค่า before/after ตาม changed_fields path จาก old/new resource (REST = camelCase)
function getPath(obj: unknown, path: string): unknown {
  const camel = path.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  let cur: any = obj
  for (const part of camel.split('.')) {
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}
function fmtVal(field: string, v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (/micros/i.test(field) && !isNaN(Number(v))) return `฿${(Number(v) / 1_000_000).toLocaleString()}`
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80)
  return String(v).slice(0, 80)
}

const MOCK: OptimizationLogEntry[] = [{
  id: 'mock-1', dateTime: '2026-07-05 10:00:00', campaign: 'CVC - Demo Campaign', adGroup: null,
  resourceType: 'CAMPAIGN_BUDGET', operation: 'UPDATE', changedBy: 'demo@convertcake.com', clientType: 'GOOGLE_ADS_WEB_CLIENT',
  changedFields: ['amount_micros'], changes: [{ field: 'amount_micros', before: '฿300', after: '฿500' }],
  impact: 'HIGH', detail: 'ปรับงบรายวัน ฿300 → ฿500', count: 1,
}]

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId')
  const dateRange = req.nextUrl.searchParams.get('dateRange') ?? 'LAST_7_DAYS'
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  if (isMockMode()) return NextResponse.json({ entries: MOCK, rangeLabel: 'mock', clamped: false })

  try {
    const { start, end, label } = resolveRange(dateRange)
    // Google จำกัด change_event ~30 วันย้อนหลัง
    const minStart = new Date(Date.now() - 29 * 24 * 3600 * 1000)
    const clamped = start < minStart
    const effStart = clamped ? minStart : start

    const token = await getGoogleAdsAccessToken()
    const cid = customerId.replace(/-/g, '')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`, 'developer-token': DEV_TOKEN, 'Content-Type': 'application/json',
      ...(LOGIN_CID ? { 'login-customer-id': LOGIN_CID } : {}),
    }
    const query = `
      SELECT change_event.change_date_time, change_event.change_resource_type, change_event.client_type,
             change_event.user_email, change_event.old_resource, change_event.new_resource,
             change_event.resource_change_operation, change_event.changed_fields,
             campaign.name, ad_group.name
      FROM change_event
      WHERE change_event.change_date_time >= '${fmtDT(effStart)}'
        AND change_event.change_date_time <= '${fmtDT(end)}'
      ORDER BY change_event.change_date_time DESC
      LIMIT 2000`
    const res = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`, {
      method: 'POST', headers, body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error(`GAQL change_event ${res.status}: ${(await res.text()).slice(0, 400)}`)
    const chunks = await res.json() as Array<{ results?: any[] }>
    const rows = chunks.flatMap(c => c.results ?? [])

    const entries: OptimizationLogEntry[] = rows.map((r, i) => {
      const ev = r.changeEvent ?? {}
      const fields: string[] = (ev.changedFields ?? '').split(',').map((x: string) => x.trim()).filter(Boolean)
      // old/new resource ห่อด้วย key ตามชนิด เช่น { campaignBudget: {...} }
      const unwrap = (o: any) => (o && typeof o === 'object') ? (Object.values(o)[0] ?? {}) : {}
      const oldR = unwrap(ev.oldResource), newR = unwrap(ev.newResource)
      const changes = fields.slice(0, 8).map(f => ({
        field: f,
        before: fmtVal(f, getPath(oldR, f)),
        after: fmtVal(f, getPath(newR, f)),
      })).filter(c => c.before !== c.after || c.before === '—')
      const op = (ev.resourceChangeOperation ?? '').replace('RESOURCE_CHANGE_OPERATION_', '')
      const rt = (ev.changeResourceType ?? '').replace('CHANGE_EVENT_RESOURCE_TYPE_', '')
      const detail =
        op === 'CREATE' ? `สร้าง ${rt} ใหม่` :
        op === 'REMOVE' ? `ลบ ${rt}` :
        changes.length > 0 ? changes.map(c => `${c.field}: ${c.before} → ${c.after}`).join(' · ') :
        `แก้ไข ${rt}`
      return {
        id: `${i}-${ev.changeDateTime ?? ''}`,
        dateTime: ev.changeDateTime ?? '',
        campaign: r.campaign?.name ?? null,
        adGroup: r.adGroup?.name ?? null,
        resourceType: rt || 'UNKNOWN',
        operation: op || 'UPDATE',
        changedBy: ev.userEmail ?? '—',
        clientType: (ev.clientType ?? '').replace('CHANGE_CLIENT_TYPE_', ''),
        changedFields: fields,
        changes,
        impact: impactOf(rt, fields),
        detail,
        count: 1,
      }
    })

    // Group รายการซ้ำ (bulk เช่นสร้าง asset 600 ตัวในนาทีเดียว) → แถวเดียว ×N กัน spam กลบของสำคัญ
    const grouped: OptimizationLogEntry[] = []
    const idx = new Map<string, number>()
    for (const e of entries) {
      const key = [e.dateTime.slice(0, 16), e.campaign, e.adGroup, e.resourceType, e.operation, e.detail, e.changedBy].join('|')
      const at = idx.get(key)
      if (at !== undefined) grouped[at].count++
      else { idx.set(key, grouped.length); grouped.push({ ...e }) }
    }

    return NextResponse.json({ entries: grouped, rangeLabel: label, clamped, total: entries.length, groupedTotal: grouped.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
