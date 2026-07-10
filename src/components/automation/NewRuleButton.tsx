'use client'

/**
 * New Rule — wizard 2 ขั้น: เลือกสถานการณ์สำเร็จรูป → ปรับประโยคเงื่อนไข → บันทึก
 * ออกแบบให้คนไม่ใช่สาย technical ใช้ได้: ไม่ต้องเข้าใจ metric/operator/type —
 * ทุกอย่างอ่านเป็นประโยคไทย "ถ้า ... ให้ระบบ ..."
 */

import { useState } from 'react'
import { Plus, X, Loader2, ArrowLeft, Pencil, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  METRIC_LABELS, METRIC_UNITS, OPERATOR_LABELS, WINDOW_LABELS,
  ACTION_LABELS, ACTION_TO_TYPE, ACTION_GROUPS, HIGH_IMPACT_TYPES, autoRuleName,
} from '@/lib/automation/labels'

// ── สถานการณ์สำเร็จรูป (จาก playbook ของ Media Buyer) ──
interface Template {
  label: string
  emoji: string
  desc:  string
  form:  { metric: string; operator: string; value: number; window: string; action: string }
}

const TEMPLATE_GROUPS: Array<{ group: string; color: string; items: Template[] }> = [
  {
    group: '🛑 กันงบเสีย', color: 'border-red-100 bg-red-50/50',
    items: [
      { label: 'CPA เกินเป้า → เตือนทีม', emoji: '💸', desc: 'CPA เกิน ฿1,500 ใน 7 วัน', form: { metric: 'cpa', operator: '>', value: 1500, window: '7d', action: 'send_alert' } },
      { label: 'ใช้งบเยอะแต่ไม่มียอด → เตือน', emoji: '🚨', desc: 'ไม่มี conversion เลยใน 14 วัน', form: { metric: 'conversions', operator: '<', value: 1, window: '14d', action: 'send_alert' } },
      { label: 'งบสัปดาห์ทะลุเพดาน → เตือน', emoji: '🔥', desc: 'ใช้เกิน ฿50,000 ใน 7 วัน', form: { metric: 'cost', operator: '>', value: 50000, window: '7d', action: 'send_alert' } },
      { label: 'ไม่มียอด 30 วัน → หยุดแคมเปญ', emoji: '⛔', desc: 'conversion = 0 ใน 30 วัน (แก้ค่าจริง)', form: { metric: 'conversions', operator: '<', value: 1, window: '30d', action: 'pause_campaign' } },
    ],
  },
  {
    group: '📈 เร่งตอนผลดี', color: 'border-emerald-100 bg-emerald-50/50',
    items: [
      { label: 'ROAS ดี → เพิ่มงบ 20%', emoji: '🚀', desc: 'ROAS เกิน 4x ใน 7 วัน (แก้ค่าจริง)', form: { metric: 'roas', operator: '>', value: 4, window: '7d', action: 'increase_budget_20pct' } },
      { label: 'CPA ต่ำกว่าเป้า → เพิ่มงบ 20%', emoji: '💚', desc: 'CPA ต่ำกว่า ฿500 ใน 7 วัน (แก้ค่าจริง)', form: { metric: 'cpa', operator: '<', value: 500, window: '7d', action: 'increase_budget_20pct' } },
      { label: 'ยอดเยอะพอ → ลด Target CPA', emoji: '🎯', desc: 'conversion เกิน 30 ใน 14 วัน (แก้ค่าจริง)', form: { metric: 'conversions', operator: '>', value: 30, window: '14d', action: 'reduce_target_cpa_10pct' } },
    ],
  },
  {
    group: '✂️ ตัดของเสีย', color: 'border-orange-100 bg-orange-50/50',
    items: [
      { label: 'Keyword แพงไม่มียอด → หยุด', emoji: '✂️', desc: 'CPC เกิน ฿80 ใน 14 วัน (แก้ค่าจริง)', form: { metric: 'cpc', operator: '>', value: 80, window: '14d', action: 'pause_keyword' } },
      { label: 'Keyword คนไม่คลิก → ลด bid ครึ่งนึง', emoji: '🔻', desc: 'CTR ต่ำกว่า 0.5% ใน 14 วัน (แก้ค่าจริง)', form: { metric: 'ctr', operator: '<', value: 0.5, window: '14d', action: 'reduce_bid_50pct' } },
      { label: 'แคมเปญขาดทุน → ลดงบ 30%', emoji: '📦', desc: 'ROAS ต่ำกว่า 1.5x ใน 14 วัน (แก้ค่าจริง)', form: { metric: 'roas', operator: '<', value: 1.5, window: '14d', action: 'decrease_budget_30pct' } },
      { label: 'Quality Score ต่ำ → ติด label ไว้ตรวจ', emoji: '🏷', desc: 'QS ต่ำกว่า 4 ใน 7 วัน', form: { metric: 'quality_score', operator: '<', value: 4, window: '7d', action: 'add_label_low_quality' } },
    ],
  },
  {
    group: '🏆 จับตา Visibility', color: 'border-blue-100 bg-blue-50/50',
    items: [
      { label: 'แพ้ auction เพราะงบหมด → เตือน', emoji: '📊', desc: 'Lost IS จากงบ เกิน 30% ใน 7 วัน', form: { metric: 'search_lost_is_budget', operator: '>', value: 30, window: '7d', action: 'send_alert' } },
      { label: 'อันดับโฆษณาต่ำ → เตือน', emoji: '🏅', desc: 'Lost IS จากอันดับ เกิน 40% ใน 7 วัน', form: { metric: 'search_lost_is_rank', operator: '>', value: 40, window: '7d', action: 'send_alert' } },
      { label: 'Impression หายฮวบ → เตือน', emoji: '👁', desc: 'Impressions ต่ำกว่า 1,000 ใน 7 วัน — อาจโดน limit/disapprove', form: { metric: 'impressions', operator: '<', value: 1000, window: '7d', action: 'send_alert' } },
      { label: 'ผลงานเด่น → ติด label ⭐', emoji: '⭐', desc: 'ROAS เกิน 6x ใน 14 วัน', form: { metric: 'roas', operator: '>', value: 6, window: '14d', action: 'add_label_top_performer' } },
    ],
  },
]

export default function NewRuleButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')      // ชื่อที่ user แก้เอง ('' = ใช้ auto)
  const [form, setForm] = useState({ metric: 'cpa', operator: '>' as string, value: 1500, window: '7d', action: 'send_alert' })

  const type = ACTION_TO_TYPE[form.action] ?? 'alert'
  const highImpact = HIGH_IMPACT_TYPES.includes(type)
  const ruleName = customName.trim() || autoRuleName(form.metric, form.operator, form.value, form.window, form.action)
  const unit = METRIC_UNITS[form.metric] ?? ''

  function openModal() {
    setOpen(true); setStep(1); setError(null); setCustomName('')
  }
  function pickTemplate(t: Template) {
    setForm({ ...t.form }); setCustomName(''); setStep(2)
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ruleName, type, ...form }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `บันทึกไม่สำเร็จ (${res.status})`)
      }
      setOpen(false)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const selCls = 'px-2 py-1.5 border border-blue-200 bg-blue-50/60 rounded-lg text-sm font-semibold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer'

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Rule
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                {step === 2 && (
                  <button onClick={() => setStep(1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" title="กลับไปเลือกสถานการณ์">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {step === 1 ? 'สร้างกฎอัตโนมัติ — เลือกสถานการณ์' : 'ตรวจเงื่อนไขก่อนบันทึก'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {step === 1 ? 'เลือกจากสถานการณ์ที่เจอบ่อย หรือตั้งเงื่อนไขเองก็ได้' : 'ปรับตัวเลขในประโยคได้เลย — ระบบตั้งชื่อกฎให้อัตโนมัติ'}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── STEP 1: เลือกสถานการณ์ ── */}
            {step === 1 && (
              <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                {TEMPLATE_GROUPS.map((group, gi) => (
                  <div key={gi}>
                    <p className="text-xs font-bold text-gray-600 mb-2">{group.group}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.items.map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => pickTemplate(t)}
                          className={cn('text-left px-3.5 py-2.5 rounded-xl border bg-white hover:border-blue-400 hover:shadow-sm transition-all', group.color)}
                        >
                          <p className="text-sm font-medium text-gray-800">{t.emoji} {t.label}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{t.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  <Pencil className="w-4 h-4" /> ตั้งเงื่อนไขเองตั้งแต่ต้น
                </button>
              </div>
            )}

            {/* ── STEP 2: ประโยคเงื่อนไข ── */}
            {step === 2 && (
              <div className="p-6 space-y-5">
                {/* Sentence builder */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">กฎนี้จะทำงานแบบนี้</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm text-gray-700 leading-loose">
                    <span className="font-semibold">ถ้า</span>
                    <select value={form.metric} onChange={(e) => setForm(f => ({ ...f, metric: e.target.value }))} className={selCls}>
                      {Object.entries(METRIC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <select value={form.operator} onChange={(e) => setForm(f => ({ ...f, operator: e.target.value }))} className={selCls}>
                      {Object.entries(OPERATOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        value={form.value}
                        onChange={(e) => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                        className="w-24 px-2 py-1.5 border border-blue-200 bg-blue-50/60 rounded-lg text-sm font-semibold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                      {unit && <span className="text-gray-500">{unit.trim()}</span>}
                    </span>
                    <span className="font-semibold">ในช่วง</span>
                    <select value={form.window} onChange={(e) => setForm(f => ({ ...f, window: e.target.value }))} className={selCls}>
                      {Object.entries(WINDOW_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <span className="font-semibold w-full sm:w-auto">ให้ระบบ</span>
                    <select value={form.action} onChange={(e) => setForm(f => ({ ...f, action: e.target.value }))} className={cn(selCls, 'max-w-full')}>
                      {ACTION_GROUPS.map(g => (
                        <optgroup key={g.group} label={g.group}>
                          {g.actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Impact note */}
                {highImpact ? (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>กฎนี้แก้ค่าจริงใน Google Ads</strong> — ตอนกดรันระบบจะถามยืนยันก่อนทุกครั้ง และถ้าระบบอยู่โหมดจำลอง จะรายงานว่า &quot;จะทำอะไร&quot; โดยยังไม่แก้จริง</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700">
                    ✅ กฎนี้ปลอดภัย — แจ้งเตือน/ติด label เท่านั้น ไม่แก้อะไรใน Google Ads
                  </div>
                )}

                {/* ชื่อกฎ (auto + แก้ได้) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ชื่อกฎ (ระบบตั้งให้ — แก้ได้)</label>
                  <input
                    value={customName || ruleName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              </div>
            )}

            {/* Footer */}
            {step === 2 && (
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ← เลือกสถานการณ์
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !ruleName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  บันทึกกฎนี้
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
