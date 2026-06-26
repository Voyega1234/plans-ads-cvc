'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import {
  ChevronDown, ChevronRight, Pencil, X, Plus, Sparkles,
  Save, CheckCircle2, AlertCircle, RefreshCw, Loader2,
} from 'lucide-react'
import { cn, formatConversions } from '@/lib/utils'

// ─── Constants ─────────────────────────────────────────────────────────────────
const HEADLINE_MAX = 30
const DESC_MAX = 90

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LiveAd {
  adId: string
  adGroupId: string
  adGroupName: string
  adType: 'RSA' | 'RESPONSIVE_DISPLAY' | 'PMAX_ASSET_GROUP'
  headlines: { text: string; pinned_field?: 'HEADLINE_1' | 'HEADLINE_2' | 'HEADLINE_3' }[]
  descriptions: { text: string }[]
  finalUrls: string[]
  status: 'ENABLED' | 'PAUSED'
  metrics?: { impressions: number; clicks: number; ctr: number; conversions: number }
}

interface Account { id: string; name: string; currencyCode?: string }
interface Campaign { campaignName: string; cost: number; clicks: number; impressions: number; conversions: number; ctr: number; cpc: number; cpa: number; conversionRate: number }

interface EditState {
  headlines: string[]
  descriptions: string[]
  finalUrls: string[]
}

interface PendingChange {
  adId: string
  editState: EditState
}

interface AISuggestResult {
  headlines: string[]
  descriptions: string[]
  rationale: string
}

// ─── Char counter input ────────────────────────────────────────────────────────

function CharInput({
  value, onChange, maxLen, placeholder, className,
}: {
  value: string
  onChange: (v: string) => void
  maxLen: number
  placeholder?: string
  className?: string
}) {
  const len = value.length
  const over = len > maxLen
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLen + 10}
        className={cn(
          'w-full px-3 py-2 pr-14 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors',
          over ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-200 bg-white',
          className
        )}
      />
      <span className={cn(
        'absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono tabular-nums',
        over ? 'text-red-500 font-bold' : len > maxLen * 0.85 ? 'text-amber-500' : 'text-gray-300'
      )}>
        {len}/{maxLen}
      </span>
    </div>
  )
}

// ─── AI Suggest Panel ──────────────────────────────────────────────────────────

function AISuggestPanel({
  onApplyAll,
  onInsertHeadline,
  onInsertDescription,
  onClose,
  businessName,
}: {
  onApplyAll: (result: AISuggestResult) => void
  onInsertHeadline: (text: string) => void
  onInsertDescription: (text: string) => void
  onClose: () => void
  businessName: string
}) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AISuggestResult | null>(null)
  const [error, setError] = useState('')

  async function generate() {
    if (!instruction.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/campaign-edit/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adType: 'RSA',
          currentHeadlines: [],
          currentDescriptions: [],
          businessContext: {
            businessName,
            productService: businessName,
            brandTone: 'professional',
            objective: 'conversion',
          },
          instruction,
          language: 'th',
        }),
      })
      const data = await res.json() as AISuggestResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'AI error')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500"/>
          <span className="font-semibold text-gray-900 text-sm">AI Suggest</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4 text-gray-400"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            บอก AI ว่าต้องการอะไร
          </label>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="เช่น: เน้นราคา, เพิ่มความเร่งด่วน, เขียนแบบ friendly"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>

        <button
          onClick={generate}
          disabled={loading || !instruction.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
          {loading ? 'กำลังสร้าง...' : 'Generate →'}
        </button>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0"/>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {result.rationale && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-[11px] text-purple-600 font-medium mb-1">กลยุทธ์ AI</p>
                <p className="text-xs text-purple-700">{result.rationale}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Headlines ({result.headlines.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.headlines.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => onInsertHeadline(h)}
                    title="คลิกเพื่อแทรก"
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs rounded-full border border-blue-200 transition-colors text-left"
                  >
                    {h}
                    <span className="ml-1 text-[10px] text-blue-400">({h.length})</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Descriptions ({result.descriptions.length})
              </p>
              <div className="space-y-1.5">
                {result.descriptions.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => onInsertDescription(d)}
                    title="คลิกเพื่อแทรก"
                    className="w-full text-left px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs rounded-lg border border-emerald-200 transition-colors"
                  >
                    {d}
                    <span className="ml-1 text-[10px] text-emerald-400">({d.length})</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => onApplyAll(result)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-4 h-4"/>
              Apply all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Ad Card ───────────────────────────────────────────────────────────────────

function AdCard({
  ad,
  pendingChange,
  onSave,
  onChangePending,
}: {
  ad: LiveAd
  pendingChange: PendingChange | null
  onSave: (adId: string, state: EditState) => Promise<void>
  onChangePending: (change: PendingChange | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editState, setEditState] = useState<EditState>({
    headlines: ad.headlines.map(h => h.text),
    descriptions: ad.descriptions.map(d => d.text),
    finalUrls: [...ad.finalUrls],
  })
  const [showAI, setShowAI] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [focusedField, setFocusedField] = useState<{ type: 'headline' | 'description'; index: number } | null>(null)

  const isDirty = pendingChange?.adId === ad.adId

  function startEdit() {
    setEditState({
      headlines: ad.headlines.map(h => h.text),
      descriptions: ad.descriptions.map(d => d.text),
      finalUrls: [...ad.finalUrls],
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setShowAI(false)
    if (isDirty) onChangePending(null)
  }

  function updateHeadline(i: number, val: string) {
    const next = [...editState.headlines]
    next[i] = val
    const nextState = { ...editState, headlines: next }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function updateDescription(i: number, val: string) {
    const next = [...editState.descriptions]
    next[i] = val
    const nextState = { ...editState, descriptions: next }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function addHeadline() {
    if (editState.headlines.length >= 15) return
    const nextState = { ...editState, headlines: [...editState.headlines, ''] }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function removeHeadline(i: number) {
    const next = editState.headlines.filter((_, idx) => idx !== i)
    const nextState = { ...editState, headlines: next }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(ad.adId, editState)
      setSaveOk(true)
      setEditing(false)
      setShowAI(false)
      onChangePending(null)
      setTimeout(() => setSaveOk(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  function handleApplyAll(result: AISuggestResult) {
    const nextState: EditState = {
      ...editState,
      headlines: result.headlines.slice(0, 15),
      descriptions: result.descriptions.slice(0, 4),
    }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function handleInsertHeadline(text: string) {
    if (focusedField?.type === 'headline') {
      updateHeadline(focusedField.index, text)
    } else {
      // append if room
      if (editState.headlines.length < 15) {
        const nextState = { ...editState, headlines: [...editState.headlines, text] }
        setEditState(nextState)
        onChangePending({ adId: ad.adId, editState: nextState })
      }
    }
  }

  function handleInsertDescription(text: string) {
    if (focusedField?.type === 'description') {
      updateDescription(focusedField.index, text)
    } else {
      if (editState.descriptions.length < 4) {
        const nextState = { ...editState, descriptions: [...editState.descriptions, text] }
        setEditState(nextState)
        onChangePending({ adId: ad.adId, editState: nextState })
      }
    }
  }

  return (
    <div className={cn(
      'border rounded-xl transition-all',
      isDirty && !editing ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100 bg-white',
      editing ? 'border-blue-200 bg-blue-50/20 shadow-md' : 'shadow-sm'
    )}>
      {/* Card header */}
      <div className="px-4 py-3 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 rounded-full">
              {ad.adGroupName}
            </span>
            <span className={cn(
              'px-2 py-0.5 text-[11px] font-semibold rounded-full',
              ad.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            )}>
              {ad.status === 'ENABLED' ? 'ENABLED' : 'PAUSED'}
            </span>
            {isDirty && !editing && (
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="มีการเปลี่ยนแปลงที่ยังไม่บันทึก"/>
            )}
            {saveOk && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                <CheckCircle2 className="w-3 h-3"/>บันทึกแล้ว
              </span>
            )}
          </div>

          {/* Performance mini-stats */}
          {ad.metrics && (
            <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
              <span><span className="font-medium text-gray-700">{ad.metrics.impressions.toLocaleString()}</span> impr.</span>
              <span><span className="font-medium text-gray-700">{ad.metrics.clicks.toLocaleString()}</span> clicks</span>
              <span><span className="font-medium text-gray-700">{ad.metrics.ctr.toFixed(1)}%</span> CTR</span>
              <span><span className="font-medium text-gray-700">{formatConversions(ad.metrics.conversions)}</span> conv.</span>
            </div>
          )}
        </div>

        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex-shrink-0"
          >
            <Pencil className="w-3 h-3"/>Edit
          </button>
        )}
      </div>

      {/* View mode: headlines + descriptions */}
      {!editing && (
        <div className="px-4 pb-4 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Headlines</p>
            <div className="flex flex-wrap gap-1.5">
              {ad.headlines.map((h, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-700"
                >
                  {h.text}
                  <span className="text-[10px] text-gray-400">({h.text.length})</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Descriptions</p>
            <div className="space-y-1">
              {ad.descriptions.map((d, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg"
                >
                  <span className="text-xs text-gray-700 flex-1">{d.text}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">({d.text.length})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="flex gap-0">
          {/* Main edit area */}
          <div className="flex-1 px-4 pb-4 space-y-4 min-w-0">
            {/* Headlines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Headlines ({editState.headlines.length}/15)
                </p>
              </div>
              <div className="space-y-2">
                {editState.headlines.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <CharInput
                        value={h}
                        onChange={v => updateHeadline(i, v)}
                        maxLen={HEADLINE_MAX}
                        placeholder={`Headline ${i + 1}`}
                        className="text-sm"
                      />
                    </div>
                    <button
                      onClick={() => { setFocusedField({ type: 'headline', index: i }); setShowAI(true) }}
                      className="p-1.5 rounded text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors flex-shrink-0"
                      title="AI suggest for this field"
                    >
                      <Sparkles className="w-3.5 h-3.5"/>
                    </button>
                    {editState.headlines.length > 3 && (
                      <button
                        onClick={() => removeHeadline(i)}
                        className="p-1.5 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editState.headlines.length < 15 && (
                <button
                  onClick={addHeadline}
                  className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="w-3 h-3"/>Add headline
                </button>
              )}
            </div>

            {/* Descriptions */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Descriptions ({editState.descriptions.length}/4)
              </p>
              <div className="space-y-2">
                {editState.descriptions.map((d, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1">
                      <CharInput
                        value={d}
                        onChange={v => updateDescription(i, v)}
                        maxLen={DESC_MAX}
                        placeholder={`Description ${i + 1}`}
                      />
                    </div>
                    <button
                      onClick={() => { setFocusedField({ type: 'description', index: i }); setShowAI(true) }}
                      className="p-1.5 rounded text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors flex-shrink-0 mt-1"
                      title="AI suggest for this field"
                    >
                      <Sparkles className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => { setShowAI(v => !v); setFocusedField(null) }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  showAI
                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-600'
                )}
              >
                <Sparkles className="w-4 h-4"/>AI Suggest
              </button>
              <button
                onClick={cancelEdit}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* AI Panel */}
          {showAI && (
            <div className="w-80 flex-shrink-0 border-l border-purple-100 bg-purple-50/30">
              <AISuggestPanel
                onApplyAll={handleApplyAll}
                onInsertHeadline={handleInsertHeadline}
                onInsertDescription={handleInsertDescription}
                onClose={() => setShowAI(false)}
                businessName="Campaign"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Ad Group Accordion ────────────────────────────────────────────────────────

function AdGroupSection({
  groupName,
  ads,
  pendingChanges,
  onSave,
  onChangePending,
}: {
  groupName: string
  ads: LiveAd[]
  pendingChanges: PendingChange[]
  onSave: (adId: string, state: EditState) => Promise<void>
  onChangePending: (change: PendingChange | null) => void
}) {
  const [open, setOpen] = useState(true)
  const hasPending = ads.some(a => pendingChanges.some(p => p.adId === a.adId))

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400"/> : <ChevronRight className="w-4 h-4 text-gray-400"/>}
          <span className="font-semibold text-gray-900 text-sm">{groupName}</span>
          <span className="px-2 py-0.5 text-[11px] bg-gray-200 text-gray-600 rounded-full">{ads.length} ads</span>
          {hasPending && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>มีการแก้ไข
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          {ads.map(ad => (
            <AdCard
              key={ad.adId}
              ad={ad}
              pendingChange={pendingChanges.find(p => p.adId === ad.adId) ?? null}
              onSave={onSave}
              onChangePending={onChangePending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function CampaignEditorPage() {
  const searchParams = useSearchParams()
  const initCustomerId = searchParams.get('customerId') ?? ''
  const initCampaignId = searchParams.get('campaignId') ?? ''

  const [accounts, setAccounts] = useState<Account[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState(initCustomerId)
  const [selectedCampaign, setSelectedCampaign] = useState(initCampaignId)

  const [ads, setAds] = useState<LiveAd[]>([])
  const [adsLoading, setAdsLoading] = useState(false)
  const [adsError, setAdsError] = useState('')

  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [savingAll, setSavingAll] = useState(false)
  const [bulkSaveResult, setBulkSaveResult] = useState<{ ok: number; fail: number } | null>(null)

  const saveResultRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load accounts
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => {
        const list: Account[] = (d.accounts ?? []).map((a: { id: string; descriptiveName?: string; name?: string; currencyCode?: string }) => ({
          id: a.id, name: a.descriptiveName ?? a.name ?? a.id, currencyCode: a.currencyCode,
        }))
        setAccounts(list)
        if (!selectedCustomer && list.length > 0) setSelectedCustomer(list[0].id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load campaigns for selected customer
  useEffect(() => {
    if (!selectedCustomer) return
    fetch(`/api/performance/account?customerId=${selectedCustomer}&days=7`)
      .then(r => r.json())
      .then(d => {
        const list: Campaign[] = d.campaigns ?? []
        setCampaigns(list)
        if (!selectedCampaign && list.length > 0) {
          // Use a mock campaign id since performance API gives campaign names
          setSelectedCampaign(`${selectedCustomer}-camp-1`)
        }
      })
      .catch(() => {})
  }, [selectedCustomer, selectedCampaign])

  // Load ads
  const loadAds = useCallback(async (customerId: string, campaignId: string) => {
    if (!customerId || !campaignId) return
    setAdsLoading(true)
    setAdsError('')
    try {
      const res = await fetch(`/api/campaign-edit/ads?customerId=${customerId}&campaignId=${campaignId}`)
      const data = await res.json() as { ads?: LiveAd[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load ads')
      setAds(data.ads ?? [])
    } catch (err) {
      setAdsError(err instanceof Error ? err.message : 'โหลดโฆษณาไม่สำเร็จ')
    } finally {
      setAdsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedCustomer && selectedCampaign) {
      loadAds(selectedCustomer, selectedCampaign)
      setPendingChanges([])
    }
  }, [selectedCustomer, selectedCampaign, loadAds])

  // Group ads by ad group
  const adGroups = ads.reduce<Record<string, LiveAd[]>>((acc, ad) => {
    const key = ad.adGroupName
    if (!acc[key]) acc[key] = []
    acc[key].push(ad)
    return acc
  }, {})

  // Save single ad
  async function saveAd(adId: string, state: EditState) {
    const res = await fetch(
      `/api/campaign-edit/ads?customerId=${selectedCustomer}&adId=${adId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headlines: state.headlines,
          descriptions: state.descriptions,
          finalUrls: state.finalUrls,
        }),
      }
    )
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Save failed')
    }
    // Optimistically update local ad copy
    setAds(prev => prev.map(a => a.adId === adId ? {
      ...a,
      headlines: state.headlines.map(text => ({ text })),
      descriptions: state.descriptions.map(text => ({ text })),
      finalUrls: state.finalUrls,
    } : a))
  }

  // Save all pending
  async function saveAll() {
    if (pendingChanges.length === 0) return
    setSavingAll(true)
    let ok = 0, fail = 0
    for (const change of pendingChanges) {
      try {
        await saveAd(change.adId, change.editState)
        ok++
      } catch {
        fail++
      }
    }
    setPendingChanges([])
    setSavingAll(false)
    setBulkSaveResult({ ok, fail })
    if (saveResultRef.current) clearTimeout(saveResultRef.current)
    saveResultRef.current = setTimeout(() => setBulkSaveResult(null), 4000)
  }

  function handleChangePending(change: PendingChange | null) {
    if (!change) return
    setPendingChanges(prev => {
      const without = prev.filter(p => p.adId !== change.adId)
      return [...without, change]
    })
  }

  function handleClearPending(change: PendingChange | null) {
    if (change) {
      handleChangePending(change)
    } else {
      // null means cancel — don't know which ad, so handled by AdCard itself
    }
  }

  const selectedCampaignName = campaigns.find((_, i) => `${selectedCustomer}-camp-${i + 1}` === selectedCampaign)?.campaignName

  return (
    <AppShell>
      <div className="space-y-5 pb-24">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campaign Editor</h1>
          <p className="text-xs text-gray-400 mt-0.5">แก้ไข ad copy ที่รันอยู่ + AI rewrite</p>
        </div>

        {/* Selectors */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Account</label>
            <select
              value={selectedCustomer}
              onChange={e => { setSelectedCustomer(e.target.value); setSelectedCampaign('') }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- เลือก Account --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Campaign</label>
            <select
              value={selectedCampaign}
              onChange={e => setSelectedCampaign(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              disabled={!selectedCustomer}
            >
              <option value="">-- เลือก Campaign --</option>
              {campaigns.map((c, i) => (
                <option key={i} value={`${selectedCustomer}-camp-${i + 1}`}>{c.campaignName}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => selectedCustomer && selectedCampaign && loadAds(selectedCustomer, selectedCampaign)}
              disabled={adsLoading || !selectedCampaign}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('w-4 h-4', adsLoading && 'animate-spin')}/>รีเฟรช
            </button>
          </div>
        </div>

        {/* Campaign info bar */}
        {selectedCampaign && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-gray-900">{selectedCampaignName ?? selectedCampaign}</span>
            <span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full font-medium">ENABLED</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">{ads.length} ads</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">{Object.keys(adGroups).length} ad groups</span>
            {pendingChanges.length > 0 && (
              <>
                <span className="text-gray-400">|</span>
                <span className="flex items-center gap-1 text-amber-600 font-medium text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-400"/>
                  {pendingChanges.length} รายการรอบันทึก
                </span>
              </>
            )}
          </div>
        )}

        {/* Content */}
        {adsLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2"/>กำลังโหลด ads...
          </div>
        )}

        {adsError && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0"/>
            <p className="text-sm text-red-600">{adsError}</p>
          </div>
        )}

        {!adsLoading && !adsError && ads.length === 0 && selectedCampaign && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Pencil className="w-8 h-8 mb-3 opacity-30"/>
            <p className="text-sm">ไม่พบ ads ใน campaign นี้</p>
          </div>
        )}

        {!adsLoading && !adsError && Object.keys(adGroups).length > 0 && (
          <div className="space-y-4">
            {Object.entries(adGroups).map(([groupName, groupAds]) => (
              <AdGroupSection
                key={groupName}
                groupName={groupName}
                ads={groupAds}
                pendingChanges={pendingChanges}
                onSave={saveAd}
                onChangePending={handleClearPending}
              />
            ))}
          </div>
        )}

      </div>

      {/* Sticky bottom bar */}
      {pendingChanges.length > 0 && (
        <div className="fixed bottom-0 left-64 right-0 z-40 border-t border-amber-200 bg-amber-50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400"/>
            <span className="font-medium">{pendingChanges.length} ad</span>
            <span>รอบันทึก</span>
          </div>
          <div className="flex items-center gap-3">
            {bulkSaveResult && (
              <span className="text-xs text-emerald-600 font-medium">
                บันทึกแล้ว {bulkSaveResult.ok} รายการ {bulkSaveResult.fail > 0 && `(ผิดพลาด ${bulkSaveResult.fail})`}
              </span>
            )}
            <button
              onClick={saveAll}
              disabled={savingAll}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {savingAll ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              บันทึกทั้งหมด
            </button>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default function CampaignEditorPageWrapper() {
  return <Suspense><CampaignEditorPage /></Suspense>
}
