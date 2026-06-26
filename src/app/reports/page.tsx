'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  BarChart2, TrendingUp, TrendingDown, RefreshCw, ChevronDown,
  Users, AlertCircle, Download, Calendar, Sparkles, Search,
  MapPin, Monitor, Clock, Target, ShoppingCart, Layers,
  MessageSquare, Send, Bot, User, ChevronUp, Mail, Copy, Check,
  Zap, ArrowRight, FileText, Eye, MousePointer, ChevronRight,
  Edit2, X, Plus, Trash,
} from 'lucide-react'
import dynamic from 'next/dynamic'
const { TrendChart, CampaignBarChart } = {
  TrendChart:      dynamic(() => import('@/components/reports/ReportCharts').then(m => m.TrendChart),      { ssr: false }),
  CampaignBarChart: dynamic(() => import('@/components/reports/ReportCharts').then(m => m.CampaignBarChart), { ssr: false }),
}
import { formatCurrency, formatNumber, formatConversions, pctChangeColor, metricValueColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoogleAdsAccount { id: string; descriptiveName: string; currencyCode: string; testAccount: boolean }

interface PctChanges {
  cost?: number | null; impressions?: number | null; clicks?: number | null
  conversions?: number | null; ctr?: number | null; cpc?: number | null
  cpa?: number | null; convRate?: number | null
}

interface CampaignRow {
  campaignName: string; cost: number; impressions: number; clicks: number
  conversions: number; ctr: number; cpc: number; cpa: number; conversionRate: number
  changes?: PctChanges
}

interface NarrativeReport {
  headline:             string
  performance:          string
  winners:              string
  concerns:             string
  actions:              string[]
  outlook:              string
  keyInsights?:         string[]
  deviceAnalysis?:      string
  locationInsights?:    string
  wastedBudget?:        string
  clientSummary?:       string
  // Strategic planner fields
  strategicContext?:      string
  strategicNextStep?:     string
  clientTalkingPoints?:   string[]
  // Closing summary paragraph
  executiveSummary?:      string
}

interface WeeklyReport {
  summary: {
    totalCost: number; totalConversions: number; totalClicks: number; totalImpressions: number
    blendedCPA: number; blendedCTR: number; targetCPA: number; cpaVsTarget: number | null; period: string
    changes?: {
      totalCost: number | null; totalConversions: number | null; totalClicks: number | null
      totalImpressions: number | null; blendedCPA: number | null; blendedCTR: number | null
    }
  }
  campaigns: CampaignRow[]
  recommendations: Array<{ campaignName: string; type: string; priority: 'critical' | 'high' | 'medium' | 'low'; title: string; detail: string; action: string; estimatedImpact?: string }>
}

interface DimKeyword { keyword: string; matchType: string; qualityScore: number | null; impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cpa: number }
interface DimAudience { audienceName: string; type: string; impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cpa: number }
interface DimLocation { location: string; impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cpa: number }
interface DimDevice { device: string; impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cpa: number }
interface DimSearchTerm { searchTerm: string; matchedKeyword: string; impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cpa: number }
interface DimTime { date: string; impressions: number; clicks: number; cost: number; conversions: number }
interface DimConversionAction { conversionName: string; category: string; conversions: number; value: number; allConversions: number; viewThroughConversions: number }
interface EcommerceFunnel { view_item: number; add_to_cart: number; begin_checkout: number; purchase: number; revenue: number; roas: number; aov: number; cartAbandonRate: number; checkoutAbandonRate: number }

const DATE_RANGES = [
  { value: 'LAST_7_DAYS', label: '7 วัน' },
  { value: 'LAST_30_DAYS', label: '30 วัน' },
  { value: 'LAST_90_DAYS', label: '90 วัน' },
  { value: 'THIS_MONTH', label: 'เดือนนี้' },
  { value: 'LAST_MONTH', label: 'เดือนที่แล้ว' },
]

const PRIORITY_COLOR = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  high:     'bg-orange-50 border-orange-200 text-orange-700',
  medium:   'bg-yellow-50 border-yellow-200 text-yellow-700',
  low:      'bg-blue-50 border-blue-200 text-blue-700',
}
const PRIORITY_LABEL = { critical: 'วิกฤต', high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' }

const DEVICE_LABEL: Record<string, string> = { MOBILE: '📱 Mobile', DESKTOP: '🖥️ Desktop', TABLET: '📲 Tablet', CONNECTED_TV: '📺 TV' }
const MATCH_LABEL: Record<string, string> = { BROAD: 'Broad', PHRASE: 'Phrase', EXACT: 'Exact' }
const MATCH_COLOR: Record<string, string> = { BROAD: 'bg-blue-50 text-blue-700', PHRASE: 'bg-purple-50 text-purple-700', EXACT: 'bg-green-50 text-green-700' }

// ── Mini helpers ──────────────────────────────────────────────────────────────

function Trend({ value, metricKey, inverse }: { value: number | null; metricKey?: string; inverse?: boolean }) {
  if (value === null) return null
  const colorCls = metricKey
    ? pctChangeColor(metricKey, value)
    : (inverse ? (value <= 0 ? 'text-emerald-600' : 'text-red-500') : (value >= 0 ? 'text-emerald-600' : 'text-red-500'))
  const good = colorCls.includes('emerald')
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', colorCls)}>
      {good ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {value >= 0 ? '+' : ''}{typeof value === 'number' ? value.toFixed(2) : value}%
    </span>
  )
}

function ChangeBadge({ metricKey, value }: { metricKey: string; value: number | null | undefined }) {
  if (value === null || value === undefined) return null
  const colorCls = pctChangeColor(metricKey, value)
  const good = colorCls.includes('emerald')
  const sign = value > 0 ? '+' : ''
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold whitespace-nowrap', colorCls)}>
      {good ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {sign}{typeof value === 'number' ? value.toFixed(2) : value}%
    </span>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide', className)}>{children}</th>
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-sm text-gray-700', className)}>{children}</td>
}

type SortDir = 'asc' | 'desc'
function SortTh({ col, label, sortKey, sortDir, onSort, className }: {
  col: string; label: string; sortKey: string; sortDir: SortDir; onSort: (col: string) => void; className?: string
}) {
  const active = sortKey === col
  return (
    <th
      onClick={() => onSort(col)}
      className={cn(
        'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors',
        'hover:bg-gray-100 whitespace-nowrap',
        active ? 'text-blue-600 bg-blue-50' : 'text-gray-500',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col leading-none">
          <span className={cn('text-[8px]', active && sortDir === 'asc' ? 'text-blue-600' : 'text-gray-300')}>▲</span>
          <span className={cn('text-[8px]', active && sortDir === 'desc' ? 'text-blue-600' : 'text-gray-300')}>▼</span>
        </span>
      </span>
    </th>
  )
}

function sortRows<T extends Record<string, unknown>>(data: T[], key: string, dir: SortDir): T[] {
  return [...data].sort((a, b) => {
    const av = a[key]; const bv = b[key]
    if (av == null && bv == null) return 0
    if (av == null) return 1; if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return dir === 'desc' ? -cmp : cmp
  })
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button onClick={onClick} className={cn(
      'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors',
      active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    )}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function EmptyDim() {
  return (
    <div className="text-center py-12 text-gray-400">
      <BarChart2 className="w-10 h-10 mx-auto mb-2 text-gray-200" />
      <p className="text-sm">ไม่มีข้อมูล — กด Sync & Refresh</p>
    </div>
  )
}

function MetricBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} /></div>
}

// ── Funnel step ───────────────────────────────────────────────────────────────
function FunnelStep({ label, value, prev, color }: { label: string; value: number; prev?: number; color: string }) {
  const rate = prev && prev > 0 ? ((value / prev) * 100).toFixed(2) : null
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('w-full rounded-xl py-4 px-3 text-center', color)}>
        <p className="text-xl font-bold">{formatNumber(value)}</p>
        <p className="text-xs font-medium mt-0.5">{label}</p>
        {rate && <p className="text-[10px] mt-1 opacity-70">rate {rate}%</p>}
      </div>
      {prev && <div className="text-[10px] text-gray-400">↓ {rate}%</div>}
    </div>
  )
}

// ── Opening brief message from GG Expert after reading the report ─────────────

function buildOpeningBrief(nr: NarrativeReport, targetCPA: string): string {
  const cpaNum = Number(targetCPA) || 0
  const lines: string[] = []

  // Lead with verdict
  lines.push(`อ่าน report เรียบร้อยแล้วครับ`)
  lines.push('')
  lines.push(`**สรุปสิ่งที่เห็น:**`)
  lines.push(nr.headline)

  // Winners
  if (nr.winners) {
    lines.push('')
    lines.push(`**จุดที่น่าดีใจ:**`)
    lines.push(nr.winners)
  }

  // Concerns with urgency
  if (nr.concerns) {
    lines.push('')
    lines.push(`**จุดที่ต้องระวัง:**`)
    lines.push(nr.concerns)
  }

  // Top action
  if (nr.actions?.length) {
    lines.push('')
    lines.push(`**สิ่งที่ควรทำก่อนเลยคือ:**`)
    lines.push(`→ ${nr.actions[0]}`)
  }

  // Strategic context if available
  if (nr.strategicContext) {
    lines.push('')
    lines.push(`**บริบทเชิงกลยุทธ์:**`)
    lines.push(nr.strategicContext)
  }

  lines.push('')
  lines.push(cpaNum > 0
    ? `Target CPA ตั้งไว้ ฿${cpaNum.toLocaleString()} — ถามได้เลยครับว่าอยากรู้เรื่องไหนเพิ่ม จะช่วยอธิบายหรือเตรียม talking points สำหรับคุยกับลูกค้าก็ได้`
    : `ถามได้เลยครับ จะช่วยวิเคราะห์เพิ่ม หรือเตรียม talking points สำหรับคุยกับลูกค้าก็ได้`)

  return lines.join('\n')
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type DimTab = 'overview' | 'campaigns' | 'keywords' | 'search_terms' | 'text_ads' | 'audiences' | 'locations' | 'devices' | 'time' | 'conversions' | 'ecommerce'

interface TextAd {
  campaignName: string
  adGroupName: string
  adId: string
  type: string
  headlines: string[]
  descriptions: string[]
  finalUrl: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  adStrength?: string
}

export default function ReportsPage() {
  const [accounts, setAccounts]               = useState<GoogleAdsAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [selectedId, setSelectedId]           = useState('')
  const [dateRange, setDateRange]             = useState('LAST_30_DAYS')
  const [targetCPA, setTargetCPA]             = useState('500')

  // Refs so async callbacks always see latest values without stale closures
  const selectedIdRef  = useRef(selectedId)
  const dateRangeRef   = useRef(dateRange)
  const targetCPARef   = useRef(targetCPA)
  useEffect(() => { selectedIdRef.current = selectedId },  [selectedId])
  useEffect(() => { dateRangeRef.current  = dateRange },   [dateRange])
  useEffect(() => { targetCPARef.current  = targetCPA },   [targetCPA])
  const [report, setReport]                   = useState<WeeklyReport | null>(null)
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [syncing, setSyncing]                 = useState(false)
  const [activeTab, setActiveTab]             = useState<DimTab>('overview')

  // Dimension data
  const [keywords, setKeywords]       = useState<DimKeyword[] | null>(null)
  const [audiences, setAudiences]     = useState<DimAudience[] | null>(null)
  const [locations, setLocations]     = useState<DimLocation[] | null>(null)
  const [devices, setDevices]         = useState<DimDevice[] | null>(null)
  const [searchTerms, setSearchTerms] = useState<DimSearchTerm[] | null>(null)
  const [timeData, setTimeData]       = useState<DimTime[] | null>(null)
  const [conversions, setConversions] = useState<{ actions: DimConversionAction[]; ecommerceFunnel: EcommerceFunnel | null } | null>(null)
  const [textAds, setTextAds] = useState<TextAd[] | null>(null)
  const [ecommerce, setEcommerce]     = useState<{ actions: DimConversionAction[]; ecommerceFunnel: EcommerceFunnel | null } | null>(null)
  const [dimLoading, setDimLoading]   = useState<Record<string, boolean>>({})

  // Text Ad inline edit state
  const [editingAdId, setEditingAdId] = useState<string | null>(null)
  const [editHeadlines, setEditHeadlines] = useState<string[]>([])
  const [editDescriptions, setEditDescriptions] = useState<string[]>([])
  const [pushingAdId, setPushingAdId] = useState<string | null>(null)
  const [pushAdResult, setPushAdResult] = useState<Record<string, 'ok' | 'error'>>({})

  function startEditAd(ad: TextAd) {
    setEditingAdId(ad.adId)
    setEditHeadlines([...ad.headlines])
    setEditDescriptions([...ad.descriptions])
    setPushAdResult(prev => { const n = { ...prev }; delete n[ad.adId]; return n })
  }

  function cancelEditAd() {
    setEditingAdId(null)
    setEditHeadlines([])
    setEditDescriptions([])
  }

  async function pushAdEdit(ad: TextAd) {
    if (!selectedId || !ad.adId) return
    const cid = selectedId.replace(/-/g, '')
    setPushingAdId(ad.adId)
    try {
      const res = await fetch(`/api/campaign-edit/ads?customerId=${cid}&adId=${ad.adId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headlines: editHeadlines.filter(h => h.trim()),
          descriptions: editDescriptions.filter(d => d.trim()),
          finalUrls: [ad.finalUrl],
        }),
      })
      if (res.ok) {
        // Update local state
        setTextAds(prev => prev ? prev.map(a => a.adId === ad.adId
          ? { ...a, headlines: editHeadlines.filter(h => h.trim()), descriptions: editDescriptions.filter(d => d.trim()) }
          : a
        ) : prev)
        setPushAdResult(prev => ({ ...prev, [ad.adId]: 'ok' }))
        setEditingAdId(null)
      } else {
        setPushAdResult(prev => ({ ...prev, [ad.adId]: 'error' }))
      }
    } catch {
      setPushAdResult(prev => ({ ...prev, [ad.adId]: 'error' }))
    } finally {
      setPushingAdId(null)
    }
  }

  // Narrative (loaded AFTER all data)
  const [narrative, setNarrative]             = useState<NarrativeReport | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)

  // Inline report chat
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatInput, setChatInput]       = useState('')
  const [chatLoading, setChatLoading]   = useState(false)
  const [chatBriefed, setChatBriefed]   = useState(false)
  const [chatOpen, setChatOpen]         = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  // Email draft
  const [emailLang, setEmailLang]       = useState<'th' | 'en'>('th')
  const [emailDraft, setEmailDraft]     = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailOpen, setEmailOpen]       = useState(false)
  const [emailCopied, setEmailCopied]   = useState(false)

  // ── Sort state for each table ─────────────────────────────────────────────────
  const [campSortKey, setCampSortKey] = useState('cost')
  const [campSortDir, setCampSortDir] = useState<SortDir>('desc')
  const [kwSortKey,   setKwSortKey]   = useState('cost')
  const [kwSortDir,   setKwSortDir]   = useState<SortDir>('desc')
  const [stSortKey,   setStSortKey]   = useState('cost')
  const [stSortDir,   setStSortDir]   = useState<SortDir>('desc')
  const [audSortKey,  setAudSortKey]  = useState('cost')
  const [audSortDir,  setAudSortDir]  = useState<SortDir>('desc')
  const [locSortKey,  setLocSortKey]  = useState('cost')
  const [locSortDir,  setLocSortDir]  = useState<SortDir>('desc')

  const campSort = {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sorted:  useMemo(() => report?.campaigns ? sortRows(report.campaigns as unknown as Record<string, unknown>[], campSortKey, campSortDir) : [], [report?.campaigns, campSortKey, campSortDir]),
    sortKey: campSortKey, sortDir: campSortDir,
    onSort:  (col: string) => { if (col === campSortKey) setCampSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCampSortKey(col); setCampSortDir('desc') } },
  }
  const kwSort = {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sorted:  useMemo(() => keywords ? sortRows(keywords as unknown as Record<string, unknown>[], kwSortKey, kwSortDir) : [], [keywords, kwSortKey, kwSortDir]),
    sortKey: kwSortKey, sortDir: kwSortDir,
    onSort:  (col: string) => { if (col === kwSortKey) setKwSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setKwSortKey(col); setKwSortDir('desc') } },
  }
  const stSort = {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sorted:  useMemo(() => searchTerms ? sortRows(searchTerms as unknown as Record<string, unknown>[], stSortKey, stSortDir) : [], [searchTerms, stSortKey, stSortDir]),
    sortKey: stSortKey, sortDir: stSortDir,
    onSort:  (col: string) => { if (col === stSortKey) setStSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setStSortKey(col); setStSortDir('desc') } },
  }
  const audSort = {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sorted:  useMemo(() => audiences ? sortRows(audiences as unknown as Record<string, unknown>[], audSortKey, audSortDir) : [], [audiences, audSortKey, audSortDir]),
    sortKey: audSortKey, sortDir: audSortDir,
    onSort:  (col: string) => { if (col === audSortKey) setAudSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setAudSortKey(col); setAudSortDir('desc') } },
  }
  const locSort = {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sorted:  useMemo(() => locations ? sortRows(locations as unknown as Record<string, unknown>[], locSortKey, locSortDir) : [], [locations, locSortKey, locSortDir]),
    sortKey: locSortKey, sortDir: locSortDir,
    onSort:  (col: string) => { if (col === locSortKey) setLocSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setLocSortKey(col); setLocSortDir('desc') } },
  }

  // Load accounts
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json() as Promise<{ accounts: GoogleAdsAccount[] }>)
      .then((d) => {
        setAccounts(d.accounts ?? [])
        if (d.accounts?.length > 0) setSelectedId(d.accounts[0].id)
      })
      .catch(() => {})
      .finally(() => setAccountsLoading(false))
  }, [])

  // Auto-load when account/dateRange changes
  useEffect(() => {
    if (selectedId) { loadReport() }
  }, [selectedId, dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // All async functions read from refs — no stale closures, no circular deps
  const loadNarrative = useCallback(async (
    reportData: WeeklyReport,
    kw: DimKeyword[] | null,
    dev: DimDevice[] | null,
    loc: DimLocation[] | null,
    st: DimSearchTerm[] | null,
    convData?: { actions: DimConversionAction[]; ecommerceFunnel: EcommerceFunnel | null } | null,
  ) => {
    setNarrativeLoading(true)
    setNarrative(null)
    setChatMessages([])
    setChatBriefed(false)
    try {
      // Detect ecommerce: sum conversion value from conversion actions
      const totalConvValue = (convData?.actions ?? []).reduce((a, c) => a + c.value, 0)
      const isEcommerce = totalConvValue > 0
      const totalCostForRoas = reportData.summary.totalCost
      const roas = isEcommerce && totalCostForRoas > 0 ? parseFloat((totalConvValue / totalCostForRoas).toFixed(2)) : undefined

      const res = await fetch('/api/reports/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRange: dateRangeRef.current,
          targetCPA: Number(targetCPARef.current),
          summary: reportData.summary,
          campaigns: reportData.campaigns.map((c) => ({
            campaignName: c.campaignName,
            cost: c.cost,
            conversions: c.conversions,
            cpa: c.cpa,
            ctr: c.ctr,
            clicks: c.clicks,
            changes: c.changes ? { cpa: c.changes.cpa } : undefined,
          })),
          keywords: kw?.map((k) => ({ keyword: k.keyword, cost: k.cost, conversions: k.conversions, cpa: k.cpa, qualityScore: k.qualityScore })),
          devices:  dev?.map((d) => ({ device: d.device, cost: d.cost, conversions: d.conversions, cpa: d.cpa, ctr: d.ctr })),
          locations: loc?.map((l) => ({ location: l.location, cost: l.cost, conversions: l.conversions, cpa: l.cpa })),
          searchTerms: st?.map((s) => ({ searchTerm: s.searchTerm, cost: s.cost, conversions: s.conversions, ctr: s.ctr })),
          recommendations: reportData.recommendations.map((r) => ({ priority: r.priority, title: r.title, action: r.action })),
          totalConversionValue: isEcommerce ? totalConvValue : undefined,
          roas,
          accountType: isEcommerce ? 'ecommerce' : 'general',
        }),
      })
      if (res.ok) {
        const nr = await res.json() as NarrativeReport
        setNarrative(nr)
        // Inject opening brief from GG Expert — summarise what was read, ready to discuss
        setChatBriefed(false)
        setChatMessages([{
          role: 'assistant',
          content: buildOpeningBrief(nr, targetCPARef.current),
        }])
      }
    } catch { /* silent */ } finally {
      setNarrativeLoading(false)
    }
  }, []) // refs, no deps needed

  const loadAllDimensions = useCallback(async (reportData?: WeeklyReport) => {
    const cid = selectedIdRef.current
    const dr  = dateRangeRef.current
    if (!cid) return

    // Mark all tabs loading
    const types = ['keywords', 'audiences', 'locations', 'devices', 'search_terms', 'time', 'conversions', 'ecommerce', 'text_ads']
    setDimLoading(Object.fromEntries(types.map((t) => [t, true])))

    try {
      // Fetch dimensions + text ads in parallel
      const [res, adsRes] = await Promise.all([
        fetch(`/api/reports/dimensions?customerId=${cid}&dateRange=${dr}&type=all`),
        fetch(`/api/reports/text-ads?customerId=${cid}&dateRange=${dr}`),
      ])
      if (!res.ok) return

      const json = await res.json() as Record<string, unknown>
      setKeywords(json.keywords     as DimKeyword[])
      setAudiences(json.audiences   as DimAudience[])
      setLocations(json.locations   as DimLocation[])
      setDevices(json.devices       as DimDevice[])
      setSearchTerms(json.search_terms as DimSearchTerm[])
      setTimeData(json.time         as DimTime[])
      setConversions(json.conversions as { actions: DimConversionAction[]; ecommerceFunnel: EcommerceFunnel | null })
      setEcommerce(json.ecommerce   as { actions: DimConversionAction[]; ecommerceFunnel: EcommerceFunnel | null })

      if (adsRes.ok) {
        const adsJson = await adsRes.json() as { ads: TextAd[] }
        setTextAds(adsJson.ads ?? [])
      }

      if (reportData) {
        loadNarrative(
          reportData,
          json.keywords     as DimKeyword[]    ?? null,
          json.devices      as DimDevice[]     ?? null,
          json.locations    as DimLocation[]   ?? null,
          json.search_terms as DimSearchTerm[] ?? null,
          json.conversions  as { actions: DimConversionAction[]; ecommerceFunnel: EcommerceFunnel | null } ?? null,
        )
      }
    } catch { /* silent */ } finally {
      setDimLoading(Object.fromEntries(types.map((t) => [t, false])))
    }
  }, [loadNarrative]) // stable: loadNarrative has [] deps

  const loadReport = useCallback(async () => {
    const cid = selectedIdRef.current
    const dr  = dateRangeRef.current
    const cpa = targetCPARef.current
    if (!cid) return
    setLoading(true); setError(null); setNarrative(null); setChatMessages([]); setChatBriefed(false)
    try {
      const res = await fetch(`/api/reports/weekly?customerId=${cid}&targetCPA=${cpa}&dateRange=${dr}`)
      if (!res.ok) throw new Error('โหลด report ไม่สำเร็จ')
      const data = await res.json() as WeeklyReport
      setReport(data)
      loadAllDimensions(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [loadAllDimensions])

  const syncData = async () => {
    if (!selectedId) return
    setSyncing(true)
    await fetch('/api/performance/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: selectedId, dateRange }) }).catch(() => {})
    setSyncing(false)
    loadReport()
  }

  // Client-safe context: raw data + performance analysis only — NO strategic/internal content
  function buildClientContext(): string {
    if (!report) return ''
    const parts: string[] = []
    if (report.summary) {
      const s = report.summary
      parts.push(`## Account Performance (${s.period})`)
      parts.push(`Spend: ฿${s.totalCost.toLocaleString()} | Conv: ${s.totalConversions} | CPA: ฿${s.blendedCPA.toFixed(0)} | CTR: ${s.blendedCTR.toFixed(2)}% | Target CPA: ฿${s.targetCPA}`)
      if (s.cpaVsTarget !== null) parts.push(`CPA vs Target: ${s.cpaVsTarget > 0 ? '+' : ''}${s.cpaVsTarget}%`)
      if (s.changes) {
        parts.push(`Changes vs prior: Cost ${s.changes.totalCost ?? 'N/A'}% | Conv ${s.changes.totalConversions ?? 'N/A'}% | CPA ${s.changes.blendedCPA ?? 'N/A'}% | CTR ${s.changes.blendedCTR ?? 'N/A'}%`)
      }
    }
    if (report.campaigns?.length) {
      parts.push(`\n## Campaigns`)
      for (const c of report.campaigns) {
        const cpaChange = c.changes?.cpa != null ? ` | CPA change: ${c.changes.cpa > 0 ? '+' : ''}${c.changes.cpa}%` : ''
        parts.push(`- ${c.campaignName}: ฿${c.cost.toLocaleString()} spend | ${c.conversions} conv | CPA ฿${c.cpa.toFixed(0)} | CTR ${c.ctr.toFixed(2)}%${cpaChange}`)
      }
    }
    // Performance narrative — winners/concerns/wasted only (no strategic planner)
    if (narrative) {
      if (narrative.headline)      parts.push(`\n## Performance Headline\n${narrative.headline}`)
      if (narrative.clientSummary) parts.push(`\n## Summary\n${narrative.clientSummary}`)
      if (narrative.winners)       parts.push(`\n## Winners\n${narrative.winners}`)
      if (narrative.concerns)      parts.push(`\n## Concerns\n${narrative.concerns}`)
      if (narrative.wastedBudget)  parts.push(`\n## Wasted Budget\n${narrative.wastedBudget}`)
      if (narrative.deviceAnalysis)   parts.push(`\n## Device Analysis\n${narrative.deviceAnalysis}`)
      if (narrative.locationInsights) parts.push(`\n## Location Insights\n${narrative.locationInsights}`)
    }
    if (keywords?.length) {
      parts.push(`\n## Keywords (top by spend)`)
      for (const k of keywords.slice(0, 10)) {
        parts.push(`- "${k.keyword}" [${k.matchType}]: ฿${k.cost.toFixed(0)} | ${k.conversions} conv | QS ${k.qualityScore ?? 'N/A'} | CPA ฿${k.cpa.toFixed(0)}`)
      }
    }
    if (searchTerms?.length) {
      parts.push(`\n## Search Terms (top by spend)`)
      for (const s of searchTerms.slice(0, 10)) {
        parts.push(`- "${s.searchTerm}": ฿${s.cost.toFixed(0)} | ${s.conversions} conv | CTR ${s.ctr.toFixed(2)}%`)
      }
    }
    if (devices?.length) {
      parts.push(`\n## Devices`)
      for (const d of devices) parts.push(`- ${d.device}: ฿${d.cost.toFixed(0)} | ${d.conversions} conv | CPA ฿${d.cpa.toFixed(0)}`)
    }
    if (locations?.length) {
      parts.push(`\n## Locations (top 5)`)
      for (const l of locations.slice(0, 5)) parts.push(`- ${l.location}: ฿${l.cost.toFixed(0)} | ${l.conversions} conv | CPA ฿${l.cpa.toFixed(0)}`)
    }
    if (report.recommendations?.length) {
      parts.push(`\n## Recommendations`)
      for (const r of report.recommendations.slice(0, 6)) {
        parts.push(`- [${r.priority.toUpperCase()}] ${r.title}: ${r.action}`)
      }
    }
    return parts.join('\n')
  }

  // Full internal context: includes Strategic Planner — for team chat only
  function buildReportContext(): string {
    const base = buildClientContext()
    if (!narrative) return base
    const internal: string[] = []
    if (narrative.strategicContext)  internal.push(`\n## Strategic Context (Internal)\n${narrative.strategicContext}`)
    if (narrative.strategicNextStep) internal.push(`\n## Strategic Next Step (Internal)\n${narrative.strategicNextStep}`)
    if (narrative.clientTalkingPoints?.length) {
      internal.push(`\n## Client Talking Points (Internal)`)
      narrative.clientTalkingPoints.forEach((p) => internal.push(`- ${p}`))
    }
    return base + internal.join('\n')
  }

  async function sendChat() {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    setChatInput('')
    const userMsg = { role: 'user' as const, content: text }
    setChatMessages((prev) => [...prev, userMsg])
    setChatLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg],
          customerId: selectedId,
          accountName: selectedAccount?.descriptiveName ?? '',
          reportContext: buildReportContext(),
        }),
      })
      if (!res.ok) throw new Error('Chat failed')
      const data = await res.json() as { content: string }
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.content }])
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'ขอโทษครับ เกิดข้อผิดพลาด ลองใหม่อีกครั้งได้เลย' }])
    } finally {
      setChatLoading(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  async function generateEmail() {
    if (!narrative || emailLoading) return
    setEmailLoading(true)
    setEmailOpen(true)
    setEmailDraft('')
    const lang = emailLang === 'th' ? 'Thai' : 'English'
    const ctx  = buildClientContext()
    const acctName = selectedAccount?.descriptiveName ?? 'Client'
    const period   = DATE_RANGES.find((r) => r.value === dateRange)?.label ?? dateRange
    const prompt = emailLang === 'th'
      ? `คุณคือนักเขียนรายงานธุรกิจมืออาชีพ เชี่ยวชาญ Google Ads ระดับผู้บริหาร

กฎเขียน (ห้ามละเมิด):
- ห้ามใช้ ** ## -- * > backtick และ Emoji ทุกชนิดเด็ดขาด
- หัวข้อเขียนเป็นข้อความธรรมดา ใส่หมายเลข เช่น "1. ผลการดำเนินงาน"
- ตารางใช้ | และ - เท่านั้น ห้ามใช้ ** ครอบข้อความในตาราง
- ทุก claim ต้องมีตัวเลขกำกับ ห้ามพูดลอยๆ
- ไม่พูดวนซ้ำ แต่ละ section บอกข้อมูลใหม่เสมอ

เขียนอีเมลทางการภาษาไทย ส่งให้ทีมผู้บริหาร "${acctName}" สรุปผล Google Ads ช่วง ${period}

โครงสร้าง (เขียนตามลำดับนี้เป๊ะ):

Subject: ${acctName} — สรุปผล Google Ads ${period} | [ผลลัพธ์ที่โดดเด่นที่สุด 1 จุด]

เรียน ทีม ${acctName}

[บทสรุปเปิด 2-3 ประโยค: ระบุ Spend รวม, Conversions รวม, CPA จริง vs เป้า พร้อมบอกว่าต่ำกว่าหรือสูงกว่าเป้ากี่ % — ตรงไปตรงมา ไม่ต้องขยายความ]

[ถ้าผลดีมาก ให้เพิ่ม 1-2 ประโยค บอกจุดที่ต้อง review ก่อน scale เช่น campaign ที่ CPA สูง หรือ keyword QS ต่ำ]

---

1. ผลการดำเนินงาน ${period}

[ตารางสรุป metric หลัก — ใส่ตัวเลขจริงทั้งหมด ถ้าไม่มีข้อมูลช่วงก่อนหน้าให้ใส่ N/A]:

ตัวชี้วัด           | ผล
--------------------|----------
งบที่ใช้             | ฿[ตัวเลข]
Impressions         | [ตัวเลข]
Clicks              | [ตัวเลข]
CTR                 | [%]
Avg. CPC            | ฿[ตัวเลข]
Conversions         | [ตัวเลข]
Cost/Conversion     | ฿[ตัวเลข]
Target CPA          | ฿[ตัวเลข]
CPA vs Target       | [X% ต่ำกว่า/สูงกว่าเป้า]

[หลังตาราง: 1 ย่อหน้า วิเคราะห์ว่า metric ไหนน่าสนใจ เพราะอะไร — อ้างอิงตัวเลขจากตาราง]

---

2. สถานะ Campaign ช่วงนี้

[ตาราง campaign ทุกตัว — ใส่ตัวเลขจริง]:

Campaign                | Spend    | Conversions | CPA      | สถานะ
------------------------|----------|-------------|----------|------------------
[ชื่อ campaign จริง 1]  | ฿[จริง]  | [จริง]      | ฿[จริง]  | [Top Performer / Strong Performance / Being Optimised / Needs Review / Inactive]
[ชื่อ campaign จริง 2]  | ฿[จริง]  | [จริง]      | ฿[จริง]  | [สถานะ]

[หลังตาราง: 2-3 ประโยค ระบุว่า campaign ไหนน่าจับตาที่สุด เพราะอะไร อ้างตัวเลข CPA จริง]

---

3. จุดที่ต้องติดตาม

[เขียนเป็น section แยกสำหรับแต่ละประเด็น เช่น Quality Score, Wasted Spend, Campaign ที่ปิดอยู่ — แต่ละประเด็นมีตัวเลขกำกับ ถ้ามีรายการ keyword หรือ search term ที่เสียเงินเปล่า ให้ทำตารางแสดงด้วย]

---

4. แผนงาน 30 วันข้างหน้า

1. [action ที่ 1 — ระบุชัดว่าทำอะไร และคาดว่าผลจะเป็นอย่างไร]
2. [action ที่ 2]
3. [action ที่ 3]
4. [action ที่ 4 ถ้ามี]
5. [action ที่ 5 ถ้ามี]

---

5. สรุป

[1 ย่อหน้า สรุปภาพรวม priority สูงสุด 3 จุดที่ต้องทำ]

หากมีข้อสงสัยหรือต้องการข้อมูลเพิ่มเติม ทีมพร้อมให้บริการครับ/ค่ะ

ขอแสดงความนับถือ
ทีม Account Management

---

ใช้เฉพาะตัวเลขจากข้อมูลด้านล่างเท่านั้น ห้ามประดิษฐ์ตัวเลข:

${ctx}`
      : `You are a professional Google Ads performance report writer. Your writing is clear, direct, and every claim is backed by a number. No repetition between sections.

Strict formatting rules:
- No Markdown symbols: no ** ## -- * > backticks or emoji of any kind
- Section headings use plain numbered text only, e.g. "1. Performance Summary"
- Tables use | and - only. No ** inside table cells
- Every claim must reference a real number from the data
- If prior-period data is unavailable, write "N/A" and add a brief note

Write a formal client email in English for "${acctName}" covering Google Ads performance for ${period}.

Follow this structure exactly:

Subject: ${acctName} — Google Ads Performance Summary ${period} | [single most important result in plain words]

Dear ${acctName} Team,

[Opening paragraph, 2-3 sentences: state total Spend, total Conversions, actual CPA vs target CPA, and whether this is above or below target by what percentage. Direct, no filler.]

[If overall performance is strong, add 1-2 sentences naming the specific areas that should be reviewed before any budget increase — e.g. a campaign with CPA above target, or keywords with low Quality Score.]

---

1. Performance Summary — ${period}

[Summary metrics table — fill in real numbers. Use N/A if prior-period data is unavailable]:

Metric              | Result
--------------------|----------
Budget Spent        | ฿[real]
Impressions         | [real]
Clicks              | [real]
CTR                 | [real]%
Avg. CPC            | ฿[real]
Conversions         | [real]
Cost / Conversion   | ฿[real]
Target CPA          | ฿[real]
CPA vs Target       | [X% below / above target]

[After table: 1 paragraph. Highlight the most notable metric — what it means and why it matters. Reference numbers from the table.]

---

2. Campaign Performance

[Campaign table — every campaign, real numbers]:

Campaign                 | Spend    | Conversions | CPA      | Status
-------------------------|----------|-------------|----------|------------------
[Real campaign name 1]   | ฿[real]  | [real]      | ฿[real]  | [Top Performer / Strong Performance / Being Optimised / Needs Review / Inactive]
[Real campaign name 2]   | ฿[real]  | [real]      | ฿[real]  | [status]

[After table: 2-3 sentences. Name the campaign that needs the most attention, state its actual CPA, and explain why it matters.]

---

3. Key Areas to Watch

[Write a separate sub-section for each issue found in the data. Each sub-section has a plain heading and real numbers. If there are wasted spend search terms or low Quality Score keywords, show them in a small table.]

---

4. Recommended Actions for the Next 30 Days

1. [Action — state what will be done and what outcome is expected]
2. [Action]
3. [Action]
4. [Action if applicable]
5. [Action if applicable]

---

5. Summary

[1 paragraph. State the top 3 priorities in plain language. No new information — just reinforce what matters most.]

Please do not hesitate to reach out with any questions or if you would like us to proceed with any of the recommended actions.

Yours sincerely,
Account Management Team

---

Use only the numbers from the data below. Do not invent any figures.

${ctx}`
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          customerId: selectedId,
          accountName: selectedAccount?.descriptiveName ?? '',
          reportContext: ctx,
        }),
      })
      if (!res.ok) throw new Error('Email generation failed')
      const data = await res.json() as { content: string }
      setEmailDraft(data.content)
    } catch {
      setEmailDraft('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setEmailLoading(false)
    }
  }

  const selectedAccount = accounts.find((a) => a.id === selectedId)
  const s = report?.summary
  const totalConvValue = (conversions?.actions ?? []).reduce((a, c) => a + c.value, 0)
  const isEcommerceAccount = totalConvValue > 0
  const accountRoas = isEcommerceAccount && s && s.totalCost > 0 ? parseFloat((totalConvValue / s.totalCost).toFixed(2)) : 0

  function exportCSV() {
    if (!report) return
    const rows = [['Campaign', 'Cost', 'Impressions', 'Clicks', 'Conv', 'CTR%', 'CPC', 'CPA'],
      ...(report.campaigns ?? []).map((c) => [c.campaignName, (c.cost ?? 0).toFixed(2), c.impressions, c.clicks, c.conversions, (c.ctr ?? 0).toFixed(2), (c.cpc ?? 0).toFixed(2), (c.cpa ?? 0).toFixed(2)])]
    const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `report-${selectedId}-${dateRange}.csv`
    a.click()
  }

  function exportAllCSV() {
    if (!report) return
    const acctName = (selectedAccount?.descriptiveName ?? selectedId).replace(/\s+/g, '_')
    const period   = dateRange

    // Helper to build and download a CSV blob
    function downloadCSV(filename: string, rows: (string | number)[][]) {
      const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    }

    // 1. Summary
    const s = report.summary
    downloadCSV(`${acctName}_${period}_summary.csv`, [
      ['Metric', 'Value', 'Change%'],
      ['Total Spend', s.totalCost.toFixed(2), s.changes?.totalCost ?? ''],
      ['Conversions', s.totalConversions.toFixed(2), s.changes?.totalConversions ?? ''],
      ['Blended CPA', s.blendedCPA.toFixed(2), s.changes?.blendedCPA ?? ''],
      ['Clicks', s.totalClicks, s.changes?.totalClicks ?? ''],
      ['Impressions', s.totalImpressions, s.changes?.totalImpressions ?? ''],
      ['CTR%', s.blendedCTR.toFixed(2), s.changes?.blendedCTR ?? ''],
      ['Target CPA', s.targetCPA, ''],
      ['CPA vs Target%', s.cpaVsTarget ?? '', ''],
      ['Period', s.period, ''],
    ])

    // 2. Campaigns
    downloadCSV(`${acctName}_${period}_campaigns.csv`, [
      ['Campaign', 'Cost', 'Impressions', 'Clicks', 'Conv', 'CTR%', 'CPC', 'CPA', 'ConvRate%'],
      ...(report.campaigns ?? []).map((c) => [c.campaignName, c.cost.toFixed(2), c.impressions, c.clicks, c.conversions.toFixed(2), c.ctr.toFixed(2), c.cpc.toFixed(2), c.cpa.toFixed(2), c.conversionRate.toFixed(2)]),
    ])

    // 3. Keywords
    if (keywords && keywords.length > 0) {
      downloadCSV(`${acctName}_${period}_keywords.csv`, [
        ['Keyword', 'Match Type', 'Quality Score', 'Impressions', 'Clicks', 'Cost', 'Conv', 'CTR%', 'CPC', 'CPA'],
        ...keywords.map((k) => [k.keyword, k.matchType, k.qualityScore ?? '', k.impressions, k.clicks, k.cost.toFixed(2), k.conversions.toFixed(2), k.ctr.toFixed(2), k.cpc.toFixed(2), k.cpa.toFixed(2)]),
      ])
    }

    // 4. Search Terms
    if (searchTerms && searchTerms.length > 0) {
      downloadCSV(`${acctName}_${period}_search_terms.csv`, [
        ['Search Term', 'Matched Keyword', 'Impressions', 'Clicks', 'Cost', 'Conv', 'CTR%', 'CPC', 'CPA'],
        ...searchTerms.map((s) => [s.searchTerm, s.matchedKeyword, s.impressions, s.clicks, s.cost.toFixed(2), s.conversions.toFixed(2), s.ctr.toFixed(2), s.cpc.toFixed(2), s.cpa.toFixed(2)]),
      ])
    }

    // 5. Audiences
    if (audiences && audiences.length > 0) {
      downloadCSV(`${acctName}_${period}_audiences.csv`, [
        ['Audience', 'Type', 'Impressions', 'Clicks', 'Cost', 'Conv', 'CTR%', 'CPC', 'CPA'],
        ...audiences.map((a) => [a.audienceName, a.type, a.impressions, a.clicks, a.cost.toFixed(2), a.conversions.toFixed(2), a.ctr.toFixed(2), a.cpc.toFixed(2), a.cpa.toFixed(2)]),
      ])
    }

    // 6. Locations
    if (locations && locations.length > 0) {
      downloadCSV(`${acctName}_${period}_locations.csv`, [
        ['Location', 'Impressions', 'Clicks', 'Cost', 'Conv', 'CTR%', 'CPC', 'CPA'],
        ...locations.map((l) => [l.location, l.impressions, l.clicks, l.cost.toFixed(2), l.conversions.toFixed(2), l.ctr.toFixed(2), l.cpc.toFixed(2), l.cpa.toFixed(2)]),
      ])
    }

    // 7. Devices
    if (devices && devices.length > 0) {
      downloadCSV(`${acctName}_${period}_devices.csv`, [
        ['Device', 'Impressions', 'Clicks', 'Cost', 'Conv', 'CTR%', 'CPC', 'CPA'],
        ...devices.map((d) => [d.device, d.impressions, d.clicks, d.cost.toFixed(2), d.conversions.toFixed(2), d.ctr.toFixed(2), d.cpc.toFixed(2), d.cpa.toFixed(2)]),
      ])
    }

    // 8. Time series
    if (timeData && timeData.length > 0) {
      downloadCSV(`${acctName}_${period}_time.csv`, [
        ['Date', 'Impressions', 'Clicks', 'Cost', 'Conv'],
        ...timeData.map((t) => [t.date, t.impressions, t.clicks, t.cost.toFixed(2), t.conversions.toFixed(2)]),
      ])
    }

    // 9. Conversions
    if (conversions && conversions.actions.length > 0) {
      downloadCSV(`${acctName}_${period}_conversions.csv`, [
        ['Conversion Action', 'Category', 'Conversions', 'Value', 'All Conversions', 'View-Through Conv'],
        ...conversions.actions.map((a) => [a.conversionName, a.category, a.conversions.toFixed(2), a.value.toFixed(2), a.allConversions.toFixed(1), a.viewThroughConversions.toFixed(1)]),
      ])
    }
  }

  function exportPDF() {
    if (!report) return
    window.print()
  }

  function exportHTML() {
    if (!report) return
    const acctName = selectedAccount?.descriptiveName ?? selectedId
    const period   = DATE_RANGES.find((r) => r.value === dateRange)?.label ?? dateRange
    const generatedDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    const s = report.summary
    const nr = narrative

    const fmt = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    const fmtConv = (n: number) => n.toFixed(2)
    const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n}%`
    const cpaBadge = s.cpaVsTarget !== null
      ? `<span style="font-size:12px;padding:2px 10px;border-radius:20px;font-weight:700;background:${s.cpaVsTarget > 10 ? '#fef2f2' : '#ecfdf5'};color:${s.cpaVsTarget > 10 ? '#dc2626' : '#059669'}">${s.cpaVsTarget > 0 ? '+' + s.cpaVsTarget + '% เกินเป้า' : Math.abs(s.cpaVsTarget) + '% ต่ำกว่าเป้า'}</span>`
      : ''

    const campaignRows = report.campaigns.map((c) => `
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#111827">${c.campaignName}</td>
        <td style="padding:10px 14px;text-align:right">${fmt(c.cost)}</td>
        <td style="padding:10px 14px;text-align:right">${formatNumber(c.impressions)}</td>
        <td style="padding:10px 14px;text-align:right">${c.clicks.toLocaleString()}</td>
        <td style="padding:10px 14px;text-align:right;color:#059669;font-weight:600">${fmtConv(c.conversions)}</td>
        <td style="padding:10px 14px;text-align:right">${c.ctr.toFixed(2)}%</td>
        <td style="padding:10px 14px;text-align:right">${fmt(c.cpc)}</td>
        <td style="padding:10px 14px;text-align:right;font-weight:600;color:${c.cpa > s.targetCPA * 1.1 ? '#dc2626' : '#374151'}">${c.cpa > 0 ? fmt(c.cpa) : '—'}</td>
      </tr>`).join('')

    const keywordRows = (keywords ?? []).sort((a, b) => b.cost - a.cost).slice(0, 20).map((k) => `
      <tr>
        <td style="padding:9px 14px;font-weight:500;color:#111827">${k.keyword}</td>
        <td style="padding:9px 14px"><span style="font-size:11px;padding:1px 7px;border-radius:4px;font-weight:600;background:${k.matchType === 'EXACT' ? '#dcfce7' : k.matchType === 'PHRASE' ? '#f3e8ff' : '#dbeafe'};color:${k.matchType === 'EXACT' ? '#15803d' : k.matchType === 'PHRASE' ? '#7e22ce' : '#1d4ed8'}">${MATCH_LABEL[k.matchType] ?? k.matchType}</span></td>
        <td style="padding:9px 14px;text-align:center;font-weight:700;color:${k.qualityScore !== null && k.qualityScore >= 7 ? '#059669' : k.qualityScore !== null && k.qualityScore <= 4 ? '#dc2626' : '#6b7280'}">${k.qualityScore ?? '—'}</td>
        <td style="padding:9px 14px;text-align:right">${fmt(k.cost)}</td>
        <td style="padding:9px 14px;text-align:right;color:#059669;font-weight:600">${fmtConv(k.conversions)}</td>
        <td style="padding:9px 14px;text-align:right">${k.cpa > 0 ? fmt(k.cpa) : '—'}</td>
        <td style="padding:9px 14px;text-align:right">${k.ctr.toFixed(2)}%</td>
      </tr>`).join('')

    const searchTermRows = (searchTerms ?? []).sort((a, b) => b.cost - a.cost).slice(0, 20).map((st) => `
      <tr>
        <td style="padding:9px 14px;font-weight:500;color:#111827">${st.searchTerm}</td>
        <td style="padding:9px 14px;font-size:12px;color:#6b7280;font-family:monospace">${st.matchedKeyword || '—'}</td>
        <td style="padding:9px 14px;text-align:right">${formatNumber(st.impressions)}</td>
        <td style="padding:9px 14px;text-align:right">${st.clicks}</td>
        <td style="padding:9px 14px;text-align:right">${fmt(st.cost)}</td>
        <td style="padding:9px 14px;text-align:right;color:${st.conversions > 0 ? '#059669' : '#d1d5db'};font-weight:${st.conversions > 0 ? '600' : '400'}">${st.conversions > 0 ? fmtConv(st.conversions) : '0'}</td>
        <td style="padding:9px 14px;text-align:right">${st.ctr.toFixed(2)}%</td>
      </tr>`).join('')

    const locationRows = (locations ?? []).sort((a, b) => b.cost - a.cost).slice(0, 15).map((l) => `
      <tr>
        <td style="padding:9px 14px;font-weight:500;color:#111827">${l.location}</td>
        <td style="padding:9px 14px;text-align:right">${formatNumber(l.impressions)}</td>
        <td style="padding:9px 14px;text-align:right">${fmt(l.cost)}</td>
        <td style="padding:9px 14px;text-align:right;color:#059669;font-weight:600">${fmtConv(l.conversions)}</td>
        <td style="padding:9px 14px;text-align:right">${l.cpa > 0 ? fmt(l.cpa) : '—'}</td>
        <td style="padding:9px 14px;text-align:right">${l.ctr.toFixed(2)}%</td>
      </tr>`).join('')

    const deviceRows = (devices ?? []).map((d) => `
      <tr>
        <td style="padding:9px 14px;font-weight:600;color:#111827">${{ MOBILE: 'Mobile', DESKTOP: 'Desktop', TABLET: 'Tablet', CONNECTED_TV: 'Connected TV' }[d.device] ?? d.device}</td>
        <td style="padding:9px 14px;text-align:right">${formatNumber(d.impressions)}</td>
        <td style="padding:9px 14px;text-align:right">${formatNumber(d.clicks)}</td>
        <td style="padding:9px 14px;text-align:right">${fmt(d.cost)}</td>
        <td style="padding:9px 14px;text-align:right;color:#059669;font-weight:600">${fmtConv(d.conversions)}</td>
        <td style="padding:9px 14px;text-align:right">${d.ctr.toFixed(2)}%</td>
        <td style="padding:9px 14px;text-align:right">${d.cpa > 0 ? fmt(d.cpa) : '—'}</td>
      </tr>`).join('')

    const thStyle = `style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;background:#f9fafb"`
    const thRight = `style="padding:9px 14px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;background:#f9fafb"`

    const tableWrap = (content: string) => `
      <div style="overflow-x:auto;border-radius:10px;border:1px solid #e5e7eb;margin-top:16px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151">
          ${content}
        </table>
      </div>`

    const sectionCard = (title: string, titleColor: string, accentColor: string, body: string) => `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:24px">
        <div style="height:3px;background:${accentColor}"></div>
        <div style="padding:20px 24px 4px">
          <p style="font-size:11px;font-weight:700;color:${titleColor};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px">${title}</p>
        </div>
        <div style="padding:4px 24px 20px">${body}</div>
      </div>`

    const actionsList = nr ? nr.actions.map((a, i) => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 14px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;margin-bottom:8px">
        <span style="min-width:22px;height:22px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
        <span style="font-size:13px;color:#374151;line-height:1.6">${a}</span>
      </div>`).join('') : ''

    const insightsList = nr?.keyInsights ? nr.keyInsights.map((ins, i) => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 14px;background:#fff;border-radius:8px;border:1px solid #e0f2fe;margin-bottom:8px">
        <span style="min-width:22px;height:22px;border-radius:50%;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
        <span style="font-size:13px;color:#374151;line-height:1.6">${ins}</span>
      </div>`).join('') : ''

    const conversionRows = conversions?.actions?.length ? conversions.actions.map((a) => `
      <tr>
        <td style="padding:9px 14px;font-weight:500;color:#111827">${a.conversionName}</td>
        <td style="padding:9px 14px;font-size:12px;color:#6b7280">${a.category}</td>
        <td style="padding:9px 14px;text-align:right;font-weight:600;color:#059669">${fmtConv(a.conversions)}</td>
        <td style="padding:9px 14px;text-align:right">${fmt(a.value)}</td>
        <td style="padding:9px 14px;text-align:right;color:#6b7280">${fmtConv(a.allConversions)}</td>
      </tr>`).join('') : ''

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Report — ${acctName} · ${period}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', sans-serif; background: #f8fafc; color: #374151; line-height: 1.6; }
    a { color: inherit; text-decoration: none; }
    @media print {
      body { background: white; }
      .no-print { display: none !important; }
      .page-wrap { max-width: 100% !important; padding: 0 !important; }
      div[style*="border-radius"] { break-inside: avoid; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @page { margin: 1.5cm; size: A4 portrait; }
    }
  </style>
</head>
<body>
<div class="page-wrap" style="max-width:960px;margin:0 auto;padding:32px 24px 60px">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e5e7eb">
    <div>
      <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Google Ads Performance Report</p>
      <h1 style="font-size:26px;font-weight:800;color:#111827;line-height:1.2">${acctName}</h1>
      <p style="font-size:14px;color:#6b7280;margin-top:4px">ช่วงเวลา: <strong style="color:#374151">${period}</strong> &nbsp;·&nbsp; จัดทำเมื่อ ${generatedDate}</p>
    </div>
    <div style="text-align:right">
      <p style="font-size:11px;color:#9ca3af">Account ID</p>
      <p style="font-size:14px;font-weight:700;font-family:monospace;color:#374151">${selectedId}</p>
      ${s.targetCPA > 0 ? `<p style="font-size:11px;color:#9ca3af;margin-top:4px">Target CPA: <strong style="color:#374151">${fmt(s.targetCPA)}</strong></p>` : ''}
    </div>
  </div>

  <!-- KPI Summary Strip -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
    ${[
      { label: 'Total Spend', value: fmt(s.totalCost), sub: period, color: '#2563eb', bg: '#eff6ff' },
      { label: 'Conversions', value: fmtConv(s.totalConversions), sub: `Conv Rate ${((s.totalConversions / Math.max(1, s.totalClicks)) * 100).toFixed(2)}%`, color: '#059669', bg: '#ecfdf5' },
      { label: 'Blended CPA', value: fmt(s.blendedCPA), sub: s.cpaVsTarget !== null ? (s.cpaVsTarget > 0 ? `+${s.cpaVsTarget}% vs target` : `${Math.abs(s.cpaVsTarget)}% below target`) : `Target ${fmt(s.targetCPA)}`, color: s.cpaVsTarget !== null && s.cpaVsTarget > 10 ? '#dc2626' : '#059669', bg: s.cpaVsTarget !== null && s.cpaVsTarget > 10 ? '#fef2f2' : '#ecfdf5' },
      { label: 'CTR', value: `${s.blendedCTR.toFixed(2)}%`, sub: `${s.totalClicks.toLocaleString()} clicks`, color: '#7c3aed', bg: '#f5f3ff' },
    ].map((m) => `
      <div style="background:${m.bg};border-radius:12px;padding:16px 18px">
        <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${m.label}</p>
        <p style="font-size:26px;font-weight:800;color:${m.color};line-height:1">${m.value}</p>
        <p style="font-size:12px;color:#9ca3af;margin-top:4px">${m.sub}</p>
      </div>`).join('')}
  </div>
  ${cpaBadge ? `<div style="margin-bottom:24px;display:flex;align-items:center;gap:10px"><span style="font-size:13px;color:#6b7280">CPA vs Target:</span>${cpaBadge}</div>` : ''}

  ${nr ? `
  <!-- Executive Summary -->
  ${sectionCard('Performance Summary', '#2563eb', 'linear-gradient(90deg,#60a5fa,#818cf8,#a78bfa)', `
    <h2 style="font-size:19px;font-weight:800;color:#111827;line-height:1.35;margin-bottom:16px">${nr.headline}</h2>
    ${nr.clientSummary ? `<p style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:14px">${nr.clientSummary}</p>` : ''}
    ${nr.performance ? `<div style="border-top:1px solid #f3f4f6;padding-top:14px;margin-top:4px"><p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Performance Analysis</p><p style="font-size:14px;color:#374151;line-height:1.7">${nr.performance}</p></div>` : ''}
    ${nr.executiveSummary ? `<div style="background:#f8fafc;border-radius:10px;padding:16px;margin-top:16px;border:1px solid #e5e7eb"><p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Executive Summary</p><p style="font-size:14px;color:#374151;line-height:1.7">${nr.executiveSummary}</p></div>` : ''}
  `)}

  <!-- Winners & Concerns -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
    <div style="background:#fff;border:1px solid #bbf7d0;border-radius:14px;overflow:hidden">
      <div style="height:3px;background:#4ade80"></div>
      <div style="padding:18px 20px">
        <p style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">จุดเด่น · Winners</p>
        <p style="font-size:14px;color:#374151;line-height:1.7">${nr.winners}</p>
      </div>
    </div>
    <div style="background:#fff;border:1px solid #fecdd3;border-radius:14px;overflow:hidden">
      <div style="height:3px;background:#f87171"></div>
      <div style="padding:18px 20px">
        <p style="font-size:11px;font-weight:700;color:#be123c;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">จุดเสี่ยง · Concerns</p>
        <p style="font-size:14px;color:#374151;line-height:1.7">${nr.concerns}</p>
      </div>
    </div>
  </div>

  ${insightsList ? sectionCard('Key Data Insights', '#0369a1', 'linear-gradient(90deg,#38bdf8,#818cf8)', `<div style="background:#f0f9ff;border-radius:10px;padding:16px">${insightsList}</div>`) : ''}

  ${(nr.deviceAnalysis || nr.locationInsights || nr.wastedBudget) ? `
  <div style="display:grid;grid-template-columns:repeat(${[nr.deviceAnalysis, nr.locationInsights, nr.wastedBudget].filter(Boolean).length},1fr);gap:14px;margin-bottom:24px">
    ${nr.deviceAnalysis ? `<div style="background:#fff;border:1px solid #ddd6fe;border-radius:12px;padding:18px"><p style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Device Analysis</p><p style="font-size:13px;color:#374151;line-height:1.7">${nr.deviceAnalysis}</p></div>` : ''}
    ${nr.locationInsights ? `<div style="background:#fff;border:1px solid #fde68a;border-radius:12px;padding:18px"><p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Location Insights</p><p style="font-size:13px;color:#374151;line-height:1.7">${nr.locationInsights}</p></div>` : ''}
    ${nr.wastedBudget ? `<div style="background:#fff;border:1px solid #fecdd3;border-radius:12px;padding:18px"><p style="font-size:11px;font-weight:700;color:#be123c;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Wasted Budget</p><p style="font-size:13px;color:#374151;line-height:1.7">${nr.wastedBudget}</p></div>` : ''}
  </div>` : ''}

  ${actionsList ? sectionCard('Action Items · แผนงาน 30 วัน', '#374151', 'linear-gradient(90deg,#94a3b8,#cbd5e1)', actionsList) : ''}

  ${nr.outlook ? `
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:18px 20px;margin-bottom:24px;display:flex;gap:14px;align-items:flex-start">
    <div style="min-width:32px;height:32px;border-radius:50%;background:#0ea5e9;display:flex;align-items:center;justify-content:center">
      <span style="color:white;font-size:14px">↗</span>
    </div>
    <div>
      <p style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Outlook</p>
      <p style="font-size:14px;color:#0c4a6e;line-height:1.7">${nr.outlook}</p>
    </div>
  </div>` : ''}
  ` : ''}

  <!-- Campaign Performance Table -->
  ${sectionCard('Campaign Performance', '#374151', 'linear-gradient(90deg,#60a5fa,#34d399)', `
    ${tableWrap(`
      <thead>
        <tr>
          <th ${thStyle}>Campaign</th>
          <th ${thRight}>Spend</th>
          <th ${thRight}>Impressions</th>
          <th ${thRight}>Clicks</th>
          <th ${thRight}>Conversions</th>
          <th ${thRight}>CTR</th>
          <th ${thRight}>CPC</th>
          <th ${thRight}>CPA</th>
        </tr>
      </thead>
      <tbody>${campaignRows}</tbody>
      <tfoot>
        <tr style="background:#f9fafb;font-weight:700">
          <td style="padding:10px 14px;color:#374151">รวมทั้งหมด</td>
          <td style="padding:10px 14px;text-align:right;color:#2563eb">${fmt(s.totalCost)}</td>
          <td style="padding:10px 14px;text-align:right">${formatNumber(s.totalImpressions)}</td>
          <td style="padding:10px 14px;text-align:right">${s.totalClicks.toLocaleString()}</td>
          <td style="padding:10px 14px;text-align:right;color:#059669">${fmtConv(s.totalConversions)}</td>
          <td style="padding:10px 14px;text-align:right">${s.blendedCTR.toFixed(2)}%</td>
          <td style="padding:10px 14px;text-align:right">—</td>
          <td style="padding:10px 14px;text-align:right">${fmt(s.blendedCPA)}</td>
        </tr>
      </tfoot>
    `)}
  `)}

  ${keywordRows ? sectionCard('Keywords · Top 20 by Spend', '#374151', 'linear-gradient(90deg,#a78bfa,#60a5fa)', `
    ${tableWrap(`
      <thead>
        <tr>
          <th ${thStyle}>Keyword</th>
          <th ${thStyle}>Match</th>
          <th ${thRight}>QS</th>
          <th ${thRight}>Spend</th>
          <th ${thRight}>Conv.</th>
          <th ${thRight}>CPA</th>
          <th ${thRight}>CTR</th>
        </tr>
      </thead>
      <tbody>${keywordRows}</tbody>
    `)}
  `) : ''}

  ${searchTermRows ? sectionCard('Search Terms · Top 20 by Spend', '#374151', 'linear-gradient(90deg,#fbbf24,#f97316)', `
    ${tableWrap(`
      <thead>
        <tr>
          <th ${thStyle}>Search Term</th>
          <th ${thStyle}>Matched Keyword</th>
          <th ${thRight}>Impressions</th>
          <th ${thRight}>Clicks</th>
          <th ${thRight}>Spend</th>
          <th ${thRight}>Conv.</th>
          <th ${thRight}>CTR</th>
        </tr>
      </thead>
      <tbody>${searchTermRows}</tbody>
    `)}
  `) : ''}

  ${locationRows ? sectionCard('Location Performance · Top 15', '#374151', 'linear-gradient(90deg,#f59e0b,#34d399)', `
    ${tableWrap(`
      <thead>
        <tr>
          <th ${thStyle}>Location</th>
          <th ${thRight}>Impressions</th>
          <th ${thRight}>Spend</th>
          <th ${thRight}>Conv.</th>
          <th ${thRight}>CPA</th>
          <th ${thRight}>CTR</th>
        </tr>
      </thead>
      <tbody>${locationRows}</tbody>
    `)}
  `) : ''}

  ${deviceRows ? sectionCard('Device Split', '#374151', 'linear-gradient(90deg,#818cf8,#c084fc)', `
    ${tableWrap(`
      <thead>
        <tr>
          <th ${thStyle}>Device</th>
          <th ${thRight}>Impressions</th>
          <th ${thRight}>Clicks</th>
          <th ${thRight}>Spend</th>
          <th ${thRight}>Conv.</th>
          <th ${thRight}>CTR</th>
          <th ${thRight}>CPA</th>
        </tr>
      </thead>
      <tbody>${deviceRows}</tbody>
    `)}
  `) : ''}

  ${conversionRows ? sectionCard('Conversion Actions', '#374151', 'linear-gradient(90deg,#34d399,#60a5fa)', `
    ${tableWrap(`
      <thead>
        <tr>
          <th ${thStyle}>Conversion Action</th>
          <th ${thStyle}>Category</th>
          <th ${thRight}>Conversions</th>
          <th ${thRight}>Value</th>
          <th ${thRight}>All Conv.</th>
        </tr>
      </thead>
      <tbody>${conversionRows}</tbody>
    `)}
  `) : ''}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
    <p style="font-size:12px;color:#9ca3af">รายงานนี้จัดทำโดยทีม Account Management · ${generatedDate}</p>
    <p style="font-size:12px;color:#d1d5db">${acctName} · ${period}</p>
  </div>

</div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `${(acctName).replace(/\s+/g, '_')}_Report_${dateRange}.html`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const maxCostKw  = Math.max(1, ...(keywords ?? []).map((k) => k.cost))
  const maxCostLoc = Math.max(1, ...(locations ?? []).map((l) => l.cost))
  const maxImpDev  = Math.max(1, ...(devices ?? []).map((d) => d.impressions))

  return (
    <AppShell>
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-500" />Reports
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Google Ads Performance — ข้อมูลจริงจาก API</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {/* Account */}
          <div className="relative flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm min-w-[200px]">
            <Users className="w-4 h-4 text-gray-400 shrink-0" />
            {accountsLoading ? <span className="text-sm text-gray-400 flex-1">Loading...</span> : (
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 bg-transparent text-sm text-gray-700 font-medium outline-none appearance-none cursor-pointer">
                {accounts.length === 0 && <option value="">ไม่พบ account</option>}
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.descriptiveName}{a.testAccount ? ' (Test)' : ''}</option>)}
              </select>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 pointer-events-none" />
          </div>
          {/* Date range */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
              className="text-sm text-gray-700 bg-transparent outline-none cursor-pointer">
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {/* Target CPA */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm">
            <span className="text-xs text-gray-500">Target CPA ฿</span>
            <input type="number" value={targetCPA} onChange={(e) => setTargetCPA(e.target.value)} onBlur={loadReport}
              className="w-16 text-sm font-medium text-gray-700 bg-transparent outline-none" />
          </div>
          {/* Sync */}
          <button onClick={syncData} disabled={syncing || !selectedId}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
            {syncing ? 'Syncing...' : 'Sync & Refresh'}
          </button>
        </div>
      </div>

      {/* Account badge */}
      {selectedAccount && !accountsLoading && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-sm">
          <span className="w-2 h-2 bg-blue-500 rounded-full" />
          <span className="font-medium text-blue-800">{selectedAccount.descriptiveName}</span>
          <span className="text-blue-400 font-mono text-xs">{selectedAccount.id}</span>
          <span className="text-blue-400">·</span>
          <span className="text-blue-600 text-xs">{selectedAccount.currencyCode}</span>
          {selectedAccount.testAccount && <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">Test Account</span>}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* ── Summary cards ── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : s && (
        <div className={cn('grid gap-3', isEcommerceAccount ? 'grid-cols-2 md:grid-cols-6' : 'grid-cols-2 md:grid-cols-5')}>
          {[
            { label: 'Total Spend',    value: formatCurrency(s.totalCost),             sub: DATE_RANGES.find((r) => r.value === dateRange)?.label, trend: null,    changeKey: 'cost',        changeVal: s.changes?.totalCost,        highlight: false },
            { label: 'Conversions',    value: formatConversions(s.totalConversions),   sub: `Conv Rate ${((s.totalConversions / Math.max(1, s.totalClicks)) * 100).toFixed(2)}%`, trend: null, changeKey: 'conversions', changeVal: s.changes?.totalConversions, highlight: false },
            ...(isEcommerceAccount ? [
              { label: 'Conv. Value',  value: formatCurrency(totalConvValue),          sub: 'ยอดขายรวม', trend: null,                                               changeKey: 'conversions', changeVal: null,                        highlight: true },
              { label: 'ROAS',         value: `${accountRoas.toFixed(2)}x`,            sub: `ทุก ฿1 → ฿${accountRoas.toFixed(2)}`, trend: null,                    changeKey: 'ctr',         changeVal: null,                        highlight: true },
            ] : []),
            { label: 'Blended CPA',    value: formatCurrency(s.blendedCPA),            sub: `Target ฿${s.targetCPA}`, trend: s.cpaVsTarget,                         changeKey: 'cpa',         changeVal: s.changes?.blendedCPA,       highlight: false },
            { label: 'Clicks',         value: formatNumber(s.totalClicks),             sub: `CTR ${s.blendedCTR.toFixed(2)}%`, trend: null,                          changeKey: 'clicks',      changeVal: s.changes?.totalClicks,      highlight: false },
            ...(!isEcommerceAccount ? [
              { label: 'Impressions',  value: formatNumber(s.totalImpressions),        sub: undefined, trend: null,                                                   changeKey: 'impressions', changeVal: s.changes?.totalImpressions, highlight: false },
            ] : []),
          ].map((c) => (
            <div key={c.label} className={cn('rounded-xl border p-4', c.highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200')}>
              <p className={cn('text-xs font-medium mb-1', c.highlight ? 'text-emerald-600' : 'text-gray-500')}>{c.label}</p>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className={cn('text-xl font-bold', c.highlight ? 'text-emerald-700' : 'text-gray-900')}>{c.value}</p>
                <ChangeBadge metricKey={c.changeKey} value={c.changeVal} />
              </div>
              {c.sub && <p className={cn('text-xs mt-0.5', c.highlight ? 'text-emerald-500' : 'text-gray-400')}>{c.sub}</p>}
              {c.trend !== null && <div className="mt-1"><Trend value={c.trend} inverse={c.label === 'Blended CPA'} /></div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Performance Report ── (loads after all data is ready) */}
      {(narrativeLoading || narrative) && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Performance Report</span>
            {narrativeLoading && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />}
          </div>

          {narrativeLoading ? (
            <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-blue-100 rounded-2xl p-6 space-y-3 animate-pulse">
              <div className="h-6 bg-blue-100 rounded-lg w-3/4" />
              <div className="h-4 bg-blue-100 rounded w-full" />
              <div className="h-4 bg-blue-100 rounded w-5/6" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-20 bg-emerald-100 rounded-xl" />
                <div className="h-20 bg-red-100 rounded-xl" />
              </div>
              <div className="space-y-2">
                {[1,2,3,4,5].map((i) => <div key={i} className="h-3 bg-blue-100 rounded w-full" />)}
              </div>
              <p className="text-center text-xs text-blue-400 italic">กำลังวิเคราะห์ข้อมูลและเขียนรายงาน...</p>
            </div>
          ) : narrative && (
            <>
              {/* ══════════════════════════════════════════════════════════
                  PERFORMANCE REPORT CARD — redesigned
              ══════════════════════════════════════════════════════════ */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

                {/* gradient accent */}
                <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

                {/* ── Header ── */}
                <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 flex-wrap border-b border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Performance Report · Strategic Analysis</p>
                      {isEcommerceAccount && <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">E-commerce</span>}
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 leading-snug">{narrative.headline}</h2>
                    {/* status badge */}
                    {s && s.cpaVsTarget !== null && (
                      <span className={cn(
                        'mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
                        s.cpaVsTarget > 10
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', s.cpaVsTarget > 10 ? 'bg-red-500' : 'bg-emerald-500')} />
                        {s.cpaVsTarget > 10
                          ? `CPA เกินเป้า ${s.cpaVsTarget}%`
                          : `ดีมาก · CPA ต่ำกว่าเป้า ${Math.abs(s.cpaVsTarget)}%`}
                      </span>
                    )}
                  </div>
                  {s && (
                    <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-500 font-medium">
                      {DATE_RANGES.find((r) => r.value === dateRange)?.label}
                    </div>
                  )}
                </div>

                {/* ── KPI Cards ── */}
                {s && (
                  <>
                  <div className={cn('grid gap-px bg-gray-100', isEcommerceAccount ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4')}>
                    {[
                      {
                        label: 'Total Spend',
                        value: formatCurrency(s.totalCost),
                        helper: `${formatNumber(s.totalImpressions)} impressions`,
                        color: 'text-blue-600',
                        changeKey: 'cost',
                        changeVal: s.changes?.totalCost,
                        eco: false,
                      },
                      {
                        label: 'Conversions',
                        value: formatConversions(s.totalConversions),
                        helper: `Conv Rate ${((s.totalConversions / Math.max(1, s.totalClicks)) * 100).toFixed(2)}%`,
                        color: 'text-emerald-600',
                        changeKey: 'conversions',
                        changeVal: s.changes?.totalConversions,
                        eco: false,
                      },
                      ...(isEcommerceAccount ? [
                        {
                          label: 'Conv. Value',
                          value: formatCurrency(totalConvValue),
                          helper: 'ยอดขายรวมจากโฆษณา',
                          color: 'text-emerald-700',
                          changeKey: 'conversions',
                          changeVal: null as null,
                          eco: true,
                        },
                        {
                          label: 'ROAS',
                          value: `${accountRoas.toFixed(2)}x`,
                          helper: accountRoas >= 3 ? 'ดีมาก — พร้อม scale' : accountRoas >= 1 ? 'คุ้มทุน — ยังปรับได้' : 'ต่ำกว่าคุ้มทุน',
                          color: accountRoas >= 3 ? 'text-emerald-600' : accountRoas >= 1 ? 'text-yellow-600' : 'text-red-500',
                          changeKey: 'ctr',
                          changeVal: null as null,
                          eco: true,
                        },
                      ] : []),
                      {
                        label: isEcommerceAccount ? 'Cost/Purchase' : 'Avg. CPA',
                        value: formatCurrency(s.blendedCPA),
                        helper: s.targetCPA > 0 ? `Target ฿${s.targetCPA.toLocaleString('th-TH')}` : undefined,
                        color: s.cpaVsTarget !== null && s.cpaVsTarget > 10 ? 'text-red-500' : 'text-emerald-600',
                        changeKey: 'cpa',
                        changeVal: s.changes?.blendedCPA,
                        eco: false,
                      },
                      {
                        label: 'CTR',
                        value: `${s.blendedCTR.toFixed(2)}%`,
                        helper: `${formatNumber(s.totalClicks)} clicks`,
                        color: 'text-violet-600',
                        changeKey: 'ctr',
                        changeVal: s.changes?.blendedCTR,
                        eco: false,
                      },
                    ].map((m) => (
                      <div key={m.label} className={cn('px-5 py-4 space-y-1', m.eco ? 'bg-emerald-50' : 'bg-white')}>
                        <p className={cn('text-[11px] font-semibold uppercase tracking-wide', m.eco ? 'text-emerald-600' : 'text-gray-400')}>{m.label}</p>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className={cn('text-2xl font-bold', m.color)}>{m.value}</p>
                          <ChangeBadge metricKey={m.changeKey} value={m.changeVal} />
                        </div>
                        {m.helper && <p className={cn('text-[11px]', m.eco ? 'text-emerald-500' : 'text-gray-400')}>{m.helper}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Trend line chart — cost + conversions over time */}
                  {timeData && timeData.length > 1 && (
                    <div className="px-5 pt-5 pb-2">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Trend — Cost & Conversions</p>
                      <TrendChart data={[...timeData].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
                        date: d.date.slice(5),
                        cost: parseFloat(d.cost.toFixed(0)),
                        conv: parseFloat(d.conversions.toFixed(2)),
                      }))} />
                      <div className="flex items-center gap-4 mt-1 justify-center">
                        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-blue-400 rounded" /><span className="text-[10px] text-gray-400">Cost</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-emerald-400 rounded" /><span className="text-[10px] text-gray-400">Conversions</span></div>
                      </div>
                    </div>
                  )}
                  </>
                )}

                {/* ── Executive Summary — 4-section structured layout ── */}
                <div className="border-t border-gray-100">
                  <div className="px-6 pt-5 pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Executive Summary</p>
                  </div>

                  <div className="px-6 pb-6 space-y-3">

                    {/* 1 · Performance Summary */}
                    {s && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Performance Summary</p>
                          {isEcommerceAccount && <span className="text-[9px] bg-emerald-200 text-emerald-800 rounded-full px-1.5 py-0.5 font-bold">E-commerce</span>}
                        </div>
                        {isEcommerceAccount ? (
                          <p className="text-sm leading-relaxed text-gray-800">
                            ในช่วง{' '}<span className="font-semibold text-gray-900">{DATE_RANGES.find(r => r.value === dateRange)?.label ?? dateRange}</span>{' '}
                            account ใช้งบ{' '}<span className="font-semibold text-gray-900">฿{Math.round(s.totalCost).toLocaleString('th-TH')}</span>{' '}
                            และสร้างยอดขายได้{' '}<span className="font-semibold text-emerald-700">฿{Math.round(totalConvValue).toLocaleString('th-TH')}</span>{' '}
                            ROAS{' '}<span className={cn('font-semibold', accountRoas >= 3 ? 'text-emerald-700' : accountRoas >= 1 ? 'text-yellow-600' : 'text-red-500')}>{accountRoas.toFixed(2)}x</span>{' '}
                            — ทุก ฿1 ที่ลงโฆษณาสร้างยอดขาย ฿{accountRoas.toFixed(2)}{' '}
                            {accountRoas >= 3 ? 'ถือว่าดีมาก มีโอกาส scale ต่อได้' : accountRoas >= 1 ? 'คุ้มทุนแล้ว แต่ยังมีช่องว่างปรับปรุง' : 'ยังต่ำกว่าคุ้มทุน ต้องปรับ strategy'}{' '}
                            จำนวน Conversion ทั้งหมด{' '}<span className="font-semibold text-gray-900">{formatConversions(s.totalConversions)}</span>{' '}รายการ
                          </p>
                        ) : (
                          <p className="text-sm leading-relaxed text-gray-800">
                            ในช่วง{' '}<span className="font-semibold text-gray-900">{DATE_RANGES.find(r => r.value === dateRange)?.label ?? dateRange}</span>{' '}
                            account ใช้งบทั้งหมด{' '}
                            <span className="font-semibold text-gray-900">฿{Math.round(s.totalCost).toLocaleString('th-TH')}</span>{' '}
                            และสร้างได้{' '}
                            <span className="font-semibold text-gray-900">{formatConversions(s.totalConversions)} conversions</span>{' '}
                            โดยมี CPA เฉลี่ยอยู่ที่{' '}
                            <span className="font-semibold text-gray-900">฿{Math.round(s.blendedCPA).toLocaleString('th-TH')}</span>
                            {s.targetCPA > 0 && (
                              <> ซึ่ง{s.cpaVsTarget !== null && s.cpaVsTarget < 0 ? 'ต่ำกว่า' : 'สูงกว่า'}เป้าหมาย <span className="font-semibold text-gray-900">฿{s.targetCPA.toLocaleString('th-TH')}</span>
                              {s.cpaVsTarget !== null && s.cpaVsTarget < 0 && (
                                <> ประมาณ <span className="font-semibold text-emerald-700">{Math.abs(s.cpaVsTarget)}%</span></>
                              )}</>
                            )}{' '}
                            {s.cpaVsTarget !== null && s.cpaVsTarget <= 0
                              ? 'โดยรวมถือว่าประสิทธิภาพดีมาก และยังมีโอกาส scale ต่อได้'
                              : 'ควรปรับ bid strategy เพื่อลด CPA ให้เข้าเป้า'
                            }
                          </p>
                        )}
                      </div>
                    )}

                    {/* 2 · Best Performing Campaign */}
                    {narrative.winners && (
                      <div className="rounded-xl bg-white border border-gray-200 px-5 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Best Performing Campaign</p>
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mt-0.5">
                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 leading-snug">{narrative.winners}</p>
                            {s && (() => {
                              const best = report?.campaigns?.filter(c => c.conversions > 0).sort((a,b) => a.cpa - b.cpa)[0]
                              return best ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    CPA ฿{Math.round(best.cpa).toLocaleString('th-TH')}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                    {Math.round(best.conversions)} Conversions
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200">
                                    เหมาะสำหรับ scale งบ
                                  </span>
                                </div>
                              ) : null
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3 · Optimization Opportunity */}
                    {narrative.wastedBudget && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 flex items-start gap-3">
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center mt-0.5">
                          <svg className="w-4 h-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1.5">Optimization Opportunity</p>
                          <p className="text-sm text-amber-900 leading-relaxed">{narrative.wastedBudget}</p>
                          <p className="mt-1.5 text-[11px] text-amber-700 font-medium">ควรเพิ่มเป็น Negative Keywords เพื่อลดค่าใช้จ่ายที่ไม่จำเป็น</p>
                        </div>
                      </div>
                    )}

                    {/* 4 · Next Step */}
                    {(narrative.strategicNextStep || (narrative.actions && narrative.actions.length > 0)) && (
                      <div className="rounded-xl bg-blue-50 border border-blue-200 px-5 py-4 flex items-start gap-3">
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-200 flex items-center justify-center mt-0.5">
                          <svg className="w-4 h-4 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-1.5">Next Step</p>
                          <p className="text-sm text-blue-900 leading-relaxed">
                            {narrative.strategicNextStep || narrative.actions[0]}
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

              </div>

              {/* ── BLOCK 3: Key Insights — horizontal scroll chips ── */}
              {narrative.keyInsights && narrative.keyInsights.length > 0 && (
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5">
                  <p className="text-[11px] font-bold text-sky-700 uppercase tracking-wide mb-3">Key Data Insights</p>
                  <div className="space-y-2">
                    {narrative.keyInsights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 border border-sky-100 shadow-sm">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-sky-100 text-sky-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span className="text-sm text-gray-700 leading-relaxed">{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── BLOCK 4: Performance Overview + Winners/Concerns ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Winners */}
                <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden">
                  <div className="h-0.5 bg-emerald-400" />
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">จุดเด่น · Winners</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{narrative.winners}</p>
                  </div>
                </div>
                {/* Concerns */}
                <div className="bg-white border border-rose-200 rounded-2xl overflow-hidden">
                  <div className="h-0.5 bg-rose-400" />
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-rose-400" />
                      <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wide">จุดเสี่ยง · Concerns</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{narrative.concerns}</p>
                  </div>
                </div>
              </div>


              {/* ── BLOCK 5: Campaign Bar Chart ── */}
              {report && report.campaigns.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Campaign Spend vs Conversions</p>
                  </div>
                  <div className="px-5 py-4">
                    <CampaignBarChart data={[...report.campaigns].sort((a, b) => b.cost - a.cost).slice(0, 6).map((c) => ({
                      name: c.campaignName.length > 18 ? c.campaignName.slice(0, 18) + '…' : c.campaignName,
                      spend: parseFloat(c.cost.toFixed(0)),
                      conv: parseFloat(c.conversions.toFixed(2)),
                    }))} />
                    <div className="flex items-center gap-4 mt-1 justify-center">
                      <div className="flex items-center gap-1.5"><div className="w-3 h-2.5 rounded bg-blue-200" /><span className="text-[10px] text-gray-400">Spend</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-3 h-2.5 rounded bg-emerald-300" /><span className="text-[10px] text-gray-400">Conversions</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── BLOCK 6: Device / Location / Wasted — light pills ── */}
              {(narrative.deviceAnalysis || narrative.locationInsights || narrative.wastedBudget) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {narrative.deviceAnalysis && (
                    <div className="bg-white border border-violet-200 rounded-xl p-4">
                      <p className="text-[11px] font-bold text-violet-600 uppercase tracking-wide mb-2">Device Analysis</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{narrative.deviceAnalysis}</p>
                    </div>
                  )}
                  {narrative.locationInsights && (
                    <div className="bg-white border border-amber-200 rounded-xl p-4">
                      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-2">Location Insights</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{narrative.locationInsights}</p>
                    </div>
                  )}
                  {narrative.wastedBudget && (
                    <div className="bg-white border border-rose-200 rounded-xl p-4">
                      <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wide mb-2">Wasted Budget</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{narrative.wastedBudget}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── BLOCK 7: Strategic Planner ── */}
              {(narrative.strategicContext || narrative.strategicNextStep || (narrative.clientTalkingPoints && narrative.clientTalkingPoints.length > 0)) && (
                <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-indigo-400 to-violet-400" />
                  <div className="px-5 py-4 border-b border-indigo-50">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-indigo-500" />
                      <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">Strategic Planner · สำหรับทีมอธิบายลูกค้า</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    {narrative.strategicContext && (
                      <div>
                        <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Situation Analysis — ทำไมตัวเลขถึงเป็นแบบนี้</p>
                        <p className="text-sm text-gray-700 leading-relaxed bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">{narrative.strategicContext}</p>
                      </div>
                    )}
                    {narrative.strategicNextStep && (
                      <div>
                        <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-1.5">Strategic Priority · 30 วันข้างหน้า</p>
                        <p className="text-sm text-gray-700 leading-relaxed bg-violet-50 rounded-xl px-4 py-3 border border-violet-100">{narrative.strategicNextStep}</p>
                      </div>
                    )}
                    {narrative.clientTalkingPoints && narrative.clientTalkingPoints.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">Client Talking Points · ประโยคที่พูดกับลูกค้าได้เลย</p>
                        <div className="space-y-2">
                          {narrative.clientTalkingPoints.map((point, i) => (
                            <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                              <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                              <span className="text-sm text-gray-700 leading-relaxed">{point}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── BLOCK 8: Action Items ── */}
              {narrative.actions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Action Items · สิ่งที่ต้องทำ</p>
                  <ol className="space-y-2">
                    {narrative.actions.map((action, i) => (
                      <li key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span className="text-sm text-gray-700 leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* ── BLOCK 9: Summary Snapshot ── */}
              {s && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-blue-400 to-emerald-400" />
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">สรุปภาพรวม · Summary Snapshot</p>
                      {isEcommerceAccount && <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold">E-commerce Mode</span>}
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {/* Metric row */}
                    <div className={cn('grid gap-px bg-gray-100', isEcommerceAccount ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4')}>
                      {[
                        { label: 'Total Spend',   value: formatCurrency(s.totalCost),          color: 'text-blue-600',    eco: false },
                        { label: 'Conversions',   value: formatConversions(s.totalConversions), color: 'text-emerald-600', eco: false },
                        ...(isEcommerceAccount ? [
                          { label: 'Conv. Value', value: formatCurrency(totalConvValue),        color: 'text-emerald-700', eco: true },
                          { label: 'ROAS',        value: `${accountRoas.toFixed(2)}x`,          color: accountRoas >= 3 ? 'text-emerald-600' : accountRoas >= 1 ? 'text-yellow-600' : 'text-red-500', eco: true },
                        ] : []),
                        { label: isEcommerceAccount ? 'Cost/Purchase' : 'Blended CPA', value: formatCurrency(s.blendedCPA), color: s.cpaVsTarget !== null && s.cpaVsTarget > 10 ? 'text-red-500' : 'text-emerald-600', eco: false },
                        { label: 'CTR',           value: `${s.blendedCTR.toFixed(2)}%`,        color: 'text-violet-600',  eco: false },
                      ].map((m) => (
                        <div key={m.label} className={cn('px-5 py-4 text-center space-y-1', m.eco ? 'bg-emerald-50' : 'bg-white')}>
                          <p className={cn('text-[11px] font-medium', m.eco ? 'text-emerald-500' : 'text-gray-400')}>{m.label}</p>
                          <p className={cn('text-xl font-bold', m.color)}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                    {/* CPA vs target bar */}
                    {s.cpaVsTarget !== null && (
                      <div className="px-5 py-4 flex items-center gap-4">
                        <div className="shrink-0 text-sm font-medium text-gray-700">
                          CPA vs Target
                        </div>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', s.cpaVsTarget > 10 ? 'bg-red-400' : 'bg-emerald-400')}
                            style={{ width: `${Math.min(100, Math.abs(s.cpaVsTarget))}%` }}
                          />
                        </div>
                        <div className={cn('shrink-0 text-sm font-bold', s.cpaVsTarget > 10 ? 'text-red-500' : 'text-emerald-600')}>
                          {s.cpaVsTarget > 0 ? `+${s.cpaVsTarget}% เกินเป้า` : `${Math.abs(s.cpaVsTarget)}% ต่ำกว่าเป้า`}
                        </div>
                      </div>
                    )}
                    {/* Executive Summary paragraph */}
                    {narrative.executiveSummary && (
                      <div className="px-5 py-4 space-y-1.5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Executive Summary</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{narrative.executiveSummary}</p>
                      </div>
                    )}
                    {/* Outlook */}
                    <div className="px-5 py-4 flex items-start gap-3 bg-sky-50">
                      <TrendingUp className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">Outlook</p>
                        <p className="text-sm text-sky-800 leading-relaxed">{narrative.outlook}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Dimension Tabs ── */}
      {selectedId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Tab bar */}
          <div className="flex gap-1 p-2 border-b border-gray-100 overflow-x-auto">
            <TabBtn active={activeTab === 'overview'}     onClick={() => setActiveTab('overview')}     icon={BarChart2}    label="Overview" />
            <TabBtn active={activeTab === 'campaigns'}    onClick={() => setActiveTab('campaigns')}    icon={Layers}       label="Campaigns" />
            <TabBtn active={activeTab === 'keywords'}     onClick={() => setActiveTab('keywords')}     icon={Search}       label="Keywords" />
            <TabBtn active={activeTab === 'search_terms'} onClick={() => setActiveTab('search_terms')} icon={Search}       label="Search Terms" />
            <TabBtn active={activeTab === 'text_ads'}     onClick={() => setActiveTab('text_ads')}     icon={FileText}     label="Text Ads" />
            <TabBtn active={activeTab === 'audiences'}    onClick={() => setActiveTab('audiences')}    icon={Users}        label="Audiences" />
            <TabBtn active={activeTab === 'locations'}    onClick={() => setActiveTab('locations')}    icon={MapPin}       label="Locations" />
            <TabBtn active={activeTab === 'devices'}      onClick={() => setActiveTab('devices')}      icon={Monitor}      label="Devices" />
            <TabBtn active={activeTab === 'time'}         onClick={() => setActiveTab('time')}         icon={Clock}        label="Time" />
            <TabBtn active={activeTab === 'conversions'}  onClick={() => setActiveTab('conversions')}  icon={Target}       label="Conversions" />
            <TabBtn active={activeTab === 'ecommerce'}    onClick={() => setActiveTab('ecommerce')}    icon={ShoppingCart} label="E-commerce" />
          </div>

          <div className="p-0">

            {/* OVERVIEW — long-form single-page view */}
            {activeTab === 'overview' && (
              <div className="divide-y divide-gray-100">
                {!s ? <EmptyDim /> : (
                  <>
                    {/* 1. Performance Summary — 6 metric cards */}
                    <div className="p-5 space-y-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Performance Summary</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                          { label: 'Total Spend',   value: formatCurrency(s.totalCost),          changeKey: 'cost',        changeVal: s.changes?.totalCost,        color: 'bg-blue-50 text-blue-700' },
                          { label: 'Conversions',   value: formatConversions(s.totalConversions), changeKey: 'conversions', changeVal: s.changes?.totalConversions,  color: 'bg-emerald-50 text-emerald-700' },
                          { label: 'CPA vs Target', value: formatCurrency(s.blendedCPA),         changeKey: 'cpa',         changeVal: s.changes?.blendedCPA,        color: s.cpaVsTarget !== null && s.cpaVsTarget > 20 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700' },
                          { label: 'CTR',           value: `${s.blendedCTR.toFixed(2)}%`,        changeKey: 'ctr',         changeVal: s.changes?.blendedCTR,        color: 'bg-purple-50 text-purple-700' },
                          { label: 'Clicks',        value: formatNumber(s.totalClicks),          changeKey: 'clicks',      changeVal: s.changes?.totalClicks,       color: 'bg-amber-50 text-amber-700' },
                          { label: 'Impressions',   value: formatNumber(s.totalImpressions),     changeKey: 'impressions', changeVal: s.changes?.totalImpressions,  color: 'bg-gray-50 text-gray-700' },
                        ].map((m) => (
                          <div key={m.label} className={cn('rounded-xl p-3 text-center space-y-1', m.color.split(' ')[0])}>
                            <p className={cn('text-xl font-bold', m.color.split(' ')[1])}>{m.value}</p>
                            <p className="text-[11px] opacity-70 font-medium">{m.label}</p>
                            {m.label === 'CPA vs Target' && s.cpaVsTarget !== null && (
                              <p className="text-[10px] font-semibold">{s.cpaVsTarget > 0 ? `+${s.cpaVsTarget}% เกินเป้า` : `${s.cpaVsTarget}% ต่ำกว่าเป้า`}</p>
                            )}
                            <div className="flex justify-center"><ChangeBadge metricKey={m.changeKey} value={m.changeVal} /></div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Campaign Table — full inline */}
                    <div>
                      <div className="px-5 py-3 flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Campaigns ({report?.campaigns?.length ?? 0})</p>
                        <button onClick={exportCSV} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                          <Download className="w-3.5 h-3.5" />CSV
                        </button>
                      </div>
                      {!report?.campaigns?.length ? <EmptyDim /> : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr><Th>Campaign</Th><Th className="text-right">Spend</Th><Th className="text-right">Conv.</Th><Th className="text-right">CPA</Th><Th className="text-right">Clicks</Th><Th className="text-right">CTR</Th><Th className="text-right">CPC</Th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {report.campaigns.map((c, i) => (
                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                  <Td><span className="font-medium text-gray-900">{c.campaignName}</span></Td>
                                  <Td className="text-right">
                                    <div className="font-medium">{formatCurrency(c.cost)}</div>
                                    <ChangeBadge metricKey="cost" value={c.changes?.cost} />
                                  </Td>
                                  <Td className="text-right">
                                    <div className="font-semibold text-emerald-600">{formatConversions(c.conversions)}</div>
                                    <ChangeBadge metricKey="conversions" value={c.changes?.conversions} />
                                  </Td>
                                  <Td className="text-right">
                                    <div className={cn('font-semibold', c.cpa > 0 ? (c.cpa > (s?.blendedCPA ?? 0) * 1.3 ? 'text-red-500' : c.cpa < (s?.blendedCPA ?? 0) * 0.8 ? 'text-emerald-600' : 'text-gray-700') : 'text-gray-300')}>{c.cpa > 0 ? formatCurrency(c.cpa) : '—'}</div>
                                    <ChangeBadge metricKey="cpa" value={c.changes?.cpa} />
                                  </Td>
                                  <Td className="text-right">
                                    <div>{formatNumber(c.clicks)}</div>
                                    <ChangeBadge metricKey="clicks" value={c.changes?.clicks} />
                                  </Td>
                                  <Td className="text-right">
                                    <div className={cn('font-semibold', metricValueColor('ctr', c.ctr ?? 0))}>{(c.ctr ?? 0).toFixed(2)}%</div>
                                    <ChangeBadge metricKey="ctr" value={c.changes?.ctr} />
                                  </Td>
                                  <Td className="text-right">
                                    <div className={cn(c.cpc > 0 ? 'text-gray-700' : 'text-gray-300')}>{formatCurrency(c.cpc)}</div>
                                    <ChangeBadge metricKey="cpc" value={c.changes?.cpc} />
                                  </Td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td className="px-4 py-2.5 text-xs font-bold text-gray-500">รวมทั้งหมด</td>
                                <td className="px-4 py-2.5 text-sm font-bold text-right">{formatCurrency(s.totalCost)}</td>
                                <td className="px-4 py-2.5 text-sm font-bold text-right">{s.totalConversions.toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-sm font-bold text-right">{s.blendedCPA > 0 ? formatCurrency(s.blendedCPA) : '—'}</td>
                                <td className="px-4 py-2.5 text-sm font-bold text-right">{formatNumber(s.totalClicks)}</td>
                                <td className="px-4 py-2.5 text-sm font-bold text-right">{s.blendedCTR.toFixed(2)}%</td>
                                <td className="px-4 py-2.5" />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 3. Top Keywords by Spend */}
                    <div>
                      <div className="px-5 py-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Top Keywords by Spend (top 10)</p>
                      </div>
                      {!keywords?.length ? (
                        <div className="px-5 pb-4 text-sm text-gray-400">ไม่มีข้อมูล keyword</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr><Th>Keyword</Th><Th>Match</Th><Th className="text-right">Spend</Th><Th className="text-right">Conv.</Th><Th className="text-right">CPA</Th><Th className="text-right">CTR</Th><Th>Volume</Th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {[...keywords].sort((a, b) => b.cost - a.cost).slice(0, 10).map((k, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  <Td><span className="font-medium text-gray-900">{k.keyword}</span></Td>
                                  <Td><span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', MATCH_COLOR[k.matchType] ?? 'bg-gray-100 text-gray-600')}>{MATCH_LABEL[k.matchType] ?? k.matchType}</span></Td>
                                  <Td className="text-right font-medium">{formatCurrency(k.cost)}</Td>
                                  <Td className="text-right font-semibold text-emerald-600">{formatConversions(k.conversions)}</Td>
                                  <Td className={cn('text-right font-semibold', k.cpa > 0 ? 'text-gray-700' : 'text-gray-300')}>{k.cpa > 0 ? formatCurrency(k.cpa) : '—'}</Td>
                                  <Td className={cn('text-right font-semibold', metricValueColor('ctr', k.ctr ?? 0))}>{(k.ctr ?? 0).toFixed(2)}%</Td>
                                  <Td><MetricBar value={k.cost} max={maxCostKw} /></Td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 4. Device Split */}
                    <div>
                      <div className="px-5 py-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Device Split</p>
                      </div>
                      {!devices?.length ? (
                        <div className="px-5 pb-4 text-sm text-gray-400">ไม่มีข้อมูล device</div>
                      ) : (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                          {devices.map((d, i) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-gray-800 text-sm">{DEVICE_LABEL[d.device] ?? d.device}</span>
                                <span className="text-xs text-gray-400">{maxImpDev > 0 ? Math.round((d.impressions / maxImpDev) * 100) : 0}%</span>
                              </div>
                              <MetricBar value={d.impressions} max={maxImpDev} />
                              <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                                <span>Spend: <b className="text-gray-800">{formatCurrency(d.cost)}</b></span>
                                <span>Clicks: <b className="text-gray-800">{formatNumber(d.clicks)}</b></span>
                                <span>Conv: <b className="text-emerald-600">{formatConversions(d.conversions)}</b></span>
                                <span>CPA: <b className="text-gray-800">{d.cpa > 0 ? formatCurrency(d.cpa) : '—'}</b></span>
                                <span>CTR: <b className="text-gray-800">{(d.ctr ?? 0).toFixed(2)}%</b></span>
                                <span>CPC: <b className="text-gray-800">{formatCurrency(d.cpc)}</b></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 5. Location Top 5 */}
                    <div>
                      <div className="px-5 py-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Top Locations (top 5)</p>
                      </div>
                      {!locations?.length ? (
                        <div className="px-5 pb-4 text-sm text-gray-400">ไม่มีข้อมูล location</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr><Th>Location</Th><Th className="text-right">Impressions</Th><Th className="text-right">Clicks</Th><Th className="text-right">Spend</Th><Th className="text-right">Conv.</Th><Th className="text-right">CPA</Th><Th>Share</Th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {[...locations].sort((a, b) => b.cost - a.cost).slice(0, 5).map((l, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  <Td><span className="font-medium text-gray-900">{l.location}</span></Td>
                                  <Td className="text-right">{formatNumber(l.impressions)}</Td>
                                  <Td className="text-right">{formatNumber(l.clicks)}</Td>
                                  <Td className="text-right font-medium">{formatCurrency(l.cost)}</Td>
                                  <Td className="text-right font-semibold text-emerald-600">{formatConversions(l.conversions)}</Td>
                                  <Td className={cn('text-right font-semibold', l.cpa > 0 ? 'text-gray-700' : 'text-gray-300')}>{l.cpa > 0 ? formatCurrency(l.cpa) : '—'}</Td>
                                  <Td><MetricBar value={l.cost} max={maxCostLoc} /></Td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 6. AI Recommendations grouped by priority */}
                    {report?.recommendations && report.recommendations.length > 0 && (
                      <div className="p-5 space-y-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recommendations ({report.recommendations.length})</p>
                        {(['critical', 'high', 'medium', 'low'] as const).map((priority) => {
                          const recs = report.recommendations.filter((r) => r.priority === priority)
                          if (!recs.length) return null
                          return (
                            <div key={priority} className="space-y-2">
                              <p className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full w-fit', PRIORITY_COLOR[priority])}>
                                {PRIORITY_LABEL[priority]} ({recs.length})
                              </p>
                              {recs.map((rec, i) => (
                                <div key={i} className={cn('rounded-xl border px-4 py-3 flex items-start gap-3', PRIORITY_COLOR[priority])}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold">{rec.title}</p>
                                    <p className="text-xs opacity-80 mt-0.5">{rec.detail}</p>
                                    <p className="text-xs font-medium mt-1.5">→ {rec.action}</p>
                                    {rec.estimatedImpact && <p className="text-xs mt-0.5 opacity-70">✦ {rec.estimatedImpact}</p>}
                                  </div>
                                  <span className="shrink-0 text-[10px] opacity-60">{rec.campaignName === 'All Campaigns' ? 'ทุก campaign' : rec.campaignName.slice(0, 22)}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* CAMPAIGNS */}
            {activeTab === 'campaigns' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Campaign Performance</span>
                  <button onClick={exportCSV} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                    <Download className="w-3.5 h-3.5" />Export CSV
                  </button>
                </div>
                {!report?.campaigns?.length ? <EmptyDim /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <SortTh col="campaignName" label="Campaign" {...campSort} />
                          <SortTh col="cost"        label="Spend"    {...campSort} className="text-right" />
                          <SortTh col="conversions" label="Conv."    {...campSort} className="text-right" />
                          <SortTh col="cpa"         label="CPA"      {...campSort} className="text-right" />
                          <SortTh col="clicks"      label="Clicks"   {...campSort} className="text-right" />
                          <SortTh col="ctr"         label="CTR"      {...campSort} className="text-right" />
                          <SortTh col="cpc"         label="CPC"      {...campSort} className="text-right" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(campSort.sorted as unknown as typeof report.campaigns).map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <Td><span className="font-medium text-gray-900">{c.campaignName}</span></Td>
                            <Td className="text-right">
                              <div className="font-medium">{formatCurrency(c.cost)}</div>
                              <ChangeBadge metricKey="cost" value={c.changes?.cost} />
                            </Td>
                            <Td className="text-right">
                              <div className="font-semibold text-emerald-600">{formatConversions(c.conversions)}</div>
                              <ChangeBadge metricKey="conversions" value={c.changes?.conversions} />
                            </Td>
                            <Td className="text-right">
                              <div className={cn('font-semibold', c.cpa > 0 ? (c.cpa > (s?.blendedCPA ?? 0) * 1.3 ? 'text-red-500' : c.cpa < (s?.blendedCPA ?? 0) * 0.8 ? 'text-emerald-600' : 'text-gray-700') : 'text-gray-300')}>{c.cpa > 0 ? formatCurrency(c.cpa) : '—'}</div>
                              <ChangeBadge metricKey="cpa" value={c.changes?.cpa} />
                            </Td>
                            <Td className="text-right">
                              <div>{formatNumber(c.clicks)}</div>
                              <ChangeBadge metricKey="clicks" value={c.changes?.clicks} />
                            </Td>
                            <Td className="text-right">
                              <div className={cn('font-semibold', metricValueColor('ctr', c.ctr ?? 0))}>{(c.ctr ?? 0).toFixed(2)}%</div>
                              <ChangeBadge metricKey="ctr" value={c.changes?.ctr} />
                            </Td>
                            <Td className="text-right">
                              <div className={cn(c.cpc > 0 ? 'text-gray-700' : 'text-gray-300')}>{formatCurrency(c.cpc)}</div>
                              <ChangeBadge metricKey="cpc" value={c.changes?.cpc} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td className="px-4 py-2.5 text-xs font-bold text-gray-500">รวมทั้งหมด</td>
                          <td className="px-4 py-2.5 text-sm font-bold text-right">{s ? formatCurrency(s.totalCost) : '—'}</td>
                          <td className="px-4 py-2.5 text-sm font-bold text-right">{s?.totalConversions.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-sm font-bold text-right">{s && s.blendedCPA > 0 ? formatCurrency(s.blendedCPA) : '—'}</td>
                          <td className="px-4 py-2.5 text-sm font-bold text-right">{s ? formatNumber(s.totalClicks) : '—'}</td>
                          <td className="px-4 py-2.5 text-sm font-bold text-right">{s?.blendedCTR.toFixed(2)}%</td>
                          <td className="px-4 py-2.5" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* KEYWORDS */}
            {activeTab === 'keywords' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Keywords ({keywords?.length ?? 0})</span>
                  {dimLoading.keywords && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                </div>
                {!keywords?.length ? <EmptyDim /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <SortTh col="keyword"      label="Keyword" {...kwSort} />
                          <SortTh col="matchType"    label="Match"   {...kwSort} />
                          <SortTh col="qualityScore" label="QS"      {...kwSort} className="text-right" />
                          <SortTh col="cost"         label="Spend"   {...kwSort} className="text-right" />
                          <SortTh col="conversions"  label="Conv."   {...kwSort} className="text-right" />
                          <SortTh col="cpa"          label="CPA"     {...kwSort} className="text-right" />
                          <SortTh col="ctr"          label="CTR"     {...kwSort} className="text-right" />
                          <Th>Volume</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(kwSort.sorted as unknown as typeof keywords).map((k, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <Td><span className="font-medium text-gray-900">{k.keyword}</span></Td>
                            <Td><span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', MATCH_COLOR[k.matchType] ?? 'bg-gray-100 text-gray-600')}>{MATCH_LABEL[k.matchType] ?? k.matchType}</span></Td>
                            <Td className="text-right">
                              {k.qualityScore !== null ? (
                                <span className={cn('font-bold text-sm', metricValueColor('quality_score', k.qualityScore))}>{k.qualityScore}</span>
                              ) : <span className="text-gray-300">—</span>}
                            </Td>
                            <Td className="text-right font-medium">{formatCurrency(k.cost)}</Td>
                            <Td className="text-right font-semibold text-emerald-600">{formatConversions(k.conversions)}</Td>
                            <Td className={cn('text-right font-semibold', k.cpa > 0 ? 'text-gray-700' : 'text-gray-300')}>{k.cpa > 0 ? formatCurrency(k.cpa) : '—'}</Td>
                            <Td className={cn('text-right font-semibold', metricValueColor('ctr', k.ctr ?? 0))}>{(k.ctr ?? 0).toFixed(2)}%</Td>
                            <Td><MetricBar value={k.cost} max={maxCostKw} /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* SEARCH TERMS */}
            {activeTab === 'search_terms' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Search Terms ({searchTerms?.length ?? 0})</span>
                  {dimLoading.search_terms && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                </div>
                {!searchTerms?.length ? <EmptyDim /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <SortTh col="searchTerm"    label="Search Term"      {...stSort} />
                          <SortTh col="matchedKeyword" label="Matched Keyword" {...stSort} />
                          <SortTh col="impressions"   label="Impressions"      {...stSort} className="text-right" />
                          <SortTh col="clicks"        label="Clicks"           {...stSort} className="text-right" />
                          <SortTh col="cost"          label="Spend"            {...stSort} className="text-right" />
                          <SortTh col="conversions"   label="Conv."            {...stSort} className="text-right" />
                          <SortTh col="ctr"           label="CTR"              {...stSort} className="text-right" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(stSort.sorted as unknown as typeof searchTerms).map((st, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <Td><span className="font-medium text-gray-900">{st.searchTerm}</span></Td>
                            <Td><span className="text-xs text-gray-500 font-mono">{st.matchedKeyword || '—'}</span></Td>
                            <Td className="text-right">{formatNumber(st.impressions)}</Td>
                            <Td className="text-right">{st.clicks}</Td>
                            <Td className="text-right">{formatCurrency(st.cost)}</Td>
                            <Td className="text-right">{st.conversions > 0 ? <span className="font-semibold text-emerald-600">{formatConversions(st.conversions)}</span> : <span className="text-gray-300">0.00</span>}</Td>
                            <Td className={cn('text-right font-semibold', metricValueColor('ctr', st.ctr ?? 0))}>{(st.ctr ?? 0).toFixed(2)}%</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TEXT ADS */}
            {activeTab === 'text_ads' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Text Ads ({textAds?.length ?? 0})</span>
                  {dimLoading.text_ads && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                </div>
                {!textAds?.length ? <EmptyDim /> : (
                  <div className="divide-y divide-gray-50">
                    {textAds.map((ad, i) => {
                      const hasConv = ad.conversions > 0
                      const isGoodCtr = ad.ctr >= 5
                      const isGoodConv = ad.conversions >= 5
                      const isEditing = editingAdId === ad.adId
                      const isPushing = pushingAdId === ad.adId
                      const pushResult = pushAdResult[ad.adId]
                      return (
                        <div key={i} className={cn('px-4 py-4', hasConv && 'bg-emerald-50/30', isEditing && 'bg-blue-50/40')}>
                          {/* Campaign / Ad Group */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{ad.campaignName}</span>
                            <ChevronRight className="w-3 h-3 text-gray-300" />
                            <span className="text-[10px] text-gray-400">{ad.adGroupName}</span>
                            {ad.adStrength && (
                              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                                ad.adStrength === 'EXCELLENT' ? 'bg-emerald-100 text-emerald-700' :
                                ad.adStrength === 'GOOD' ? 'bg-blue-100 text-blue-700' :
                                ad.adStrength === 'AVERAGE' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-500'
                              )}>Ad Strength: {ad.adStrength}</span>
                            )}
                            <div className="ml-auto flex items-center gap-1.5">
                              {pushResult === 'ok' && (
                                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Push สำเร็จ
                                </span>
                              )}
                              {pushResult === 'error' && (
                                <span className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Push ไม่สำเร็จ
                                </span>
                              )}
                              {isEditing ? (
                                <button onClick={cancelEditAd} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button onClick={() => startEditAd(ad)} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors">
                                  <Edit2 className="w-3 h-3" /> แก้ไข
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Ad Preview (read-only) */}
                          {!isEditing && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                              <div className="text-[10px] text-green-600 font-medium mb-0.5">Ad · {ad.finalUrl?.split('/')[2] ?? 'example.com'}</div>
                              <div className="text-sm font-semibold text-blue-700 leading-snug mb-1">
                                {ad.headlines.slice(0, 3).join(' | ')}
                              </div>
                              <div className="text-xs text-gray-600 leading-snug">
                                {ad.descriptions.slice(0, 2).join(' ')}
                              </div>
                            </div>
                          )}

                          {/* Inline Edit Panel */}
                          {isEditing && (
                            <div className="mb-3 bg-white border border-blue-200 rounded-lg p-3 space-y-3">
                              {/* Headlines */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Headlines (≤30 ตัวอักษร)</span>
                                  {editHeadlines.length < 15 && (
                                    <button onClick={() => setEditHeadlines(prev => [...prev, ''])} className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                                      <Plus className="w-3 h-3" /> เพิ่ม
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  {editHeadlines.map((h, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5">
                                      <input
                                        value={h}
                                        maxLength={30}
                                        onChange={e => setEditHeadlines(prev => prev.map((v, j) => j === idx ? e.target.value : v))}
                                        className={cn('flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400',
                                          h.length > 30 ? 'border-red-400' : 'border-gray-200'
                                        )}
                                        placeholder={`Headline ${idx + 1}`}
                                      />
                                      <span className={cn('text-[10px] w-6 text-right', h.length > 30 ? 'text-red-500' : 'text-gray-400')}>{h.length}</span>
                                      {editHeadlines.length > 3 && (
                                        <button onClick={() => setEditHeadlines(prev => prev.filter((_, j) => j !== idx))} className="text-gray-300 hover:text-red-400">
                                          <Trash className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Descriptions */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Descriptions (≤90 ตัวอักษร)</span>
                                  {editDescriptions.length < 4 && (
                                    <button onClick={() => setEditDescriptions(prev => [...prev, ''])} className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                                      <Plus className="w-3 h-3" /> เพิ่ม
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  {editDescriptions.map((d, idx) => (
                                    <div key={idx} className="flex items-start gap-1.5">
                                      <textarea
                                        value={d}
                                        maxLength={90}
                                        rows={2}
                                        onChange={e => setEditDescriptions(prev => prev.map((v, j) => j === idx ? e.target.value : v))}
                                        className={cn('flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none',
                                          d.length > 90 ? 'border-red-400' : 'border-gray-200'
                                        )}
                                        placeholder={`Description ${idx + 1}`}
                                      />
                                      <div className="flex flex-col items-end gap-1 pt-1">
                                        <span className={cn('text-[10px]', d.length > 90 ? 'text-red-500' : 'text-gray-400')}>{d.length}</span>
                                        {editDescriptions.length > 2 && (
                                          <button onClick={() => setEditDescriptions(prev => prev.filter((_, j) => j !== idx))} className="text-gray-300 hover:text-red-400">
                                            <Trash className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Push Button */}
                              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                                <span className="text-[10px] text-gray-400">การแก้ไขจะ push ขึ้น Google Ads ทันที</span>
                                <button
                                  onClick={() => pushAdEdit(ad)}
                                  disabled={isPushing || editHeadlines.filter(h => h.trim()).length < 3 || editDescriptions.filter(d => d.trim()).length < 2}
                                  className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                                    isPushing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                    'bg-blue-600 text-white hover:bg-blue-700'
                                  )}
                                >
                                  {isPushing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                  {isPushing ? 'กำลัง Push...' : 'Push to Google Ads'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Metrics */}
                          <div className="flex flex-wrap gap-3 text-xs">
                            <div className="flex items-center gap-1 text-gray-500">
                              <Eye className="w-3 h-3" />
                              <span>{formatNumber(ad.impressions)} impr</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-500">
                              <MousePointer className="w-3 h-3" />
                              <span>{ad.clicks} clicks</span>
                            </div>
                            <div className={cn('flex items-center gap-1 font-semibold', isGoodCtr ? 'text-emerald-600' : 'text-amber-600')}>
                              CTR {ad.ctr.toFixed(2)}%
                              {isGoodCtr ? <TrendingUp className="w-3 h-3" /> : null}
                            </div>
                            <div className="flex items-center gap-1 text-gray-500">
                              Spend {formatCurrency(ad.cost)}
                            </div>
                            {hasConv ? (
                              <>
                                <div className={cn('flex items-center gap-1 font-semibold', isGoodConv ? 'text-emerald-700' : 'text-gray-700')}>
                                  <Zap className="w-3 h-3" />
                                  {formatConversions(ad.conversions)} conv
                                </div>
                                <div className="text-gray-500">CPA {formatCurrency(ad.cpa)}</div>
                              </>
                            ) : (
                              <div className="text-gray-300">0 conversion</div>
                            )}
                          </div>

                          {/* Insight badge */}
                          {isGoodConv && (
                            <div className="mt-2 text-[10px] bg-emerald-100 text-emerald-700 rounded px-2 py-1 inline-flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              Ad นี้ conv ดี — ใช้เป็น control ก่อน pause ad อื่น
                            </div>
                          )}
                          {!hasConv && ad.cost > 500 && (
                            <div className="mt-2 text-[10px] bg-amber-100 text-amber-700 rounded px-2 py-1 inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Spend ฿{ad.cost.toFixed(2)} แต่ยังไม่มี conv — ลอง refresh headline หรือ description
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* AUDIENCES */}
            {activeTab === 'audiences' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Audiences ({audiences?.length ?? 0})</span>
                </div>
                {!audiences?.length ? <EmptyDim /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <SortTh col="audienceName" label="Audience"    {...audSort} />
                          <SortTh col="type"         label="Type"        {...audSort} />
                          <SortTh col="impressions"  label="Impressions" {...audSort} className="text-right" />
                          <SortTh col="clicks"       label="Clicks"      {...audSort} className="text-right" />
                          <SortTh col="cost"         label="Spend"       {...audSort} className="text-right" />
                          <SortTh col="conversions"  label="Conv."       {...audSort} className="text-right" />
                          <SortTh col="cpa"          label="CPA"         {...audSort} className="text-right" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(audSort.sorted as unknown as typeof audiences).map((a, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <Td><span className="font-medium text-gray-900">{a.audienceName}</span></Td>
                            <Td><span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{a.type.replace('_', ' ')}</span></Td>
                            <Td className="text-right">{formatNumber(a.impressions)}</Td>
                            <Td className="text-right">{formatNumber(a.clicks)}</Td>
                            <Td className="text-right font-medium">{formatCurrency(a.cost)}</Td>
                            <Td className="text-right font-semibold text-emerald-600">{formatConversions(a.conversions)}</Td>
                            <Td className={cn('text-right font-semibold', a.cpa > 0 ? 'text-gray-700' : 'text-gray-300')}>{a.cpa > 0 ? formatCurrency(a.cpa) : '—'}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* LOCATIONS */}
            {activeTab === 'locations' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Locations ({locations?.length ?? 0})</span>
                </div>
                {!locations?.length ? <EmptyDim /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <SortTh col="location"    label="Location"    {...locSort} />
                          <SortTh col="impressions" label="Impressions" {...locSort} className="text-right" />
                          <SortTh col="clicks"      label="Clicks"      {...locSort} className="text-right" />
                          <SortTh col="cost"        label="Spend"       {...locSort} className="text-right" />
                          <SortTh col="conversions" label="Conv."       {...locSort} className="text-right" />
                          <SortTh col="cpa"         label="CPA"         {...locSort} className="text-right" />
                          <Th>Share</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(locSort.sorted as unknown as typeof locations).map((l, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <Td><span className="font-medium text-gray-900">{l.location}</span></Td>
                            <Td className="text-right">{formatNumber(l.impressions)}</Td>
                            <Td className="text-right">{formatNumber(l.clicks)}</Td>
                            <Td className="text-right font-medium">{formatCurrency(l.cost)}</Td>
                            <Td className="text-right font-semibold text-emerald-600">{formatConversions(l.conversions)}</Td>
                            <Td className={cn('text-right font-semibold', l.cpa > 0 ? 'text-gray-700' : 'text-gray-300')}>{l.cpa > 0 ? formatCurrency(l.cpa) : '—'}</Td>
                            <Td><MetricBar value={l.cost} max={maxCostLoc} /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* DEVICES */}
            {activeTab === 'devices' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Devices</span>
                </div>
                {!devices?.length ? <EmptyDim /> : (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {devices.map((d, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-800 text-sm">{DEVICE_LABEL[d.device] ?? d.device}</span>
                          <span className="text-xs text-gray-400">{maxImpDev > 0 ? Math.round((d.impressions / maxImpDev) * 100) : 0}%</span>
                        </div>
                        <MetricBar value={d.impressions} max={maxImpDev} />
                        <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                          <span>Spend: <b className="text-gray-800">{formatCurrency(d.cost)}</b></span>
                          <span>Clicks: <b className="text-gray-800">{formatNumber(d.clicks)}</b></span>
                          <span>Conv: <b className="text-emerald-600">{formatConversions(d.conversions)}</b></span>
                          <span>CPA: <b className="text-gray-800">{d.cpa > 0 ? formatCurrency(d.cpa) : '—'}</b></span>
                          <span>CTR: <b className="text-gray-800">{(d.ctr ?? 0).toFixed(2)}%</b></span>
                          <span>CPC: <b className="text-gray-800">{formatCurrency(d.cpc)}</b></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TIME */}
            {activeTab === 'time' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Daily Performance ({timeData?.length ?? 0} days)</span>
                </div>
                {!timeData?.length ? <EmptyDim /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr><Th>Date</Th><Th className="text-right">Impressions</Th><Th className="text-right">Clicks</Th><Th className="text-right">Spend</Th><Th className="text-right">Conv.</Th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {timeData.map((t, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <Td><span className="font-mono text-xs text-gray-600">{t.date}</span></Td>
                            <Td className="text-right">{formatNumber(t.impressions)}</Td>
                            <Td className="text-right">{formatNumber(t.clicks)}</Td>
                            <Td className="text-right font-medium">{formatCurrency(t.cost)}</Td>
                            <Td className="text-right">{t.conversions > 0 ? <span className="font-semibold text-emerald-600">{formatConversions(t.conversions)}</span> : '—'}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* CONVERSIONS */}
            {activeTab === 'conversions' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Conversion Actions</span>
                </div>
                {!conversions?.actions?.length ? <EmptyDim /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr><Th>Conversion Action</Th><Th>Category</Th><Th className="text-right">Conversions</Th><Th className="text-right">All Conv.</Th><Th className="text-right">View-through</Th><Th className="text-right">Value (฿)</Th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {conversions.actions.map((a, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <Td><span className="font-medium text-gray-900 font-mono text-xs">{a.conversionName}</span></Td>
                            <Td><span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{a.category}</span></Td>
                            <Td className="text-right font-bold text-emerald-600">{formatConversions(a.conversions)}</Td>
                            <Td className="text-right text-gray-500">{formatConversions(a.allConversions)}</Td>
                            <Td className="text-right text-gray-400">{formatConversions(a.viewThroughConversions)}</Td>
                            <Td className="text-right">{a.value > 0 ? formatCurrency(a.value) : '—'}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ECOMMERCE */}
            {activeTab === 'ecommerce' && (
              <div className="p-4 space-y-4">
                {!ecommerce ? <EmptyDim /> : (
                  <>
                    {/* Funnel */}
                    {ecommerce.ecommerceFunnel ? (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-700">Sales Funnel</p>
                        <div className="grid grid-cols-4 gap-2">
                          <FunnelStep label="View Item" value={ecommerce.ecommerceFunnel.view_item} color="bg-blue-50 text-blue-700" />
                          <FunnelStep label="Add to Cart" value={ecommerce.ecommerceFunnel.add_to_cart} prev={ecommerce.ecommerceFunnel.view_item} color="bg-purple-50 text-purple-700" />
                          <FunnelStep label="Begin Checkout" value={ecommerce.ecommerceFunnel.begin_checkout} prev={ecommerce.ecommerceFunnel.add_to_cart} color="bg-amber-50 text-amber-700" />
                          <FunnelStep label="Purchase" value={ecommerce.ecommerceFunnel.purchase} prev={ecommerce.ecommerceFunnel.begin_checkout} color="bg-emerald-50 text-emerald-700" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                          {[
                            { label: 'Revenue', value: formatCurrency(ecommerce.ecommerceFunnel.revenue) },
                            { label: 'ROAS', value: ecommerce.ecommerceFunnel.roas > 0 ? `${Number(ecommerce.ecommerceFunnel.roas).toFixed(2)}x` : '—' },
                            { label: 'AOV', value: formatCurrency(ecommerce.ecommerceFunnel.aov) },
                            { label: 'Cart Abandon', value: `${Number(ecommerce.ecommerceFunnel.cartAbandonRate).toFixed(2)}%` },
                          ].map((m) => (
                            <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center">
                              <p className="text-xl font-bold text-gray-900">{m.value}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400 text-sm">ไม่พบ E-commerce conversion actions — ติดตั้ง purchase tracking ก่อน</div>
                    )}
                    {/* Conversion action table */}
                    {ecommerce.actions.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50 border-b border-gray-100">
                            <tr><Th>Conversion</Th><Th className="text-right">Count</Th><Th className="text-right">Revenue</Th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {ecommerce.actions.map((a, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <Td><span className="font-mono text-xs text-gray-700">{a.conversionName}</span></Td>
                                <Td className="text-right font-bold text-emerald-600">{formatConversions(a.conversions)}</Td>
                                <Td className="text-right">{a.value > 0 ? formatCurrency(a.value) : '—'}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Recommendations ── */}
      {report?.recommendations && report.recommendations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Recommendations</h2>
            <p className="text-xs text-gray-400 mt-0.5">จาก performance data — {DATE_RANGES.find((r) => r.value === dateRange)?.label}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {report.recommendations.map((rec, i) => (
              <div key={i} className="px-5 py-4 flex items-start gap-4">
                <span className={cn('shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border mt-0.5', PRIORITY_COLOR[rec.priority])}>
                  {PRIORITY_LABEL[rec.priority]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{rec.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rec.detail}</p>
                  <p className="text-xs text-blue-600 mt-1.5 font-medium">→ {rec.action}</p>
                  {rec.estimatedImpact && <p className="text-xs text-emerald-600 mt-0.5">✦ {rec.estimatedImpact}</p>}
                </div>
                <span className="shrink-0 text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {rec.campaignName === 'All Campaigns' ? 'ทุก campaign' : rec.campaignName.slice(0, 22)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !report && !error && selectedId && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <BarChart2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">กำลังโหลดข้อมูลจาก Google Ads API...</p>
        </div>
      )}

      {/* ── Email Draft ── */}
      {report && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* Header — language toggle visible always in header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
            <button
              onClick={() => setEmailOpen((v) => !v)}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            >
              <Mail className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">เขียนเมลรายงานให้ลูกค้า</p>
                <p className="text-xs text-gray-400">สร้างอีเมลสรุป performance พร้อมดาวน์โหลดตารางและ PDF แนบ</p>
              </div>
            </button>
            {/* Language toggle — always visible in header */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setEmailLang('th')}
                className={cn('px-3 py-1.5 font-medium transition-colors', emailLang === 'th' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}
              >ไทย</button>
              <button
                onClick={() => setEmailLang('en')}
                className={cn('px-3 py-1.5 font-medium transition-colors border-l border-gray-200', emailLang === 'en' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}
              >EN</button>
            </div>
            <button
              onClick={generateEmail}
              disabled={emailLoading || !narrative}
              title={!narrative ? 'รอ Report โหลดก่อน' : ''}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              {emailLoading
                ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> กำลังเขียน</>
                : <><Mail className="w-3 h-3" /> สร้างอีเมล</>
              }
            </button>
            <button onClick={() => setEmailOpen((v) => !v)} className="shrink-0">
              {emailOpen
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />
              }
            </button>
          </div>

          {emailOpen && (
            <div className="px-5 py-4 space-y-4">
              {/* Download buttons */}
              <div className="flex items-center gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mr-1">แนบไฟล์:</p>
                <button
                  onClick={exportAllCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors font-medium"
                >
                  <Download className="w-3.5 h-3.5" />ดาวน์โหลดตารางทั้งหมด (CSV)
                </button>
                <button
                  onClick={exportPDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 hover:border-red-300 hover:text-red-700 transition-colors font-medium"
                >
                  <Download className="w-3.5 h-3.5" />ดาวน์โหลด PDF Report
                </button>
                <button
                  onClick={exportHTML}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors font-medium"
                >
                  <Download className="w-3.5 h-3.5" />ดาวน์โหลด HTML Report
                </button>
                <p className="text-[10px] text-gray-400 ml-auto">
                  {[
                    report.campaigns.length > 0 && 'Campaigns',
                    keywords && keywords.length > 0 && 'Keywords',
                    searchTerms && searchTerms.length > 0 && 'Search Terms',
                    audiences && audiences.length > 0 && 'Audiences',
                    locations && locations.length > 0 && 'Locations',
                    devices && devices.length > 0 && 'Devices',
                    timeData && timeData.length > 0 && 'Time',
                    conversions && conversions.actions.length > 0 && 'Conversions',
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {emailDraft && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(emailDraft)
                      setEmailCopied(true)
                      setTimeout(() => setEmailCopied(false), 2000)
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {emailCopied ? <><Check className="w-3.5 h-3.5 text-green-500" /> คัดลอกแล้ว</> : <><Copy className="w-3.5 h-3.5" /> คัดลอกอีเมล</>}
                  </button>
                )}
              </div>

              {emailDraft && (
                <textarea
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 leading-relaxed bg-white focus:outline-none focus:border-blue-300 transition-colors resize-y"
                  rows={24}
                  spellCheck={false}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Media Buyer Chat — ถามต่อจาก AI Report ── */}
      {report && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* Header — click to collapse/expand */}
          <button
            onClick={() => setChatOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white hover:from-slate-100 hover:to-slate-50 transition-colors text-left"
          >
            <MessageSquare className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">ถามต่อกับ Mercy Expert</p>
              <p className="text-xs text-gray-400">อ่าน report ครบแล้ว — ถามได้เลย เช่น &quot;ทำไม CPA สูง?&quot;, &quot;ควร scale campaign ไหน?&quot;, &quot;อธิบายให้ลูกค้าฟังยังไง?&quot;</p>
            </div>
            {chatOpen
              ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
              : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            }
          </button>

          {chatOpen && (
          <>
          {/* Messages */}
          {chatMessages.length > 0 && (
            <div className="px-4 py-4 space-y-3 max-h-[480px] overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className={cn(
                    'rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-slate-800 text-white rounded-tr-sm'
                      : 'bg-slate-50 border border-slate-200 text-gray-800 rounded-tl-sm'
                  )}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2.5 justify-start">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Quick prompts — แสดงหลัง opening brief ก่อนทีมเริ่มถาม */}
          {chatMessages.length <= 1 && (
            <div className="px-4 py-4 flex flex-wrap gap-2">
              {[
                'ทำไม CPA ถึงสูงกว่าเป้า?',
                'ควร scale campaign ไหนก่อน?',
                'อธิบายผลให้ลูกค้าฟังยังไง?',
                'keyword ไหนควร pause?',
                'budget ควรจัดสรรยังไงเดือนหน้า?',
              ].map((q) => (
                <button key={q} onClick={() => {
                  setChatInput(q)
                  // auto-send immediately
                  setTimeout(() => {
                    const userMsg = { role: 'user' as const, content: q }
                    setChatMessages((prev) => [...prev, userMsg])
                    setChatLoading(true)
                    fetch('/api/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        messages: [...chatMessages, userMsg],
                        customerId: selectedId,
                        accountName: selectedAccount?.descriptiveName ?? '',
                        reportContext: buildReportContext(),
                      }),
                    })
                      .then((r) => r.json() as Promise<{ content: string }>)
                      .then((d) => setChatMessages((prev) => [...prev, { role: 'assistant', content: d.content }]))
                      .catch(() => setChatMessages((prev) => [...prev, { role: 'assistant', content: 'ขอโทษครับ เกิดข้อผิดพลาด' }]))
                      .finally(() => { setChatLoading(false); setChatInput(''); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100) })
                  }, 0)
                }}
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-4 pt-2">
            <div className="flex gap-2 items-end">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                placeholder="ถามเกี่ยวกับ report นี้... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-slate-400 bg-gray-50 focus:bg-white transition-colors"
                style={{ minHeight: '42px', maxHeight: '120px' }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                }}
              />
              <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading}
                className="shrink-0 w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      )}

    </div>
    </AppShell>
  )
}
