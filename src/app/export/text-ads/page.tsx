'use client'

import AppShell from '@/components/layout/AppShell'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Download, FileText, CheckCircle2, AlertTriangle, Tag,
  FileJson, Copy, Search, Globe, Monitor, RefreshCw,
  MessageSquare, Send, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RsaAdCopy, PMaxAssetGroup, DisplayAdCopy } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface KwItem {
  keyword: string
  matchType: string
  intent?: string
}

interface CampaignGroup {
  campaignName: string
  campaignType: string
  budget: number
  bidStrategy: string
  adGroups: {
    adGroupName: string
    keywords: KwItem[]
    ads: { rsa?: RsaAdCopy; pmax?: PMaxAssetGroup; display?: DisplayAdCopy }[]
  }[]
}

interface ExportData {
  businessName: string
  exportedAt: string
  blueprintId: string
  campaigns: CampaignGroup[]
  keywordSummary: { total: number; byMatchType: Record<string, number> }
}

interface Comment {
  id: string
  campaignName: string
  authorName: string
  authorEmail?: string
  comment: string
  status: string
  createdAt: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  SEARCH:          { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'SEARCH' },
  PERFORMANCE_MAX: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'PMAX' },
  DISPLAY:         { bg: 'bg-purple-100', text: 'text-purple-700', label: 'DISPLAY' },
  VIDEO:           { bg: 'bg-red-100',    text: 'text-red-700',    label: 'VIDEO' },
  SHOPPING:        { bg: 'bg-green-100',  text: 'text-green-700',  label: 'SHOPPING' },
}

const MATCH_COLOR: Record<string, string> = {
  EXACT:  'bg-blue-100 text-blue-700 border-blue-200',
  PHRASE: 'bg-purple-100 text-purple-700 border-purple-200',
  BROAD:  'bg-amber-50 text-amber-700 border-amber-200',
}

function matchLabel(kw: string, matchType: string) {
  if (matchType === 'EXACT')  return `[${kw}]`
  if (matchType === 'PHRASE') return `"${kw}"`
  return kw
}

// ── Google SERP Preview ───────────────────────────────────────────────────────

function SerpPreview({ rsa }: { rsa: RsaAdCopy }) {
  const h = rsa.headlines ?? []
  const d = rsa.descriptions ?? []
  const url = rsa.finalUrl ?? 'https://example.com'
  const domain = url.replace(/https?:\/\//, '').split('/')[0]
  const path = [rsa.displayPath1, rsa.displayPath2].filter(Boolean).join('/')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      {/* URL row */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] text-white font-bold">G</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 truncate">{domain}{path ? `/${path}` : ''}</p>
        </div>
        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">โฆษณา</span>
      </div>
      {/* Headline */}
      <p className="text-blue-700 text-base font-medium leading-snug mb-1.5">
        {h.slice(0, 3).join(' | ')}
      </p>
      {/* Descriptions */}
      {d.slice(0, 2).map((desc, i) => (
        <p key={i} className="text-sm text-gray-600 leading-relaxed">{desc}</p>
      ))}
    </div>
  )
}

// ── RSA Card (matches the screenshot layout) ──────────────────────────────────

function RsaCard({ rsa, index }: { rsa: RsaAdCopy; index: number }) {
  const h = rsa.headlines ?? []
  const d = rsa.descriptions ?? []
  const total = h.length + d.length
  const issues = [
    ...h.filter(s => s.length > 30),
    ...d.filter(s => s.length > 90),
  ].length
  const strength = issues === 0 && h.length >= 10 ? 'Excellent' : h.length >= 5 ? 'Good' : 'Poor'

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">RSA Ad {index + 1}</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map(i => (
              <div key={i} className={cn('w-5 h-1.5 rounded-full', i <= (strength === 'Excellent' ? 5 : strength === 'Good' ? 3 : 1) ? 'bg-green-500' : 'bg-gray-200')} />
            ))}
          </div>
          <span className="text-xs text-green-600 font-medium">Ad Strength: {strength}</span>
          {issues > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
        {/* Left — asset list */}
        <div className="p-4">
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              HEADLINES {h.length}/15
            </p>
            <div className="space-y-1.5">
              {h.map((txt, i) => {
                const ok = txt.length <= 30
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                    <span className={cn('text-sm flex-1 leading-5', ok ? 'text-gray-800' : 'text-red-600')}>{txt}</span>
                    <span className={cn('text-[10px] tabular-nums ml-1 flex-shrink-0 mt-0.5', ok ? 'text-gray-400' : 'text-red-500 font-bold')}>
                      {txt.length}/30
                    </span>
                    {!ok && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded flex-shrink-0 mt-0.5">ยาวเกิน</span>}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              DESCRIPTIONS {d.length}/4
            </p>
            <div className="space-y-1.5">
              {d.map((txt, i) => {
                const ok = txt.length <= 90
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                    <span className={cn('text-sm flex-1 leading-5', ok ? 'text-gray-700' : 'text-red-600')}>{txt}</span>
                    <span className={cn('text-[10px] tabular-nums ml-1 flex-shrink-0 mt-0.5', ok ? 'text-gray-400' : 'text-red-500 font-bold')}>
                      {txt.length}/90
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right — SERP preview */}
        <div className="p-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">PREVIEW — GOOGLE SEARCH</p>
          <SerpPreview rsa={rsa} />

          {/* Mini headline list (like screenshot right column) */}
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">HEADLINES</p>
            <div className="space-y-1">
              {h.slice(0, 5).map((txt, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-gray-700">{i + 1}. {txt}</span>
                  <span className="text-gray-400 ml-2 flex-shrink-0">{txt.length}/30</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PMax Card ─────────────────────────────────────────────────────────────────

function PMaxCard({ ag, index }: { ag: PMaxAssetGroup; index: number }) {
  const h  = ag.headlines ?? []
  const lh = ag.longHeadlines ?? []
  const d  = ag.descriptions ?? []

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-orange-50 border-b border-orange-100">
        <span className="text-sm font-semibold text-orange-800">Performance Max — Asset Group {index + 1}</span>
        {ag.assetGroupName && <span className="text-xs text-orange-600">{ag.assetGroupName}</span>}
      </div>

      {/* PMax responsive preview */}
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Ad Preview (Responsive)</p>
        <div className="flex gap-3 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-w-md">
          <div className="w-28 h-20 bg-gradient-to-br from-orange-100 to-purple-100 flex items-center justify-center flex-shrink-0 text-2xl">🖼</div>
          <div className="py-3 pr-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-700 truncate">{h[0]}</p>
            <p className="text-xs text-gray-800 mt-0.5 line-clamp-2">{lh[0] ?? h[1]}</p>
            <p className="text-xs text-gray-500 mt-1 truncate">{d[0]}</p>
            {ag.businessName && <p className="text-[10px] text-gray-400 mt-1">{ag.businessName}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0 divide-x divide-gray-100">
        <div className="p-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-2">HEADLINES {h.length}/15</p>
          <div className="space-y-1">
            {h.map((txt, i) => (
              <div key={i} className="flex justify-between text-xs gap-1">
                <span className="text-gray-700">{i+1}. {txt}</span>
                <span className={cn('flex-shrink-0', txt.length > 30 ? 'text-red-500 font-bold' : 'text-gray-400')}>{txt.length}/30</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-2">LONG HEADLINES {lh.length}/5</p>
          <div className="space-y-1">
            {lh.map((txt, i) => (
              <div key={i} className="flex justify-between text-xs gap-1">
                <span className="text-gray-700">{i+1}. {txt}</span>
                <span className={cn('flex-shrink-0', txt.length > 90 ? 'text-red-500 font-bold' : 'text-gray-400')}>{txt.length}/90</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-2">DESCRIPTIONS {d.length}/4</p>
          <div className="space-y-1">
            {d.map((txt, i) => (
              <div key={i} className="flex justify-between text-xs gap-1">
                <span className="text-gray-700">{i+1}. {txt}</span>
                <span className={cn('flex-shrink-0', txt.length > 90 ? 'text-red-500 font-bold' : 'text-gray-400')}>{txt.length}/90</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Display Card ──────────────────────────────────────────────────────────────

function DisplayCard({ display, agName }: { display: DisplayAdCopy; agName: string }) {
  const h  = display.headlines ?? []
  const lh = display.longHeadlines ?? []
  const d  = display.descriptions ?? []

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
        <span className="text-sm font-semibold text-purple-800">Display / GDN</span>
        <span className="text-xs text-purple-600">{agName}</span>
      </div>

      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex gap-3 bg-white border border-gray-200 rounded-xl overflow-hidden max-w-sm">
          <div className="w-24 h-16 bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center flex-shrink-0 text-xl">🖼</div>
          <div className="py-2 pr-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{lh[0] ?? h[0]}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{d[0]}</p>
            <p className="text-xs text-blue-600 font-medium mt-1">เรียนรู้เพิ่มเติม ›</p>
          </div>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4 divide-x divide-gray-100">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-2">HEADLINES</p>
          {h.map((txt, i) => (
            <div key={i} className="flex justify-between text-xs mb-1">
              <span className="text-gray-700">{i+1}. {txt}</span>
              <span className={cn('flex-shrink-0 ml-1', txt.length > 30 ? 'text-red-500 font-bold' : 'text-gray-400')}>{txt.length}/30</span>
            </div>
          ))}
          {lh.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-gray-500 mt-2 mb-1">LONG HEADLINE</p>
              {lh.map((txt, i) => (
                <div key={i} className="flex justify-between text-xs mb-1">
                  <span className="text-gray-700">{txt}</span>
                  <span className="text-gray-400 ml-1">{txt.length}/90</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="pl-4">
          <p className="text-[11px] font-semibold text-gray-500 mb-2">DESCRIPTIONS</p>
          {d.map((txt, i) => (
            <div key={i} className="flex justify-between text-xs mb-1">
              <span className="text-gray-700">{i+1}. {txt}</span>
              <span className={cn('flex-shrink-0 ml-1', txt.length > 90 ? 'text-red-500 font-bold' : 'text-gray-400')}>{txt.length}/90</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Comment Section ───────────────────────────────────────────────────────────

function CommentSection({ blueprintId, campaignName }: { blueprintId: string; campaignName: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [authorName, setAuthorName] = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/comments?blueprintId=${blueprintId}`)
    if (res.ok) {
      const d = await res.json() as { comments: Comment[] }
      setComments(d.comments.filter(c => c.campaignName === campaignName))
    }
  }, [blueprintId, campaignName])

  useEffect(() => { load() }, [load])

  async function send() {
    if (!authorName.trim() || !text.trim()) return
    setSending(true)
    try {
      await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId, campaignName, authorName: authorName.trim(), authorEmail: authorEmail.trim() || undefined, comment: text.trim() }),
      })
      setText('')
      await load()
    } finally { setSending(false) }
  }

  return (
    <div className="border-t border-gray-100 mt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500 font-medium">Comments ({comments.length})</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {comments.map(c => (
            <div key={c.id} className={cn('flex gap-2.5', c.status === 'resolved' && 'opacity-50')}>
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                {c.authorName[0]?.toUpperCase()}
              </div>
              <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-800">{c.authorName}</span>
                  {c.authorEmail && <span className="text-[10px] text-gray-400">{c.authorEmail}</span>}
                  {c.status === 'resolved' && <span className="text-[10px] bg-green-100 text-green-600 px-1.5 rounded-full">resolved</span>}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{c.comment}</p>
              </div>
            </div>
          ))}

          {/* New comment */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="ชื่อของคุณ *"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
              />
              <input
                type="email"
                placeholder="อีเมล (ไม่บังคับ)"
                value={authorEmail}
                onChange={e => setAuthorEmail(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
              />
            </div>
            <div className="flex gap-2">
              <textarea
                rows={2}
                placeholder="เขียน comment..."
                value={text}
                onChange={e => setText(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 resize-none bg-white"
              />
              <button
                onClick={send}
                disabled={sending || !authorName.trim() || !text.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 text-sm flex-shrink-0 self-end"
              >
                <Send className="w-3.5 h-3.5" />
                ส่ง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Campaign Panel ────────────────────────────────────────────────────────────

function CampaignPanel({ camp, blueprintId }: { camp: CampaignGroup; blueprintId: string }) {
  const color = TYPE_COLOR[camp.campaignType] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: camp.campaignType }

  // Flatten all keywords
  const allKws: KwItem[] = camp.adGroups.flatMap(ag =>
    ag.keywords.map(kw => ({ ...kw, _agName: ag.adGroupName } as KwItem & { _agName: string }))
  )

  // Group keywords by ad group for display
  const kwByAg: Record<string, KwItem[]> = {}
  for (const ag of camp.adGroups) {
    if (ag.keywords.length > 0) kwByAg[ag.adGroupName] = ag.keywords
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Campaign header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', color.bg, color.text)}>
            {color.label}
          </span>
          <h2 className="text-sm font-semibold text-gray-900">{camp.campaignName}</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          <span>Budget: <strong className="text-gray-700">฿{camp.budget.toLocaleString()}/วัน</strong></span>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{camp.bidStrategy?.replace(/_/g,' ') || 'PAUSED'}</span>
        </div>
      </div>

      {/* Keywords section */}
      {Object.entries(kwByAg).length > 0 && (
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Keywords ({allKws.length})</span>
          </div>

          {Object.entries(kwByAg).map(([agName, kws]) => (
            <div key={agName} className="mb-3 last:mb-0">
              <p className="text-xs font-medium text-gray-500 mb-1.5">{agName}</p>
              <div className="flex flex-wrap gap-1.5">
                {kws.map((kw, i) => (
                  <span
                    key={i}
                    className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', MATCH_COLOR[kw.matchType] ?? 'bg-gray-100 text-gray-600 border-gray-200')}
                  >
                    {matchLabel(kw.keyword, kw.matchType)}
                    <span className="ml-1 opacity-50 text-[10px]">[{kw.matchType?.slice(0,1)}]</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ads section */}
      <div className="p-5 space-y-4">
        {camp.adGroups.map((ag) => (
          <div key={ag.adGroupName}>
            {ag.ads.length > 0 && (
              <>
                <p className="text-xs text-gray-400 mb-2">{ag.adGroupName}</p>
                <div className="space-y-4">
                  {ag.ads.map((ad, adIdx) => (
                    <div key={adIdx}>
                      {ad.rsa    && <RsaCard rsa={ad.rsa} index={adIdx} />}
                      {ad.display && <DisplayCard display={ad.display} agName={ag.adGroupName} />}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}

        {/* PMax asset groups */}
        {camp.campaignType === 'PERFORMANCE_MAX' && camp.adGroups.map((ag) =>
          ag.ads.filter(a => a.pmax).map((ad, i) => (
            <PMaxCard key={i} ag={ad.pmax!} index={i} />
          ))
        )}
      </div>

      {/* Comments */}
      <CommentSection blueprintId={blueprintId} campaignName={camp.campaignName} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function TextAdsExportPage() {
  const searchParams = useSearchParams()
  const blueprintId  = searchParams.get('blueprintId') ?? undefined
  const mediaPlanId  = searchParams.get('mediaPlanId') ?? undefined

  const [loading, setLoading]     = useState(false)
  const [data, setData]           = useState<ExportData | null>(null)
  const [activeTab, setActiveTab] = useState<string>('')
  const [search, setSearch]       = useState('')
  const [copied, setCopied]       = useState(false)

  const buildUrl = useCallback((format: string) => {
    const p = new URLSearchParams()
    if (blueprintId) p.set('blueprintId', blueprintId)
    else if (mediaPlanId) p.set('mediaPlanId', mediaPlanId)
    p.set('format', format)
    return `/api/export/text-ads?${p.toString()}`
  }, [blueprintId, mediaPlanId])

  const loadData = useCallback(async () => {
    if (!blueprintId && !mediaPlanId) return
    setLoading(true)
    try {
      const res = await fetch(buildUrl('json'))
      if (!res.ok) throw new Error('Load failed')
      const json = await res.json() as ExportData
      setData(json)
      setActiveTab(json.campaigns?.[0]?.campaignName ?? '')
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }, [buildUrl, blueprintId, mediaPlanId])

  useEffect(() => { loadData() }, [loadData])

  const activeCamp = data?.campaigns.find(c => c.campaignName === activeTab)

  const totalKws = data?.campaigns.reduce((s, c) => s + c.adGroups.reduce((ss, ag) => ss + ag.keywords.length, 0), 0) ?? 0
  const totalBudget = data?.campaigns.reduce((s, c) => s + (c.budget ?? 0), 0) ?? 0

  const copyCsv = async () => {
    const res = await fetch(buildUrl('csv'))
    const text = await res.text()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Export / ส่งลูกค้า</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {data?.businessName ? `${data.businessName} — Ad Preview` : 'Ad Preview'}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">สร้างโดย Convert Cake · เอกสารสำหรับตรวจ ad copy ก่อน publish</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 bg-white rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={copyCsv}
              disabled={!data}
              className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 bg-white rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy CSV'}
            </button>
            <a
              href={buildUrl('csv')}
              download
              className={cn('flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 bg-white rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors', !data && 'opacity-40 pointer-events-none')}
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </a>
            <a
              href={data ? `/api/export/html?${blueprintId ? `blueprintId=${blueprintId}` : `mediaPlanId=${mediaPlanId}`}&format=html` : '#'}
              download
              className={cn('flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-2 transition-colors', !data && 'opacity-40 pointer-events-none')}
            >
              <Download className="w-3.5 h-3.5" /> Download HTML
            </a>
          </div>
        </div>

        {/* No ID state */}
        {!blueprintId && !mediaPlanId && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">เลือก Blueprint ที่ต้องการ Export</p>
            <p className="text-xs text-gray-400 mt-1">ไปที่ Media Plan → เลือก Blueprint → คลิก Export</p>
            <a href="/media-plans" className="inline-flex items-center gap-1.5 mt-4 text-sm text-blue-600 hover:underline">
              ไปที่ Media Plans
            </a>
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-gray-400 text-sm">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            กำลังโหลดข้อมูล...
          </div>
        )}

        {!loading && data && (
          <>
            {/* Summary pills */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <span className="bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700">
                <strong>{data.campaigns.length}</strong> Campaigns
              </span>
              <span className="bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700">
                Budget <strong>฿{totalBudget.toLocaleString()}</strong>/วัน
              </span>
              <span className="bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700">
                {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              {totalKws > 0 && (
                <span className="bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700">
                  <strong>{totalKws}</strong> Keywords
                </span>
              )}
            </div>

            {/* Campaign tabs (like top of screenshot) */}
            <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
              {data.campaigns.map(c => {
                const color = TYPE_COLOR[c.campaignType]
                const isActive = c.campaignName === activeTab
                return (
                  <button
                    key={c.campaignName}
                    onClick={() => setActiveTab(c.campaignName)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border flex-shrink-0',
                      isActive
                        ? 'bg-white text-gray-900 border-gray-300 shadow-sm'
                        : 'text-gray-500 border-transparent hover:bg-gray-100'
                    )}
                  >
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', color?.bg ?? 'bg-gray-100', color?.text ?? 'text-gray-600')}>
                      {color?.label ?? c.campaignType}
                    </span>
                    <span className="max-w-[160px] truncate">{c.campaignName}</span>
                  </button>
                )
              })}
            </div>

            {/* Active campaign */}
            {activeCamp && (
              <CampaignPanel camp={activeCamp} blueprintId={data.blueprintId} />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

export default function TextAdsExportPageWrapper() {
  return <Suspense><TextAdsExportPage /></Suspense>
}
