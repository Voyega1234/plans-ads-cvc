'use client'

import AppShell from '@/components/layout/AppShell'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Activity, CheckCircle2, AlertTriangle, Clock, Loader,
  ChevronDown, ChevronRight, ExternalLink, RefreshCw, User,
  Sparkles, DollarSign, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ADMIN_EMAILS = ['bob@convertcake.com', 'apps@convertcake.com']

interface CampaignRow {
  campaignName: string
  status: 'success' | 'error'
  error?: string
}

interface PushLogRow {
  id: string
  status: string
  mode: string
  provider: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  user: { email: string; name: string | null } | null
  businessName: string
  mediaPlanId: string | null
  blueprintId: string | null
  campaigns: CampaignRow[]
  totalCreated: number
  totalErrors: number
}

interface AiCostLog {
  id: string
  route: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedUSD: number
  createdAt: string
  mediaPlanId: string | null
  user: { email: string; name: string | null } | null
}

interface AiCostSummary {
  totalCalls: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  estimatedUSD: number
  byRoute: Array<{ route: string; calls: number; totalTokens: number; estimatedUSD: number }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completed: { label: 'Completed',  color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  partial:   { label: 'Partial',    color: 'bg-amber-100 text-amber-700',     icon: AlertTriangle },
  failed:    { label: 'Failed',     color: 'bg-red-100 text-red-700',         icon: AlertTriangle },
  running:   { label: 'Running...',  color: 'bg-blue-100 text-blue-700',       icon: Loader },
  pending:   { label: 'Pending',    color: 'bg-gray-100 text-gray-500',       icon: Clock },
}

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d} วันที่แล้ว`
  if (h > 0) return `${h} ชม.ที่แล้ว`
  if (m > 0) return `${m} นาทีที่แล้ว`
  return 'เมื่อสักครู่'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtUSD(v: number) {
  if (v < 0.001) return `$${(v * 1000).toFixed(3)}m`
  return `$${v.toFixed(4)}`
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function shortRoute(r: string) {
  return r.replace('/api/', '').replace(/\//g, ' › ')
}

export default function PushLogsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [jobs, setJobs] = useState<PushLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  // AI Cost state
  const [aiLogs, setAiLogs] = useState<AiCostLog[]>([])
  const [aiSummary, setAiSummary] = useState<AiCostSummary | null>(null)
  const [aiLoading, setAiLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'push' | 'ai-cost'>('push')

  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email ?? '')

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!isAdmin) { router.replace('/dashboard'); return }
    loadLogs()
    loadAiCosts()
  }, [sessionStatus, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLogs(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await fetch('/api/push-logs?limit=100')
      if (!res.ok) return
      const data = await res.json() as { jobs: PushLogRow[]; total: number }
      setJobs(data.jobs)
      setTotal(data.total)
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false) }
  }

  async function loadAiCosts() {
    setAiLoading(true)
    try {
      const res = await fetch('/api/admin/ai-costs?days=30&limit=200')
      if (!res.ok) return
      const data = await res.json() as { logs: AiCostLog[]; summary: AiCostSummary }
      setAiLogs(data.logs)
      setAiSummary(data.summary)
    } catch { /* ignore */ }
    finally { setAiLoading(false) }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && loading)) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <Loader className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!isAdmin) return null

  const completed = jobs.filter(j => j.status === 'completed').length
  const failed    = jobs.filter(j => j.status === 'failed').length
  const partial   = jobs.filter(j => j.status === 'partial').length

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto py-6 px-4">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-gray-500" />
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">ADMIN ONLY</span>
            </div>
            <p className="text-sm text-gray-500">Push history & cost tracking — admin access only</p>
          </div>
          <button
            onClick={() => { loadLogs(true); loadAiCosts() }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
          <button
            onClick={() => setActiveTab('push')}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'push' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
          >
            <Activity className="w-3.5 h-3.5" />
            Push Log
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full ml-0.5',
              activeTab === 'push' ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500')}>
              {total}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('ai-cost')}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'ai-cost' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Track Cost
            {aiSummary && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full ml-0.5',
                activeTab === 'ai-cost' ? 'bg-violet-100 text-violet-700' : 'bg-gray-200 text-gray-500')}>
                {fmtUSD(aiSummary.estimatedUSD)}
              </span>
            )}
          </button>
        </div>

        {/* ───── PUSH LOG TAB ───── */}
        {activeTab === 'push' && (
          <>
            {/* Summary pills */}
            <div className="flex gap-3 mb-5 flex-wrap">
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Activity className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">ทั้งหมด</p>
                  <p className="text-lg font-bold text-gray-900">{total}</p>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-xs text-gray-500">Completed</p>
                  <p className="text-lg font-bold text-emerald-700">{completed}</p>
                </div>
              </div>
              {partial > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-xs text-gray-500">Partial</p>
                    <p className="text-lg font-bold text-amber-700">{partial}</p>
                  </div>
                </div>
              )}
              {failed > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <div>
                    <p className="text-xs text-gray-500">Failed</p>
                    <p className="text-lg font-bold text-red-700">{failed}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Log table */}
            {jobs.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <Activity className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">ยังไม่มี push history</p>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => {
                  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending
                  const Icon = cfg.icon
                  const isExpanded = expanded.has(job.id)
                  const dur = duration(job.startedAt, job.finishedAt)

                  return (
                    <div key={job.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                        onClick={() => toggleExpand(job.id)}
                      >
                        <Icon className={cn(
                          'w-4 h-4 flex-shrink-0',
                          job.status === 'completed' ? 'text-emerald-500' :
                          job.status === 'failed' ? 'text-red-500' :
                          job.status === 'partial' ? 'text-amber-500' :
                          job.status === 'running' ? 'text-blue-500 animate-spin' :
                          'text-gray-400'
                        )} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 truncate">{job.businessName}</span>
                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0', cfg.color)}>
                              {cfg.label}
                            </span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              {job.mode}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <User className="w-3 h-3" />
                              {job.user?.email ?? 'Unknown'}
                            </span>
                            <span className="text-xs text-gray-400">{formatDateTime(job.createdAt)}</span>
                            {dur !== '—' && <span className="text-xs text-gray-400">⏱ {dur}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                          {job.totalCreated > 0 && <span className="text-emerald-600 font-semibold">✓ {job.totalCreated}</span>}
                          {job.totalErrors > 0 && <span className="text-red-600 font-semibold">✗ {job.totalErrors}</span>}
                          <span className="text-gray-400">{relativeTime(job.createdAt)}</span>
                        </div>

                        <div className="flex-shrink-0 ml-1">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                            : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-xs text-gray-500 font-mono">ID: {job.id}</span>
                            {job.mediaPlanId && (
                              <a href={`/media-plans/${job.mediaPlanId}`} target="_blank"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                                <ExternalLink className="w-3 h-3" /> ดู Media Plan
                              </a>
                            )}
                            {job.startedAt && <span className="text-xs text-gray-400">Start: {formatDateTime(job.startedAt)}</span>}
                            {job.finishedAt && <span className="text-xs text-gray-400">End: {formatDateTime(job.finishedAt)}</span>}
                          </div>

                          {job.campaigns.length > 0 ? (
                            <div className="space-y-1.5">
                              {job.campaigns.map((c, i) => (
                                <div key={i} className={cn(
                                  'flex items-start gap-2 px-3 py-2 rounded-lg text-xs border',
                                  c.status === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                                )}>
                                  {c.status === 'success'
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                    : <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                                  <div className="min-w-0">
                                    <p className={cn('font-semibold', c.status === 'success' ? 'text-emerald-800' : 'text-red-800')}>
                                      {c.campaignName}
                                    </p>
                                    {c.error && (
                                      <p className="text-red-600 mt-0.5 break-words whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
                                        {c.error.slice(0, 500)}{c.error.length > 500 ? '…' : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">ไม่มีข้อมูล campaigns</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ───── AI COST TAB ───── */}
        {activeTab === 'ai-cost' && (
          <>
            {aiLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader className="w-5 h-5 text-violet-500 animate-spin" />
              </div>
            ) : !aiSummary ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">ยังไม่มีข้อมูล AI usage</p>
              </div>
            ) : (
              <>
                {/* Cost summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">Total Calls (30d)</p>
                    <p className="text-2xl font-bold text-gray-900">{aiSummary.totalCalls.toLocaleString()}</p>
                  </div>
                  <div className="bg-white border border-violet-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">Total Tokens</p>
                    <p className="text-2xl font-bold text-violet-700">{fmtTokens(aiSummary.totalTokens)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      ↑ {fmtTokens(aiSummary.inputTokens)} in · {fmtTokens(aiSummary.outputTokens)} out
                    </p>
                  </div>
                  <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Est. Cost (USD)
                    </p>
                    <p className="text-2xl font-bold text-emerald-700">{fmtUSD(aiSummary.estimatedUSD)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">≈ ฿{(aiSummary.estimatedUSD * 35).toFixed(3)}</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">Avg / Call</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {aiSummary.totalCalls > 0
                        ? fmtTokens(Math.round(aiSummary.totalTokens / aiSummary.totalCalls))
                        : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">tokens</p>
                  </div>
                </div>

                {/* By route */}
                {aiSummary.byRoute.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                      <BarChart3 className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-700">Cost by Route</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {aiSummary.byRoute.slice(0, 10).map((r) => {
                        const pct = aiSummary.estimatedUSD > 0
                          ? (r.estimatedUSD / aiSummary.estimatedUSD) * 100
                          : 0
                        return (
                          <div key={r.route} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono text-gray-600 truncate">{shortRoute(r.route)}</p>
                              <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-violet-400 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-semibold text-gray-800">{fmtUSD(r.estimatedUSD)}</p>
                              <p className="text-[10px] text-gray-400">{r.calls} calls · {fmtTokens(r.totalTokens)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Recent calls log */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold text-gray-700">Recent Calls</span>
                    <span className="text-xs text-gray-400 ml-auto">ล่าสุด 200 รายการ</span>
                  </div>
                  {aiLogs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีข้อมูล</p>
                  ) : (
                    <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                      {aiLogs.map((log) => (
                        <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-gray-600 truncate">{shortRoute(log.route)}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-gray-400">{log.model}</span>
                              {log.user?.email && (
                                <span className="text-[10px] text-gray-400">· {log.user.email}</span>
                              )}
                              <span className="text-[10px] text-gray-400">· {relativeTime(log.createdAt)}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-semibold text-emerald-700">{fmtUSD(log.estimatedUSD)}</p>
                            <p className="text-[10px] text-gray-400">
                              {fmtTokens(log.inputTokens)}↑ {fmtTokens(log.outputTokens)}↓
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

      </div>
    </AppShell>
  )
}
