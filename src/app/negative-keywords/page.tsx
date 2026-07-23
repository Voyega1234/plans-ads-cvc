'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  Ban, RefreshCw, Loader2, AlertCircle, CheckCircle2, Sparkles,
  ChevronDown, ChevronRight, Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccountSelect } from '@/components/ui/AccountSelect'
import type { CampaignSearchTerms, NegativeSuggestion, NegativeMatchType } from '@/app/api/negative-keywords/route'

interface Account { id: string; name: string; currencyCode?: string }

const MATCH_TYPES: NegativeMatchType[] = ['BROAD', 'PHRASE', 'EXACT']

// รายการ negative ที่ผู้ใช้แก้ไขได้ต่อ search term หนึ่งแถว
interface NegEdit { text: string; matchType: NegativeMatchType; reason?: string }

// ─── Per-campaign card ─────────────────────────────────────────────────────────

function CampaignTermsCard({
  campaign, customerId, onApplied, scope = 'campaign', accountCampaignResourceNames,
}: {
  campaign: CampaignSearchTerms
  customerId: string
  onApplied: (campaignId: string, keywords: string[]) => void
  scope?: 'campaign' | 'account'
  accountCampaignResourceNames?: string[]  // scope=account: แคมเปญที่จะ attach negative list เข้าไป
}) {
  const isAccount = scope === 'account'
  const [listName, setListName] = useState('')
  const [expanded, setExpanded] = useState(isAccount)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // edit ต่อ search term: คำที่จะ negative (แก้ได้) + match type
  const [edits, setEdits] = useState<Record<string, NegEdit>>({})
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
      if (next.has(term)) {
        next.delete(term)
      } else {
        next.add(term)
        // ตอนติ๊กครั้งแรก ตั้ง default = ทั้ง search term แบบ phrase (แล้วผู้ใช้แก้เหลือเฉพาะคำได้)
        setEdits(prevE => prevE[term] ? prevE : { ...prevE, [term]: { text: term, matchType: 'PHRASE' } })
      }
      return next
    })
  }

  function updateEdit(term: string, patch: Partial<NegEdit>) {
    setEdits(prev => {
      const cur: NegEdit = prev[term] ?? { text: term, matchType: 'PHRASE' }
      return { ...prev, [term]: { ...cur, ...patch } }
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
        setSelected(new Set(suggestions.map(s => s.searchTerm)))
        setEdits(prev => {
          const next = { ...prev }
          for (const s of suggestions) {
            next[s.searchTerm] = { text: s.negative, matchType: s.matchType, reason: s.reason }
          }
          return next
        })
        setExpanded(true)
        setOkMsg(`ระบบคัดมาให้ ${suggestions.length} คำ — แก้คำ/match type ได้ แล้วกด "อัพเดต Negative Keywords"`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSuggesting(false)
    }
  }

  async function apply() {
    const terms = Array.from(selected)
    // แปลงเป็นรายการ negative keyword จริง (text + matchType) ที่ผู้ใช้แก้ไว้
    const keywords = terms
      .map(t => {
        const e = edits[t] ?? { text: t, matchType: 'PHRASE' as NegativeMatchType }
        return { text: e.text.trim(), matchType: e.matchType }
      })
      .filter(k => k.text.length > 0)
    if (!keywords.length) {
      setError('ยังไม่มีคำที่จะ negative — ติ๊กเลือกและกรอกคำก่อน')
      return
    }
    const attachCount = accountCampaignResourceNames?.length ?? 0
    const confirmMsg = isAccount
      ? `สร้าง negative list ระดับ Account จาก ${keywords.length} คำ แล้ว attach เข้า ${attachCount} แคมเปญใน Google Ads?`
      : `เพิ่ม ${keywords.length} negative keywords เข้าแคมเปญ "${campaign.campaignName}" ใน Google Ads?`
    if (!confirm(confirmMsg)) return
    setApplying(true)
    setError('')
    setOkMsg('')
    try {
      const payload = isAccount
        ? {
            action: 'apply', customerId, scope: 'account',
            campaignResourceNames: accountCampaignResourceNames ?? [],
            listName: listName.trim() || undefined,
            keywords,
          }
        : {
            action: 'apply', customerId, scope: 'campaign',
            campaignResourceName: campaign.campaignResourceName,
            keywords,
          }
      const res = await fetch('/api/negative-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { added?: number; error?: string; message?: string; attachedCampaigns?: number; attachErrors?: string[] }
      if (!res.ok) throw new Error(data.error ?? 'อัพเดตไม่สำเร็จ')
      onApplied(campaign.campaignId, terms)
      setSelected(new Set())
      setEdits({})
      if (isAccount) {
        const warn = data.attachErrors?.length ? ` (บางแคมเปญ attach ไม่ได้: ${data.attachErrors[0]})` : ''
        setOkMsg((data.message ?? `สร้าง negative list ${data.added ?? keywords.length} คำแล้ว`) + ' ✓' + warn)
      } else {
        setOkMsg(`เพิ่ม ${data.added ?? keywords.length} negative keywords เข้าแคมเปญแล้ว ✓`)
      }
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
            {isAccount ? 'สร้าง Negative List (Account)' : 'อัพเดต Negative Keywords'}{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>

      {isAccount && (
        <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-gray-500">ชื่อ Negative List:</label>
          <input
            type="text"
            value={listName}
            onChange={e => setListName(e.target.value)}
            placeholder="เว้นว่าง = ตั้งชื่ออัตโนมัติตามวันเวลา"
            className="flex-1 min-w-[220px] px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
          />
          <span className="text-[11px] text-gray-400">จะ attach เข้า {accountCampaignResourceNames?.length ?? 0} แคมเปญที่รองรับ (Search/Shopping)</span>
        </div>
      )}

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
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 min-w-[280px]">Negative keyword (แก้ได้)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaign.terms.map(t => {
                const checked = selected.has(t.searchTerm)
                const edit = edits[t.searchTerm]
                const reason = edit?.reason
                return (
                  <tr key={t.searchTerm} className={cn('transition-colors', t.alreadyNegative ? 'opacity-50' : checked ? 'bg-red-50/50' : 'hover:bg-gray-50')}>
                    <td className="px-3 py-2 text-center align-top">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={t.alreadyNegative}
                        onChange={() => toggleTerm(t.searchTerm)}
                        className="w-4 h-4 mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="text-xs font-medium text-gray-900">{t.searchTerm}</p>
                      {reason && checked && <p className="text-[10px] text-purple-600 mt-0.5">🤖 {reason}</p>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums align-top">{t.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums align-top">{t.clicks.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 tabular-nums font-medium align-top">฿{t.cost.toLocaleString()}</td>
                    <td className={cn('px-3 py-2 text-right text-xs tabular-nums font-semibold align-top', t.conversions > 0 ? 'text-emerald-600' : 'text-gray-400')}>{t.conversions}</td>
                    <td className="px-3 py-2 align-top">
                      {t.alreadyNegative
                        ? <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">เป็น negative อยู่แล้ว</span>
                        : checked
                          ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={edit?.text ?? t.searchTerm}
                                onChange={e => updateEdit(t.searchTerm, { text: e.target.value })}
                                placeholder="คำที่จะ negative"
                                className="flex-1 min-w-0 px-2 py-1 text-xs font-mono text-red-700 border border-red-200 rounded focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
                              />
                              <select
                                value={edit?.matchType ?? 'PHRASE'}
                                onChange={e => updateEdit(t.searchTerm, { matchType: e.target.value as NegativeMatchType })}
                                className="shrink-0 px-1.5 py-1 text-[11px] border border-gray-200 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-400"
                              >
                                {MATCH_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                          )
                          : <span className="text-[10px] text-gray-300">— ติ๊กเพื่อเลือกคำ —</span>
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

const DAY_OPTIONS = [7, 14, 30, 60, 90]

export default function NegativeKeywordsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignSearchTerms[]>([])
  const [days, setDays] = useState(30)
  const [viewMode, setViewMode] = useState<'campaign' | 'account'>('campaign')
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

  async function load(customerId: string, lookbackDays: number) {
    if (!customerId) return
    setLoading(true)
    setError('')
    setLoaded(false)
    setCampaigns([])
    try {
      const res = await fetch(`/api/negative-keywords?customerId=${customerId}&days=${lookbackDays}`)
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
    if (selectedCustomer) void load(selectedCustomer, days)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer, days])

  // มุมมอง "ทั้ง Account" — รวม search terms ทุกแคมเปญเป็นแคมเปญเสมือนก้อนเดียว (รวม metrics ตามคำ)
  const accountCampaign: CampaignSearchTerms = (() => {
    const byTerm = new Map<string, CampaignSearchTerms['terms'][number]>()
    for (const c of campaigns) {
      for (const t of c.terms) {
        const ex = byTerm.get(t.searchTerm)
        if (ex) {
          ex.impressions += t.impressions
          ex.clicks += t.clicks
          ex.cost += t.cost
          ex.conversions += t.conversions
        } else {
          byTerm.set(t.searchTerm, { ...t, alreadyNegative: false })
        }
      }
    }
    return {
      campaignId: '__account__',
      campaignName: 'ทั้ง Account (รวมทุกแคมเปญ)',
      campaignResourceName: '',
      terms: Array.from(byTerm.values()).sort((a, b) => b.cost - a.cost),
    }
  })()

  const allCampaignResourceNames = campaigns
    .map(c => c.campaignResourceName)
    .filter((r): r is string => !!r)

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
            ดึง search terms ตามจำนวนวันที่เลือก ให้ระบบคัดเฉพาะ &quot;คำ&quot; ที่ควร negative (ไม่ใช่ทั้งประโยค) แก้คำ/match type ได้ แล้ว push เข้า Google Ads ระดับแคมเปญ หรือสร้างเป็น Negative List ระดับ Account
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
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">ช่วงเวลา</label>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {DAY_OPTIONS.map(d => <option key={d} value={d}>{d} วันล่าสุด</option>)}
            </select>
          </div>
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">ระดับที่จะ Negative</label>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('campaign')}
                className={cn('px-3 py-2 text-xs font-medium transition-colors', viewMode === 'campaign' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
              >รายแคมเปญ</button>
              <button
                onClick={() => setViewMode('account')}
                className={cn('px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200', viewMode === 'account' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
              >ทั้ง Account (List)</button>
            </div>
          </div>
          <button
            onClick={() => selectedCustomer && load(selectedCustomer, days)}
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
          <div className="py-10 text-center text-gray-400 text-sm">ไม่พบ search terms ใน account นี้ ({days} วันล่าสุด)</div>
        )}

        {!loading && loaded && campaigns.length > 0 && (
          viewMode === 'account'
            ? (
              <CampaignTermsCard
                key="__account__"
                campaign={accountCampaign}
                customerId={selectedCustomer}
                onApplied={handleApplied}
                scope="account"
                accountCampaignResourceNames={allCampaignResourceNames}
              />
            )
            : (
              <div className="space-y-3">
                {campaigns.map(c => (
                  <CampaignTermsCard key={c.campaignId} campaign={c} customerId={selectedCustomer} onApplied={handleApplied}/>
                ))}
              </div>
            )
        )}
      </div>
    </AppShell>
  )
}
