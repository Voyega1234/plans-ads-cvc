/**
 * Optimization Log — AI explanation
 * POST /api/optimization-log/ai
 *  { mode: 'explain', entry, accountName }            → อธิบาย log รายตัวแบบ client-friendly
 *  { mode: 'summary', entries[], rangeLabel, accountName } → สรุปรวมทั้งช่วงเป็นเรื่องเดียว
 */

export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { safeCallAI } from '@/lib/ai/provider'

interface LogEntryLite {
  dateTime: string
  campaign: string | null
  adGroup: string | null
  resourceType: string
  operation: string
  changedBy: string
  detail: string
  impact: string
}

const entryLine = (e: LogEntryLite) =>
  `- [${e.dateTime}] ${e.campaign ?? '(account)'}${e.adGroup ? ` > ${e.adGroup}` : ''} · ${e.resourceType} ${e.operation} · ${e.detail} · โดย ${e.changedBy} · impact ${e.impact}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const accountName = (body.accountName as string) ?? 'บัญชีนี้'

    if (body.mode === 'explain') {
      const e = body.entry as LogEntryLite
      if (!e) return NextResponse.json({ error: 'entry required' }, { status: 400 })
      const result = await safeCallAI<{ text: string }>(
        `คุณคือ Senior Performance Marketer อธิบายการปรับแคมเปญ Google Ads ให้ Account Manager เอาไปคุยกับลูกค้าได้

การเปลี่ยนแปลง (บัญชี ${accountName}):
${entryLine(e)}

เขียนคำอธิบายภาษาไทย 1 ย่อหน้า (3-5 ประโยค) ครอบคลุม: ปรับอะไร · เหตุผลที่ทีมมักปรับแบบนี้ · โอกาสที่จะดีขึ้น · ความเสี่ยง/สิ่งที่ต้องติดตาม · น้ำเสียงมืออาชีพ เข้าใจง่าย ไม่ใช้ศัพท์เทคนิคเกินจำเป็น ห้ามการันตีผลลัพธ์

ตอบเป็น JSON เท่านั้น: {"text": "..."}`,
        (raw) => {
          const r = raw as { text?: string }
          return r?.text ? { text: r.text } : null
        },
        () => ({ text: `ทีมได้${e.detail} ใน ${e.campaign ?? 'ระดับบัญชี'} — การปรับลักษณะนี้มักทำเพื่อเพิ่มประสิทธิภาพการใช้งบ ควรติดตามผล 7-14 วันหลังปรับ` }),
        { tier: 'standard', _route: '/api/optimization-log/ai', _feature: 'optimization_log', _subfeature: 'explain' }
      )
      return NextResponse.json(result)
    }

    if (body.mode === 'summary') {
      const entries = (body.entries as LogEntryLite[]) ?? []
      const rangeLabel = (body.rangeLabel as string) ?? ''
      if (entries.length === 0) return NextResponse.json({ error: 'entries required' }, { status: 400 })
      const lines = entries.slice(0, 80).map(entryLine).join('\n')
      const result = await safeCallAI<{ text: string }>(
        `คุณคือ Senior Performance Marketer สรุปงาน optimization ของทีมให้ลูกค้าเข้าใจเป็นเรื่องเดียวที่สอดคล้องกัน

บัญชี: ${accountName} · ช่วงเวลา: ${rangeLabel} · การเปลี่ยนแปลงทั้งหมด ${entries.length} รายการ:
${lines}

เขียนสรุปภาษาไทย 1-2 ย่อหน้า (ไม่เกิน 220 คำ) ตอบให้ครบ:
1. ช่วงนี้ทีมปรับอะไรหลักๆ (จัดกลุ่ม อย่าไล่ทีละรายการ)
2. เป้าหมายรวมของการปรับคืออะไร และแต่ละส่วนสัมพันธ์กันยังไง
3. คาดว่าจะช่วย performance ด้านไหน
4. ความเสี่ยง/สิ่งที่ต้องติดตามต่อ (เช่น learning phase, CPA, Impression Share)
น้ำเสียง client-friendly ใช้ในรายงานได้เลย ห้ามการันตีผลลัพธ์ ห้ามประดิษฐ์ข้อมูลที่ไม่มีใน log

ตอบเป็น JSON เท่านั้น: {"text": "..."}`,
        (raw) => {
          const r = raw as { text?: string }
          return r?.text ? { text: r.text } : null
        },
        () => ({ text: `ในช่วง${rangeLabel} ทีมมีการปรับแคมเปญรวม ${entries.length} รายการ เน้นการปรับงบประมาณและโครงสร้างแคมเปญเพื่อเพิ่มประสิทธิภาพการใช้งบ ควรติดตาม CPA และ Conversion ต่อเนื่องใน 7-14 วันข้างหน้า` }),
        { tier: 'quality', _route: '/api/optimization-log/ai', _feature: 'optimization_log', _subfeature: 'summary' }
      )
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'mode must be explain|summary' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
