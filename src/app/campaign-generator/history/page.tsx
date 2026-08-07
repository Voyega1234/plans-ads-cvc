'use client'

// ── Campaign Generator History ────────────────────────────────────────────────
// ทุกครั้งที่ push สำเร็จ ระบบเก็บ blueprint + ผลไว้แล้ว (ตั้งแต่รอบนี้ของเก่า
// ไม่ถูกลบอีก — ถูก archive แทน) หน้านี้เอามาแสดงเป็น card ให้ทีม:
//   ดูว่า push อะไรไปเมื่อไหร่ → เปิดแก้ text ads → save → push เข้า Google Ads
//   ซ้ำได้ทั้งชุด (แยกจากหน้า Campaign Generator ที่วิ่งจาก Media plan)

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import {
  History, Loader2, AlertCircle, CheckCircle2, ChevronLeft, RefreshCw,
  Save, Upload, X, Search, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccountSelect } from '@/components/ui/AccountSelect'
import type { HistoryCard } from '@/app/api/campaign-generator/history/route'
import type { CampaignBlueprintJson, CampaignBlueprintItem } from '@/types'

const H_MAX = 30
const D_MAX = 90

interface Detail {
  pushJobId: string
  blueprintId: string
  mediaPlanId: string
  planTitle: string
  customerId: string
  mode: string
  status: string
  pushedAt: string | null
  blueprintJson: CampaignBlueprintJson
}

// แก้ list ข้อความแบบ generic (headlines/descriptions) พร้อมตัวนับ
function TextListEditor({ label, values, max, limit, onChange }: {
  label: string
  values: string[]
  max: number
  limit: number
  onChange: (next: string[]) => void
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">{label}</p>
      <div className="space-y-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={v} onChange={e => onChange(values.map((x, j) => j === i ? e.target.value : x))}
              className={cn('flex-1 px-2.5 py-1.5 text-sm border rounded-lg',
                v.trim().length > limit ? 'border-red-300 bg-red-50/40' : 'border-gray-200')}/>
            <span className={cn('text-[10px] w-10 text-right', v.trim().length > limit ? 'text-red-600' : 'text-gray-400')}>
              {v.trim().length}/{limit}
            </span>
            <button onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5"/></button>
          </div>
        ))}
      </div>
      {values.length < max && (
        <button onClick={() => onChange([...values, ''])} className="mt-1 text-[11px] text-blue-600 hover:underline">+ เพิ่ม</button>
      )}
    </div>
  )
}

function HistoryDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // re-push
  const [accounts, setAccounts] = useState<Array<{ id: string; descriptiveName: string }>>([])
  const [pushCid, setPushCid] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushProgress, setPushProgress] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/campaign-generator/history?id=${id}`)
      .then(r => r.json())
      .then((d: Detail & { error?: string }) => {
        if (d.error) throw new Error(d.error)
        setDetail(d)
        setPushCid(d.customerId || '')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json() as Promise<{ accounts?: Array<{ id: string; descriptiveName: string; manager?: boolean }> }>)
      .then(d => setAccounts((d.accounts ?? []).filter(a => !a.manager)))
      .catch(() => {})
  }, [])

  const updateCampaign = useCallback((ci: number, updated: CampaignBlueprintItem) => {
    setDetail(prev => prev ? {
      ...prev,
      blueprintJson: {
        ...prev.blueprintJson,
        campaigns: prev.blueprintJson.campaigns.map((c, i) => i === ci ? updated : c),
      },
    } : prev)
  }, [])

  async function save(): Promise<boolean> {
    if (!detail) return false
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/campaign-generator/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId: detail.blueprintId, blueprintJson: detail.blueprintJson }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'บันทึกไม่สำเร็จ')
      setMsg({ ok: true, text: 'บันทึกแล้ว' })
      return true
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' })
      return false
    } finally {
      setSaving(false)
    }
  }

  // Push ทีละแคมเปญ (append) แบบเดียวกับหน้า build — กัน timeout บน serverless
  async function rePush() {
    if (!detail || !pushCid) return
    if (!(await save())) return
    setPushing(true)
    setMsg(null)
    try {
      const campaigns = detail.blueprintJson.campaigns
      for (let i = 0; i < campaigns.length; i++) {
        setPushProgress(`กำลัง push ${i + 1}/${campaigns.length}: ${campaigns[i].campaignName}`)
        const res = await fetch(`/api/media-plans/${detail.mediaPlanId}/push-blueprint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: pushCid,
            mode: 'live',
            append: i > 0,
            blueprintJson: {
              campaigns: [campaigns[i]],
              accountSettings: detail.blueprintJson.accountSettings,
              conversionActions: [],
            },
          }),
        })
        const text = await res.text()
        let data: { success?: boolean; error?: string }
        try { data = JSON.parse(text) } catch { throw new Error(`เซิร์ฟเวอร์ตอบไม่ใช่ JSON (HTTP ${res.status})`) }
        if (!res.ok || !data.success) throw new Error(data.error ?? `Push "${campaigns[i].campaignName}" ไม่สำเร็จ`)
      }
      setMsg({ ok: true, text: `Push ${campaigns.length} แคมเปญเข้า Google Ads แล้ว — รอบนี้ถูกเก็บเป็น card ใหม่ใน history` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Push ไม่สำเร็จ' })
    } finally {
      setPushing(false)
      setPushProgress('')
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-16 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin"/>กำลังโหลด...</div>
  if (error || !detail) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
      <AlertCircle className="w-4 h-4"/>{error || 'ไม่พบข้อมูล'}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4"/>กลับ
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{detail.planTitle}</h2>
          <p className="text-xs text-gray-400">
            push เมื่อ {detail.pushedAt ? new Date(detail.pushedAt).toLocaleString('th-TH') : '—'} · {detail.mode} · {detail.status}
          </p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}บันทึก
        </button>
      </div>

      {msg && (
        <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border',
          msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600')}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0"/> : <AlertCircle className="w-4 h-4 shrink-0"/>}
          {msg.text}
        </div>
      )}

      {/* แก้ text ads รายแคมเปญ */}
      {detail.blueprintJson.campaigns.map((c, ci) => (
        <div key={ci} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            {c.campaignType === 'PERFORMANCE_MAX' ? <Zap className="w-4 h-4 text-orange-500"/> : <Search className="w-4 h-4 text-blue-500"/>}
            <span className="font-semibold text-sm text-gray-900 truncate">{c.campaignName}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{c.campaignType} · ฿{(c.budget ?? 0).toLocaleString()}/วัน</span>
          </div>
          <div className="p-4 space-y-4">
            {/* Search/Display: adGroups → ads → rsa */}
            {(c.adGroups ?? []).map((ag, agi) => (
              <div key={agi} className="space-y-3">
                {ag.ads?.some(ad => ad.rsa) && <p className="text-xs font-bold text-gray-400">{ag.adGroupName}</p>}
                {(ag.ads ?? []).map((ad, adi) => ad.rsa ? (
                  <div key={adi} className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-gray-100 rounded-lg p-3">
                    <TextListEditor label={`Headlines (≤${H_MAX})`} values={ad.rsa.headlines} max={15} limit={H_MAX}
                      onChange={next => {
                        const cc = JSON.parse(JSON.stringify(c)) as CampaignBlueprintItem
                        cc.adGroups[agi].ads[adi].rsa!.headlines = next
                        updateCampaign(ci, cc)
                      }}/>
                    <TextListEditor label={`Descriptions (≤${D_MAX})`} values={ad.rsa.descriptions} max={4} limit={D_MAX}
                      onChange={next => {
                        const cc = JSON.parse(JSON.stringify(c)) as CampaignBlueprintItem
                        cc.adGroups[agi].ads[adi].rsa!.descriptions = next
                        updateCampaign(ci, cc)
                      }}/>
                  </div>
                ) : null)}
              </div>
            ))}
            {/* PMax: assetGroups */}
            {(c.assetGroups ?? []).map((ag, agi) => (
              <div key={agi} className="space-y-3">
                <p className="text-xs font-bold text-gray-400">{ag.assetGroupName}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-gray-100 rounded-lg p-3">
                  <TextListEditor label={`Headlines (≤${H_MAX})`} values={ag.headlines} max={15} limit={H_MAX}
                    onChange={next => {
                      const cc = JSON.parse(JSON.stringify(c)) as CampaignBlueprintItem
                      cc.assetGroups![agi].headlines = next
                      updateCampaign(ci, cc)
                    }}/>
                  <TextListEditor label={`Descriptions (≤${D_MAX})`} values={ag.descriptions} max={5} limit={D_MAX}
                    onChange={next => {
                      const cc = JSON.parse(JSON.stringify(c)) as CampaignBlueprintItem
                      cc.assetGroups![agi].descriptions = next
                      updateCampaign(ci, cc)
                    }}/>
                </div>
              </div>
            ))}
            {(c.adGroups ?? []).every(ag => !(ag.ads ?? []).some(ad => ad.rsa)) && (c.assetGroups ?? []).length === 0 && (
              <p className="text-xs text-gray-400">แคมเปญนี้ไม่มี text ads ให้แก้จากหน้านี้</p>
            )}
          </div>
        </div>
      ))}

      {/* re-push */}
      <div className="bg-gray-900 rounded-xl px-5 py-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="text-white font-medium text-sm">Push เข้า Google Ads อีกรอบ</p>
          <p className="text-gray-400 text-xs mt-0.5">
            {pushProgress || 'บันทึกอัตโนมัติก่อน push · แคมเปญจะถูกสร้างเป็นชุดใหม่ (PAUSED ตาม blueprint) — ไม่ทับของเดิมใน Google Ads'}
          </p>
        </div>
        <AccountSelect accounts={accounts} value={pushCid} onChange={setPushCid}
          className="px-3 py-2 rounded-lg text-sm bg-gray-800 text-white border border-gray-700 focus:outline-none"/>
        <button onClick={rePush} disabled={pushing || !pushCid}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors">
          {pushing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
          {pushing ? 'กำลัง push...' : 'Push ทั้งชุด'}
        </button>
      </div>
    </div>
  )
}

function HistoryList() {
  const [cards, setCards] = useState<HistoryCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetch('/api/campaign-generator/history')
      .then(r => r.json() as Promise<{ cards?: HistoryCard[]; error?: string }>)
      .then(d => {
        if (d.error) throw new Error(d.error)
        setCards(d.cards ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (activeId) return <HistoryDetail id={activeId} onBack={() => { setActiveId(null); load() }}/>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-blue-500"/>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Campaign Generator History</h1>
          <p className="text-sm text-gray-500 mt-0.5">ทุกชุดที่ push เข้า Google Ads สำเร็จ — เปิดดู แก้ text ads แล้ว push ซ้ำได้</p>
        </div>
        <Link href="/campaign-generator" className="text-xs text-blue-600 font-semibold hover:underline shrink-0">
          ← Campaign Generator
        </Link>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 shrink-0">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>รีเฟรช
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4"/>{error}</div>}
      {loading && cards.length === 0 && (
        <div className="flex items-center gap-2 py-16 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin"/>กำลังโหลด...</div>
      )}
      {!loading && !error && cards.length === 0 && (
        <div className="py-16 text-center text-gray-400 text-sm">
          ยังไม่มีประวัติ — card จะโผล่ที่นี่อัตโนมัติหลัง push สำเร็จครั้งถัดไป
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map(card => (
          <button key={card.pushJobId} onClick={() => setActiveId(card.pushJobId)}
            className="text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-sm text-gray-900 flex-1 truncate">{card.planTitle}</p>
              <span className={cn('px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0',
                card.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                {card.status === 'completed' ? 'สำเร็จ' : 'สำเร็จบางส่วน'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              {card.clientName && `${card.clientName} · `}
              {card.pushedAt ? new Date(card.pushedAt).toLocaleString('th-TH') : ''}
              {card.customerId && ` · บัญชี ${card.customerId}`}
            </p>
            <div className="flex flex-wrap gap-1">
              {card.campaignNames.slice(0, 3).map((n, i) => (
                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] truncate max-w-[180px]">{n}</span>
              ))}
              {card.campaignCount > 3 && <span className="text-[11px] text-gray-400">+{card.campaignCount - 3}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CampaignGeneratorHistoryPage() {
  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto">
        <Suspense fallback={<div className="py-16 text-center text-gray-400">กำลังโหลด...</div>}>
          <HistoryList/>
        </Suspense>
      </div>
    </AppShell>
  )
}
