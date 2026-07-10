'use client'

import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Trash2, FileText, Calendar, Wallet, CheckCircle2, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchCampaign {
  name: string
  theme: string
  monthlyBudget: number
  budgetPct?: number
  adGroups?: string[]
  keywordThemes?: string[]
}
interface PmaxCampaign {
  name: string
  monthlyBudget: number
  budgetPct?: number
  assetGroups?: string[]
  audienceSignals?: string[]
}
interface RemarketingCampaign {
  name: string
  monthlyBudget: number
  budgetPct?: number
  audience?: string
  lookbackWindow?: number
  messageAngle?: string
}
interface DemandGenCampaign {
  name: string
  monthlyBudget: number
  budgetPct?: number
  audience?: string
  creativeAngle?: string
  funnelStage?: string
}

interface BudgetAllocationRow {
  campaignType: string
  funnelStage: string
  monthlyBudget: number
  mainKpi: string
}

interface CampaignStructure {
  search: SearchCampaign[]
  pmax: PmaxCampaign[]
  remarketing: RemarketingCampaign[]
  demandGen: DemandGenCampaign[]
}

interface IntakeSummary {
  monthlyBudget: number
  [key: string]: unknown
}

interface MediaPlanStrategy {
  intakeSummary: IntakeSummary
  budgetAllocation: BudgetAllocationRow[]
  campaignStructure: CampaignStructure
  [key: string]: unknown
}

interface Plan {
  id: string
  title: string
  objective: string
  monthlyBudget: number
  currency: string
  status: string
  createdAt: string
  campaignCount: number
  strategyJson?: string | null
  planJson?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  review:    'bg-blue-100 text-blue-700',
  approved:  'bg-emerald-100 text-emerald-700',
  active:    'bg-blue-100 text-blue-700',
  paused:    'bg-yellow-100 text-yellow-700',
  completed: 'bg-purple-100 text-purple-700',
}

/** Compute per-campaign budget edits from strategy — same logic as BudgetEditor in plan/page.tsx */
function computeInitialBudgets(strategy: MediaPlanStrategy): Record<string, number> {
  const result: Record<string, number> = {}
  const cs = strategy.campaignStructure
  const totalBudget = strategy.intakeSummary.monthlyBudget

  // Search: brand 30%, generic 70% of search allocation
  const searchAlloc = strategy.budgetAllocation.find(b =>
    b.campaignType.toLowerCase().includes('search')
  )
  const searchTotal = searchAlloc?.monthlyBudget ?? Math.round(totalBudget * 0.5)

  if (cs.search && cs.search.length > 0) {
    cs.search.forEach(c => {
      if (c.monthlyBudget) {
        result[c.name] = c.monthlyBudget
      } else {
        const isBrand = c.theme === 'brand' || /brand/i.test(c.name)
        result[c.name] = isBrand
          ? Math.round(searchTotal * 0.3)
          : Math.round(searchTotal * 0.7)
      }
    })
  }

  // PMax, Remarketing, DemandGen: split equally within type
  const splitEqual = (campaigns: Array<{ name: string; monthlyBudget: number }>, typeName: string) => {
    if (!campaigns || campaigns.length === 0) return
    const alloc = strategy.budgetAllocation.find(b =>
      b.campaignType.toLowerCase().includes(typeName.toLowerCase())
    )
    const typeTotal = alloc?.monthlyBudget ?? 0
    campaigns.forEach(c => {
      result[c.name] = c.monthlyBudget || Math.round(typeTotal / campaigns.length)
    })
  }

  splitEqual(cs.pmax ?? [], 'max')
  splitEqual(cs.remarketing ?? [], 'remarketing')
  splitEqual(cs.demandGen ?? [], 'demand')

  return result
}

// ─── Approved PlanCard ────────────────────────────────────────────────────────

// ประเมิน Est. Clicks / CPC / Impressions จากแผน: avg CPC ของ keywords ที่ research ไว้
// + งบเดือนต่อแคมเปญ + CTR สมมติฐานตามประเภท (Search 4%, PMax 1.2%, Display 0.8%, DG 1%)
function estimatePlanMetrics(plan: Plan): { clicks: number; cpc: number; impressions: number } | null {
  try {
    const parsed = JSON.parse(plan.planJson ?? '{}') as { campaignMix?: Array<{ type?: string; monthlyBudget?: number; keywords?: { suggestedCpc?: number; selected?: boolean }[] }> }
    const mix = parsed.campaignMix ?? []
    if (mix.length === 0) return null
    const FALLBACK_CPC: Record<string, number> = { SEARCH: 8, PERFORMANCE_MAX: 5, DISPLAY: 3, DEMAND_GEN: 4 }
    const CTR: Record<string, number> = { SEARCH: 0.04, PERFORMANCE_MAX: 0.012, DISPLAY: 0.008, DEMAND_GEN: 0.01 }
    let clicks = 0, spend = 0, imps = 0
    for (const c of mix) {
      const budget = c.monthlyBudget ?? 0
      if (budget <= 0) continue
      const kws = (c.keywords ?? []).filter(k => (k.selected ?? true) && (k.suggestedCpc ?? 0) > 0)
      const avgCpc = kws.length > 0
        ? kws.reduce((t, k) => t + (k.suggestedCpc ?? 0), 0) / kws.length
        : FALLBACK_CPC[c.type ?? ''] ?? 6
      const cClicks = budget / Math.max(avgCpc, 0.5)
      clicks += cClicks
      spend  += budget
      imps   += cClicks / (CTR[c.type ?? ''] ?? 0.02)
    }
    if (spend <= 0 || clicks <= 0) return null
    return { clicks: Math.round(clicks), cpc: spend / clicks, impressions: Math.round(imps) }
  } catch { return null }
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function PlanCard({ plan, onDeleted }: { plan: Plan; onDeleted: (id: string) => void }) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm) { setConfirm(true); return }
    setDeleting(true)
    const res = await fetch(`/api/media-plans/${plan.id}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) onDeleted(plan.id)
    else { setDeleting(false); setConfirm(false) }
  }

  const budget = plan.monthlyBudget > 0
    ? `฿${plan.monthlyBudget.toLocaleString()}/เดือน`
    : '—'
  const date = new Date(plan.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-sm transition-all flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{plan.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{plan.objective}</p>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', STATUS_COLOR[plan.status] ?? 'bg-gray-100 text-gray-600')}>
          {plan.status}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />{budget}</span>
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{date}</span>
        {plan.campaignCount > 0 && (
          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{plan.campaignCount} campaigns</span>
        )}
      </div>
      {(() => {
        const est = estimatePlanMetrics(plan)
        return est ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold tabular-nums">≈ {fmtShort(est.clicks)} clicks/เดือน</span>
            <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-semibold tabular-nums">CPC ฿{est.cpc.toFixed(0)}</span>
            <span className="bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full tabular-nums">{fmtShort(est.impressions)} impr.</span>
            <span className="text-gray-300 text-[10px]">ประเมินจาก avg CPC + CTR + งบ</span>
          </div>
        ) : null
      })()}

      <div className="flex gap-2 mt-auto">
        <Link
          href={`/media-plans/${plan.id}/preview`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> ดูแผน
        </Link>
        {plan.status === 'approved' && (
          <Link
            href={`/media-plans/${plan.id}/build`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            <Zap className="w-3.5 h-3.5" /> สร้าง Campaign
          </Link>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title={confirm ? 'คลิกอีกครั้งเพื่อยืนยัน' : 'ลบ'}
          className={cn(
            'px-3 py-2 rounded-xl transition-colors',
            confirm ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-gray-300 hover:text-red-500 hover:bg-red-50',
            deleting && 'opacity-40 cursor-not-allowed'
          )}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {confirm && <p className="text-[11px] text-red-500">คลิกลบอีกครั้งเพื่อยืนยัน</p>}
    </div>
  )
}

// ─── Review Card — plan waiting for approval ──────────────────────────────────

function ReviewCard({
  plan,
  onDeleted,
  onApproved,
}: {
  plan: Plan
  onDeleted: (id: string) => void
  onApproved: (id: string) => void
}) {
  const [approving, setApproving] = useState(false)
  const [confirm, setConfirm]     = useState(false)
  const [deleting, setDeleting]   = useState(false)

  async function handleApprove() {
    setApproving(true)
    const res = await fetch(`/api/media-plans/${plan.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    }).catch(() => null)
    if (res?.ok) onApproved(plan.id)
    else setApproving(false)
  }

  async function handleDelete() {
    if (!confirm) { setConfirm(true); return }
    setDeleting(true)
    const res = await fetch(`/api/media-plans/${plan.id}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) onDeleted(plan.id)
    else { setDeleting(false); setConfirm(false) }
  }

  const budget = plan.monthlyBudget > 0
    ? `฿${plan.monthlyBudget.toLocaleString()}/เดือน`
    : '—'
  const date = new Date(plan.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="bg-white border-2 border-blue-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{plan.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{plan.objective}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
          review
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />{budget}</span>
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{date}</span>
      </div>

      <div className="flex gap-2 mt-auto">
        <button
          onClick={handleApprove}
          disabled={approving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
        >
          {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Approve
        </button>
        <Link
          href={`/media-plans/${plan.id}/preview`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> ดูแผน
        </Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          title={confirm ? 'คลิกอีกครั้งเพื่อยืนยัน' : 'ลบ'}
          className={cn(
            'px-3 py-2 rounded-xl transition-colors',
            confirm ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-gray-300 hover:text-red-500 hover:bg-red-50',
            deleting && 'opacity-40 cursor-not-allowed'
          )}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {confirm && <p className="text-[11px] text-red-500">คลิกลบอีกครั้งเพื่อยืนยัน</p>}
    </div>
  )
}

// ─── Draft Card with inline Budget Editor ─────────────────────────────────────

type CampaignRow = { name: string; type: string }

function DraftCard({
  plan,
  onDeleted,
  onApproved,
}: {
  plan: Plan
  onDeleted: (id: string) => void
  onApproved: (id: string) => void
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [strategy, setStrategy] = useState<MediaPlanStrategy | null>(null)
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])

  const budget = plan.monthlyBudget > 0
    ? `฿${plan.monthlyBudget.toLocaleString()}/เดือน`
    : '—'
  const date = new Date(plan.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  // Parse strategy when expanded
  useEffect(() => {
    if (!expanded) return
    if (strategy) return
    try {
      const raw = plan.strategyJson
        ? JSON.parse(plan.strategyJson)
        : plan.planJson
          ? JSON.parse(plan.planJson)
          : null
      if (!raw) return
      const parsed = raw as MediaPlanStrategy
      setStrategy(parsed)
      const initial = computeInitialBudgets(parsed)
      setBudgets(initial)

      // Flatten all campaigns with type labels
      const rows: CampaignRow[] = []
      const cs = parsed.campaignStructure
      cs.search?.forEach(c => rows.push({ name: c.name, type: 'Search' }))
      cs.pmax?.forEach(c => rows.push({ name: c.name, type: 'PMax' }))
      cs.remarketing?.forEach(c => rows.push({ name: c.name, type: 'Remarketing' }))
      cs.demandGen?.forEach(c => rows.push({ name: c.name, type: 'Demand Gen' }))
      setCampaigns(rows)
    } catch { /* ignore parse errors */ }
  }, [expanded, plan.strategyJson, plan.planJson, strategy])

  async function handleDelete() {
    if (!confirm) { setConfirm(true); return }
    setDeleting(true)
    const res = await fetch(`/api/media-plans/${plan.id}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) onDeleted(plan.id)
    else { setDeleting(false); setConfirm(false) }
  }

  async function handleApprove() {
    if (!strategy) return
    setApproving(true)
    try {
      // Merge edited budgets back into strategy's campaignStructure
      const updatedStrategy: MediaPlanStrategy = {
        ...strategy,
        campaignStructure: {
          ...strategy.campaignStructure,
          search: strategy.campaignStructure.search?.map(c => ({
            ...c,
            monthlyBudget: budgets[c.name] ?? c.monthlyBudget,
          })) ?? [],
          pmax: strategy.campaignStructure.pmax?.map(c => ({
            ...c,
            monthlyBudget: budgets[c.name] ?? c.monthlyBudget,
          })) ?? [],
          remarketing: strategy.campaignStructure.remarketing?.map(c => ({
            ...c,
            monthlyBudget: budgets[c.name] ?? c.monthlyBudget,
          })) ?? [],
          demandGen: strategy.campaignStructure.demandGen?.map(c => ({
            ...c,
            monthlyBudget: budgets[c.name] ?? c.monthlyBudget,
          })) ?? [],
        },
      }
      const res = await fetch(`/api/media-plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', strategyJson: JSON.stringify(updatedStrategy) }),
      })
      if (res.ok) {
        onApproved(plan.id)
        router.push(`/media-plans/${plan.id}/build`)
      }
    } catch { /* ignore */ } finally {
      setApproving(false)
    }
  }

  const totalEdited = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0)

  return (
    <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden transition-all">
      {/* Card header */}
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{plan.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{plan.objective}</p>
          </div>
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', STATUS_COLOR['draft'])}>
            draft
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />{budget}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{date}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'ซ่อนการแก้ไข' : 'แก้ไข & อนุมัติ'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title={confirm ? 'คลิกอีกครั้งเพื่อยืนยัน' : 'ลบ'}
            className={cn(
              'px-3 py-2 rounded-xl transition-colors',
              confirm ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-gray-300 hover:text-red-500 hover:bg-red-50',
              deleting && 'opacity-40 cursor-not-allowed'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {confirm && <p className="text-[11px] text-red-500">คลิกลบอีกครั้งเพื่อยืนยัน</p>}
      </div>

      {/* Expandable Budget Editor */}
      {expanded && (
        <div className="border-t border-amber-100 bg-amber-50/40 px-5 py-4 flex flex-col gap-4">
          {campaigns.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">ไม่พบข้อมูล Campaign — กรุณาตรวจสอบ strategyJson</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">แก้ไขงบประมาณ Campaign</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-amber-200">
                      <th className="text-left pb-2 pr-3 text-gray-500 font-medium">ชื่อ Campaign</th>
                      <th className="text-left pb-2 pr-3 text-gray-500 font-medium w-24">ประเภท</th>
                      <th className="text-right pb-2 text-gray-500 font-medium w-32">งบ/เดือน (฿)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => (
                      <tr key={c.name} className="border-b border-amber-100 last:border-0">
                        <td className="py-2 pr-3 text-gray-700 max-w-[200px]">
                          <span className="block truncate" title={c.name}>{c.name}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="inline-block bg-white border border-amber-200 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                            {c.type}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={budgets[c.name] ?? 0}
                            onChange={e => setBudgets(prev => ({ ...prev, [c.name]: Number(e.target.value) }))}
                            className="w-28 text-right border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-amber-300">
                      <td colSpan={2} className="pt-2 text-xs font-semibold text-gray-700">รวมทั้งหมด</td>
                      <td className="pt-2 text-right text-xs font-bold text-gray-900">
                        ฿{totalEdited.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <button
                onClick={handleApprove}
                disabled={approving || !strategy}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-colors',
                  approving || !strategy
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                )}
              >
                {approving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> กำลังอนุมัติ...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> อนุมัติแผนนี้</>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MediaPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/media-plans')
      .then(r => r.json())
      .then(d => {
        const arr: Plan[] = Array.isArray(d) ? d : (d.plans ?? [])
        setPlans(
          arr.map((p: Plan & { blueprints?: unknown[] }) => ({
            ...p,
            campaignCount: p.campaignCount ?? (Array.isArray(p.blueprints) ? p.blueprints.length : 0),
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDeleted = useCallback((id: string) => {
    setPlans(prev => prev.filter(p => p.id !== id))
  }, [])

  const handleApproved = useCallback((id: string) => {
    setPlans(prev =>
      prev.map(p => p.id === id ? { ...p, status: 'approved' } : p)
    )
  }, [])

  const draftPlans    = plans.filter(p => p.status === 'draft')
  const reviewPlans   = plans.filter(p => p.status === 'review')
  const approvedPlans = plans.filter(p => p.status !== 'draft' && p.status !== 'review')

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Plans</h1>
          <p className="text-gray-500 text-sm mt-0.5">Media Plan ทั้งหมด — กดสร้าง Campaign ได้เลย</p>
        </div>
        <Link
          href="/media-plans/plan"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Plan
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">ยังไม่มี Media Plan</h3>
          <p className="text-sm text-gray-400 mb-6">สร้าง Media Plan แรกเพื่อเริ่มต้นวางแผนแคมเปญ</p>
          <Link
            href="/media-plans/plan"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> สร้าง Media Plan แรก
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Draft section */}
          {draftPlans.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">รอดำเนินการ</h2>
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{draftPlans.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {draftPlans.map(plan => (
                  <DraftCard key={plan.id} plan={plan} onDeleted={handleDeleted} onApproved={handleApproved} />
                ))}
              </div>
            </section>
          )}

          {/* Review section */}
          {reviewPlans.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">รอ Approve</h2>
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{reviewPlans.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reviewPlans.map(plan => (
                  <ReviewCard key={plan.id} plan={plan} onDeleted={handleDeleted} onApproved={handleApproved} />
                ))}
              </div>
            </section>
          )}

          {/* Approved section */}
          {approvedPlans.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">อนุมัติแล้ว</h2>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{approvedPlans.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {approvedPlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} onDeleted={handleDeleted} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  )
}
