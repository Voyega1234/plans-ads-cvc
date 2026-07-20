'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  Ban, RefreshCw, Loader2, AlertCircle, CheckCircle2, Sparkles,
  ChevronDown, ChevronRight, Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccountSelect } from '@/components/ui/AccountSelect'
import type { CampaignSearchTerms, NegativeSuggestion } from '@/app/api/negative-keywords/route'

interface Account { id: string; name: string; currencyCode?: string }

// ─── Per-campaign card ─────────────────────────────────────────────────────────

function CampaignTermsCard({
  campaign, customerId, onApplied,
}: {
  campaign: CampaignSearchTerms
  customerId: string
  onApplied: (campaignId: string, keywords: string[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [suggesting, setSuggesting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const selectable = campaign.terms.filter(t => !t.alreadyNegative)
  const wasted = campaign.terms.filter(t => !t.alreadyNegative && t.conversions === 0 && t.clicks > 0)
  const wastedCost = wasted.reduce((s, t) => s + t.cost, 0)

  function toggleTerm(term: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(term)) next.delete(term)
      else next.add(term)
      return next
    })
  }

  // "คัด Negative Keyword" — ให้ระบบ (AI + heuristic) เลือกคำให้เอง แล้วติ๊กในตาราง
  async function suggest() {
    setSuggesting(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch('/api/negative-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest',
          campaignName: campaign.campaignName,
          terms: selectable.map(t => ({
            searchTerm: t.searchTerm,
            impressions: t.impressions,
            clicks: t.clicks,
            cost: t.cost,
            conversions: t.conversions,
          })),
        }),
      })
      const data = await res.json() as { suggestions?: NegativeSuggestion[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'คัดไม่สำเร็จ')
      const suggestions = data.suggestions ?? []
      if (!suggestions.length) {
        setOkMsg('ระบบไม่พบ search term ที่ควรเป็น negative — แคมเปญนี้ค่อนข้างสะอาดแล้ว')
      } else {
        setSelected(new Set(suggestions.map(s => s.term)))
        setReasons(Object.fromEntries(suggestions.map(s => [s.term, s.reason])))
        setExpanded(true)
        setOkMsg(`ระบบคัดมาให้ ${suggestions.length} คำ — ตรวจแล้วกด "อัพเดต Negative Keywords" ได้เลย`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSuggesting(false)
    }
  }

  async function apply() {
    const keywords = Array.from(selected)
    if (!keywords.length) return
    if (!confirm(`เพิ่ม ${keywords.length} negative keywords (phrase match) เข้าแคมเปญ "${campaign.campaignName}" ใน Google Ads?`)) return
    setApplying(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch('/api/negative-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          customerId,
          campaignResourceName: campaign.campaignResourceName,
          keywords,
        }),
      })
      const data = await res.json() as { added?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'อัพเดตไม่สำเร็จ')
      onApplied(campaign.campaignId, keywords)
      setSelected(new Set())
      setReasons({})
      setOkMsg(`เพิ่ม ${data.added ?? keywords.length} negative keywords เข้าแคมเปญแล้ว ✓`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0"/>}
          <span className="font-semibold text-sm text-gray-900 truncate">{campaign.campaignName}</span>
          <span className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-500 rounded-full shrink-0">{campaign.terms.length} terms</span>
          {wasted.length > 0 && (
            <span className="px-2 py-0.5 text-[11px] bg-red-50 text-red-600 border border-red-100 rounded-full shrink-0">
              {wasted.length} คำไม่มี conv. (฿{wastedCost.toLocaleString()})
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={suggest}
            disabled={suggesting || !selectable.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg disabled:opacity-50 transition-colors"
          >
            {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Sparkles className="w-3.5 h-3.5"/>}
            คัด Negative Keyword
          </button>
          <button
            onClick={apply}
            disabled={applying || selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 transition-colors"
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Upload className="w-3.5 h-3.5"/>}
            อัพเดต Negative Keywords{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>

      {(error || okMsg) && (
        <div className={cn('mx-4 mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2',
          error ? 'bg-red-50 border border-red-200 text-red-600' : 'bg-emerald-50 border border-emerald-200 text-emerald-700')}>
          {error ? <AlertCircle className="w-3.5 h-3.5 shrink-0"/> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0"/>}
          {error || okMsg}
        </div>
      )}

      {/* Terms table */}
      {expanded && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-10 px-3 py-2.5"></th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Search Term</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Impr.</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Clicks</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Cost</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Conv.</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Negative (phrase)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaign.terms.map(t => {
                const checked = selected.has(t.searchTerm)
                const reason = reasons[t.searchTerm]
                return (
                  <tr key={t.searchTerm} className={cn('transition-colors', t.alreadyNegative ? 'opacity-50' : checked ? 'bg-red-50/50' : 'hover:bg-gray-50')}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={t.alreadyNegative}
                        onChange={() => toggleTerm(t.searchTerm)}
                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs font-medium text-gray-900">{t.searchTerm}</p>
                      {reason && checked && <p className="text-[10px] text-purple-600 mt-0.5">🤖 {reason}</p>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums">{t.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums">{t.clicks.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 tabular-nums font-medium">฿{t.cost.toLocaleString()}</td>
                    <td className={cn('px-3 py-2 text-right text-xs tabular-nums font-semibold', t.conversions > 0 ? 'text-emerald-600' : 'text-gray-400')}>{t.conversions}</td>
                    <td className="px-3 py-2">
                      {t.alreadyNegative
                        ? <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">เป็น negative อยู่แล้ว</span>
                        : checked
                          ? <span className="text-xs font-mono text-red-600">&quot;{t.searchTerm}&quot;</span>
                          : <span className="text-[10px] text-gray-300">—</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {campaign.terms.length === 0 && (
            <div className="py-8 text-center text-gray-400 text-sm">ไม่พบ search terms</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function NegativeKeywordsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignSearchTerms[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then((d: { accounts?: Array<{ id: string; descriptiveName?: string; name?: string; currencyCode?: string }> }) => {
        const list: Account[] = (d.accounts ?? []).map(a => ({
          id: a.id, name: a.descriptiveName ?? a.name ?? a.id, currencyCode: a.currencyCode,
        }))
        setAccounts(list)
      })
      .catch(() => {})
  }, [])

  async function load(customerId: string) {
    if (!customerId) return
    setLoading(true)
    setError('')
    setLoaded(false)
    setCampaigns([])
    try {
      const res = await fetch(`/api/negative-keywords?customerId=${customerId}`)
      const data = await res.json() as { campaigns?: CampaignSearchTerms[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'โหลด search terms ไม่สำเร็จ')
      setCampaigns(data.campaigns ?? [])
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCustomer) void load(selectedCustomer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer])

  // หลัง apply สำเร็จ — mark คำเหล่านั้นเป็น negative แล้วในตาราง
  function handleApplied(campaignId: string, keywords: string[]) {
    const set = new Set(keywords)
    setCampaigns(prev => prev.map(c => c.campaignId === campaignId
      ? { ...c, terms: c.terms.map(t => set.has(t.searchTerm) ? { ...t, alreadyNegative: true } : t) }
      : c
    ))
  }

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-500"/>
            Negative Keywords
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            ดึง search terms 30 วันล่าสุดของแต่ละแคมเปญ ให้ระบบคัดคำที่เปลืองงบ แล้วอัพเดตเป็น negative keyword (phrase match) เข้าแคมเปญนั้นใน Google Ads ได้เลย
          </p>
        </div>

        {/* Account selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Account</label>
            <AccountSelect
              accounts={accounts}
              value={selectedCustomer}
              onChange={id => setSelectedCustomer(id)}
              placeholder="-- เลือก Account --"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <button
            onClick={() => selectedCustomer && load(selectedCustomer)}
            disabled={loading || !selectedCustomer}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')}/>รีเฟรช
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0"/>{error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-10 justify-center text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin"/>กำลังดึง search terms...
          </div>
        )}

        {!loading && loaded && campaigns.length === 0 && !error && (
          <div className="py-10 text-center text-gray-400 text-sm">ไม่พบ search terms ใน account นี้ (30 วันล่าสุด)</div>
        )}

        <div className="space-y-3">
          {campaigns.map(c => (
            <CampaignTermsCard key={c.campaignId} campaign={c} customerId={selectedCustomer} onApplied={handleApplied}/>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
