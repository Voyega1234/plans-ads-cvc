'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Brain, Star, XCircle, TrendingDown, TrendingUp,
  Edit3, Save, RefreshCw, Trash2, MessageSquare,
} from 'lucide-react'

interface ClientMemoryRecord {
  id: string
  clientId: string
  industry: string | null
  avgCPC: number | null
  avgCPA: number | null
  avgConversionRate: number | null
  bestKeywords: string | null
  negativeKeywords: string | null
  approvedCopyPatterns: string | null
  rejectedCopyPatterns: string | null
  industryBenchmarkCPC: number | null
  lastRunObjective: string | null
  totalCampaignsRun: number
  notes: string | null
  updatedAt: string
  createdAt: string
}

interface FeedbackRecord {
  id: string
  copyType: string
  copyText: string
  status: 'approved' | 'rejected'
  reason: string | null
  createdAt: string
}

interface MemoryData {
  memory: ClientMemoryRecord | null
  feedback: FeedbackRecord[]
}

function parseJson<T>(str: string | null, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) as T } catch { return fallback }
}

export default function ClientMemoryPage() {
  const params  = useParams()
  const id      = params.id as string

  const [data,    setData]    = useState<MemoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [editing, setEditing] = useState(false)
  const [tab,     setTab]     = useState<'overview' | 'keywords' | 'copy' | 'feedback'>('overview')

  const [form, setForm] = useState({
    industry:             '',
    notes:                '',
    industryBenchmarkCPC: '',
    avgCPC:               '',
    avgCPA:               '',
    avgConversionRate:    '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/clients/${id}/memory`)
    if (res.ok) {
      const json = await res.json() as MemoryData
      setData(json)
      if (json.memory) {
        setForm({
          industry:             json.memory.industry ?? '',
          notes:                json.memory.notes ?? '',
          industryBenchmarkCPC: json.memory.industryBenchmarkCPC?.toString() ?? '',
          avgCPC:               json.memory.avgCPC?.toString() ?? '',
          avgCPA:               json.memory.avgCPA?.toString() ?? '',
          avgConversionRate:    json.memory.avgConversionRate?.toString() ?? '',
        })
      }
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    await fetch(`/api/clients/${id}/memory`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        industry:             form.industry || undefined,
        notes:                form.notes || undefined,
        industryBenchmarkCPC: form.industryBenchmarkCPC ? Number(form.industryBenchmarkCPC) : undefined,
        avgCPC:               form.avgCPC ? Number(form.avgCPC) : undefined,
        avgCPA:               form.avgCPA ? Number(form.avgCPA) : undefined,
        avgConversionRate:    form.avgConversionRate ? Number(form.avgConversionRate) : undefined,
      }),
    })
    setSaving(false)
    setEditing(false)
    load()
  }

  async function clearMemory() {
    if (!confirm('ลบ memory ทั้งหมดของ client นี้? ไม่สามารถเรียกคืนได้')) return
    await fetch(`/api/clients/${id}/memory`, { method: 'DELETE' })
    load()
  }

  const mem      = data?.memory
  const feedback = data?.feedback ?? []
  const bestKws  = parseJson<string[]>(mem?.bestKeywords ?? null, [])
  const negKws   = parseJson<string[]>(mem?.negativeKeywords ?? null, [])
  const approved = parseJson<string[]>(mem?.approvedCopyPatterns ?? null, [])
  const rejected = parseJson<string[]>(mem?.rejectedCopyPatterns ?? null, [])

  const approvedFeedback = feedback.filter((f) => f.status === 'approved')
  const rejectedFeedback = feedback.filter((f) => f.status === 'rejected')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-7 h-7 text-purple-500" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Client Memory</h1>
            <p className="text-sm text-gray-500">ข้อมูลที่ระบบจำได้เกี่ยวกับ client นี้</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {mem && (
            <button onClick={clearMemory} className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> ลบ Memory
            </button>
          )}
        </div>
      </div>

      {!mem && feedback.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Brain className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">ยังไม่มี memory สำหรับ client นี้</p>
          <p className="text-gray-400 text-xs mt-1">ระบบจะเริ่มจำข้อมูลหลังจากรัน automation ครั้งแรก</p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Campaigns Run', value: mem?.totalCampaignsRun ?? 0, icon: TrendingUp, color: 'blue' },
              { label: 'Avg CPA', value: mem?.avgCPA ? `฿${mem.avgCPA.toFixed(0)}` : '—', icon: TrendingDown, color: 'green' },
              { label: 'Avg CPC', value: mem?.avgCPC ? `฿${mem.avgCPC.toFixed(0)}` : '—', icon: TrendingDown, color: 'purple' },
              { label: 'Ad Feedback', value: feedback.length, icon: MessageSquare, color: 'orange' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{String(stat.value)}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {(['overview', 'keywords', 'copy', 'feedback'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all ${
                  tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'overview' ? 'Overview' : t === 'keywords' ? 'Keywords' : t === 'copy' ? 'Ad Copy' : 'Feedback'}
              </button>
            ))}
          </div>

          {/* Tab: Overview */}
          {tab === 'overview' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">ข้อมูล Client</h2>
                <button
                  onClick={() => editing ? save() : setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={saving}
                >
                  {editing ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                  {saving ? 'กำลังบันทึก...' : editing ? 'บันทึก' : 'แก้ไข'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Industry', key: 'industry' as const, type: 'text', placeholder: 'เช่น Real Estate, Dental, Visa' },
                  { label: 'Industry Benchmark CPC (฿)', key: 'industryBenchmarkCPC' as const, type: 'number', placeholder: '0' },
                  { label: 'Avg CPC จากประสบการณ์ (฿)', key: 'avgCPC' as const, type: 'number', placeholder: '0' },
                  { label: 'Avg CPA จากประสบการณ์ (฿)', key: 'avgCPA' as const, type: 'number', placeholder: '0' },
                  { label: 'Avg Conversion Rate (%)', key: 'avgConversionRate' as const, type: 'number', placeholder: '0' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                    {editing ? (
                      <input
                        type={field.type}
                        value={form[field.key]}
                        onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 py-2">
                        {form[field.key] || <span className="text-gray-400">—</span>}
                      </p>
                    )}
                  </div>
                ))}

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Agency Notes</label>
                  {editing ? (
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={3}
                      placeholder="บันทึกข้อมูลพิเศษเกี่ยวกับ client เช่น ข้อจำกัด, ประวัติ, ความต้องการพิเศษ"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-sm text-gray-900 py-2 whitespace-pre-wrap">
                      {form.notes || <span className="text-gray-400">—</span>}
                    </p>
                  )}
                </div>
              </div>

              {mem?.lastRunObjective && (
                <div className="pt-3 border-t border-gray-100 text-xs text-gray-500">
                  Last run: {mem.lastRunObjective} · Updated: {new Date(mem.updatedAt).toLocaleString('th-TH')}
                </div>
              )}
            </div>
          )}

          {/* Tab: Keywords */}
          {tab === 'keywords' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <h2 className="font-semibold text-gray-900">Best Keywords ({bestKws.length})</h2>
                </div>
                {bestKws.length === 0 ? (
                  <p className="text-sm text-gray-400">ยังไม่มีข้อมูล — จะเพิ่มอัตโนมัติหลัง run campaign</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {bestKws.map((kw, i) => (
                      <span key={i} className="px-2.5 py-1 bg-green-50 text-green-700 text-xs rounded-full border border-green-200">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <h2 className="font-semibold text-gray-900">Negative Keywords ({negKws.length})</h2>
                </div>
                {negKws.length === 0 ? (
                  <p className="text-sm text-gray-400">ยังไม่มีข้อมูล — จะเพิ่มอัตโนมัติหลัง run campaign</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {negKws.map((kw, i) => (
                      <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 text-xs rounded-full border border-red-200">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Ad Copy */}
          {tab === 'copy' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-4 h-4 text-green-500" />
                  <h2 className="font-semibold text-gray-900">Approved Patterns ({approved.length})</h2>
                </div>
                {approved.length === 0 ? (
                  <p className="text-sm text-gray-400">ยังไม่มีข้อมูล — บันทึกอัตโนมัติจาก approval flow</p>
                ) : (
                  <ul className="space-y-2">
                    {approved.map((p, i) => (
                      <li key={i} className="text-sm bg-green-50 text-green-800 px-3 py-2 rounded-lg border border-green-100">{p}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <h2 className="font-semibold text-gray-900">Rejected Patterns ({rejected.length})</h2>
                </div>
                {rejected.length === 0 ? (
                  <p className="text-sm text-gray-400">ยังไม่มีข้อมูล — บันทึกอัตโนมัติจาก rejection flow</p>
                ) : (
                  <ul className="space-y-2">
                    {rejected.map((p, i) => (
                      <li key={i} className="text-sm bg-red-50 text-red-800 px-3 py-2 rounded-lg border border-red-100">{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Tab: Feedback History */}
          {tab === 'feedback' && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Ad Copy Feedback History</h2>
                <span className="text-xs text-gray-500">{feedback.length} records</span>
              </div>
              {feedback.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">ยังไม่มี feedback</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {feedback.map((f) => (
                    <div key={f.id} className="px-6 py-3 flex items-start gap-3">
                      <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${f.status === 'approved' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{f.copyText}</p>
                        {f.reason && <p className="text-xs text-gray-500 mt-0.5">{f.reason}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className={`text-xs font-medium ${f.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                          {f.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                        <p className="text-xs text-gray-400">{f.copyType}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
