'use client'

import { useState } from 'react'
import { Plus, X, Loader2, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const METRIC_OPTIONS = [
  { value: 'ctr',              label: 'CTR (%)' },
  { value: 'cpc',              label: 'CPC (฿)' },
  { value: 'cpa',              label: 'CPA (฿)' },
  { value: 'roas',             label: 'ROAS' },
  { value: 'impressions',      label: 'Impressions' },
  { value: 'clicks',           label: 'Clicks' },
  { value: 'conversions',      label: 'Conversions' },
  { value: 'cost',             label: 'Cost (฿)' },
  { value: 'conv_rate',        label: 'Conv. Rate (%)' },
  { value: 'impression_share', label: 'Impression Share (%)' },
  { value: 'quality_score',    label: 'Quality Score' },
  { value: 'search_lost_is_budget', label: 'Lost IS (Budget) (%)' },
  { value: 'search_lost_is_rank',   label: 'Lost IS (Rank) (%)' },
]

const RULE_TYPE_OPTIONS = [
  { value: 'alert',           label: '🔔 Alert — แจ้งเตือนทีม' },
  { value: 'keyword_pause',   label: '⏸ Keyword — จัดการ keyword' },
  { value: 'budget_adjust',   label: '💰 Budget — ปรับงบ campaign' },
  { value: 'bid_adjust',      label: '🎯 Bid — ปรับ bid' },
  { value: 'campaign_pause',  label: '🛑 Campaign — pause/enable' },
  { value: 'label',           label: '🏷 Label — ติด label' },
]

const ACTION_LABELS: Record<string, string> = {
  // Alert
  send_alert:               'แจ้งเตือนใน Dashboard',
  send_email_alert:         'ส่ง Email แจ้งเตือน',
  // Keyword
  pause_keyword:            'Pause keyword',
  enable_keyword:           'Enable keyword',
  reduce_bid_10pct:         'ลด bid keyword 10%',
  reduce_bid_20pct:         'ลด bid keyword 20%',
  reduce_bid_50pct:         'ลด bid keyword 50%',
  increase_bid_10pct:       'เพิ่ม bid keyword 10%',
  increase_bid_20pct:       'เพิ่ม bid keyword 20%',
  // Budget
  increase_budget_10pct:    'เพิ่ม budget 10%',
  increase_budget_20pct:    'เพิ่ม budget 20%',
  increase_budget_30pct:    'เพิ่ม budget 30%',
  decrease_budget_10pct:    'ลด budget 10%',
  decrease_budget_20pct:    'ลด budget 20%',
  decrease_budget_30pct:    'ลด budget 30%',
  // Bid (campaign-level)
  reduce_target_cpa_10pct:  'ลด Target CPA 10%',
  reduce_target_cpa_20pct:  'ลด Target CPA 20%',
  increase_target_cpa_10pct:'เพิ่ม Target CPA 10%',
  increase_target_roas_10pct:'เพิ่ม Target ROAS 10%',
  reduce_target_roas_10pct: 'ลด Target ROAS 10%',
  // Campaign
  pause_campaign:           'Pause campaign',
  enable_campaign:          'Enable campaign',
  // Label
  add_label_review:         'ติด label "ต้องตรวจสอบ"',
  add_label_top_performer:  'ติด label "Top Performer"',
  add_label_low_quality:    'ติด label "Low Quality"',
}

const ACTION_OPTIONS: Record<string, string[]> = {
  alert:          ['send_alert', 'send_email_alert'],
  keyword_pause:  ['pause_keyword', 'enable_keyword', 'reduce_bid_20pct', 'reduce_bid_50pct', 'reduce_bid_10pct', 'increase_bid_10pct', 'increase_bid_20pct'],
  budget_adjust:  ['increase_budget_10pct', 'increase_budget_20pct', 'increase_budget_30pct', 'decrease_budget_10pct', 'decrease_budget_20pct', 'decrease_budget_30pct'],
  bid_adjust:     ['reduce_target_cpa_10pct', 'reduce_target_cpa_20pct', 'increase_target_cpa_10pct', 'increase_target_roas_10pct', 'reduce_target_roas_10pct'],
  campaign_pause: ['pause_campaign', 'enable_campaign', 'send_alert'],
  label:          ['add_label_review', 'add_label_top_performer', 'add_label_low_quality'],
}

// ── Templates grouped by category ────────────────────────────────────────────

interface Template {
  label: string
  emoji: string
  tag:   string
  desc:  string
  form:  { name: string; type: string; metric: string; operator: string; value: number; window: string; action: string }
}

const TEMPLATE_GROUPS: Array<{ group: string; color: string; items: Template[] }> = [
  {
    group: '🛑 ป้องกันงบเสีย',
    color: 'bg-red-50 border-red-100',
    items: [
      {
        label: 'CPA เกิน target',
        emoji: '💸', tag: 'Alert',
        desc: 'เมื่อ CPA เกิน ฿1,500 ใน 7 วัน — แจ้งทีมทันที',
        form: { name: 'แจ้งเตือน CPA เกิน target', type: 'alert', metric: 'cpa', operator: '>', value: 1500, window: '7d', action: 'send_alert' },
      },
      {
        label: 'CTR ต่ำผิดปกติ',
        emoji: '📉', tag: 'Alert',
        desc: 'CTR < 1% ใน 7 วัน — ad copy หรือ keyword อาจมีปัญหา',
        form: { name: 'แจ้งเตือน CTR ต่ำ', type: 'alert', metric: 'ctr', operator: '<', value: 1, window: '7d', action: 'send_alert' },
      },
      {
        label: 'ไม่มี Conversion 14 วัน',
        emoji: '🚨', tag: 'Alert',
        desc: 'Campaign ใช้งบแต่ไม่ได้ conversion เลย ควรหยุดทบทวน',
        form: { name: 'แจ้งเตือน ไม่มี Conversion 14 วัน', type: 'alert', metric: 'conversions', operator: '<', value: 1, window: '14d', action: 'send_alert' },
      },
      {
        label: 'Cost เกินเป้าสัปดาห์',
        emoji: '🔥', tag: 'Alert',
        desc: 'ใช้งบเกิน ฿50,000 ใน 7 วัน — เตือนก่อน overspend',
        form: { name: 'แจ้งเตือน Cost สูง', type: 'alert', metric: 'cost', operator: '>', value: 50000, window: '7d', action: 'send_alert' },
      },
      {
        label: 'Pause campaign ไม่มีผล',
        emoji: '⛔', tag: 'Campaign',
        desc: 'Campaign ใช้งบ > ฿5,000 แต่ได้ conversion 0 ใน 30 วัน',
        form: { name: 'Pause campaign ไม่มี conversion', type: 'campaign_pause', metric: 'conversions', operator: '<', value: 1, window: '30d', action: 'pause_campaign' },
      },
    ],
  },
  {
    group: '📈 เร่ง Scale ตอน Performance ดี',
    color: 'bg-green-50 border-green-100',
    items: [
      {
        label: 'เพิ่มงบ ROAS สูง',
        emoji: '🚀', tag: 'Budget',
        desc: 'ROAS > 4x ใน 7 วัน — เพิ่มงบ 20% ดึง volume',
        form: { name: 'เพิ่ม budget เมื่อ ROAS ดี', type: 'budget_adjust', metric: 'roas', operator: '>', value: 4, window: '7d', action: 'increase_budget_20pct' },
      },
      {
        label: 'เพิ่มงบ CPA ต่ำกว่า target',
        emoji: '💚', tag: 'Budget',
        desc: 'CPA < ฿500 ใน 7 วัน — CPA ดีกว่า target, scale ได้',
        form: { name: 'เพิ่มงบเมื่อ CPA ต่ำ', type: 'budget_adjust', metric: 'cpa', operator: '<', value: 500, window: '7d', action: 'increase_budget_20pct' },
      },
      {
        label: 'เพิ่ม budget ตอน Conv. Rate สูง',
        emoji: '⚡', tag: 'Budget',
        desc: 'Conv. Rate > 5% ใน 7 วัน — landing page + keyword match ดี',
        form: { name: 'เพิ่มงบเมื่อ CVR สูง', type: 'budget_adjust', metric: 'conv_rate', operator: '>', value: 5, window: '7d', action: 'increase_budget_30pct' },
      },
      {
        label: 'ลด target CPA เมื่อ conv เยอะ',
        emoji: '🎯', tag: 'Bid',
        desc: 'Conversion > 30 ใน 14 วัน — bid algorithm พร้อม ลด CPA target 10% เพื่อ efficiency',
        form: { name: 'ลด tCPA เมื่อ volume พอ', type: 'bid_adjust', metric: 'conversions', operator: '>', value: 30, window: '14d', action: 'reduce_target_cpa_10pct' },
      },
    ],
  },
  {
    group: '✂️ ตัด Waste ออก',
    color: 'bg-orange-50 border-orange-100',
    items: [
      {
        label: 'Pause keyword CPC สูงไม่ convert',
        emoji: '✂️', tag: 'Keyword',
        desc: 'CPC > ฿80 และ conversion < 1 ใน 14 วัน — keyword นี้แพงและไม่มีค่า',
        form: { name: 'Pause keyword CPC สูง ไม่มี conv', type: 'keyword_pause', metric: 'cpc', operator: '>', value: 80, window: '14d', action: 'pause_keyword' },
      },
      {
        label: 'ลด bid keyword CTR ต่ำ',
        emoji: '🔻', tag: 'Keyword',
        desc: 'CTR < 0.5% ใน 14 วัน — keyword ไม่ตรง intent, ลด bid ก่อน pause',
        form: { name: 'ลด bid keyword CTR ต่ำ', type: 'keyword_pause', metric: 'ctr', operator: '<', value: 0.5, window: '14d', action: 'reduce_bid_50pct' },
      },
      {
        label: 'ลด budget campaign ROAS ต่ำ',
        emoji: '📦', tag: 'Budget',
        desc: 'ROAS < 1.5x ใน 14 วัน — campaign ขาดทุน ลดงบก่อนปรับ',
        form: { name: 'ลดงบ campaign ROAS ต่ำ', type: 'budget_adjust', metric: 'roas', operator: '<', value: 1.5, window: '14d', action: 'decrease_budget_30pct' },
      },
      {
        label: 'ติด label keyword Quality Score ต่ำ',
        emoji: '🏷', tag: 'Label',
        desc: 'Quality Score < 4 ใน 7 วัน — mark ไว้ตรวจ landing page + ad relevance',
        form: { name: 'Label keyword QS ต่ำ', type: 'label', metric: 'quality_score', operator: '<', value: 4, window: '7d', action: 'add_label_low_quality' },
      },
    ],
  },
  {
    group: '🏆 จัดการ Impression Share',
    color: 'bg-blue-50 border-blue-100',
    items: [
      {
        label: 'IS ต่ำ เพราะงบ',
        emoji: '📊', tag: 'Alert',
        desc: 'Lost IS (Budget) > 30% — campaign แพ้ auction เพราะงบหมด ควรเพิ่มงบ',
        form: { name: 'แจ้งเตือน Lost IS เพราะงบ', type: 'alert', metric: 'search_lost_is_budget', operator: '>', value: 30, window: '7d', action: 'send_alert' },
      },
      {
        label: 'IS ต่ำ เพราะ rank',
        emoji: '🏅', tag: 'Alert',
        desc: 'Lost IS (Rank) > 40% — ad rank ต่ำ อาจต้องปรับ bid หรือ Quality Score',
        form: { name: 'แจ้งเตือน Lost IS เพราะ Rank', type: 'alert', metric: 'search_lost_is_rank', operator: '>', value: 40, window: '7d', action: 'send_alert' },
      },
      {
        label: 'เพิ่มงบ เมื่อ IS ดีแต่งบหมด',
        emoji: '📈', tag: 'Budget',
        desc: 'Lost IS (Budget) > 20% และ ROAS > 3x — กำลังดีแต่งบจำกัด เพิ่มเลย',
        form: { name: 'เพิ่มงบเมื่อ IS ถูกจำกัดด้วยงบ', type: 'budget_adjust', metric: 'search_lost_is_budget', operator: '>', value: 20, window: '7d', action: 'increase_budget_20pct' },
      },
    ],
  },
  {
    group: '🔔 Monitor & Label',
    color: 'bg-purple-50 border-purple-100',
    items: [
      {
        label: 'ติด label Top Performer',
        emoji: '⭐', tag: 'Label',
        desc: 'ROAS > 6x ใน 14 วัน — mark campaign/keyword ดีเป็นตัวอย่าง',
        form: { name: 'Label Top Performer ROAS > 6x', type: 'label', metric: 'roas', operator: '>', value: 6, window: '14d', action: 'add_label_top_performer' },
      },
      {
        label: 'แจ้งเตือน Impression ลด',
        emoji: '👁', tag: 'Alert',
        desc: 'Impression < 1,000 ใน 7 วัน — campaign reach ลดฮวบ อาจถูก limit หรือ disapproved',
        form: { name: 'แจ้งเตือน Impression ต่ำ', type: 'alert', metric: 'impressions', operator: '<', value: 1000, window: '7d', action: 'send_alert' },
      },
      {
        label: 'แจ้งเตือน Click ลด 50%',
        emoji: '🖱', tag: 'Alert',
        desc: 'Clicks < 50 ใน 7 วัน — traffic หายไป อาจ bid ต่ำหรือ keyword หมด volume',
        form: { name: 'แจ้งเตือน Click ต่ำ', type: 'alert', metric: 'clicks', operator: '<', value: 50, window: '7d', action: 'send_alert' },
      },
      {
        label: 'Enable keyword ที่เคย pause',
        emoji: '▶️', tag: 'Keyword',
        desc: 'Impression Share > 70% ใน 7 วัน — market ขยาย enable keyword เก่ากลับมาได้',
        form: { name: 'Enable keyword เมื่อ IS สูง', type: 'keyword_pause', metric: 'impression_share', operator: '>', value: 70, window: '7d', action: 'enable_keyword' },
      },
    ],
  },
]

const TAG_COLOR: Record<string, string> = {
  Alert:    'bg-red-100 text-red-600',
  Budget:   'bg-green-100 text-green-700',
  Keyword:  'bg-purple-100 text-purple-700',
  Bid:      'bg-blue-100 text-blue-700',
  Campaign: 'bg-orange-100 text-orange-700',
  Label:    'bg-gray-100 text-gray-600',
}

export default function NewRuleButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<number | null>(0)
  const [form, setForm] = useState({
    name: '',
    type: 'alert' as string,
    metric: 'ctr',
    operator: '<' as string,
    value: 1,
    window: '7d',
    action: 'send_alert',
  })

  function handleTypeChange(type: string) {
    const firstAction = ACTION_OPTIONS[type]?.[0] ?? 'send_alert'
    setForm((f) => ({ ...f, type, action: firstAction }))
  }

  function applyTemplate(t: Template) {
    setForm({ ...t.form })
    // scroll to form section
    setTimeout(() => {
      document.getElementById('rule-form-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('กรุณาระบุชื่อกฎ'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; details?: unknown }
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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
              <div>
                <h2 className="font-semibold text-gray-900">สร้าง Automation Rule ใหม่</h2>
                <p className="text-xs text-gray-400 mt-0.5">เลือก template หรือตั้งค่าเอง — กฎจะถูก evaluate ทุก 6 ชั่วโมง</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* ── Templates ── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Templates จาก Media Buyer ({TEMPLATE_GROUPS.reduce((s, g) => s + g.items.length, 0)} templates)
                </p>

                <div className="space-y-2">
                  {TEMPLATE_GROUPS.map((group, gi) => (
                    <div key={gi} className={cn('rounded-xl border overflow-hidden', group.color)}>
                      {/* Group header */}
                      <button
                        type="button"
                        onClick={() => setExpandedGroup(expandedGroup === gi ? null : gi)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-white/40 transition-colors"
                      >
                        <span>{group.group}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-normal text-gray-400">{group.items.length} rules</span>
                          {expandedGroup === gi
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          }
                        </div>
                      </button>

                      {/* Template items */}
                      {expandedGroup === gi && (
                        <div className="px-3 pb-3 grid grid-cols-1 gap-2">
                          {group.items.map((t) => (
                            <button
                              key={t.label}
                              type="button"
                              onClick={() => applyTemplate(t)}
                              className={cn(
                                'text-left px-3.5 py-2.5 rounded-lg bg-white border transition-all hover:border-blue-300 hover:shadow-sm',
                                form.name === t.form.name ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'
                              )}
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-base">{t.emoji}</span>
                                <span className="text-sm font-medium text-gray-800">{t.label}</span>
                                <span className={cn('ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full', TAG_COLOR[t.tag] ?? 'bg-gray-100 text-gray-500')}>{t.tag}</span>
                              </div>
                              <p className="text-[11px] text-gray-400 leading-relaxed pl-7">{t.desc}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-4 mb-1">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400">หรือตั้งค่าเองด้านล่าง</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              </div>

              {/* ── Manual form ── */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อกฎ *</label>
                  <input
                    id="rule-form-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="เช่น Pause keyword ถ้า CTR ต่ำ"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทกฎ</label>
                  <select
                    value={form.type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {RULE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Metric</label>
                    <select
                      value={form.metric}
                      onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {METRIC_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">เงื่อนไข</label>
                    <select
                      value={form.operator}
                      onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="<">{'<'} (น้อยกว่า)</option>
                      <option value=">">{'>'} (มากกว่า)</option>
                      <option value="<=">≤ (น้อยกว่าหรือเท่ากับ)</option>
                      <option value=">=">≥ (มากกว่าหรือเท่ากับ)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ค่า</label>
                    <input
                      type="number"
                      value={form.value}
                      onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ช่วงเวลาที่ดู</label>
                    <select
                      value={form.window}
                      onChange={(e) => setForm((f) => ({ ...f, window: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="1d">1 วัน</option>
                      <option value="3d">3 วัน</option>
                      <option value="7d">7 วัน</option>
                      <option value="14d">14 วัน</option>
                      <option value="30d">30 วัน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                    <select
                      value={form.action}
                      onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {(ACTION_OPTIONS[form.type] ?? []).map((a) => (
                        <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                {form.name && (
                  <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-600 border border-gray-200">
                    <span className="font-semibold text-gray-700">Preview: </span>
                    ถ้า <span className="font-medium text-blue-600">{METRIC_OPTIONS.find(m => m.value === form.metric)?.label ?? form.metric}</span>
                    {' '}<span className="font-medium">{form.operator}</span>{' '}
                    <span className="font-medium text-blue-600">{form.value}</span>
                    {' '}ในช่วง <span className="font-medium">{form.window}</span>
                    {' '}→ <span className="font-medium text-emerald-600">{ACTION_LABELS[form.action] ?? form.action}</span>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                บันทึกกฎ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
