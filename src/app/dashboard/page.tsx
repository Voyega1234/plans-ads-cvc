'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import AppShell from '@/components/layout/AppShell'
import { RefreshCw, Search, TrendingUp, TrendingDown, AlertTriangle, Plus, Pencil, X, Save, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { MonitorCampaign } from '@/app/api/performance/monitor/route'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account { id: string; name: string; currencyCode?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) }
function fmtB(n: number) { return `฿${fmt(n)}` }
function fmtCpc(n: number) {
  if (n === 0) return '—'
  if (n < 1) return `฿${n.toFixed(2)}`
  return fmtB(Math.round(n))
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

const ECOMMERCE_BIDDING = new Set(['MAXIMIZE_CONVERSION_VALUE', 'TARGET_ROAS'])
function isEcommerce(s: string) { return ECOMMERCE_BIDDING.has(s) }

function pctColor(pct: number | null, inverse = false): string {
  if (pct === null) return 'text-gray-400'
  const good = inverse ? pct <= 0 : pct >= 0
  return good ? 'text-emerald-600' : 'text-red-500'
}

function PctBadge({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct === null) return null
  const good = inverse ? pct <= 0 : pct >= 0
  const sign = pct > 0 ? '↑' : '↓'
  return (
    <span className={cn('text-[11px]', good ? 'text-emerald-600' : 'text-red-500')}>
      {sign} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortCol = 'name' | 'client' | 'budget' | 'spend' | 'impr' | 'clicks' | 'ctr' | 'conv' | 'cpc' | 'cpa' | 'value' | 'roas' | 'status'
type SortDir = 'asc' | 'desc'

function SortTh({ col, label, current, dir, onSort }: {
  col: SortCol; label: string; current: SortCol; dir: SortDir; onSort: (c: SortCol) => void
}) {
  const active = current === col
  return (
    <th
      className="py-3 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-gray-600 transition-colors text-left"
      onClick={() => onSort(col)}
    >
      <span className={cn('flex items-center gap-0.5', active && 'text-gray-700')}>
        {label}
        {active && <span className="text-[10px]">{dir === 'desc' ? ' ↓' : ' ↑'}</span>}
      </span>
    </th>
  )
}

// ── Campaign sub-label (insight line) ─────────────────────────────────────────

function subLabel(c: MonitorCampaign): string {
  const ecom = isEcommerce(c.biddingStrategy)
  if (ecom && c.targetRoas && c.roas > 0) {
    const diff = ((c.roas / c.targetRoas) - 1) * 100
    return `ROAS ${c.roas.toFixed(2)}x ${diff >= 0 ? 'เกิน' : 'ต่ำกว่า'} target ${c.targetRoas}x (${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%)`
  }
  if (c.biddingStrategy === 'TARGET_CPA' && c.targetCpa && c.cpa > 0) {
    const diff = ((c.cpa / c.targetCpa) - 1) * 100
    return `CPA ฿${Math.round(c.cpa)} ${diff > 0 ? 'สูงกว่า' : 'ต่ำกว่า'} target ฿${Math.round(c.targetCpa)} (${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%)`
  }
  if (c.biddingStrategy === 'CPM') {
    const cpm = c.impressions > 0 ? (c.cost / c.impressions) * 1000 : 0
    return `CPM ฿${cpm.toFixed(2)} ต่ำกว่า benchmark Y...`
  }
  return ''
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ENABLED: { label: 'Active',  cls: 'bg-emerald-50 text-emerald-700' },
    PAUSED:  { label: 'Paused',  cls: 'bg-gray-100 text-gray-500' },
    REMOVED: { label: 'Removed', cls: 'bg-red-50 text-red-600' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-400' }
  return <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', cls)}>{label}</span>
}

function hasCpaAlert(c: MonitorCampaign): boolean {
  if (!c.targetCpa || c.cpa <= 0) return false
  return c.cpa > c.targetCpa * 1.2
}

// ── Bidding helpers ───────────────────────────────────────────────────────────

const CPA_STRATEGIES  = new Set(['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'])
const ROAS_STRATEGIES = new Set(['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE'])

function campaignResourceNameOf(c: MonitorCampaign): string {
  return c.campaignResourceName ?? `customers/${c.customerId.replace(/-/g, '')}/campaigns/${c.campaignId}`
}

// ── Edit modal (budget + bidding) ─────────────────────────────────────────────

function EditCampaignModal({
  campaign, onClose, onSaved,
}: {
  campaign: MonitorCampaign
  onClose: () => void
  onSaved: (patch: Partial<MonitorCampaign>) => void
}) {
  // Strategy is editable: keep the campaign's own strategy selected by default,
  // switching it sends changeStrategy so the API rewrites the bidding scheme.
  const STRATEGY_OPTIONS = ['MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_ROAS'] as const
  const initialStrategy = (STRATEGY_OPTIONS as readonly string[]).includes(campaign.biddingStrategy)
    ? campaign.biddingStrategy
    : 'MAXIMIZE_CONVERSIONS'
  const [strategy, setStrategy] = useState(initialStrategy)
  const isCpa  = CPA_STRATEGIES.has(strategy)
  const isRoas = ROAS_STRATEGIES.has(strategy)
  const strategyChanged = strategy !== campaign.biddingStrategy

  const [budget, setBudget] = useState(String(campaign.dailyBudget || ''))
  const [target, setTarget] = useState(
    CPA_STRATEGIES.has(campaign.biddingStrategy) ? String(campaign.targetCpa ?? '')
      : ROAS_STRATEGIES.has(campaign.biddingStrategy) ? String(campaign.targetRoas ?? '') : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function save() {
    setError('')
    const patch: Partial<MonitorCampaign> = {}
    const newBudget = parseFloat(budget)
    const newTarget = parseFloat(target)

    const budgetChanged = !isNaN(newBudget) && newBudget > 0 && newBudget !== campaign.dailyBudget
    const targetChanged = !isNaN(newTarget) && newTarget > 0 &&
      newTarget !== (isCpa ? campaign.targetCpa ?? 0 : campaign.targetRoas ?? 0)
    const biddingChanged = strategyChanged || targetChanged

    if (!budgetChanged && !biddingChanged) { setError('ไม่มีค่าที่เปลี่ยนแปลง'); return }
    if (budgetChanged && !campaign.budgetResourceName) { setError('ไม่พบ budget ของแคมเปญนี้ (ลอง Refresh)'); return }
    // TARGET_CPA / TARGET_ROAS require an explicit target value.
    if (biddingChanged && (strategy === 'TARGET_CPA' || strategy === 'TARGET_ROAS') && (isNaN(newTarget) || newTarget <= 0)) {
      setError(strategy === 'TARGET_CPA' ? 'Target CPA ต้องระบุ (บาท)' : 'Target ROAS ต้องระบุ (เท่า)')
      return
    }
    if (strategyChanged && !confirm(`ยืนยันเปลี่ยน bidding strategy ของ "${campaign.campaignName}"\n${campaign.biddingStrategy} → ${strategy}?\n(การเปลี่ยน strategy จะรีเซ็ตช่วงเรียนรู้ของ Google)`)) return

    setSaving(true)
    try {
      if (budgetChanged) {
        const res = await fetch('/api/campaign-adjustments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit_campaign_budget',
            customerId: campaign.customerId,
            budgetResourceName: campaign.budgetResourceName,
            dailyBudgetMicros: Math.round(newBudget * 1_000_000),
          }),
        })
        if (!res.ok) {
          const d = await res.json() as { error?: string }
          throw new Error(d.error ?? 'ปรับงบไม่สำเร็จ')
        }
        patch.dailyBudget = Math.round(newBudget)
      }
      if (biddingChanged) {
        const hasTarget = !isNaN(newTarget) && newTarget > 0
        const res = await fetch('/api/campaign-adjustments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit_campaign_bidding',
            customerId: campaign.customerId,
            campaignResourceName: campaignResourceNameOf(campaign),
            biddingStrategyType: strategy,
            ...(strategyChanged ? { changeStrategy: true } : {}),
            ...(isCpa && hasTarget ? { targetCpaMicros: Math.round(newTarget * 1_000_000) } : {}),
            ...(isRoas && hasTarget ? { targetRoas: newTarget } : {}),
          }),
        })
        if (!res.ok) {
          const d = await res.json() as { error?: string }
          throw new Error(d.error ?? 'ปรับ bidding ไม่สำเร็จ')
        }
        patch.biddingStrategy = strategy
        if (isCpa && hasTarget) patch.targetCpa = newTarget
        if (isRoas && hasTarget) patch.targetRoas = newTarget
      }
      onSaved(patch)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">แก้ไขแคมเปญ</h3>
            <p className="text-xs text-gray-400 mt-0.5 break-words">{campaign.campaignName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 shrink-0"><X className="w-4 h-4 text-gray-400"/></button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">งบประมาณรายวัน (บาท)</label>
          <input
            type="number" min="1" value={budget}
            onChange={e => setBudget(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Bidding Strategy
            <span className="ml-1 text-gray-400 font-normal">— ปัจจุบัน: {campaign.biddingStrategy || 'ไม่ทราบ'}</span>
          </label>
          <select
            value={strategy}
            onChange={e => setStrategy(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STRATEGY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {strategyChanged && (
            <p className="mt-1 text-[11px] text-amber-600">
              ⚠️ จะเปลี่ยน strategy จริงใน Google Ads — แคมเปญเข้าสู่ช่วงเรียนรู้ใหม่ (learning period)
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            {isCpa ? 'Target CPA (บาท)' : 'Target ROAS (เท่า เช่น 4 = 400%)'}
            {(strategy === 'MAXIMIZE_CONVERSIONS' || strategy === 'MAXIMIZE_CONVERSION_VALUE') && (
              <span className="ml-1 text-gray-400 font-normal">— เว้นว่างได้ (ให้ Google หาให้)</span>
            )}
          </label>
          <input
            type="number" min="0" step={isCpa ? '1' : '0.1'} value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={isCpa ? 'เช่น 300' : 'เช่น 4'}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            อัพเดตใน Google Ads
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DAY_TABS = [
  { label: 'วันนี้',    value: '1' },
  { label: '7 วัน',    value: '7' },
  { label: '30 วัน',   value: '30' },
  { label: 'กำหนดเอง', value: 'custom' },
]

export default function CampaignMonitorPage() {
  const [clients,    setClients]    = useState<Account[]>([])
  const [campaigns,  setCampaigns]  = useState<MonitorCampaign[]>([])
  const [loading,    setLoading]    = useState(true)
  const [days,       setDays]       = useState('1')
  const [search,     setSearch]     = useState('')
  const [clientTab,  setClientTab]  = useState<string>('all')
  // Big accounts have long PAUSED tails — default to showing only what's running.
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENABLED' | 'PAUSED'>('ENABLED')
  const [sortCol,    setSortCol]    = useState<SortCol>('spend')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [editCampaign, setEditCampaign] = useState<MonitorCampaign | null>(null)
  const [togglingKey,  setTogglingKey]  = useState<string | null>(null)
  const [actionMsg,    setActionMsg]    = useState<{ text: string; ok: boolean } | null>(null)

  function patchCampaign(target: MonitorCampaign, patch: Partial<MonitorCampaign>) {
    setCampaigns(prev => prev.map(c =>
      c.customerId === target.customerId && c.campaignId === target.campaignId ? { ...c, ...patch } : c
    ))
  }

  function flashMsg(text: string, ok: boolean) {
    setActionMsg({ text, ok })
    setTimeout(() => setActionMsg(null), 4000)
  }

  async function toggleStatus(c: MonitorCampaign) {
    const newStatus = c.status === 'ENABLED' ? 'PAUSED' : 'ENABLED'
    const label = newStatus === 'PAUSED' ? 'ปิด' : 'เปิด'
    if (!confirm(`${label}แคมเปญ "${c.campaignName}" ใน Google Ads?`)) return
    const key = `${c.customerId}:${c.campaignId}`
    setTogglingKey(key)
    try {
      const res = await fetch('/api/campaign-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_campaign_status',
          customerId: c.customerId,
          campaignResourceName: campaignResourceNameOf(c),
          status: newStatus,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'เปลี่ยนสถานะไม่สำเร็จ')
      }
      patchCampaign(c, { status: newStatus })
      flashMsg(`${label}แคมเปญ "${c.campaignName}" แล้ว`, true)
    } catch (err) {
      flashMsg(err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ', false)
    } finally {
      setTogglingKey(null)
    }
  }

  const fetchData = useCallback(async (clientList: Account[], d: string) => {
    if (!clientList.length) return
    setLoading(true)
    try {
      const ids = clientList.map(a => a.id).join(',')
      const res = await fetch(`/api/performance/monitor?customerIds=${ids}&days=${d}`)
      const json = await res.json()
      setCampaigns((json.campaigns ?? []) as MonitorCampaign[])
      setLastUpdate(new Date())
    } catch { /* */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => {
        const list: Account[] = (d.accounts ?? []).map((a: { id: string; descriptiveName?: string; name?: string; currencyCode?: string }) => ({
          id: a.id, name: a.descriptiveName ?? a.name ?? a.id, currencyCode: a.currencyCode,
        }))
        setClients(list)
        if (list.length) fetchData(list, '1')
      })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    let rows = campaigns
    if (clientTab !== 'all') rows = rows.filter(c => c.customerId === clientTab)
    if (statusFilter !== 'ALL') rows = rows.filter(c => c.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(c => c.campaignName.toLowerCase().includes(q))
    }
    return [...rows].sort((a, b) => {
      const mult = sortDir === 'desc' ? -1 : 1
      const map: Record<SortCol, () => number> = {
        name:    () => a.campaignName.localeCompare(b.campaignName),
        client:  () => (a.customerId ?? '').localeCompare(b.customerId ?? ''),
        budget:  () => a.dailyBudget - b.dailyBudget,
        spend:   () => a.cost - b.cost,
        impr:    () => a.impressions - b.impressions,
        clicks:  () => a.clicks - b.clicks,
        ctr:     () => a.ctr - b.ctr,
        conv:    () => a.conversions - b.conversions,
        cpc:     () => a.cpc - b.cpc,
        cpa:     () => a.cpa - b.cpa,
        value:   () => a.conversionValue - b.conversionValue,
        roas:    () => a.roas - b.roas,
        status:  () => a.status.localeCompare(b.status),
      }
      return (map[sortCol]?.() ?? 0) * mult
    })
  }, [campaigns, clientTab, statusFilter, search, sortCol, sortDir])

  // KPI summary
  const tabRows = clientTab === 'all' ? campaigns : campaigns.filter(c => c.customerId === clientTab)
  const totalSpend = tabRows.reduce((s, c) => s + c.cost, 0)
  const totalConv  = tabRows.reduce((s, c) => s + c.conversions, 0)
  const totalClicks = tabRows.reduce((s, c) => s + c.clicks, 0)
  const totalValue = tabRows.reduce((s, c) => s + c.conversionValue, 0)
  const ecomRows   = tabRows.filter(c => isEcommerce(c.biddingStrategy))
  const blendedRoas = (() => {
    const val  = ecomRows.reduce((s, c) => s + c.conversionValue, 0)
    const cost = ecomRows.reduce((s, c) => s + c.cost, 0)
    return cost > 0 && val > 0 ? val / cost : 0
  })()
  const blendedCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
  const blendedCpa = totalConv > 0 ? totalSpend / totalConv : 0
  const cpaAlerts = tabRows.filter(hasCpaAlert).length

  const spendChange = (() => {
    const w = tabRows.reduce((s, c) => s + (c.costChange ?? 0) * c.cost, 0)
    return totalSpend > 0 ? w / totalSpend : null
  })()
  const convChange = (() => {
    const w = tabRows.reduce((s, c) => s + (c.convChange ?? 0) * c.conversions, 0)
    return totalConv > 0 ? w / totalConv : null
  })()

  function clientName(id: string) {
    return clients.find(a => a.id === id)?.name ?? id
  }

  return (
    <AppShell>
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaign Monitor</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {filtered.length} campaigns · {DAY_TABS.find(t => t.value === days)?.label}
              {lastUpdate && (
                <span className="ml-2">
                  · ข้อมูล: Google Ads API · อัปเตตล่าสุด {lastUpdate.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <Link
            href="/brief/new?mode=media-plan"
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </Link>
        </div>

        {/* ── Period tabs + Refresh ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 font-medium">Period:</span>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {DAY_TABS.map(t => (
              <button key={t.value}
                onClick={() => { if (t.value !== 'custom') { setDays(t.value); fetchData(clients, t.value) } else setDays('custom') }}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  days === t.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700')}
              >{t.label}</button>
            ))}
          </div>
          <button
            onClick={() => fetchData(clients, days)}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {actionMsg && (
          <div className={cn('px-4 py-2.5 rounded-xl border text-sm font-medium',
            actionMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600')}>
            {actionMsg.text}
          </div>
        )}

        {/* ── KPI Summary ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">Total Spend</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{fmtB(totalSpend)}</p>
            {spendChange !== null && (
              <p className={cn('text-xs mt-1', pctColor(spendChange))}>
                {spendChange >= 0 ? '↑' : '↓'} {Math.abs(spendChange).toFixed(1)}% vs เมื่อวาน
              </p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">Conversions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{totalConv.toLocaleString('th-TH')}</p>
            {convChange !== null && (
              <p className={cn('text-xs mt-1', pctColor(convChange))}>
                {convChange >= 0 ? '↑' : '↓'} {Math.abs(convChange).toFixed(1)}% vs เมื่อวาน
              </p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">Conv. Value</p>
            <p className={cn('text-2xl font-bold mt-1 tabular-nums', totalValue > 0 ? 'text-emerald-600' : 'text-gray-300')}>
              {totalValue > 0 ? fmtB(totalValue) : '—'}
            </p>
            {totalValue > 0 && totalConv > 0 && (
              <p className="text-xs mt-1 text-gray-400">฿{fmt(Math.round(totalValue / totalConv))}/conv</p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">Avg. CPC</p>
            <p className={cn('text-2xl font-bold mt-1 tabular-nums', blendedCpc > 0 ? 'text-gray-900' : 'text-gray-300')}>
              {blendedCpc > 0 ? fmtCpc(blendedCpc) : '—'}
            </p>
            {totalClicks > 0 && (
              <p className="text-xs mt-1 text-gray-400">{fmt(totalClicks)} clicks</p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">ROAS</p>
            <p className={cn('text-2xl font-bold mt-1 tabular-nums', blendedRoas > 0 ? 'text-emerald-600' : 'text-gray-300')}>
              {blendedRoas > 0 ? `${blendedRoas.toFixed(2)}x` : '—'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">CPA</p>
            <p className={cn('text-2xl font-bold mt-1 tabular-nums', blendedCpa > 0 ? 'text-gray-900' : 'text-gray-300')}>
              {blendedCpa > 0 ? fmtB(blendedCpa) : '—'}
            </p>
            {blendedCpa > 0 && cpaAlerts > 0 && (
              <p className="text-xs mt-1 text-red-500">{cpaAlerts} alert{cpaAlerts > 1 ? 's' : ''}</p>
            )}
          </div>
        </div>

        {/* ── Search + Status filter + Client Tabs ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input
                type="text"
                placeholder="ค้นหา campaign..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {/* Status filter — default ENABLED so long paused tails stay out of the way */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {([['ENABLED', 'Active'], ['PAUSED', 'Paused'], ['ALL', 'ทั้งหมด']] as const).map(([v, label]) => (
                <button key={v}
                  onClick={() => setStatusFilter(v)}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    statusFilter === v
                      ? v === 'ENABLED' ? 'bg-emerald-600 text-white' : v === 'PAUSED' ? 'bg-amber-500 text-white' : 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:text-gray-700')}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[{ id: 'all', name: 'All Clients' }, ...clients].map(a => (
              <button key={a.id} onClick={() => setClientTab(a.id)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors border',
                  clientTab === a.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >{a.name}</button>
            ))}
          </div>
        </div>

        {/* ── Campaign Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-white">
                  <SortTh col="name"   label="Campaign"   current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="client" label="Client"     current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="budget" label="Budget/day" current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="spend"  label="Spend ↓"   current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="impr"   label="Impr."      current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="clicks" label="Clicks"     current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="ctr"    label="CTR"        current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="conv"   label="Conv."      current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="cpc"    label="CPC"        current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="cpa"    label="CPA"        current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="value"  label="Value"      current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="roas"   label="ROAS"       current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortTh col="status" label="Status"     current={sortCol} dir={sortDir} onSort={handleSort} />
                  <th className="py-3 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 14 }).map((_, j) => (
                      <td key={j} className="py-4 px-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-gray-400 text-sm">
                      ไม่พบข้อมูล campaign
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((c, i) => {
                  const ecom   = isEcommerce(c.biddingStrategy)
                  const alert  = hasCpaAlert(c)
                  const roasOk = ecom && c.targetRoas ? c.roas >= c.targetRoas : (ecom && c.roas > 3)
                  const roasBad = ecom && c.targetRoas ? c.roas < c.targetRoas * 0.8 : false
                  const sub    = subLabel(c)
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      {/* Campaign */}
                      <td className="py-4 px-3 min-w-[200px]">
                        <p className="font-semibold text-gray-900 whitespace-normal break-words">{c.campaignName}</p>
                        {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
                      </td>
                      {/* Client */}
                      <td className="py-4 px-3 text-gray-600 whitespace-nowrap">{clientName(c.customerId)}</td>
                      {/* Budget/day */}
                      <td className="py-4 px-3 text-gray-700 whitespace-nowrap">{fmtB(c.dailyBudget)}</td>
                      {/* Spend */}
                      <td className="py-4 px-3 whitespace-nowrap">
                        <p className="font-semibold text-gray-900">{fmtB(c.cost)}</p>
                        <PctBadge pct={c.costChange} />
                      </td>
                      {/* Impr */}
                      <td className="py-4 px-3 text-gray-700 tabular-nums whitespace-nowrap">
                        {c.impressions >= 1000 ? `${(c.impressions / 1000).toFixed(1)}K` : String(c.impressions)}
                      </td>
                      {/* Clicks */}
                      <td className="py-4 px-3 text-gray-700 tabular-nums whitespace-nowrap">
                        {c.clicks.toLocaleString()}
                      </td>
                      {/* CTR */}
                      <td className="py-4 px-3 text-gray-700 whitespace-nowrap">{fmtPct(c.ctr)}</td>
                      {/* Conv */}
                      <td className="py-4 px-3 whitespace-nowrap">
                        <p className="font-bold text-gray-900">{c.conversions}</p>
                        <PctBadge pct={c.convChange} />
                      </td>
                      {/* CPC */}
                      <td className="py-4 px-3 whitespace-nowrap text-gray-700 tabular-nums">
                        {c.cpc > 0 ? fmtCpc(c.cpc) : <span className="text-gray-300">—</span>}
                      </td>
                      {/* CPA */}
                      <td className="py-4 px-3 whitespace-nowrap">
                        {ecom ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <>
                            <p className={cn('font-semibold flex items-center gap-0.5', alert ? 'text-red-600' : 'text-gray-900')}>
                              {c.cpa > 0 ? fmtB(c.cpa) : '—'}
                              {alert && <AlertTriangle className="w-3 h-3 text-red-400" />}
                            </p>
                            {(c.cpaChange !== null || c.targetCpa) && (
                              <p className={cn('text-[11px]', c.cpaChange !== null ? pctColor(c.cpaChange, true) : 'text-gray-400')}>
                                {c.cpaChange !== null && `${c.cpaChange >= 0 ? '↑' : '↓'} ${Math.abs(c.cpaChange).toFixed(1)}% `}
                                {c.targetCpa ? `t:${fmtB(c.targetCpa)}` : ''}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      {/* Value */}
                      <td className="py-4 px-3 whitespace-nowrap">
                        {c.conversionValue > 0 ? (
                          <>
                            <p className="font-semibold text-emerald-600 tabular-nums">{fmtB(c.conversionValue)}</p>
                            {c.valuePerConv > 0 && <p className="text-[11px] text-gray-400">฿{fmt(c.valuePerConv)}/conv</p>}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {/* ROAS */}
                      <td className="py-4 px-3 whitespace-nowrap">
                        {c.roas > 0 ? (
                          <>
                            <p className={cn(
                              'font-semibold flex items-center gap-0.5',
                              roasOk ? 'text-emerald-600' : roasBad ? 'text-red-500' : 'text-orange-500'
                            )}>
                              {roasOk ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              {c.roas.toFixed(2)}x
                            </p>
                            {c.targetRoas && <p className="text-[11px] text-gray-400">t:{c.targetRoas}x</p>}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {/* Status */}
                      <td className="py-4 px-3">
                        <StatusPill status={c.status} />
                      </td>
                      {/* Actions — ปิด/เปิด, แก้งบ + bidding แล้ว push เข้า Google Ads */}
                      <td className="py-4 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleStatus(c)}
                            disabled={togglingKey === `${c.customerId}:${c.campaignId}` || c.status === 'REMOVED'}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                            title={c.status === 'ENABLED' ? 'ปิดแคมเปญ (Pause)' : 'เปิดแคมเปญ (Enable)'}
                          >
                            {togglingKey === `${c.customerId}:${c.campaignId}`
                              ? <Loader2 className="w-4 h-4 animate-spin"/>
                              : c.status === 'ENABLED'
                                ? <ToggleRight className="w-5 h-5 text-emerald-500"/>
                                : <ToggleLeft className="w-5 h-5 text-gray-400"/>
                            }
                          </button>
                          <button
                            onClick={() => setEditCampaign(c)}
                            disabled={c.status === 'REMOVED'}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 transition-colors"
                            title="แก้งบประมาณ / bidding"
                          >
                            <Pencil className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {editCampaign && (
        <EditCampaignModal
          campaign={editCampaign}
          onClose={() => setEditCampaign(null)}
          onSaved={(patch) => { patchCampaign(editCampaign, patch); flashMsg(`อัพเดต "${editCampaign.campaignName}" ใน Google Ads แล้ว`, true) }}
        />
      )}
    </AppShell>
  )
}
