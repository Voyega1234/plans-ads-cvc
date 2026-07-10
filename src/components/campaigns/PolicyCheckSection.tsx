'use client'

/**
 * Policy Check — ตรวจความเสี่ยง Google Ads Policy ในหน้า QA (advisory — ไม่ block push)
 * โมดูลแยกอิสระ ไม่กระทบ QA checks เดิม
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ShieldCheck, ShieldAlert, Loader2, AlertTriangle, Copy, CheckCircle2 } from 'lucide-react'

export interface PolicyDraftCampaign {
  name: string
  type?: string
  finalUrl?: string
  headlines?: string[]
  descriptions?: string[]
  keywords?: string[]
}
interface PolicyItem {
  campaign: string
  target: string
  category: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  reason: string
  evidence: string
  fix: string
  clientExplanation: string
  status: 'PASSED' | 'WARNING' | 'FAILED' | 'NEEDS_REVIEW'
}

const RISK_STYLE: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-gray-50 text-gray-500 border-gray-200',
}
const STATUS_STYLE: Record<string, string> = {
  FAILED: 'bg-red-100 text-red-700',
  WARNING: 'bg-amber-100 text-amber-700',
  NEEDS_REVIEW: 'bg-blue-100 text-blue-700',
  PASSED: 'bg-emerald-100 text-emerald-700',
}

function CopyMini({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* noop */ } }}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
    >
      {copied ? <><CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Copied</> : <><Copy className="w-2.5 h-2.5" /> Copy Client Explanation</>}
    </button>
  )
}

export default function PolicyCheckSection({ campaigns, customerId }: {
  campaigns: PolicyDraftCampaign[]
  customerId?: string
}) {
  const [items, setItems] = useState<PolicyItem[] | null>(null)
  const [note, setNote] = useState('')
  const [liveChecked, setLiveChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (loading) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/qa/policy-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, campaigns }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      setItems(d.items ?? [])
      setNote(d.overallNote ?? '')
      setLiveChecked(!!d.liveChecked)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ตรวจ policy ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  const high = (items ?? []).filter(i => i.riskLevel === 'HIGH').length
  const med = (items ?? []).filter(i => i.riskLevel === 'MEDIUM').length

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-500" /> Policy Check
            {items !== null && (
              items.length === 0
                ? <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">ไม่พบความเสี่ยงชัดเจน</span>
                : <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">{items.length} จุด ({high} high · {med} medium)</span>
            )}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            ตรวจความเสี่ยง Google Ads Policy จาก ad copy / keywords / landing page{customerId ? ' + สถานะโฆษณาจริงในบัญชี' : ''} — เป็นคำเตือน ไม่บล็อกการ push
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading || campaigns.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          {items === null ? 'ตรวจ Policy' : 'ตรวจใหม่'}
        </button>
      </div>

      {loading && <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> กำลังวิเคราะห์ policy risk ({campaigns.length} แคมเปญ{customerId ? ' + live ads' : ''})...</p>}
      {error && (
        <p className="text-xs text-red-600 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {items !== null && !loading && (
        <>
          {items.length === 0 ? (
            <p className="text-xs text-gray-600 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 leading-relaxed">{note}</p>
          ) : (
            <div className="space-y-2.5">
              {items.map((it, i) => (
                <div key={i} className={cn('border rounded-lg p-3 space-y-1.5', it.riskLevel === 'HIGH' ? 'border-red-200 bg-red-50/40' : it.riskLevel === 'MEDIUM' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200')}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded-full border', RISK_STYLE[it.riskLevel])}>{it.riskLevel}</span>
                    <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded-full', STATUS_STYLE[it.status] ?? STATUS_STYLE.NEEDS_REVIEW)}>{it.status}</span>
                    <span className="text-xs font-semibold text-gray-800">{it.category}</span>
                    <span className="text-[11px] text-gray-400">· {it.campaign} · {it.target}</span>
                  </div>
                  <p className="text-xs text-gray-700"><strong>เหตุผล:</strong> {it.reason}</p>
                  {it.evidence && <p className="text-[11px] text-gray-500"><strong>หลักฐาน:</strong> {it.evidence}</p>}
                  <p className="text-xs text-gray-700"><strong>วิธีแก้:</strong> {it.fix}</p>
                  <div className="flex items-start justify-between gap-2 bg-white border border-gray-100 rounded-md p-2">
                    <p className="text-[11px] text-gray-600 leading-relaxed flex-1">💬 {it.clientExplanation}</p>
                    <CopyMini text={it.clientExplanation} />
                  </div>
                </div>
              ))}
              {note && <p className="text-[11px] text-gray-400">{note}</p>}
            </div>
          )}
          <p className="text-[10px] text-gray-300">
            {liveChecked ? 'รวมสถานะ policy จริงจากโฆษณาในบัญชีแล้ว · ' : ''}ผลนี้เป็นการประเมินความเสี่ยงเบื้องต้น — การอนุมัติจริงขึ้นกับระบบตรวจของ Google
          </p>
        </>
      )}
    </div>
  )
}
