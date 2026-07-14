/**
 * Optimization Log — AI explanation
 * POST /api/optimization-log/ai
 *  { mode: 'explain', entry, accountName }            → อธิบาย log รายตัวแบบ client-friendly
 *  { mode: 'summary', entries[], rangeLabel, accountName } → สรุปรวมทั้งช่วงเป็นเรื่องเดียว
 */

export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { callAI, isRealAI } from '@/lib/ai/provider'

// AI มักตอบ free-text/JSON ปนกัน — แกะเป็นเนื้อความเสมอ (อย่าบังคับ JSON แล้ว fallback ทิ้ง)
function unwrapText(raw: string): string {
  let t = (raw ?? '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim()
  if (t.startsWith('{')) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>
      const firstStr = Object.values(obj).find(v => typeof v === 'string' && v.length > 20)
      if (typeof firstStr === 'string') return firstStr.trim()
    } catch { /* JSON เพี้ยน (เช่นมี newline จริงใน string) — ดึงค่า key แรกด้วย regex ไม่สน key ชื่ออะไร */
      const m = t.match(/"[a-zA-Z_]+"\s*:\s*"([\s\S]*?)"\s*[,}]/)
      if (m && m[1].length > 20) return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
    }
  }
  return t
}

interface LogEntryLite {
  dateTime: string
  campaign: string | null
  adGroup: string | null
  resourceType: string
  operation: string
  changedBy: string
  detail: string
  impact: string
  count?: number
}

const entryLine = (e: LogEntryLite) =>
  `- [${e.dateTime}] ${e.campaign ?? '(account)'}${e.adGroup ? ` > ${e.adGroup}` : ''} · ${e.resourceType} ${e.operation}${(e.count ?? 1) > 1 ? ` ×${e.count}` : ''} · ${e.detail} · โดย ${e.changedBy} · impact ${e.impact}`

// สรุปยอดแบบ digest — ให้ AI เห็นภาพรวมจริงแทนบรรทัดดิบ 80 บรรทัดแรก
// (บัญชีจริงมี bulk operation เช่น สร้าง asset ×1,900 ที่กลบการปรับสำคัญ)
function buildDigest(entries: LogEntryLite[]): string {
  const n = (e: LogEntryLite) => e.count ?? 1
  const total = entries.reduce((s, e) => s + n(e), 0)
  const byType = new Map<string, number>()
  const byCampaign = new Map<string, number>()
  const actors = new Map<string, number>()
  for (const e of entries) {
    const t = `${e.resourceType} ${e.operation}`
    byType.set(t, (byType.get(t) ?? 0) + n(e))
    if (e.campaign) byCampaign.set(e.campaign, (byCampaign.get(e.campaign) ?? 0) + n(e))
    actors.set(e.changedBy, (actors.get(e.changedBy) ?? 0) + n(e))
  }
  const top = (m: Map<string, number>, k: number) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, k)
  const highs = entries.filter(e => e.impact === 'HIGH').slice(0, 15)
  const meds = entries.filter(e => e.impact === 'MEDIUM' && e.resourceType !== 'ASSET').slice(0, 10)
  return [
    `รวมทั้งหมด ${total} การเปลี่ยนแปลง`,
    `ประเภท: ${top(byType, 8).map(([t, c]) => `${t} ×${c}`).join(', ')}`,
    `แคมเปญที่ถูกปรับมากสุด: ${top(byCampaign, 5).map(([t, c]) => `${t} (${c})`).join(', ') || '—'}`,
    `ผู้ปรับ: ${top(actors, 4).map(([t, c]) => `${t} (${c})`).join(', ')}`,
    highs.length ? `\nรายการ HIGH impact (สำคัญสุด):\n${highs.map(entryLine).join('\n')}` : '',
    meds.length ? `\nรายการ MEDIUM ที่น่าสนใจ:\n${meds.map(entryLine).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const accountName = (body.accountName as string) ?? 'บัญชีนี้'

    if (body.mode === 'explain') {
      const e = body.entry as LogEntryLite
      if (!e) return NextResponse.json({ error: 'entry required' }, { status: 400 })
      const fallback = `⚠ AI ไม่พร้อมใช้งานขณะนี้ (เช็คการตั้งค่า AI provider) — ข้อมูลดิบ: ${e.detail} ใน ${e.campaign ?? 'ระดับบัญชี'} โดย ${e.changedBy}`
      if (!isRealAI()) return NextResponse.json({ text: fallback })
      try {
        const raw = await callAI(
          `คุณคือ Senior Performance Marketer อธิบายการปรับแคมเปญ Google Ads ให้ Account Manager เอาไปคุยกับลูกค้าได้

การเปลี่ยนแปลง (บัญชี ${accountName}):
${entryLine(e)}

เขียนคำอธิบายภาษาไทย 1 ย่อหน้า (3-5 ประโยค) ครอบคลุม: ปรับอะไร · เหตุผลที่ทีมมักปรับแบบนี้ · โอกาสที่จะดีขึ้น · ความเสี่ยง/สิ่งที่ต้องติดตาม · น้ำเสียงมืออาชีพ เข้าใจง่าย ไม่ใช้ศัพท์เทคนิคเกินจำเป็น ห้ามการันตีผลลัพธ์ · ตอบเฉพาะเนื้อความ ไม่ต้องมีหัวข้อหรือ JSON`,
          { tier: 'standard', _route: '/api/optimization-log/ai' }
        )
        const text = unwrapText(raw)
        return NextResponse.json({ text: text.length > 30 ? text : fallback })
      } catch {
        return NextResponse.json({ text: fallback })
      }
    }

    if (body.mode === 'summary') {
      const entries = (body.entries as LogEntryLite[]) ?? []
      const rangeLabel = (body.rangeLabel as string) ?? ''
      if (entries.length === 0) return NextResponse.json({ error: 'entries required' }, { status: 400 })
      const digest = buildDigest(entries)
      const fallback = `⚠ AI ไม่พร้อมใช้งานขณะนี้ (เช็คการตั้งค่า AI provider) — สรุปอัตโนมัติ: ในช่วง${rangeLabel} มีการเปลี่ยนแปลงรวม ${entries.reduce((s, e) => s + (e.count ?? 1), 0)} รายการ ควรติดตาม CPA และ Conversion ต่อเนื่องใน 7-14 วันข้างหน้า`
      if (!isRealAI()) return NextResponse.json({ text: fallback })
      try {
        const raw = await callAI(
          `คุณคือ Senior Performance Marketer สรุปงาน optimization ของทีมให้ลูกค้าเข้าใจเป็นเรื่องเดียวที่สอดคล้องกัน

บัญชี: ${accountName} · ช่วงเวลา: ${rangeLabel}
${digest}

เขียนสรุปภาษาไทย 1-2 ย่อหน้า (ไม่เกิน 220 คำ) ตอบให้ครบ:
1. ช่วงนี้ทีมปรับอะไรหลักๆ (จัดกลุ่ม อย่าไล่ทีละรายการ)
2. เป้าหมายรวมของการปรับคืออะไร และแต่ละส่วนสัมพันธ์กันยังไง
3. คาดว่าจะช่วย performance ด้านไหน
4. ความเสี่ยง/สิ่งที่ต้องติดตามต่อ (เช่น learning phase, CPA, Impression Share)
น้ำเสียง client-friendly ใช้ในรายงานได้เลย ห้ามการันตีผลลัพธ์ ห้ามประดิษฐ์ข้อมูลที่ไม่มีใน log · ตอบเฉพาะเนื้อความ ไม่ต้องมีหัวข้อหรือ JSON`,
          { tier: 'quality', _route: '/api/optimization-log/ai' }
        )
        const text = unwrapText(raw)
        return NextResponse.json({ text: text.length > 50 ? text : fallback })
      } catch {
        return NextResponse.json({ text: fallback })
      }
    }

    return NextResponse.json({ error: 'mode must be explain|summary' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
