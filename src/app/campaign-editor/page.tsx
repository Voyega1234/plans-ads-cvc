'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { FileUpload, UploadedFile } from '@/components/ui/FileUpload'
import {
  ChevronDown, ChevronRight, Pencil, X, Plus, Sparkles,
  Save, CheckCircle2, AlertCircle, RefreshCw, Loader2,
  Search, Zap, Monitor, ShoppingBag, Video, Globe, LayoutGrid, Smartphone,
  ToggleLeft, ToggleRight, DollarSign, Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CampaignSummary } from '@/app/api/campaign-edit/campaigns/route'
import type { AssetGroup } from '@/app/api/campaign-edit/asset-groups/route'
import type { ProductGroup } from '@/app/api/campaign-edit/shopping-products/route'
import { AccountSelect } from '@/components/ui/AccountSelect'
import { GoogleSearchPreview, exportTextAdsHtml, exportTextAdsCsv } from '@/components/text-ads/textAdsShared'
import type { GeneratedTextAd } from '@/app/api/text-ads/generate/route'

// ─── Constants ─────────────────────────────────────────────────────────────────
// ค่า default สำหรับ PMax asset group (สเปค Google: 3-15 H, 1-5 LH, 2-5 D)
const HEADLINE_MAX = 30
const DESC_MAX = 90
const HEADLINE_MIN = 3
const HEADLINE_MAX_COUNT = 15
const DESC_MIN = 2
const PMAX_DESC_MAX_COUNT = 5
const PMAX_LH_MAX_COUNT = 5

// ─── Types ─────────────────────────────────────────────────────────────────────

type EditableAdType =
  | 'RSA'
  | 'RESPONSIVE_DISPLAY'
  | 'APP'
  | 'DEMAND_GEN_MULTI_ASSET'
  | 'DEMAND_GEN_VIDEO'
  | 'DEMAND_GEN_CAROUSEL'

// สเปคจำนวน/ความยาว text ต่อ ad type — ตามเงื่อนไขจริงของ Google Ads
interface AdSpec {
  label: string
  hMin: number; hMax: number; hLen: number
  lhMin: number; lhMax: number; lhLen: number
  dMin: number; dMax: number; dLen: number
  editable: boolean
}

const AD_SPECS: Record<EditableAdType | 'PMAX', AdSpec> = {
  RSA:                    { label: 'Search (RSA)',        hMin: 3, hMax: 15, hLen: 30, lhMin: 0, lhMax: 0, lhLen: 0,  dMin: 2, dMax: 4, dLen: 90, editable: true },
  RESPONSIVE_DISPLAY:     { label: 'Display (RDA)',       hMin: 1, hMax: 5,  hLen: 30, lhMin: 1, lhMax: 1, lhLen: 90, dMin: 1, dMax: 5, dLen: 90, editable: true },
  APP:                    { label: 'App',                 hMin: 2, hMax: 5,  hLen: 30, lhMin: 0, lhMax: 0, lhLen: 0,  dMin: 1, dMax: 5, dLen: 90, editable: true },
  DEMAND_GEN_MULTI_ASSET: { label: 'Demand Gen',          hMin: 1, hMax: 5,  hLen: 40, lhMin: 0, lhMax: 0, lhLen: 0,  dMin: 1, dMax: 5, dLen: 90, editable: true },
  DEMAND_GEN_VIDEO:       { label: 'Demand Gen Video',    hMin: 1, hMax: 5,  hLen: 40, lhMin: 1, lhMax: 5, lhLen: 90, dMin: 1, dMax: 5, dLen: 90, editable: true },
  DEMAND_GEN_CAROUSEL:    { label: 'Demand Gen Carousel', hMin: 0, hMax: 0,  hLen: 40, lhMin: 0, lhMax: 0, lhLen: 0,  dMin: 0, dMax: 0, dLen: 90, editable: false },
  PMAX:                   { label: 'Performance Max',     hMin: 3, hMax: 15, hLen: 30, lhMin: 1, lhMax: 5, lhLen: 90, dMin: 2, dMax: 5, dLen: 90, editable: true },
}

interface LiveAd {
  adId: string
  adGroupId: string
  adGroupName: string
  adType: EditableAdType
  headlines: { text: string; pinned_field?: 'HEADLINE_1' | 'HEADLINE_2' | 'HEADLINE_3' }[]
  longHeadlines: { text: string }[]
  descriptions: { text: string }[]
  finalUrls: string[]
  status: 'ENABLED' | 'PAUSED'
  metrics?: { impressions: number; clicks: number; ctr: number; conversions: number }
}

interface Account { id: string; name: string; currencyCode?: string }

interface EditState {
  headlines: string[]
  longHeadlines: string[]
  descriptions: string[]
  finalUrls: string[]
}

interface PendingChange {
  adId: string
  editState: EditState
}

interface AISuggestResult {
  headlines: string[]
  longHeadlines?: string[]
  descriptions: string[]
  rationale: string
}

interface BulkSaveResult {
  ok: number
  fail: number
  error?: string
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
  adType, currentHeadlines, currentLongHeadlines, currentDescriptions,
  onApplyAll, onInsertHeadline, onInsertLongHeadline, onInsertDescription, onClose, businessName,
}: {
  adType: EditableAdType | 'PMAX'
  currentHeadlines: string[]
  currentLongHeadlines: string[]
  currentDescriptions: string[]
  onApplyAll: (result: AISuggestResult) => void
  onInsertHeadline: (text: string) => void
  onInsertLongHeadline?: (text: string) => void
  onInsertDescription: (text: string) => void
  onClose: () => void
  businessName: string
}) {
  const [instruction, setInstruction] = useState('')
  const [promotion, setPromotion] = useState('')
  const [emphasis, setEmphasis] = useState('')
  const [mustInclude, setMustInclude] = useState('')
  const [avoid, setAvoid] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AISuggestResult | null>(null)
  const [error, setError] = useState('')
  const spec = AD_SPECS[adType]

  async function generate() {
    if (!instruction.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/campaign-edit/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adType,
          currentHeadlines: currentHeadlines.filter(h => h.trim()),
          currentLongHeadlines: currentLongHeadlines.filter(h => h.trim()),
          currentDescriptions: currentDescriptions.filter(d => d.trim()),
          // สินค้า/กลุ่มเป้าหมาย/โทน ให้ AI อ่านจาก ad เดิมเอง — ส่งแค่ชื่อธุรกิจเท่าที่รู้
          businessContext: { businessName },
          instruction,
          adjustments: {
            promotion: promotion.trim() || undefined,
            emphasis: emphasis.trim() || undefined,
            mustInclude: mustInclude.trim() || undefined,
            avoid: avoid.trim() || undefined,
          },
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
        <p className="text-[11px] text-gray-400 -mb-2">
          {spec.label}: AI จะเขียน Headline {spec.hMax} รายการ{spec.lhMax > 0 ? ` + Long Headline ${spec.lhMax} รายการ` : ''} + Description {spec.dMax} รายการ ครบตามสเปค Google
        </p>
        <div className="rounded-lg bg-purple-50/60 border border-purple-100 px-3 py-2 text-[11px] text-purple-700">
          💡 สินค้า/บริการ · กลุ่มเป้าหมาย · โทนแบรนด์ · keyword — <b>AI อ่านจาก Ad เดิมให้อัตโนมัติ</b> ไม่ต้องกรอกซ้ำ · กรอกแค่ &quot;สิ่งที่อยากปรับ&quot; ด้านล่าง
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">อยากปรับอะไร <span className="text-red-400">*</span></label>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="เช่น: ปรับให้ดูพรีเมียมขึ้น เน้นความน่าเชื่อถือ และเขียนให้ชวนคลิกกว่าเดิม / เพิ่มมุมมองด้านบริการหลังการขาย"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">โปรโมชั่น / ข้อเสนอใหม่ <span className="text-gray-300">(ถ้ามี)</span></label>
            <input
              value={promotion}
              onChange={e => setPromotion(e.target.value)}
              placeholder="เช่น: ลด 20% ถึงสิ้นเดือน / ปรึกษาฟรี / ผ่อน 0% 10 เดือน"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">เน้น angle ไหน <span className="text-gray-300">(ถ้ามี)</span></label>
            <input
              value={emphasis}
              onChange={e => setEmphasis(e.target.value)}
              placeholder="เช่น: ราคา / ความน่าเชื่อถือ / ความเร่งด่วน / บริการหลังการขาย / จุดขายเฉพาะ"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">คำที่ต้องมี <span className="text-gray-300">(ถ้ามี)</span></label>
            <input
              value={mustInclude}
              onChange={e => setMustInclude(e.target.value)}
              placeholder="เช่น: ชื่อแบรนด์, คำว่า 'ของแท้', keyword หลักที่ต้องติด"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">คำ / ข้อความที่ห้ามใช้ <span className="text-gray-300">(ถ้ามี)</span></label>
            <input
              value={avoid}
              onChange={e => setAvoid(e.target.value)}
              placeholder="เช่น: การันตี 100%, ถูกที่สุด, คำเคลมที่ผิดนโยบาย"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Headlines ({result.headlines.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {result.headlines.map((h, i) => (
                  <button key={i} onClick={() => onInsertHeadline(h)} title="คลิกเพื่อแทรก"
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs rounded-full border border-blue-200 transition-colors text-left">
                    {h}<span className="ml-1 text-[10px] text-blue-400">({h.length})</span>
                  </button>
                ))}
              </div>
            </div>
            {(result.longHeadlines ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Long Headlines ({(result.longHeadlines ?? []).length})</p>
                <div className="space-y-1.5">
                  {(result.longHeadlines ?? []).map((h, i) => (
                    <button key={i} onClick={() => onInsertLongHeadline?.(h)} title="คลิกเพื่อแทรก"
                      className="w-full text-left px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs rounded-lg border border-indigo-200 transition-colors">
                      {h}<span className="ml-1 text-[10px] text-indigo-400">({h.length})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Descriptions ({result.descriptions.length})</p>
              <div className="space-y-1.5">
                {result.descriptions.map((d, i) => (
                  <button key={i} onClick={() => onInsertDescription(d)} title="คลิกเพื่อแทรก"
                    className="w-full text-left px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs rounded-lg border border-emerald-200 transition-colors">
                    {d}<span className="ml-1 text-[10px] text-emerald-400">({d.length})</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => onApplyAll(result)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
              <CheckCircle2 className="w-4 h-4"/>Apply all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Ad Card (RSA / Display) ───────────────────────────────────────────────────

function AdCard({
  ad, pendingChange, onSave, onChangePending,
}: {
  ad: LiveAd
  pendingChange: PendingChange | null
  onSave: (adId: string, state: EditState) => Promise<void>
  onChangePending: (change: PendingChange | null, removeAdId?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editState, setEditState] = useState<EditState>({
    headlines: ad.headlines.map(h => h.text),
    longHeadlines: ad.longHeadlines.map(h => h.text),
    descriptions: ad.descriptions.map(d => d.text),
    finalUrls: [...ad.finalUrls],
  })
  const [showAI, setShowAI] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [focusedField, setFocusedField] = useState<{ type: 'headline' | 'longHeadline' | 'description'; index: number } | null>(null)

  const spec = AD_SPECS[ad.adType]
  const isDirty = pendingChange?.adId === ad.adId

  function startEdit() {
    setEditState({
      headlines: ad.headlines.map(h => h.text),
      longHeadlines: ad.longHeadlines.map(h => h.text),
      descriptions: ad.descriptions.map(d => d.text),
      finalUrls: [...ad.finalUrls],
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setShowAI(false)
    if (isDirty) onChangePending(null, ad.adId)
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

  function updateLongHeadline(i: number, val: string) {
    const next = [...editState.longHeadlines]
    next[i] = val
    const nextState = { ...editState, longHeadlines: next }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function addHeadline() {
    if (editState.headlines.length >= spec.hMax) return
    const nextState = { ...editState, headlines: [...editState.headlines, ''] }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function addLongHeadline() {
    if (editState.longHeadlines.length >= spec.lhMax) return
    const nextState = { ...editState, longHeadlines: [...editState.longHeadlines, ''] }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function addDescription() {
    if (editState.descriptions.length >= spec.dMax) return
    const nextState = { ...editState, descriptions: [...editState.descriptions, ''] }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function removeLongHeadline(i: number) {
    const next = editState.longHeadlines.filter((_, idx) => idx !== i)
    const nextState = { ...editState, longHeadlines: next }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function removeHeadline(i: number) {
    const next = editState.headlines.filter((_, idx) => idx !== i)
    const nextState = { ...editState, headlines: next }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  const filledHeadlines = editState.headlines.filter(h => h.trim().length > 0)
  const filledLHs       = editState.longHeadlines.filter(h => h.trim().length > 0)
  const filledDescs     = editState.descriptions.filter(d => d.trim().length > 0)
  const overLimitH      = editState.headlines.some(h => h.length > spec.hLen)
  const overLimitLH     = editState.longHeadlines.some(h => h.length > spec.lhLen)
  const overLimitD      = editState.descriptions.some(d => d.length > spec.dLen)
  const tooFewH         = filledHeadlines.length < spec.hMin
  const tooFewLH        = spec.lhMin > 0 && filledLHs.length < spec.lhMin
  const tooFewD         = filledDescs.length < spec.dMin
  const saveBlocked     = tooFewH || tooFewLH || tooFewD || overLimitH || overLimitLH || overLimitD

  const validationError = tooFewH
    ? `ต้องมี Headlines อย่างน้อย ${spec.hMin} รายการ (ปัจจุบัน ${filledHeadlines.length})`
    : tooFewLH
      ? `ต้องมี Long Headlines อย่างน้อย ${spec.lhMin} รายการ (ปัจจุบัน ${filledLHs.length})`
    : tooFewD
      ? `ต้องมี Descriptions อย่างน้อย ${spec.dMin} รายการ (ปัจจุบัน ${filledDescs.length})`
      : overLimitH ? `Headline บางรายการยาวเกิน ${spec.hLen} ตัวอักษร`
      : overLimitLH ? `Long Headline บางรายการยาวเกิน ${spec.lhLen} ตัวอักษร`
      : overLimitD ? `Description บางรายการยาวเกิน ${spec.dLen} ตัวอักษร`
      : ''

  async function handleSave() {
    if (saveBlocked) return
    setSaving(true)
    try {
      await onSave(ad.adId, editState)
      setSaveOk(true)
      setEditing(false)
      setShowAI(false)
      onChangePending(null, ad.adId)
      setTimeout(() => setSaveOk(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  function handleApplyAll(result: AISuggestResult) {
    const nextState: EditState = {
      ...editState,
      headlines: result.headlines.slice(0, spec.hMax),
      longHeadlines: (result.longHeadlines ?? []).slice(0, spec.lhMax),
      descriptions: result.descriptions.slice(0, spec.dMax),
    }
    setEditState(nextState)
    onChangePending({ adId: ad.adId, editState: nextState })
  }

  function handleInsertHeadline(text: string) {
    if (focusedField?.type === 'headline') {
      updateHeadline(focusedField.index, text)
    } else if (editState.headlines.length < spec.hMax) {
      const nextState = { ...editState, headlines: [...editState.headlines, text] }
      setEditState(nextState)
      onChangePending({ adId: ad.adId, editState: nextState })
    }
  }

  function handleInsertLongHeadline(text: string) {
    if (focusedField?.type === 'longHeadline') {
      updateLongHeadline(focusedField.index, text)
    } else if (editState.longHeadlines.length < spec.lhMax) {
      const nextState = { ...editState, longHeadlines: [...editState.longHeadlines, text] }
      setEditState(nextState)
      onChangePending({ adId: ad.adId, editState: nextState })
    }
  }

  function handleInsertDescription(text: string) {
    if (focusedField?.type === 'description') {
      updateDescription(focusedField.index, text)
    } else if (editState.descriptions.length < spec.dMax) {
      const nextState = { ...editState, descriptions: [...editState.descriptions, text] }
      setEditState(nextState)
      onChangePending({ adId: ad.adId, editState: nextState })
    }
  }

  return (
    <div className={cn(
      'border rounded-xl transition-all',
      isDirty && !editing ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100 bg-white',
      editing ? 'border-blue-200 bg-blue-50/20 shadow-md' : 'shadow-sm'
    )}>
      <div className="px-4 py-3 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 rounded-full">{ad.adGroupName}</span>
            <span className="px-2 py-0.5 text-[11px] font-medium bg-purple-50 text-purple-600 border border-purple-100 rounded-full">{spec.label}</span>
            <span className={cn('px-2 py-0.5 text-[11px] font-semibold rounded-full', ad.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
              {ad.status}
            </span>
            {isDirty && !editing && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="มีการเปลี่ยนแปลงที่ยังไม่บันทึก"/>}
            {saveOk && <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium"><CheckCircle2 className="w-3 h-3"/>บันทึกแล้ว</span>}
          </div>
          {ad.metrics && (
            <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
              <span><span className="font-medium text-gray-700">{ad.metrics.impressions.toLocaleString()}</span> impr.</span>
              <span><span className="font-medium text-gray-700">{ad.metrics.clicks.toLocaleString()}</span> clicks</span>
              <span><span className="font-medium text-gray-700">{ad.metrics.ctr.toFixed(1)}%</span> CTR</span>
              <span><span className="font-medium text-gray-700">{ad.metrics.conversions}</span> conv.</span>
            </div>
          )}
        </div>
        {!editing && spec.editable && (
          <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex-shrink-0">
            <Pencil className="w-3 h-3"/>Edit
          </button>
        )}
        {!spec.editable && (
          <span className="text-[11px] text-gray-400 flex-shrink-0">แก้ text ผ่าน API ไม่ได้ — แก้ใน Google Ads UI</span>
        )}
      </div>

      {!editing && (
        <div className="px-4 pb-4 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Headlines</p>
            <div className="flex flex-wrap gap-1.5">
              {ad.headlines.map((h, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-700">
                  {h.text}<span className="text-[10px] text-gray-400">({h.text.length})</span>
                </span>
              ))}
            </div>
          </div>
          {ad.longHeadlines.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Long Headlines</p>
              <div className="space-y-1">
                {ad.longHeadlines.map((h, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 px-3 py-1.5 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                    <span className="text-xs text-gray-700 flex-1">{h.text}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">({h.text.length})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Descriptions</p>
            <div className="space-y-1">
              {ad.descriptions.map((d, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg">
                  <span className="text-xs text-gray-700 flex-1">{d.text}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">({d.text.length})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="flex gap-0">
          <div className="flex-1 px-4 pb-4 space-y-4 min-w-0">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Headlines
                  <span className={cn('ml-1.5 font-bold tabular-nums', tooFewH ? 'text-red-500' : filledHeadlines.length >= spec.hMin ? 'text-emerald-600' : 'text-amber-500')}>
                    {filledHeadlines.length}/{spec.hMax}
                  </span>
                </p>
                <span className="text-[10px] text-gray-400">ขั้นต่ำ {spec.hMin} · สูงสุด {spec.hMax} · ≤{spec.hLen} ตัวอักษร</span>
              </div>
              <div className="space-y-2">
                {editState.headlines.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <CharInput value={h} onChange={v => updateHeadline(i, v)} maxLen={spec.hLen} placeholder={`Headline ${i + 1}${i < spec.hMin ? ' *' : ''}`} className="text-sm"/>
                    </div>
                    <button onClick={() => { setFocusedField({ type: 'headline', index: i }); setShowAI(true) }}
                      className="p-1.5 rounded text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors flex-shrink-0" title="AI suggest">
                      <Sparkles className="w-3.5 h-3.5"/>
                    </button>
                    <button onClick={() => removeHeadline(i)} disabled={filledHeadlines.length <= spec.hMin && h.trim().length > 0}
                      className="p-1.5 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
              {tooFewH && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0"/>ต้องมี Headlines อย่างน้อย {spec.hMin} รายการ ก่อนบันทึก</p>}
              {editState.headlines.length < spec.hMax && (
                <button onClick={addHeadline} className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <Plus className="w-3 h-3"/>Add headline
                </button>
              )}
            </div>

            {spec.lhMax > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Long Headlines
                    <span className={cn('ml-1.5 font-bold tabular-nums', tooFewLH ? 'text-red-500' : filledLHs.length >= spec.lhMin ? 'text-emerald-600' : 'text-amber-500')}>
                      {filledLHs.length}/{spec.lhMax}
                    </span>
                  </p>
                  <span className="text-[10px] text-gray-400">ขั้นต่ำ {spec.lhMin} · สูงสุด {spec.lhMax} · ≤{spec.lhLen} ตัวอักษร</span>
                </div>
                <div className="space-y-2">
                  {editState.longHeadlines.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1">
                        <CharInput value={h} onChange={v => updateLongHeadline(i, v)} maxLen={spec.lhLen} placeholder={`Long Headline ${i + 1}${i < spec.lhMin ? ' *' : ''}`} className="text-sm"/>
                      </div>
                      <button onClick={() => { setFocusedField({ type: 'longHeadline', index: i }); setShowAI(true) }}
                        className="p-1.5 rounded text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors flex-shrink-0" title="AI suggest">
                        <Sparkles className="w-3.5 h-3.5"/>
                      </button>
                      <button onClick={() => removeLongHeadline(i)}
                        className="p-1.5 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  ))}
                </div>
                {tooFewLH && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0"/>ต้องมี Long Headlines อย่างน้อย {spec.lhMin} รายการ ก่อนบันทึก</p>}
                {editState.longHeadlines.length < spec.lhMax && (
                  <button onClick={addLongHeadline} className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Plus className="w-3 h-3"/>Add long headline
                  </button>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Descriptions
                  <span className={cn('ml-1.5 font-bold tabular-nums', tooFewD ? 'text-red-500' : filledDescs.length >= spec.dMin ? 'text-emerald-600' : 'text-amber-500')}>
                    {filledDescs.length}/{spec.dMax}
                  </span>
                </p>
                <span className="text-[10px] text-gray-400">ขั้นต่ำ {spec.dMin} · สูงสุด {spec.dMax} · ≤{spec.dLen} ตัวอักษร</span>
              </div>
              <div className="space-y-2">
                {editState.descriptions.map((d, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1">
                      <CharInput value={d} onChange={v => updateDescription(i, v)} maxLen={spec.dLen} placeholder={`Description ${i + 1}${i < spec.dMin ? ' *' : ''}`}/>
                    </div>
                    <button onClick={() => { setFocusedField({ type: 'description', index: i }); setShowAI(true) }}
                      className="p-1.5 rounded text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors flex-shrink-0 mt-1" title="AI suggest">
                      <Sparkles className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
              {tooFewD && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0"/>ต้องมี Descriptions อย่างน้อย {spec.dMin} รายการ ก่อนบันทึก</p>}
              {editState.descriptions.length < spec.dMax && (
                <button onClick={addDescription} className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <Plus className="w-3 h-3"/>Add description
                </button>
              )}
            </div>

            {validationError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0"/>
                <p className="text-xs text-red-600 font-medium">{validationError}</p>
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleSave} disabled={saving || saveBlocked} title={saveBlocked ? validationError : undefined}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => { setShowAI(v => !v); setFocusedField(null) }}
                className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  showAI ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-600')}>
                <Sparkles className="w-4 h-4"/>AI Suggest
              </button>
              <button onClick={cancelEdit} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
            </div>
          </div>
          {showAI && (
            <div className="w-80 flex-shrink-0 border-l border-purple-100 bg-purple-50/30">
              <AISuggestPanel
                adType={ad.adType}
                currentHeadlines={editState.headlines}
                currentLongHeadlines={editState.longHeadlines}
                currentDescriptions={editState.descriptions}
                onApplyAll={handleApplyAll}
                onInsertHeadline={handleInsertHeadline}
                onInsertLongHeadline={handleInsertLongHeadline}
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

// ─── Campaign type badge ───────────────────────────────────────────────────────

const TYPE_META: Record<CampaignSummary['type'], { label: string; color: string; Icon: React.FC<{ className?: string }> }> = {
  SEARCH: { label: 'Search', color: 'bg-blue-100 text-blue-700', Icon: Search },
  PERFORMANCE_MAX: { label: 'PMax', color: 'bg-purple-100 text-purple-700', Icon: Zap },
  DISPLAY: { label: 'Display', color: 'bg-teal-100 text-teal-700', Icon: Monitor },
  VIDEO: { label: 'Video', color: 'bg-red-100 text-red-700', Icon: Video },
  SHOPPING: { label: 'Shopping', color: 'bg-orange-100 text-orange-700', Icon: ShoppingBag },
  DEMAND_GEN: { label: 'Demand Gen', color: 'bg-pink-100 text-pink-700', Icon: Globe },
  APP: { label: 'App', color: 'bg-cyan-100 text-cyan-700', Icon: Smartphone },
  LOCAL: { label: 'Local', color: 'bg-green-100 text-green-700', Icon: LayoutGrid },
  UNKNOWN: { label: 'Other', color: 'bg-gray-100 text-gray-600', Icon: LayoutGrid },
}

function TypeBadge({ type }: { type: CampaignSummary['type'] }) {
  const meta = TYPE_META[type]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full', meta.color)}>
      <meta.Icon className="w-3 h-3"/>
      {meta.label}
    </span>
  )
}

// ─── PMax Asset Group Editor ───────────────────────────────────────────────────

function PMaxAssetGroupCard({
  group, customerId, onSaved,
}: {
  group: AssetGroup
  customerId: string
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [headlines, setHeadlines] = useState<string[]>(group.headlines)
  const [longHeadlines, setLongHeadlines] = useState<string[]>(group.longHeadlines)
  const [descriptions, setDescriptions] = useState<string[]>(group.descriptions)
  const [businessName, setBusinessName] = useState(group.businessName)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [error, setError] = useState('')
  const [uploadFiles, setUploadFiles] = useState<UploadedFile[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadedAssets, setUploadedAssets] = useState<{ resourceName: string; name: string }[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [showAI, setShowAI] = useState(false)

  const filledH = headlines.filter(h => h.trim()).length
  const filledD = descriptions.filter(d => d.trim()).length
  const overH = headlines.some(h => h.length > HEADLINE_MAX)
  const overD = descriptions.some(d => d.length > DESC_MAX)
  const overBN = businessName.length > 25
  const saveBlocked = filledH < HEADLINE_MIN || filledD < DESC_MIN || overH || overD || overBN

  // AI Suggest — เติม headlines / long headlines / descriptions ครบตามสเปค PMax
  function handleAIApplyAll(result: AISuggestResult) {
    setHeadlines(result.headlines.slice(0, HEADLINE_MAX_COUNT))
    if ((result.longHeadlines ?? []).length > 0) setLongHeadlines((result.longHeadlines ?? []).slice(0, PMAX_LH_MAX_COUNT))
    setDescriptions(result.descriptions.slice(0, PMAX_DESC_MAX_COUNT))
  }
  function handleAIInsertHeadline(text: string) {
    setHeadlines(prev => prev.length < HEADLINE_MAX_COUNT ? [...prev, text] : prev)
  }
  function handleAIInsertLongHeadline(text: string) {
    setLongHeadlines(prev => prev.length < PMAX_LH_MAX_COUNT ? [...prev, text] : prev)
  }
  function handleAIInsertDescription(text: string) {
    setDescriptions(prev => prev.length < PMAX_DESC_MAX_COUNT ? [...prev, text] : prev)
  }

  async function handleSave() {
    if (saveBlocked) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/campaign-edit/pmax-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          assetGroupResourceName: group.assetGroupResourceName,
          headlines: headlines.filter(h => h.trim()),
          longHeadlines: longHeadlines.filter(h => h.trim()),
          descriptions: descriptions.filter(d => d.trim()),
          businessName,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setSaveOk(true)
      setEditing(false)
      onSaved()
      setTimeout(() => setSaveOk(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadImage() {
    if (!uploadFiles.length) return
    setUploadingImage(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', uploadFiles[0].file)
      formData.append('customerId', customerId)
      const res = await fetch('/api/google-ads/upload-logo', { method: 'POST', body: formData })
      const data = await res.json() as { resourceName?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setUploadedAssets(prev => [...prev, { resourceName: data.resourceName ?? '', name: uploadFiles[0].file.name }])
      setUploadFiles([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setUploadingImage(false)
    }
  }

  function updateItem(arr: string[], setArr: (v: string[]) => void, i: number, val: string) {
    const next = [...arr]
    next[i] = val
    setArr(next)
  }

  function removeItem(arr: string[], setArr: (v: string[]) => void, i: number) {
    setArr(arr.filter((_, idx) => idx !== i))
  }

  function addItem(arr: string[], setArr: (v: string[]) => void, max: number) {
    if (arr.length >= max) return
    setArr([...arr, ''])
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-900">{group.name}</span>
          <span className={cn('px-2 py-0.5 text-[11px] font-semibold rounded-full', group.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
            {group.status}
          </span>
          {saveOk && <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium"><CheckCircle2 className="w-3 h-3"/>บันทึกแล้ว</span>}
        </div>
        <div className="flex items-center gap-2">
          {group.finalUrls[0] && <span className="text-[11px] text-gray-400 truncate max-w-[200px]">{group.finalUrls[0]}</span>}
          {!editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors">
              <Pencil className="w-3 h-3"/>Edit
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0"/>
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Image grid */}
      {(group.images.length > 0 || group.logos.length > 0) && (
        <div className="px-4 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Images & Logos</p>
          <div className="flex flex-wrap gap-2">
            {[...group.images, ...group.logos].map((img, i) => (
              <div key={i} className="relative w-20 h-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt={img.assetName} className="w-full h-full object-cover"/>
                ) : (
                  <ImageIcon className="w-6 h-6 text-gray-300"/>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                  <p className="text-[9px] text-white truncate">{img.fieldType.replace('_', ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Text fields - view mode */}
      {!editing && (
        <div className="px-4 py-3 space-y-3">
          {headlines.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Headlines ({headlines.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {headlines.map((h, i) => <span key={i} className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-700">{h}<span className="ml-1 text-[10px] text-gray-400">({h.length})</span></span>)}
              </div>
            </div>
          )}
          {descriptions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Descriptions ({descriptions.length})</p>
              <div className="space-y-1">
                {descriptions.map((d, i) => <div key={i} className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-700">{d}</div>)}
              </div>
            </div>
          )}
          {businessName && <p className="text-xs text-gray-500">Business Name: <span className="font-medium text-gray-900">{businessName}</span></p>}
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="flex gap-0">
        <div className="flex-1 p-4 space-y-4 min-w-0">
          {/* Headlines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Headlines
                <span className={cn('ml-1.5 font-bold', filledH < HEADLINE_MIN ? 'text-red-500' : 'text-emerald-600')}>{filledH}/{HEADLINE_MAX_COUNT}</span>
              </p>
              <span className="text-[10px] text-gray-400">≤{HEADLINE_MAX} chars · min {HEADLINE_MIN}</span>
            </div>
            <div className="space-y-2">
              {headlines.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1"><CharInput value={h} onChange={v => updateItem(headlines, setHeadlines, i, v)} maxLen={HEADLINE_MAX} placeholder={`Headline ${i + 1}${i < HEADLINE_MIN ? ' *' : ''}`}/></div>
                  <button onClick={() => removeItem(headlines, setHeadlines, i)} className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded transition-colors"><X className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
            {headlines.length < HEADLINE_MAX_COUNT && <button onClick={() => addItem(headlines, setHeadlines, HEADLINE_MAX_COUNT)} className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium"><Plus className="w-3 h-3"/>Add headline</button>}
          </div>

          {/* Long Headlines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Long Headlines <span className="font-normal text-gray-400">({longHeadlines.length}/5)</span></p>
              <span className="text-[10px] text-gray-400">≤90 chars</span>
            </div>
            <div className="space-y-2">
              {longHeadlines.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1"><CharInput value={h} onChange={v => updateItem(longHeadlines, setLongHeadlines, i, v)} maxLen={90} placeholder={`Long Headline ${i + 1}`}/></div>
                  <button onClick={() => removeItem(longHeadlines, setLongHeadlines, i)} className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded transition-colors"><X className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
            {longHeadlines.length < PMAX_LH_MAX_COUNT && <button onClick={() => addItem(longHeadlines, setLongHeadlines, PMAX_LH_MAX_COUNT)} className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium"><Plus className="w-3 h-3"/>Add long headline</button>}
          </div>

          {/* Descriptions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Descriptions
                <span className={cn('ml-1.5 font-bold', filledD < DESC_MIN ? 'text-red-500' : 'text-emerald-600')}>{filledD}/{PMAX_DESC_MAX_COUNT}</span>
              </p>
              <span className="text-[10px] text-gray-400">≤{DESC_MAX} chars · min {DESC_MIN}</span>
            </div>
            <div className="space-y-2">
              {descriptions.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1"><CharInput value={d} onChange={v => updateItem(descriptions, setDescriptions, i, v)} maxLen={DESC_MAX} placeholder={`Description ${i + 1}${i < DESC_MIN ? ' *' : ''}`}/></div>
                  <button onClick={() => removeItem(descriptions, setDescriptions, i)} className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded transition-colors"><X className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
            {descriptions.length < PMAX_DESC_MAX_COUNT && <button onClick={() => addItem(descriptions, setDescriptions, PMAX_DESC_MAX_COUNT)} className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium"><Plus className="w-3 h-3"/>Add description</button>}
          </div>

          {/* Business name */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Business Name <span className="font-normal text-gray-400">(≤25 chars)</span></p>
            <CharInput value={businessName} onChange={setBusinessName} maxLen={25} placeholder="ชื่อธุรกิจ"/>
          </div>

          {/* Image upload */}
          <div>
            <button onClick={() => setShowUpload(v => !v)} className="flex items-center gap-1.5 text-xs text-blue-600 font-medium mb-2">
              <ImageIcon className="w-3 h-3"/>
              {showUpload ? 'ซ่อน Image Upload' : 'อัปโหลด Image ใหม่'}
            </button>
            {showUpload && (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
                <FileUpload
                  title=""
                  accept="image/*"
                  acceptLabel="JPG, PNG, WebP"
                  maxSizeMB={5}
                  files={uploadFiles}
                  onAdd={f => setUploadFiles(f)}
                  onRemove={() => setUploadFiles([])}
                  onUpload={handleUploadImage}
                  onCancel={() => setUploadFiles([])}
                />
                {uploadingImage && <div className="flex items-center gap-2 text-xs text-blue-600"><Loader2 className="w-3 h-3 animate-spin"/>กำลังอัปโหลด...</div>}
                {uploadedAssets.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 mb-1">อัปโหลดแล้ว:</p>
                    {uploadedAssets.map((a, i) => (
                      <div key={i} className="text-[11px] text-gray-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500"/>{a.name} → <span className="font-mono text-gray-400 truncate">{a.resourceName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || saveBlocked}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button onClick={() => setShowAI(v => !v)}
              className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                showAI ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-600')}>
              <Sparkles className="w-4 h-4"/>AI Suggest
            </button>
            <button onClick={() => { setEditing(false); setError('') }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
          </div>
        </div>
        {showAI && (
          <div className="w-80 flex-shrink-0 border-l border-purple-100 bg-purple-50/30">
            <AISuggestPanel
              adType="PMAX"
              currentHeadlines={headlines}
              currentLongHeadlines={longHeadlines}
              currentDescriptions={descriptions}
              onApplyAll={handleAIApplyAll}
              onInsertHeadline={handleAIInsertHeadline}
              onInsertLongHeadline={handleAIInsertLongHeadline}
              onInsertDescription={handleAIInsertDescription}
              onClose={() => setShowAI(false)}
              businessName={businessName || group.name}
            />
          </div>
        )}
        </div>
      )}
    </div>
  )
}

// ─── Shopping Product Groups Panel ────────────────────────────────────────────

function ShoppingProductsPanel({ customerId, campaignId }: { customerId: string; campaignId: string }) {
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/campaign-edit/shopping-products?customerId=${customerId}&campaignId=${campaignId}`)
      .then(r => r.json())
      .then((d: { productGroups?: ProductGroup[]; error?: string }) => {
        if (d.error) throw new Error(d.error)
        setProductGroups(d.productGroups ?? [])
      })
      .catch(err => setError(err instanceof Error ? err.message : 'โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [customerId, campaignId])

  async function toggleStatus(pg: ProductGroup) {
    const newStatus: 'ENABLED' | 'PAUSED' = pg.status === 'ENABLED' ? 'PAUSED' : 'ENABLED'
    setToggling(pg.resourceName)
    try {
      const res = await fetch('/api/campaign-edit/shopping-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, resourceName: pg.resourceName, status: newStatus }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Toggle failed')
      setProductGroups(prev => prev.map(p => p.resourceName === pg.resourceName ? { ...p, status: newStatus } : p))
    } catch {
      // silently keep old status on failure
    } finally {
      setToggling(null)
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>โหลด Product Groups...</div>
  if (error) return <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0"/>{error}</div>

  return (
    <div>
      <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-700">Shopping campaigns: แก้ไข creative ไม่ได้ผ่าน API — ต้องทำผ่าน Google Merchant Center โดยตรง สามารถ Enable/Pause product groups ได้ที่นี่</p>
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Ad Group</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Product Group</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Type</th>
              <th className="text-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {productGroups.map((pg) => (
              <tr key={pg.resourceName} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-xs text-gray-600">{pg.adGroupName}</td>
                <td className="px-4 py-2.5 text-xs font-medium text-gray-900">{pg.caseValue}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded-full">{pg.listingGroupType}</span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => toggleStatus(pg)}
                    disabled={toggling === pg.resourceName}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border"
                    style={{ minWidth: '80px' }}
                  >
                    {toggling === pg.resourceName
                      ? <Loader2 className="w-3 h-3 animate-spin mx-auto"/>
                      : pg.status === 'ENABLED'
                        ? <><ToggleRight className="w-3.5 h-3.5 text-emerald-500"/>Enabled</>
                        : <><ToggleLeft className="w-3.5 h-3.5 text-gray-400"/>Paused</>
                    }
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {productGroups.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">ไม่พบ Product Groups</div>
        )}
      </div>
    </div>
  )
}

// ─── Per-campaign Editor Panel ─────────────────────────────────────────────────

// ─── สร้าง Text Ad (RSA) ใหม่ ──────────────────────────────────────────────────
//
// ฟอร์มนี้ตรวจกติกาของ Google ฝั่งหน้าเว็บก่อน (พาดหัว ≥3 ยาว ≤30, คำอธิบาย ≥2
// ยาว ≤90, ต้องมี URL) เพื่อไม่ให้ผู้ใช้เสียเวลายิงไปแล้วโดนตีกลับเป็น error code
// ฝั่ง API ตรวจซ้ำอีกชั้นอยู่แล้ว — ที่นี่แค่บอกให้รู้ตัวเร็วขึ้น

function NewTextAdSection({ campaign, customerId, onCreated }: {
  campaign: CampaignSummary
  customerId: string
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<AdGroupRowUI[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [adGroupRn, setAdGroupRn] = useState('')
  const [headlines, setHeadlines] = useState<string[]>(['', '', ''])
  const [descriptions, setDescriptions] = useState<string[]>(['', ''])
  const [finalUrl, setFinalUrl] = useState('')
  const [path1, setPath1] = useState('')
  const [path2, setPath2] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // AI ช่วยเขียน — บอกได้ว่าอยากได้แนวไหน (ส่งเข้า /api/text-ads/generate)
  const [aiHint, setAiHint] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  async function aiGenerate() {
    setAiLoading(true)
    setMsg(null)
    try {
      const res = await fetch('/api/text-ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: campaign.campaignName.replace(/^\(?CVC\)?\s*-?\s*/i, '').split(/[-_]/)[0].trim() || campaign.campaignName,
          productService: campaign.campaignName,
          finalUrl: finalUrl.trim(),
          objective: 'leads',
          suggestions: aiHint,
          numAds: 1,
        }),
      })
      const data = await res.json() as { ads?: GeneratedTextAd[]; error?: string }
      if (!res.ok || !data.ads?.[0]) throw new Error(data.error ?? 'AI generate ไม่สำเร็จ')
      const ad = data.ads[0]
      setHeadlines(ad.headlines)
      setDescriptions(ad.descriptions)
      if (ad.path1) setPath1(ad.path1)
      if (ad.path2) setPath2(ad.path2)
      setMsg({ ok: true, text: `AI เขียนให้ ${ad.headlines.length} พาดหัว ${ad.descriptions.length} คำอธิบาย — ตรวจ/แก้ก่อนกดสร้าง` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'AI generate ไม่สำเร็จ' })
    } finally {
      setAiLoading(false)
    }
  }

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const res = await fetch(`/api/campaign-edit/ad-groups?customerId=${customerId}&campaignResourceName=${encodeURIComponent(campaign.campaignResourceName)}`)
      const data = await res.json() as { adGroups?: AdGroupRowUI[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'โหลด ad groups ไม่สำเร็จ')
      const list = data.adGroups ?? []
      setGroups(list)
      // เลือกกลุ่มแรกให้เลย ผู้ใช้ส่วนใหญ่มีกลุ่มเดียว
      setAdGroupRn(prev => prev || (list[0]?.adGroupResourceName ?? ''))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'โหลด ad groups ไม่สำเร็จ' })
    } finally {
      setGroupsLoading(false)
    }
  }, [customerId, campaign.campaignResourceName])

  useEffect(() => { if (open) loadGroups() }, [open, loadGroups])

  function setAt(list: string[], i: number, v: string) {
    const next = list.slice()
    next[i] = v
    return next
  }

  const filledHeadlines = headlines.filter(h => h.trim().length > 0)
  const filledDescriptions = descriptions.filter(d => d.trim().length > 0)
  const tooLongH = headlines.some(h => h.trim().length > HEADLINE_MAX)
  const tooLongD = descriptions.some(d => d.trim().length > DESC_MAX)
  const ready = !!adGroupRn && filledHeadlines.length >= HEADLINE_MIN && filledDescriptions.length >= DESC_MIN
    && !!finalUrl.trim() && !tooLongH && !tooLongD

  async function create() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/campaign-edit/ads?customerId=${customerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adType: 'RSA',
          adGroupResourceName: adGroupRn,
          headlines: filledHeadlines,
          descriptions: filledDescriptions,
          finalUrls: [finalUrl.trim()],
          path1: path1.trim(),
          path2: path2.trim(),
          status: 'ENABLED',
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'สร้างโฆษณาไม่สำเร็จ')
      setMsg({ ok: true, text: 'สร้างโฆษณาใหม่แล้ว' })
      setHeadlines(['', '', ''])
      setDescriptions(['', ''])
      setFinalUrl(''); setPath1(''); setPath2('')
      setOpen(false)
      onCreated()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'สร้างโฆษณาไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button onClick={() => { setOpen(true); setMsg(null) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
          <Plus className="w-4 h-4"/>สร้าง Text Ad ใหม่
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
      </div>
    )
  }

  return (
    <div className="border border-emerald-200 rounded-xl bg-emerald-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 text-emerald-600"/>
        <p className="font-semibold text-sm text-gray-900">สร้าง Text Ad ใหม่ (Responsive Search Ad)</p>
        <button onClick={() => setOpen(false)} className="ml-auto p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-600 mb-1">Ad Group ที่จะสร้างโฆษณาลงไป</label>
        {groupsLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin"/>โหลด ad groups...</div>
        ) : groups.length === 0 ? (
          <p className="text-xs text-amber-700">ยังไม่มี ad group ในแคมเปญนี้ — สร้าง ad group ก่อนที่หัวข้อ &ldquo;Ad Groups&rdquo; ด้านล่าง</p>
        ) : (
          <select value={adGroupRn} onChange={e => setAdGroupRn(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
            {groups.map(g => <option key={g.adGroupId} value={g.adGroupResourceName}>{g.name}{g.status === 'PAUSED' ? ' (หยุดอยู่)' : ''}</option>)}
          </select>
        )}
      </div>

      {/* AI ช่วยเขียน — เติมฟอร์มให้ทั้งชุด แล้วผู้ใช้แก้ต่อได้ */}
      <div className="flex items-center gap-2 p-2.5 bg-purple-50/60 border border-purple-100 rounded-lg">
        <Sparkles className="w-4 h-4 text-purple-500 shrink-0"/>
        <input value={aiHint} onChange={e => setAiHint(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !aiLoading) aiGenerate() }}
          placeholder="บอก AI ว่าอยากได้แนวไหน (ไม่บังคับ) เช่น เน้นโปรใหม่ ราคา 6.89 ลบ."
          className="flex-1 px-2.5 py-1.5 text-xs border border-purple-200 rounded-lg bg-white focus:outline-none focus:border-purple-400"/>
        <button onClick={aiGenerate} disabled={aiLoading}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors shrink-0">
          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Sparkles className="w-3.5 h-3.5"/>}
          AI Gen
        </button>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-600 mb-1">
          พาดหัว (ต้องมีอย่างน้อย {HEADLINE_MIN} อัน — ตอนนี้ {filledHeadlines.length})
        </label>
        <div className="space-y-1.5">
          {headlines.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={h} onChange={e => setHeadlines(prev => setAt(prev, i, e.target.value))}
                placeholder={`พาดหัวที่ ${i + 1}`}
                className={cn('flex-1 px-2 py-1 text-xs border rounded-lg bg-white',
                  h.trim().length > HEADLINE_MAX ? 'border-red-300' : 'border-gray-200')}/>
              <span className={cn('text-[10px] w-12 text-right', h.trim().length > HEADLINE_MAX ? 'text-red-600' : 'text-gray-400')}>
                {h.trim().length}/{HEADLINE_MAX}
              </span>
              {headlines.length > HEADLINE_MIN && (
                <button onClick={() => setHeadlines(prev => prev.filter((_, j) => j !== i))}
                  className="p-0.5 text-gray-400 hover:text-red-600"><X className="w-3.5 h-3.5"/></button>
              )}
            </div>
          ))}
        </div>
        {headlines.length < HEADLINE_MAX_COUNT && (
          <button onClick={() => setHeadlines(prev => [...prev, ''])}
            className="mt-1 text-[11px] text-emerald-700 hover:underline">+ เพิ่มพาดหัว</button>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-600 mb-1">
          คำอธิบาย (ต้องมีอย่างน้อย {DESC_MIN} อัน — ตอนนี้ {filledDescriptions.length})
        </label>
        <div className="space-y-1.5">
          {descriptions.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={d} onChange={e => setDescriptions(prev => setAt(prev, i, e.target.value))}
                placeholder={`คำอธิบายที่ ${i + 1}`}
                className={cn('flex-1 px-2 py-1 text-xs border rounded-lg bg-white',
                  d.trim().length > DESC_MAX ? 'border-red-300' : 'border-gray-200')}/>
              <span className={cn('text-[10px] w-12 text-right', d.trim().length > DESC_MAX ? 'text-red-600' : 'text-gray-400')}>
                {d.trim().length}/{DESC_MAX}
              </span>
              {descriptions.length > DESC_MIN && (
                <button onClick={() => setDescriptions(prev => prev.filter((_, j) => j !== i))}
                  className="p-0.5 text-gray-400 hover:text-red-600"><X className="w-3.5 h-3.5"/></button>
              )}
            </div>
          ))}
        </div>
        {descriptions.length < 4 && (
          <button onClick={() => setDescriptions(prev => [...prev, ''])}
            className="mt-1 text-[11px] text-emerald-700 hover:underline">+ เพิ่มคำอธิบาย</button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-medium text-gray-600 mb-1">URL ปลายทาง</label>
          <input value={finalUrl} onChange={e => setFinalUrl(e.target.value)} placeholder="https://example.com/landing"
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"/>
        </div>
        <div className="w-28">
          <label className="block text-[11px] font-medium text-gray-600 mb-1">path 1</label>
          <input value={path1} onChange={e => setPath1(e.target.value)} maxLength={15} placeholder="ไม่บังคับ"
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"/>
        </div>
        <div className="w-28">
          <label className="block text-[11px] font-medium text-gray-600 mb-1">path 2</label>
          <input value={path2} onChange={e => setPath2(e.target.value)} maxLength={15} placeholder="ไม่บังคับ"
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"/>
        </div>
      </div>

      {/* preview แบบผลค้นหา Google — อัปเดตสดตามที่พิมพ์ */}
      {(filledHeadlines.length > 0 || finalUrl.trim()) && (
        <GoogleSearchPreview
          ad={{ headlines, descriptions, finalUrl: finalUrl.trim() || 'https://', path1: path1.trim(), path2: path2.trim() }}
          brandName={campaign.campaignName}
        />
      )}

      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <button onClick={create} disabled={!ready || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 rounded-lg transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle2 className="w-3.5 h-3.5"/>}
          {saving ? 'กำลังสร้าง...' : 'สร้างโฆษณา'}
        </button>
        {/* export ส่งลูกค้าตรวจ — ไม่ต้อง copy มือ */}
        <button onClick={() => exportTextAdsHtml(campaign.campaignName, [{ headlines: filledHeadlines, descriptions: filledDescriptions, finalUrl: finalUrl.trim() || 'https://', path1: path1.trim(), path2: path2.trim() }], campaign.campaignName)}
          disabled={filledHeadlines.length === 0}
          className="px-2.5 py-1.5 text-[11px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          Export HTML
        </button>
        <button onClick={() => exportTextAdsCsv(campaign.campaignName, [{ headlines: filledHeadlines, descriptions: filledDescriptions, finalUrl: finalUrl.trim() || 'https://', path1: path1.trim(), path2: path2.trim() }])}
          disabled={filledHeadlines.length === 0}
          className="px-2.5 py-1.5 text-[11px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          Export CSV
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
        {!ready && !msg && (
          <span className="text-[11px] text-gray-500">
            ต้องมีพาดหัว ≥{HEADLINE_MIN}, คำอธิบาย ≥{DESC_MIN}, URL ปลายทาง และห้ามยาวเกินกำหนด
          </span>
        )}
      </div>
      <p className="text-[10px] text-gray-400">โฆษณาใหม่จะถูกสร้างเป็นสถานะ ENABLED และเข้ารีวิวของ Google ตามปกติ</p>
    </div>
  )
}

function CampaignEditorPanel({
  campaign, customerId,
}: {
  campaign: CampaignSummary
  customerId: string
}) {
  const [ads, setAds] = useState<LiveAd[]>([])
  const [adsLoading, setAdsLoading] = useState(false)
  const [adsError, setAdsError] = useState('')
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([])
  const [agLoading, setAgLoading] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [savingAll, setSavingAll] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkSaveResult | null>(null)
  const bulkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // เพิ่มค่านี้เพื่อสั่งโหลด ads ใหม่ (ใช้ตอนสร้างโฆษณาใหม่เสร็จ)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (campaign.type === 'PERFORMANCE_MAX') {
      setAgLoading(true)
      fetch(`/api/campaign-edit/asset-groups?customerId=${customerId}&campaignId=${campaign.campaignId}`)
        .then(r => r.json())
        .then((d: { assetGroups?: AssetGroup[]; error?: string }) => {
          if (d.error) throw new Error(d.error)
          setAssetGroups(d.assetGroups ?? [])
        })
        .catch(err => setAdsError(err instanceof Error ? err.message : 'โหลดไม่สำเร็จ'))
        .finally(() => setAgLoading(false))
      return
    }

    if (campaign.type === 'SHOPPING' || campaign.type === 'VIDEO') return

    setAdsLoading(true)
    setAdsError('')
    fetch(`/api/campaign-edit/ads?customerId=${customerId}&campaignId=${campaign.campaignId}`)
      .then(r => r.json())
      .then((d: { ads?: LiveAd[]; error?: string }) => {
        if (d.error) throw new Error(d.error)
        setAds(d.ads ?? [])
      })
      .catch(err => setAdsError(err instanceof Error ? err.message : 'โหลดโฆษณาไม่สำเร็จ'))
      .finally(() => setAdsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.campaignId, campaign.type, customerId, reloadKey])

  async function saveAd(adId: string, state: EditState) {
    const targetAd = ads.find(a => a.adId === adId)
    const res = await fetch(
      `/api/campaign-edit/ads?customerId=${customerId}&adId=${adId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adType: targetAd?.adType ?? 'RSA',
          headlines: state.headlines.filter(h => h.trim()),
          longHeadlines: state.longHeadlines.filter(h => h.trim()),
          descriptions: state.descriptions.filter(d => d.trim()),
          finalUrls: state.finalUrls,
        }),
      }
    )
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Save failed')
    }
    setAds(prev => prev.map(a => a.adId === adId ? {
      ...a,
      headlines: state.headlines.filter(h => h.trim()).map(text => ({ text })),
      longHeadlines: state.longHeadlines.filter(h => h.trim()).map(text => ({ text })),
      descriptions: state.descriptions.filter(d => d.trim()).map(text => ({ text })),
      finalUrls: state.finalUrls,
    } : a))
  }

  function handleChangePending(change: PendingChange | null, removeAdId?: string) {
    if (!change) {
      // null means "cancel / clear" for the given ad — remove it from pending list.
      if (removeAdId) {
        setPendingChanges(prev => prev.filter(p => p.adId !== removeAdId))
      }
      return
    }
    setPendingChanges(prev => {
      const without = prev.filter(p => p.adId !== change.adId)
      return [...without, change]
    })
  }

  async function saveAll() {
    if (!pendingChanges.length) return
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
    setBulkResult({ ok, fail })
    if (bulkTimerRef.current) clearTimeout(bulkTimerRef.current)
    bulkTimerRef.current = setTimeout(() => setBulkResult(null), 4000)
  }

  const adGroups = ads.reduce<Record<string, LiveAd[]>>((acc, ad) => {
    const key = ad.adGroupName
    if (!acc[key]) acc[key] = []
    acc[key].push(ad)
    return acc
  }, {})

  // VIDEO: read-only
  if (campaign.type === 'VIDEO') {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <div className="flex items-start gap-3">
          <Video className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="font-semibold">Video Campaign</p>
            <p className="mt-1 text-xs">แก้ไข Video Ads ต้องทำผ่าน YouTube Studio โดยตรง — ไม่สามารถแก้ไข video creative ผ่าน API ได้</p>
          </div>
        </div>
      </div>
    )
  }

  // SHOPPING
  if (campaign.type === 'SHOPPING') {
    return <ShoppingProductsPanel customerId={customerId} campaignId={campaign.campaignId}/>
  }

  // PERFORMANCE_MAX
  if (campaign.type === 'PERFORMANCE_MAX') {
    if (agLoading) return <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>โหลด Asset Groups...</div>
    if (adsError) return <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0"/>{adsError}</div>
    if (!assetGroups.length) return <div className="py-8 text-center text-gray-400 text-sm">ไม่พบ Asset Groups</div>
    return (
      <div className="space-y-4">
        {assetGroups.map(group => (
          <PMaxAssetGroupCard key={group.assetGroupId} group={group} customerId={customerId} onSaved={() => {}}/>
        ))}
      </div>
    )
  }

  // SEARCH / DISPLAY / DEMAND_GEN — ad-based editor
  const loading = adsLoading
  const error = adsError

  return (
    <div className="space-y-4">
      {loading && <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>โหลด ads...</div>}
      {error && <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0"/>{error}</div>}
      {!loading && !error && !ads.length && (
        <div className="py-8 text-center text-gray-400 text-sm">ไม่พบ ads ใน campaign นี้</div>
      )}

      {/* สร้าง Text Ad (RSA) ใหม่ — เฉพาะแคมเปญ Search เพราะชนิดอื่นต้องมี asset รูป */}
      {campaign.type === 'SEARCH' && (
        <NewTextAdSection
          campaign={campaign}
          customerId={customerId}
          onCreated={() => setReloadKey(k => k + 1)}
        />
      )}

      {Object.entries(adGroups).map(([groupName, groupAds]) => (
        <div key={groupName} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900">{groupName}</span>
            <span className="px-2 py-0.5 text-[11px] bg-gray-200 text-gray-600 rounded-full">{groupAds.length} ads</span>
          </div>
          <div className="p-4 space-y-3">
            {groupAds.map(ad => (
              <AdCard
                key={ad.adId}
                ad={ad}
                pendingChange={pendingChanges.find(p => p.adId === ad.adId) ?? null}
                onSave={saveAd}
                onChangePending={handleChangePending}
              />
            ))}
          </div>
        </div>
      ))}

      {pendingChanges.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-xs text-amber-700 font-medium">{pendingChanges.length} รายการรอบันทึก</span>
          <div className="flex items-center gap-3">
            {bulkResult && (
              bulkResult.error
                ? <span className="text-xs text-red-600">{bulkResult.error}</span>
                : <span className="text-xs text-emerald-600">บันทึกแล้ว {bulkResult.ok} รายการ{bulkResult.fail > 0 ? ` (ผิดพลาด ${bulkResult.fail})` : ''}</span>
            )}
            <button onClick={saveAll} disabled={savingAll}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-semibold rounded-lg transition-colors">
              {savingAll ? <Loader2 className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3"/>}
              บันทึกทั้งหมด
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Budget Modal ──────────────────────────────────────────────────────────────

function BudgetModal({
  campaigns, onClose, onApply,
}: {
  campaigns: CampaignSummary[]
  onClose: () => void
  onApply: (dailyBudgetMicros: number) => Promise<void>
}) {
  const [budgetBaht, setBudgetBaht] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    const baht = parseFloat(budgetBaht)
    if (!baht || baht <= 0) { setError('กรุณาระบุงบประมาณที่ถูกต้อง'); return }
    setApplying(true)
    setError('')
    try {
      await onApply(Math.round(baht * 1_000_000))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ตั้งค่างบประมาณไม่สำเร็จ')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">ปรับงบประมาณรายวัน</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-400"/></button>
        </div>
        <div className="text-xs text-gray-500">
          จะตั้งงบประมาณเดียวกันให้ {campaigns.length} campaigns:<br/>
          {campaigns.map(c => c.campaignName).join(', ')}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">งบประมาณรายวัน (บาท)</label>
          <input
            type="number"
            min="1"
            value={budgetBaht}
            onChange={e => setBudgetBaht(e.target.value)}
            placeholder="เช่น 500"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={apply} disabled={applying}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors">
            {applying ? <Loader2 className="w-4 h-4 animate-spin"/> : <DollarSign className="w-4 h-4"/>}
            ตั้งค่า
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}

// ─── Reapprove confirm modal ───────────────────────────────────────────────────
// Every push action funnels through this: it lists exactly what will change and
// nothing reaches Google Ads until the user clicks ยืนยัน (re-approve step).

interface PendingConfirm {
  title: string
  detail: string[]
  confirmLabel: string
  tone: 'emerald' | 'amber' | 'blue' | 'red'
  run: () => Promise<void> | void
}

const CONFIRM_TONES: Record<PendingConfirm['tone'], string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300',
  amber:   'bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300',
  blue:    'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300',
  red:     'bg-red-600 hover:bg-red-700 disabled:bg-red-300',
}

function ConfirmActionModal({ pending, onClose }: { pending: PendingConfirm; onClose: () => void }) {
  const [running, setRunning] = useState(false)
  async function confirm() {
    setRunning(true)
    try {
      await pending.run()
      onClose()
    } finally {
      setRunning(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500"/>{pending.title}
          </h3>
          <button onClick={onClose} disabled={running} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-400"/></button>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
          {pending.detail.map((line, i) => (
            <p key={i} className="text-xs text-gray-700">• {line}</p>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">ตรวจสอบรายการด้านบนก่อน — กดยืนยันแล้วระบบจะ push ไปที่ Google Ads จริงทันที</p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={confirm}
            disabled={running}
            className={cn('flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors', CONFIRM_TONES[pending.tone])}
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle2 className="w-4 h-4"/>}
            {pending.confirmLabel}
          </button>
          <button onClick={onClose} disabled={running} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}

// ─── Bidding section (campaign level) ──────────────────────────────────────────
// Adjust bidding targets via the existing edit_campaign_bidding action. The API
// updates the target of the given strategy — pushing a strategy that does not
// match the campaign's live strategy is rejected by Google Ads, so we default to
// the campaign's current one and warn on mismatch.

const BIDDING_LABELS: Record<string, string> = {
  TARGET_CPA: 'Target CPA',
  MAXIMIZE_CONVERSIONS: 'Maximize Conversions',
  TARGET_ROAS: 'Target ROAS',
  MAXIMIZE_CONVERSION_VALUE: 'Maximize Conversion Value',
  TARGET_SPEND: 'Maximize Clicks (Target Spend)',
  MANUAL_CPC: 'Manual CPC',
}

const ADJUSTABLE_STRATEGIES = ['MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_ROAS'] as const
type AdjustableStrategy = (typeof ADJUSTABLE_STRATEGIES)[number]

function BiddingSection({ campaign, customerId, confirm }: {
  campaign: CampaignSummary
  customerId: string
  confirm: (p: PendingConfirm) => void
}) {
  const current = campaign.biddingStrategyType ?? ''
  const [strategy, setStrategy] = useState<AdjustableStrategy>(
    (ADJUSTABLE_STRATEGIES as readonly string[]).includes(current) ? current as AdjustableStrategy : 'MAXIMIZE_CONVERSIONS'
  )
  const [target, setTarget] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const isCpa = strategy === 'TARGET_CPA' || strategy === 'MAXIMIZE_CONVERSIONS'
  const mismatch = current !== '' && current !== strategy

  async function push(value: number) {
    const res = await fetch('/api/campaign-adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit_campaign_bidding',
        customerId,
        campaignResourceName: campaign.campaignResourceName,
        biddingStrategyType: strategy,
        // Picking a different strategy than the campaign's current one = switch it.
        ...(mismatch ? { changeStrategy: true } : {}),
        ...(isCpa ? { targetCpaMicros: Math.round(value * 1_000_000) } : { targetRoas: value }),
      }),
    })
    const data = await res.json() as { success?: boolean; message?: string; error?: string }
    if (res.ok && data.success) {
      setMsg({ ok: true, text: data.message ?? `ปรับ bidding สำเร็จ` })
    } else {
      setMsg({ ok: false, text: data.error ?? 'ปรับ bidding ไม่สำเร็จ' })
    }
  }

  function request() {
    const value = parseFloat(target)
    if (!value || value <= 0) { setMsg({ ok: false, text: isCpa ? 'ระบุ Target CPA (บาท) ให้ถูกต้อง' : 'ระบุ Target ROAS (เท่า) ให้ถูกต้อง' }); return }
    setMsg(null)
    confirm({
      title: 'ยืนยันปรับ Bidding?',
      detail: [
        `${campaign.campaignName}`,
        `Strategy: ${BIDDING_LABELS[strategy] ?? strategy}${mismatch ? ` (ปัจจุบัน: ${BIDDING_LABELS[current] ?? current} — ถ้าไม่ตรง Google จะปฏิเสธ)` : ''}`,
        isCpa ? `Target CPA: ฿${value.toLocaleString()}` : `Target ROAS: ${value} เท่า (${Math.round(value * 100)}%)`,
      ],
      confirmLabel: 'ปรับ Bidding',
      tone: 'blue',
      run: () => push(value),
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-blue-500"/>
        <p className="font-semibold text-sm text-gray-900">Bidding</p>
        {current && (
          <span className="px-2 py-0.5 text-[11px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full">
            ปัจจุบัน: {BIDDING_LABELS[current] ?? current}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Strategy</label>
          <select value={strategy} onChange={e => setStrategy(e.target.value as AdjustableStrategy)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {ADJUSTABLE_STRATEGIES.map(s => <option key={s} value={s}>{BIDDING_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-gray-500 mb-1">{isCpa ? 'Target CPA (บาท)' : 'Target ROAS (เท่า)'}</label>
          <input type="number" min="0" step={isCpa ? '1' : '0.1'} value={target} onChange={e => setTarget(e.target.value)}
            placeholder={isCpa ? 'เช่น 250' : 'เช่น 4 (= 400%)'}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>
        <button onClick={request}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          <Save className="w-4 h-4"/>ปรับ Bidding
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
      </div>
      {mismatch && (
        <p className="mt-1.5 text-[11px] text-amber-600">
          ⚠️ strategy ที่เลือกต่างจากปัจจุบัน — ระบบจะ<b>เปลี่ยน strategy จริง</b>ใน Google Ads (แคมเปญเข้าสู่ช่วงเรียนรู้ใหม่)
        </p>
      )}
    </div>
  )
}

// ─── Keywords section (SEARCH campaigns) ───────────────────────────────────────
// View / add / pause / remove keywords per ad group + AI suggestions grounded on
// the live keywords and the campaign's real ad copy. All pushes go through the
// reapprove modal.

interface KeywordRowUI {
  adGroupId: string
  adGroupName: string
  adGroupResourceName: string
  criterionResourceName: string
  text: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD' | 'UNKNOWN'
  status: 'ENABLED' | 'PAUSED'
  negative: boolean
}

interface KeywordAISuggestion {
  add: { text: string; matchType: 'EXACT' | 'PHRASE' | 'BROAD'; reason: string }[]
  pauseOrRemove: { text: string; reason: string }[]
  rationale: string
}

function KeywordsSection({ campaign, customerId, confirm }: {
  campaign: CampaignSummary
  customerId: string
  confirm: (p: PendingConfirm) => void
}) {
  const [rows, setRows] = useState<KeywordRowUI[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // add form
  const [addText, setAddText] = useState('')
  const [addMatch, setAddMatch] = useState<'EXACT' | 'PHRASE' | 'BROAD'>('PHRASE')
  const [addAdGroup, setAddAdGroup] = useState('')

  // AI suggest
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<KeywordAISuggestion | null>(null)
  const [aiPicked, setAiPicked] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/campaign-edit/keywords?customerId=${customerId}&campaignResourceName=${encodeURIComponent(campaign.campaignResourceName)}`)
      const data = await res.json() as { keywords?: KeywordRowUI[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'โหลด keywords ไม่สำเร็จ')
      setRows(data.keywords ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด keywords ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [customerId, campaign.campaignResourceName])

  useEffect(() => { load() }, [load])

  const adGroups = Array.from(new Map(rows.map(r => [r.adGroupResourceName, r.adGroupName])).entries())
  const effectiveAddAdGroup = addAdGroup || adGroups[0]?.[0] || ''

  async function mutate(operations: Record<string, unknown>[], successText: string) {
    const res = await fetch('/api/campaign-edit/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, operations }),
    })
    const data = await res.json() as { success?: boolean; message?: string; error?: string }
    if (res.ok && data.success) {
      setMsg({ ok: true, text: data.message ?? `${successText}` })
      await load()
    } else {
      setMsg({ ok: false, text: data.error ?? 'ปรับ keyword ไม่สำเร็จ' })
    }
  }

  function requestSetStatus(row: KeywordRowUI, status: 'ENABLED' | 'PAUSED') {
    confirm({
      title: status === 'PAUSED' ? 'ยืนยันพัก keyword?' : 'ยืนยันเปิด keyword?',
      detail: [`"${row.text}" [${row.matchType}] ใน ${row.adGroupName} — ${row.status} → ${status}`],
      confirmLabel: status === 'PAUSED' ? 'พัก keyword' : 'เปิด keyword',
      tone: status === 'PAUSED' ? 'amber' : 'emerald',
      run: () => mutate(
        [{ op: 'set_status', criterionResourceName: row.criterionResourceName, status }],
        status === 'PAUSED' ? 'พัก keyword แล้ว' : 'เปิด keyword แล้ว'
      ),
    })
  }

  function requestRemove(row: KeywordRowUI) {
    confirm({
      title: 'ยืนยันลบ keyword?',
      detail: [`ลบถาวร: "${row.text}" [${row.matchType}] ใน ${row.adGroupName}`],
      confirmLabel: 'ลบ keyword',
      tone: 'red',
      run: () => mutate([{ op: 'remove', criterionResourceName: row.criterionResourceName }], 'ลบ keyword แล้ว'),
    })
  }

  function requestAdd() {
    const words = addText.split('\n').map(s => s.trim()).filter(Boolean)
    if (!words.length) { setMsg({ ok: false, text: 'พิมพ์ keyword ที่จะเพิ่มก่อน (บรรทัดละคำ)' }); return }
    if (!effectiveAddAdGroup) { setMsg({ ok: false, text: 'ยังไม่มี Ad Group ให้เพิ่ม keyword' }); return }
    const agName = adGroups.find(([rn]) => rn === effectiveAddAdGroup)?.[1] ?? ''
    setMsg(null)
    confirm({
      title: 'ยืนยันเพิ่ม keywords?',
      detail: words.map(w => `+ "${w}" [${addMatch}] → ${agName}`),
      confirmLabel: `เพิ่ม ${words.length} keywords`,
      tone: 'emerald',
      run: () => mutate(
        words.map(w => ({ op: 'add', adGroupResourceName: effectiveAddAdGroup, text: w, matchType: addMatch })),
        `เพิ่ม ${words.length} keywords แล้ว`
      ).then(() => setAddText('')),
    })
  }

  async function askAI() {
    setAiLoading(true)
    setAiResult(null)
    setAiPicked(new Set())
    try {
      // Ground the suggestion on the campaign's real ad copy.
      let adHeadlines: string[] = []
      let adDescriptions: string[] = []
      try {
        const adsRes = await fetch(`/api/campaign-edit/ads?customerId=${customerId}&campaignId=${campaign.campaignId}`)
        const adsData = await adsRes.json() as { ads?: { headlines?: { text: string }[]; descriptions?: { text: string }[] }[] }
        adHeadlines = (adsData.ads ?? []).flatMap(a => (a.headlines ?? []).map(h => h.text)).slice(0, 15)
        adDescriptions = (adsData.ads ?? []).flatMap(a => (a.descriptions ?? []).map(d => d.text)).slice(0, 8)
      } catch { /* ad copy is optional grounding */ }

      const res = await fetch('/api/campaign-edit/keyword-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: campaign.campaignName,
          existingKeywords: rows.map(r => ({ text: r.text, matchType: r.matchType, status: r.status })),
          adHeadlines,
          adDescriptions,
          instruction: aiInstruction,
        }),
      })
      const data = await res.json() as KeywordAISuggestion & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'AI แนะนำไม่สำเร็จ')
      setAiResult(data)
      setAiPicked(new Set(data.add.map(a => a.text)))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'AI แนะนำไม่สำเร็จ' })
    } finally {
      setAiLoading(false)
    }
  }

  function requestApplyAI() {
    if (!aiResult) return
    const picked = aiResult.add.filter(a => aiPicked.has(a.text))
    if (!picked.length) { setMsg({ ok: false, text: 'เลือก keyword ที่จะเพิ่มอย่างน้อย 1 คำ' }); return }
    if (!effectiveAddAdGroup) { setMsg({ ok: false, text: 'ยังไม่มี Ad Group ให้เพิ่ม keyword' }); return }
    const agName = adGroups.find(([rn]) => rn === effectiveAddAdGroup)?.[1] ?? ''
    confirm({
      title: 'ยืนยันเพิ่ม keywords จาก AI?',
      detail: picked.map(a => `+ "${a.text}" [${a.matchType}] → ${agName}`),
      confirmLabel: `เพิ่ม ${picked.length} keywords`,
      tone: 'emerald',
      run: () => mutate(
        picked.map(a => ({ op: 'add', adGroupResourceName: effectiveAddAdGroup, text: a.text, matchType: a.matchType })),
        `เพิ่ม ${picked.length} keywords จาก AI แล้ว`
      ).then(() => setAiResult(null)),
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Search className="w-4 h-4 text-indigo-500"/>
        <p className="font-semibold text-sm text-gray-900">Keywords</p>
        {rows.length > 0 && <span className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-500 rounded-full">{rows.length}</span>}
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>รีเฟรช
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {loading && rows.length === 0 && (
        <div className="flex items-center gap-2 py-4 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>กำลังโหลด keywords...</div>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-gray-400 py-2">ยังไม่มี keyword ในแคมเปญนี้</p>
      )}

      {/* Keyword table grouped by ad group */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-gray-100 overflow-hidden mb-3 max-h-72 overflow-y-auto">
          {adGroups.map(([agRn, agName]) => (
            <div key={agRn}>
              <div className="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 border-b border-gray-100">{agName}</div>
              {rows.filter(r => r.adGroupResourceName === agRn).map(r => (
                <div key={r.criterionResourceName} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-b-0">
                  <span className={cn('flex-1 min-w-0 truncate text-sm', r.status === 'PAUSED' ? 'text-gray-400' : 'text-gray-800')}>
                    {r.negative && <span className="text-red-500 font-semibold mr-1">−</span>}{r.text}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-600 rounded">{r.matchType}</span>
                  <span className={cn('px-1.5 py-0.5 text-[10px] font-semibold rounded', r.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{r.status}</span>
                  <button
                    onClick={() => requestSetStatus(r, r.status === 'ENABLED' ? 'PAUSED' : 'ENABLED')}
                    className="text-xs text-gray-500 hover:text-gray-800"
                    title={r.status === 'ENABLED' ? 'พัก keyword' : 'เปิด keyword'}
                  >
                    {r.status === 'ENABLED' ? <ToggleLeft className="w-4 h-4"/> : <ToggleRight className="w-4 h-4"/>}
                  </button>
                  <button onClick={() => requestRemove(r)} className="text-gray-300 hover:text-red-500" title="ลบ keyword">
                    <X className="w-3.5 h-3.5"/>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add keywords */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5"/>เพิ่ม Keywords (บรรทัดละคำ)</p>
          <textarea value={addText} onChange={e => setAddText(e.target.value)} rows={3}
            placeholder={'คลินิกทันตกรรม ใกล้ฉัน\nจัดฟัน ราคา'}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          <div className="flex items-center gap-2">
            <select value={addMatch} onChange={e => setAddMatch(e.target.value as 'EXACT' | 'PHRASE' | 'BROAD')}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
              <option value="EXACT">EXACT</option>
              <option value="PHRASE">PHRASE</option>
              <option value="BROAD">BROAD</option>
            </select>
            <select value={effectiveAddAdGroup} onChange={e => setAddAdGroup(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
              {adGroups.map(([rn, name]) => <option key={rn} value={rn}>{name}</option>)}
            </select>
            <button onClick={requestAdd}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">เพิ่ม</button>
          </div>
        </div>

        {/* AI suggest */}
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5"/>AI แนะนำ keyword (อิงจาก keyword + ad จริง)</p>
          <div className="flex items-center gap-2">
            <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
              placeholder="สิ่งที่อยากปรับ เช่น เน้นคนหาราคา / ตัดคำกว้าง"
              className="flex-1 px-2.5 py-1.5 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            <button onClick={askAI} disabled={aiLoading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors">
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Sparkles className="w-3.5 h-3.5"/>}แนะนำ
            </button>
          </div>
          {aiResult && (
            <div className="space-y-2">
              {aiResult.add.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {aiResult.add.map(a => (
                    <label key={a.text} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-indigo-600"
                        checked={aiPicked.has(a.text)}
                        onChange={() => setAiPicked(prev => {
                          const next = new Set(prev)
                          if (next.has(a.text)) next.delete(a.text); else next.add(a.text)
                          return next
                        })}/>
                      <span className="min-w-0"><b>&quot;{a.text}&quot;</b> [{a.matchType}] <span className="text-gray-400">— {a.reason}</span></span>
                    </label>
                  ))}
                </div>
              )}
              {aiResult.pauseOrRemove.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 space-y-0.5">
                  <p className="text-[11px] font-semibold text-amber-700">แนะนำให้พัก/ลบ (กดจากตารางด้านบน):</p>
                  {aiResult.pauseOrRemove.map(p => (
                    <p key={p.text} className="text-[11px] text-amber-700">• &quot;{p.text}&quot; — {p.reason}</p>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400">{aiResult.rationale}</p>
              <button onClick={requestApplyAI}
                className="w-full px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                เพิ่มคำที่เลือก ({aiResult.add.filter(a => aiPicked.has(a.text)).length})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Extensions section (sitelink / callout, campaign level) ───────────────────

interface ExtensionRowUI {
  campaignAssetResourceName: string
  assetResourceName: string
  fieldType: 'SITELINK' | 'CALLOUT'
  linkText?: string
  description1?: string
  description2?: string
  finalUrl?: string
  calloutText?: string
}

function ExtensionsSection({ campaign, customerId, confirm }: {
  campaign: CampaignSummary
  customerId: string
  confirm: (p: PendingConfirm) => void
}) {
  const [rows, setRows] = useState<ExtensionRowUI[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [slText, setSlText] = useState('')
  const [slUrl, setSlUrl] = useState('')
  const [slDesc1, setSlDesc1] = useState('')
  const [slDesc2, setSlDesc2] = useState('')
  const [coText, setCoText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/campaign-edit/extensions?customerId=${customerId}&campaignResourceName=${encodeURIComponent(campaign.campaignResourceName)}`)
      const data = await res.json() as { extensions?: ExtensionRowUI[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'โหลด extensions ไม่สำเร็จ')
      setRows(data.extensions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด extensions ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [customerId, campaign.campaignResourceName])

  useEffect(() => { load() }, [load])

  async function mutate(operations: Record<string, unknown>[], successText: string) {
    const res = await fetch('/api/campaign-edit/extensions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, operations }),
    })
    const data = await res.json() as { success?: boolean; message?: string; error?: string }
    if (res.ok && data.success) {
      setMsg({ ok: true, text: data.message ?? `${successText}` })
      await load()
    } else {
      setMsg({ ok: false, text: data.error ?? 'ปรับ extension ไม่สำเร็จ' })
    }
  }

  function requestAddSitelink() {
    if (!slText.trim() || !slUrl.trim()) { setMsg({ ok: false, text: 'Sitelink ต้องมีข้อความ + URL' }); return }
    setMsg(null)
    confirm({
      title: 'ยืนยันเพิ่ม Sitelink?',
      detail: [`+ Sitelink "${slText.trim()}" → ${slUrl.trim()}`, ...(slDesc1.trim() ? [`คำอธิบาย: ${slDesc1.trim()}${slDesc2.trim() ? ' / ' + slDesc2.trim() : ''}`] : []), `แคมเปญ: ${campaign.campaignName}`],
      confirmLabel: 'เพิ่ม Sitelink',
      tone: 'emerald',
      run: () => mutate(
        [{ op: 'add_sitelink', campaignResourceName: campaign.campaignResourceName, linkText: slText.trim(), finalUrl: slUrl.trim(), description1: slDesc1.trim(), description2: slDesc2.trim() }],
        'เพิ่ม Sitelink แล้ว'
      ).then(() => { setSlText(''); setSlUrl(''); setSlDesc1(''); setSlDesc2('') }),
    })
  }

  function requestAddCallout() {
    if (!coText.trim()) { setMsg({ ok: false, text: 'พิมพ์ข้อความ Callout ก่อน' }); return }
    setMsg(null)
    confirm({
      title: 'ยืนยันเพิ่ม Callout?',
      detail: [`+ Callout "${coText.trim()}"`, `แคมเปญ: ${campaign.campaignName}`],
      confirmLabel: 'เพิ่ม Callout',
      tone: 'emerald',
      run: () => mutate(
        [{ op: 'add_callout', campaignResourceName: campaign.campaignResourceName, calloutText: coText.trim() }],
        'เพิ่ม Callout แล้ว'
      ).then(() => setCoText('')),
    })
  }

  function requestRemove(row: ExtensionRowUI) {
    const label = row.fieldType === 'SITELINK' ? `Sitelink "${row.linkText}"` : `Callout "${row.calloutText}"`
    confirm({
      title: `ยืนยันถอด ${row.fieldType === 'SITELINK' ? 'Sitelink' : 'Callout'}?`,
      detail: [`ถอด ${label} ออกจาก ${campaign.campaignName} (ตัว asset ยังอยู่ใน library ของบัญชี)`],
      confirmLabel: 'ถอดออก',
      tone: 'red',
      run: () => mutate([{ op: 'remove', campaignAssetResourceName: row.campaignAssetResourceName }], 'ถอด extension แล้ว'),
    })
  }

  const sitelinks = rows.filter(r => r.fieldType === 'SITELINK')
  const callouts = rows.filter(r => r.fieldType === 'CALLOUT')

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <LayoutGrid className="w-4 h-4 text-teal-500"/>
        <p className="font-semibold text-sm text-gray-900">Extensions (Sitelink / Callout)</p>
        {rows.length > 0 && <span className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-500 rounded-full">{rows.length}</span>}
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>รีเฟรช
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Sitelinks */}
        <div className="rounded-lg border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Sitelinks ({sitelinks.length})</p>
          {sitelinks.map(r => (
            <div key={r.campaignAssetResourceName} className="flex items-start gap-2 text-xs border-b border-gray-50 pb-1.5 last:border-b-0">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{r.linkText}</p>
                <p className="text-gray-400 truncate">{r.finalUrl}</p>
                {(r.description1 || r.description2) && <p className="text-gray-400 truncate">{[r.description1, r.description2].filter(Boolean).join(' / ')}</p>}
              </div>
              <button onClick={() => requestRemove(r)} className="text-gray-300 hover:text-red-500 shrink-0" title="ถอดออก"><X className="w-3.5 h-3.5"/></button>
            </div>
          ))}
          {!loading && sitelinks.length === 0 && <p className="text-xs text-gray-400">ยังไม่มี sitelink</p>}
          <div className="pt-1 space-y-1.5">
            <div className="flex gap-1.5">
              <input value={slText} onChange={e => setSlText(e.target.value)} maxLength={25} placeholder="ข้อความ (≤25)"
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              <input value={slUrl} onChange={e => setSlUrl(e.target.value)} placeholder="https://..."
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            </div>
            <div className="flex gap-1.5">
              <input value={slDesc1} onChange={e => setSlDesc1(e.target.value)} maxLength={35} placeholder="คำอธิบาย 1 (ไม่บังคับ)"
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"/>
              <input value={slDesc2} onChange={e => setSlDesc2(e.target.value)} maxLength={35} placeholder="คำอธิบาย 2 (ไม่บังคับ)"
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"/>
              <button onClick={requestAddSitelink}
                className="px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shrink-0">เพิ่ม</button>
            </div>
          </div>
        </div>

        {/* Callouts */}
        <div className="rounded-lg border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Callouts ({callouts.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {callouts.map(r => (
              <span key={r.campaignAssetResourceName} className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 border border-teal-100 text-teal-700 text-xs rounded-full">
                {r.calloutText}
                <button onClick={() => requestRemove(r)} className="hover:text-red-500" title="ถอดออก"><X className="w-3 h-3"/></button>
              </span>
            ))}
            {!loading && callouts.length === 0 && <p className="text-xs text-gray-400">ยังไม่มี callout</p>}
          </div>
          <div className="flex gap-1.5 pt-1">
            <input value={coText} onChange={e => setCoText(e.target.value)} maxLength={25} placeholder="เช่น ส่งฟรีทั่วไทย (≤25)"
              className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            <button onClick={requestAddCallout}
              className="px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shrink-0">เพิ่ม</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Audience section (campaign-level USER_LIST criteria) ──────────────────────

interface AttachedAudienceUI {
  criterionResourceName: string
  userListResourceName: string
  name: string
  bidModifier?: number
  negative: boolean
}

interface AvailableUserListUI {
  resourceName: string
  name: string
  sizeForSearch?: number
}

function AudienceSection({ campaign, customerId, confirm }: {
  campaign: CampaignSummary
  customerId: string
  confirm: (p: PendingConfirm) => void
}) {
  const [attached, setAttached] = useState<AttachedAudienceUI[]>([])
  const [available, setAvailable] = useState<AvailableUserListUI[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pickList, setPickList] = useState('')
  const [bidMod, setBidMod] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/campaign-edit/audiences?customerId=${customerId}&campaignResourceName=${encodeURIComponent(campaign.campaignResourceName)}`)
      const data = await res.json() as { attached?: AttachedAudienceUI[]; available?: AvailableUserListUI[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'โหลด audiences ไม่สำเร็จ')
      setAttached(data.attached ?? [])
      setAvailable(data.available ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด audiences ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [customerId, campaign.campaignResourceName])

  useEffect(() => { load() }, [load])

  const attachedRns = new Set(attached.map(a => a.userListResourceName))
  const addable = available.filter(a => !attachedRns.has(a.resourceName))
  const effectivePick = pickList || addable[0]?.resourceName || ''

  async function mutate(operations: Record<string, unknown>[], successText: string) {
    const res = await fetch('/api/campaign-edit/audiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, operations }),
    })
    const data = await res.json() as { success?: boolean; message?: string; error?: string }
    if (res.ok && data.success) {
      setMsg({ ok: true, text: data.message ?? `${successText}` })
      await load()
    } else {
      setMsg({ ok: false, text: data.error ?? 'ปรับ audience ไม่สำเร็จ' })
    }
  }

  function requestAdd() {
    if (!effectivePick) { setMsg({ ok: false, text: 'ไม่มี audience list ให้เพิ่ม (สร้าง user list ใน Google Ads ก่อน)' }); return }
    const name = addable.find(a => a.resourceName === effectivePick)?.name ?? effectivePick
    const mod = parseFloat(bidMod)
    setMsg(null)
    confirm({
      title: 'ยืนยันเพิ่ม Audience?',
      detail: [`+ "${name}" → ${campaign.campaignName}`, ...(mod > 0 ? [`Bid modifier: ×${mod}`] : [])],
      confirmLabel: 'เพิ่ม Audience',
      tone: 'emerald',
      run: () => mutate(
        [{ op: 'add', campaignResourceName: campaign.campaignResourceName, userListResourceName: effectivePick, ...(mod > 0 ? { bidModifier: mod } : {}) }],
        'เพิ่ม audience แล้ว'
      ).then(() => { setPickList(''); setBidMod('') }),
    })
  }

  function requestRemove(a: AttachedAudienceUI) {
    confirm({
      title: 'ยืนยันถอด Audience?',
      detail: [`ถอด "${a.name}" ออกจาก ${campaign.campaignName}`],
      confirmLabel: 'ถอดออก',
      tone: 'red',
      run: () => mutate([{ op: 'remove', criterionResourceName: a.criterionResourceName }], 'ถอด audience แล้ว'),
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-purple-500"/>
        <p className="font-semibold text-sm text-gray-900">Audiences (Remarketing / Customer lists)</p>
        {attached.length > 0 && <span className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-500 rounded-full">{attached.length}</span>}
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>รีเฟรช
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex flex-wrap gap-1.5 mb-2">
        {attached.map(a => (
          <span key={a.criterionResourceName} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 border border-purple-100 text-purple-700 text-xs rounded-full">
            {a.negative && <span className="font-bold text-red-500">−</span>}
            {a.name}
            {a.bidModifier ? <span className="text-purple-400">×{a.bidModifier}</span> : null}
            <button onClick={() => requestRemove(a)} className="hover:text-red-500" title="ถอดออก"><X className="w-3 h-3"/></button>
          </span>
        ))}
        {!loading && attached.length === 0 && <p className="text-xs text-gray-400">ยังไม่มี audience ผูกกับแคมเปญนี้</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select value={effectivePick} onChange={e => setPickList(e.target.value)}
          className="flex-1 min-w-[200px] px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
          {addable.length === 0 && <option value="">— ไม่มี list ที่ยังไม่ได้เพิ่ม —</option>}
          {addable.map(a => (
            <option key={a.resourceName} value={a.resourceName}>
              {a.name}{typeof a.sizeForSearch === 'number' ? ` (~${a.sizeForSearch.toLocaleString()} คน)` : ''}
            </option>
          ))}
        </select>
        <input type="number" min="0" step="0.1" value={bidMod} onChange={e => setBidMod(e.target.value)}
          placeholder="bid ×(เช่น 1.2)"
          className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"/>
        <button onClick={requestAdd}
          className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">เพิ่ม</button>
      </div>
    </div>
  )
}

// ─── Ad group section (bid + enable/pause per ad group) ────────────────────────

interface AdGroupRowUI {
  adGroupId: string
  adGroupResourceName: string
  name: string
  status: 'ENABLED' | 'PAUSED'
  cpcBidMicros: number
  type: string
}

// ชนิด ad group ที่ใช้ได้กับแคมเปญแต่ละชนิด — undefined = สร้าง ad group ไม่ได้
// (PMax ใช้ asset group, Shopping สร้างจาก Google Ads UI เพราะต้องผูก product group)
const AD_GROUP_TYPE_FOR_CAMPAIGN: Partial<Record<CampaignSummary['type'], string>> = {
  SEARCH: 'SEARCH_STANDARD',
  DISPLAY: 'DISPLAY_STANDARD',
  VIDEO: 'VIDEO_RESPONSIVE',
  DEMAND_GEN: 'DEMAND_GEN_AD_GROUP',
}

function AdGroupBidsSection({ campaign, customerId, confirm }: {
  campaign: CampaignSummary
  customerId: string
  confirm: (p: PendingConfirm) => void
}) {
  const [rows, setRows] = useState<AdGroupRowUI[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [bidDraft, setBidDraft] = useState<Record<string, string>>({})
  // ฟอร์มสร้าง ad group ใหม่
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBid, setNewBid] = useState('')
  const [creating, setCreating] = useState(false)

  // ad group ที่สร้างใหม่ต้องมี type ตรงกับชนิดแคมเปญ ไม่งั้น Google ปฏิเสธ
  // PMax ใช้ asset group ไม่ใช่ ad group จึงสร้างจากตรงนี้ไม่ได้
  const newAdGroupType = AD_GROUP_TYPE_FOR_CAMPAIGN[campaign.type]

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/campaign-edit/ad-groups?customerId=${customerId}&campaignResourceName=${encodeURIComponent(campaign.campaignResourceName)}`)
      const data = await res.json() as { adGroups?: AdGroupRowUI[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'โหลด ad groups ไม่สำเร็จ')
      setRows(data.adGroups ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด ad groups ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [customerId, campaign.campaignResourceName])

  useEffect(() => { load() }, [load])

  async function mutate(operations: Record<string, unknown>[], successText: string) {
    const res = await fetch('/api/campaign-edit/ad-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, operations }),
    })
    const data = await res.json() as { success?: boolean; message?: string; error?: string }
    if (res.ok && data.success) {
      setMsg({ ok: true, text: data.message ?? `${successText}` })
      await load()
    } else {
      setMsg({ ok: false, text: data.error ?? 'ปรับ ad group ไม่สำเร็จ' })
    }
  }

  function requestSetStatus(row: AdGroupRowUI) {
    const status: 'ENABLED' | 'PAUSED' = row.status === 'ENABLED' ? 'PAUSED' : 'ENABLED'
    confirm({
      title: status === 'PAUSED' ? 'ยืนยันหยุด Ad Group?' : 'ยืนยันเปิด Ad Group?',
      detail: [`${row.name} — ${row.status} → ${status}`],
      confirmLabel: status === 'PAUSED' ? 'หยุด Ad Group' : 'เปิด Ad Group',
      tone: status === 'PAUSED' ? 'amber' : 'emerald',
      run: () => mutate([{ op: 'set_status', adGroupResourceName: row.adGroupResourceName, status }],
        status === 'PAUSED' ? 'หยุด ad group แล้ว' : 'เปิด ad group แล้ว'),
    })
  }

  function requestSetBid(row: AdGroupRowUI) {
    const baht = parseFloat(bidDraft[row.adGroupId] ?? '')
    if (!baht || baht <= 0) { setMsg({ ok: false, text: 'ระบุ CPC bid (บาท) ให้ถูกต้อง' }); return }
    setMsg(null)
    confirm({
      title: 'ยืนยันปรับ CPC bid?',
      detail: [`${row.name}: ฿${(row.cpcBidMicros / 1_000_000).toLocaleString()} → ฿${baht.toLocaleString()}`],
      confirmLabel: 'ปรับ bid',
      tone: 'blue',
      run: () => mutate(
        [{ op: 'set_bid', adGroupResourceName: row.adGroupResourceName, cpcBidMicros: Math.round(baht * 1_000_000) }],
        'ปรับ CPC bid แล้ว'
      ).then(() => setBidDraft(prev => ({ ...prev, [row.adGroupId]: '' }))),
    })
  }

  function requestCreate() {
    const name = newName.trim()
    if (!name) { setMsg({ ok: false, text: 'ใส่ชื่อ ad group ก่อน' }); return }
    if (rows.some(r => r.name.trim().toLowerCase() === name.toLowerCase())) {
      setMsg({ ok: false, text: `มี ad group ชื่อ "${name}" อยู่แล้วในแคมเปญนี้` }); return
    }
    if (!newAdGroupType) { setMsg({ ok: false, text: 'แคมเปญชนิดนี้สร้าง ad group จากที่นี่ไม่ได้' }); return }
    const baht = parseFloat(newBid)
    setMsg(null)
    confirm({
      title: 'ยืนยันสร้าง Ad Group ใหม่?',
      detail: [
        `ชื่อ: ${name}`,
        `แคมเปญ: ${campaign.campaignName}`,
        baht > 0 ? `CPC bid เริ่มต้น: ฿${baht.toLocaleString()}` : 'ไม่กำหนด CPC bid (ใช้ค่าจาก bid strategy ของแคมเปญ)',
      ],
      confirmLabel: 'สร้าง Ad Group',
      tone: 'emerald',
      run: async () => {
        setCreating(true)
        try {
          const res = await fetch('/api/campaign-edit/ad-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerId,
              operations: [{
                op: 'create',
                campaignResourceName: campaign.campaignResourceName,
                name,
                type: newAdGroupType,
                status: 'ENABLED',
                ...(baht > 0 ? { cpcBidMicros: Math.round(baht * 1_000_000) } : {}),
              }],
            }),
          })
          const data = await res.json() as { success?: boolean; error?: string }
          if (res.ok && data.success) {
            setMsg({ ok: true, text: `สร้าง ad group "${name}" แล้ว` })
            setNewName(''); setNewBid(''); setShowNew(false)
            await load()
          } else {
            setMsg({ ok: false, text: data.error ?? 'สร้าง ad group ไม่สำเร็จ' })
          }
        } finally {
          setCreating(false)
        }
      },
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-orange-500"/>
        <p className="font-semibold text-sm text-gray-900">Ad Groups (bid + เปิด/หยุด รายกลุ่ม)</p>
        {rows.length > 0 && <span className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-500 rounded-full">{rows.length}</span>}
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>รีเฟรช
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {loading && rows.length === 0 && (
        <div className="flex items-center gap-2 py-3 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>กำลังโหลด ad groups...</div>
      )}
      {!loading && !error && rows.length === 0 && <p className="text-sm text-gray-400 py-1">ไม่มี ad group ในแคมเปญนี้</p>}

      {rows.length > 0 && (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          {rows.map(r => (
            <div key={r.adGroupId} className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-b-0">
              <span className={cn('flex-1 min-w-[140px] truncate text-sm', r.status === 'PAUSED' ? 'text-gray-400' : 'text-gray-800')}>{r.name}</span>
              <span className={cn('px-1.5 py-0.5 text-[10px] font-semibold rounded', r.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{r.status}</span>
              <button onClick={() => requestSetStatus(r)} className="text-gray-500 hover:text-gray-800" title={r.status === 'ENABLED' ? 'หยุด ad group' : 'เปิด ad group'}>
                {r.status === 'ENABLED' ? <ToggleLeft className="w-4 h-4"/> : <ToggleRight className="w-4 h-4"/>}
              </button>
              <span className="text-[11px] text-gray-400 w-24 text-right">CPC ฿{(r.cpcBidMicros / 1_000_000).toLocaleString()}</span>
              <input type="number" min="0" step="0.5" value={bidDraft[r.adGroupId] ?? ''}
                onChange={e => setBidDraft(prev => ({ ...prev, [r.adGroupId]: e.target.value }))}
                placeholder="bid ใหม่ (บาท)"
                className="w-28 px-2 py-1 text-xs border border-gray-200 rounded-lg"/>
              <button onClick={() => requestSetBid(r)}
                className="px-2.5 py-1 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">ปรับ bid</button>
            </div>
          ))}
        </div>
      )}
      {newAdGroupType && !showNew && (
        <button onClick={() => { setShowNew(true); setMsg(null) }}
          className="mt-2 flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5"/>สร้าง Ad Group ใหม่
        </button>
      )}
      {newAdGroupType && showNew && (
        <div className="mt-2 p-3 rounded-lg border border-emerald-100 bg-emerald-50/40">
          <div className="flex flex-wrap items-center gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="ชื่อ ad group ใหม่" maxLength={255}
              className="flex-1 min-w-[160px] px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"/>
            <input type="number" min="0" step="0.5" value={newBid} onChange={e => setNewBid(e.target.value)}
              placeholder="CPC bid (บาท, ไม่บังคับ)"
              className="w-40 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"/>
            <button onClick={requestCreate} disabled={creating}
              className="px-2.5 py-1 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg transition-colors">
              {creating ? 'กำลังสร้าง...' : 'สร้าง'}
            </button>
            <button onClick={() => { setShowNew(false); setNewName(''); setNewBid('') }}
              className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
          </div>
          <p className="mt-1.5 text-[10px] text-gray-500">
            ชนิด ad group: {newAdGroupType} (ตามชนิดแคมเปญ) — ถ้าแคมเปญใช้ smart bidding ไม่ต้องใส่ CPC bid
          </p>
        </div>
      )}
      {!newAdGroupType && (
        <p className="mt-2 text-[10px] text-gray-400">
          แคมเปญ {campaign.type} สร้าง ad group จากหน้านี้ไม่ได้ (PMax ใช้ asset group / Shopping ต้องผูก product group)
        </p>
      )}
      <p className="mt-1.5 text-[10px] text-gray-400">CPC bid มีผลเฉพาะ strategy แบบ manual/enhanced — ถ้าแคมเปญใช้ smart bidding (tCPA/tROAS) Google จะไม่ใช้ค่านี้</p>
    </div>
  )
}

// ─── PMax asset group images (list from asset-groups API, mutate via new route) ─

const IMAGE_FIELD_LABEL: Record<string, string> = {
  MARKETING_IMAGE: 'Landscape (1.91:1)',
  SQUARE_MARKETING_IMAGE: 'Square (1:1)',
  PORTRAIT_MARKETING_IMAGE: 'Portrait (4:5)',
  LOGO: 'Logo (1:1)',
  LANDSCAPE_LOGO: 'Logo (4:1)',
}

function AssetGroupImagesSection({ campaign, customerId, confirm }: {
  campaign: CampaignSummary
  customerId: string
  confirm: (p: PendingConfirm) => void
}) {
  const [groups, setGroups] = useState<AssetGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [activeGroupRn, setActiveGroupRn] = useState('')
  const [newFieldType, setNewFieldType] = useState('MARKETING_IMAGE')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/campaign-edit/asset-groups?customerId=${customerId}&campaignId=${campaign.campaignId}`)
      const data = await res.json() as { assetGroups?: AssetGroup[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'โหลด asset groups ไม่สำเร็จ')
      setGroups(data.assetGroups ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด asset groups ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [customerId, campaign.campaignId])

  useEffect(() => { load() }, [load])

  const activeGroup = groups.find(g => g.assetGroupResourceName === (activeGroupRn || groups[0]?.assetGroupResourceName))
  const allImages = activeGroup ? [...activeGroup.images, ...activeGroup.logos] : []

  async function mutate(operations: Record<string, unknown>[], successText: string) {
    const res = await fetch('/api/campaign-edit/asset-group-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, operations }),
    })
    const data = await res.json() as { success?: boolean; message?: string; error?: string }
    if (res.ok && data.success) {
      setMsg({ ok: true, text: data.message ?? `${successText}` })
      await load()
    } else {
      setMsg({ ok: false, text: data.error ?? 'ปรับรูปไม่สำเร็จ' })
    }
  }

  async function handleFile(file: File) {
    if (!activeGroup) return
    setUploading(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'อัปโหลดรูปไม่สำเร็จ')
      const url = data.url
      confirm({
        title: 'ยืนยันเพิ่มรูปเข้า Asset Group?',
        detail: [
          `Asset Group: ${activeGroup.name}`,
          `ประเภท: ${IMAGE_FIELD_LABEL[newFieldType] ?? newFieldType}`,
          `ไฟล์: ${file.name} (${Math.round(file.size / 1024)} KB)`,
        ],
        confirmLabel: 'เพิ่มรูป',
        tone: 'emerald',
        run: () => mutate(
          [{ op: 'link', assetGroupResourceName: activeGroup.assetGroupResourceName, fieldType: newFieldType, imageUrl: url, assetName: file.name }],
          'เพิ่มรูปแล้ว'
        ),
      })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'อัปโหลดรูปไม่สำเร็จ' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function requestUnlink(img: { resourceName: string; assetName: string; fieldType: string }) {
    if (!activeGroup) return
    confirm({
      title: 'ยืนยันถอดรูปออกจาก Asset Group?',
      detail: [
        `Asset Group: ${activeGroup.name}`,
        `รูป: ${img.assetName || img.resourceName} (${IMAGE_FIELD_LABEL[img.fieldType] ?? img.fieldType})`,
        'หมายเหตุ: ถ้าถอดแล้วต่ำกว่าขั้นต่ำของ PMax (ต้องมีรูปอย่างน้อย 1 ต่อประเภทหลัก) Google จะปฏิเสธ',
      ],
      confirmLabel: 'ถอดรูป',
      tone: 'red',
      run: () => mutate(
        [{ op: 'unlink', assetGroupResourceName: activeGroup.assetGroupResourceName, assetResourceName: img.resourceName, fieldType: img.fieldType }],
        'ถอดรูปแล้ว'
      ),
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="w-4 h-4 text-orange-500"/>
        <p className="font-semibold text-sm text-gray-900">รูปภาพใน Asset Groups</p>
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>รีเฟรช
        </button>
        {msg && <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {loading && groups.length === 0 && (
        <div className="flex items-center gap-2 py-3 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>กำลังโหลด asset groups...</div>
      )}
      {!loading && !error && groups.length === 0 && <p className="text-sm text-gray-400 py-1">ไม่มี asset group ในแคมเปญนี้</p>}

      {groups.length > 0 && (
        <>
          <select value={activeGroup?.assetGroupResourceName ?? ''} onChange={e => setActiveGroupRn(e.target.value)}
            className="mb-3 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
            {groups.map(g => <option key={g.assetGroupResourceName} value={g.assetGroupResourceName}>{g.name} ({g.status})</option>)}
          </select>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
            {allImages.map(img => (
              <div key={`${img.resourceName}-${img.fieldType}`} className="rounded-lg border border-gray-100 overflow-hidden group relative">
                {img.url
                  ? <img src={img.url} alt={img.assetName} className="w-full h-20 object-cover"/>
                  : <div className="w-full h-20 bg-gray-50 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-gray-200"/></div>}
                <button onClick={() => requestUnlink(img)}
                  className="absolute top-1 right-1 p-0.5 bg-white/90 rounded-full text-gray-400 hover:text-red-500 shadow"
                  title="ถอดรูปออก">
                  <X className="w-3.5 h-3.5"/>
                </button>
                <p className="px-1.5 py-1 text-[9px] text-gray-500 truncate">{IMAGE_FIELD_LABEL[img.fieldType] ?? img.fieldType}</p>
              </div>
            ))}
            {allImages.length === 0 && <p className="col-span-full text-xs text-gray-400">ยังไม่มีรูปใน asset group นี้</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
              {Object.entries(IMAGE_FIELD_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <button onClick={() => fileRef.current?.click()} disabled={uploading || !activeGroup}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg transition-colors">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Plus className="w-3.5 h-3.5"/>}
              อัปโหลดรูปใหม่
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}/>
            <span className="text-[10px] text-gray-400">JPG/PNG ≤5MB — สัดส่วนต้องตรงประเภทที่เลือก ไม่งั้น Google ปฏิเสธ</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── สร้าง Asset Group ใหม่ (PMax) ────────────────────────────────────────────
//
// PMax แก้ของเดิมได้มานานแล้วแต่สร้างใหม่ไม่ได้ — ฟอร์มนี้เก็บครบตามขั้นต่ำของ
// Google (พาดหัว 3, long headline 1, คำอธิบาย 2 โดยอันแรก ≤60, business name,
// รูป landscape+square+logo อย่างละ 1) แล้วยิง googleAds:mutate ก้อนเดียวผ่าน
// POST /api/campaign-edit/asset-groups — สร้างเป็น PAUSED ให้ตรวจก่อนเปิด

function NewAssetGroupSection({ campaign, customerId, confirm }: {
  campaign: CampaignSummary
  customerId: string
  confirm: (p: PendingConfirm) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [finalUrl, setFinalUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [headlines, setHeadlines] = useState<string[]>(['', '', ''])
  const [longHeadline, setLongHeadline] = useState('')
  const [descriptions, setDescriptions] = useState<string[]>(['', ''])
  const [images, setImages] = useState<{ landscape: string[]; square: string[]; logo: string[] }>({ landscape: [], square: [], logo: [] })
  const [uploading, setUploading] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function uploadTo(slot: 'landscape' | 'square' | 'logo', file: File) {
    setUploading(slot)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'อัปโหลดรูปไม่สำเร็จ')
      setImages(prev => ({ ...prev, [slot]: [...prev[slot], data.url!] }))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'อัปโหลดรูปไม่สำเร็จ' })
    } finally {
      setUploading(null)
    }
  }

  const filledH = headlines.map(h => h.trim()).filter(Boolean)
  const filledD = descriptions.map(d => d.trim()).filter(Boolean)
  const ready = name.trim().length > 0 && /^https?:\/\//i.test(finalUrl.trim())
    && filledH.length >= 3 && filledH.every(h => h.length <= 30)
    && longHeadline.trim().length > 0 && longHeadline.trim().length <= 90
    && filledD.length >= 2 && filledD.every(d => d.length <= 90) && filledD.some(d => d.length <= 60)
    && businessName.trim().length > 0 && businessName.trim().length <= 25
    && images.landscape.length >= 1 && images.square.length >= 1 && images.logo.length >= 1

  function requestCreate() {
    if (!ready) return
    setMsg(null)
    confirm({
      title: 'ยืนยันสร้าง Asset Group ใหม่?',
      detail: [
        `แคมเปญ: ${campaign.campaignName}`,
        `ชื่อ: ${name.trim()}`,
        `${filledH.length} พาดหัว · ${filledD.length} คำอธิบาย · รูป ${images.landscape.length + images.square.length + images.logo.length} รูป`,
        'สร้างเป็นสถานะ PAUSED — ตรวจใน Google Ads แล้วค่อยเปิดเอง',
      ],
      confirmLabel: 'สร้าง Asset Group',
      tone: 'emerald',
      run: async () => {
        setCreating(true)
        try {
          const res = await fetch('/api/campaign-edit/asset-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerId,
              campaignResourceName: campaign.campaignResourceName,
              name: name.trim(),
              finalUrl: finalUrl.trim(),
              headlines: filledH,
              longHeadline: longHeadline.trim(),
              descriptions: filledD,
              businessName: businessName.trim(),
              landscapeImageUrls: images.landscape,
              squareImageUrls: images.square,
              logoUrls: images.logo,
              status: 'PAUSED',
            }),
          })
          const data = await res.json() as { success?: boolean; error?: string }
          if (!res.ok || !data.success) {
            setMsg({ ok: false, text: data.error ?? 'สร้าง asset group ไม่สำเร็จ' })
          } else {
            setMsg({ ok: true, text: `สร้าง asset group "${name.trim()}" แล้ว (PAUSED) — กดรีเฟรชในหัวข้อรูปภาพเพื่อเห็นกลุ่มใหม่` })
            setOpen(false)
            setName(''); setFinalUrl(''); setBusinessName(''); setLongHeadline('')
            setHeadlines(['', '', '']); setDescriptions(['', ''])
            setImages({ landscape: [], square: [], logo: [] })
          }
        } finally {
          setCreating(false)
        }
      },
    })
  }

  const imgSlot = (slot: 'landscape' | 'square' | 'logo', label: string, hint: string) => (
    <div>
      <p className="text-[11px] font-medium text-gray-600 mb-1">{label} <span className="text-gray-400">({hint})</span></p>
      <div className="flex flex-wrap items-center gap-1.5">
        {images[slot].map((u, i) => (
          <div key={i} className="relative group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`${slot} ${i + 1}`} className="w-14 h-14 object-cover rounded-lg border border-gray-200"/>
            <button onClick={() => setImages(prev => ({ ...prev, [slot]: prev[slot].filter((_, j) => j !== i) }))}
              className="absolute -top-1 -right-1 p-0.5 bg-white rounded-full shadow text-gray-400 hover:text-red-500">
              <X className="w-3 h-3"/>
            </button>
          </div>
        ))}
        <label className={cn('w-14 h-14 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-colors',
          images[slot].length === 0 ? 'border-amber-300 text-amber-400 hover:border-amber-400' : 'border-gray-200 text-gray-300 hover:border-gray-300')}>
          {uploading === slot ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
          <input type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadTo(slot, f); e.target.value = '' }}/>
        </label>
      </div>
    </div>
  )

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <Plus className="w-4 h-4 text-orange-500"/>
        <p className="font-semibold text-sm text-gray-900">สร้าง Asset Group ใหม่</p>
        {msg && <span className={cn('text-xs font-medium ml-2', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span>}
        {!open && (
          <button onClick={() => { setOpen(true); setMsg(null) }}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5"/>เปิดฟอร์ม
          </button>
        )}
        {open && (
          <button onClick={() => setOpen(false)} className="ml-auto p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
        )}
      </div>

      {open && (
        <div className="p-3 rounded-lg border border-orange-100 bg-orange-50/30 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อ asset group *"
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"/>
            <input value={finalUrl} onChange={e => setFinalUrl(e.target.value)} placeholder="Final URL — https://... *"
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"/>
            <div className="flex items-center gap-1">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} maxLength={25} placeholder="ชื่อธุรกิจ (≤25) *"
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"/>
              <span className="text-[10px] text-gray-400 w-9 text-right">{businessName.trim().length}/25</span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium text-gray-600 mb-1">พาดหัว (≥3 อัน, ≤30 ตัวอักษร) — ตอนนี้ {filledH.length}</p>
            <div className="space-y-1.5">
              {headlines.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={h} onChange={e => setHeadlines(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    placeholder={`พาดหัวที่ ${i + 1}`}
                    className={cn('flex-1 px-2.5 py-1.5 text-xs border rounded-lg bg-white', h.trim().length > 30 ? 'border-red-300' : 'border-gray-200')}/>
                  <span className={cn('text-[10px] w-9 text-right', h.trim().length > 30 ? 'text-red-600' : 'text-gray-400')}>{h.trim().length}/30</span>
                  {headlines.length > 3 && (
                    <button onClick={() => setHeadlines(prev => prev.filter((_, j) => j !== i))} className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5"/></button>
                  )}
                </div>
              ))}
            </div>
            {headlines.length < 15 && (
              <button onClick={() => setHeadlines(prev => [...prev, ''])} className="mt-1 text-[11px] text-orange-700 hover:underline">+ เพิ่มพาดหัว</button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[11px] font-medium text-gray-600 mb-1">Long headline (≤90)</p>
              <input value={longHeadline} onChange={e => setLongHeadline(e.target.value)}
                placeholder="พาดหัวยาว 1 อัน"
                className={cn('w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white', longHeadline.trim().length > 90 ? 'border-red-300' : 'border-gray-200')}/>
            </div>
            <span className={cn('text-[10px] w-10 text-right mt-4', longHeadline.trim().length > 90 ? 'text-red-600' : 'text-gray-400')}>{longHeadline.trim().length}/90</span>
          </div>

          <div>
            <p className="text-[11px] font-medium text-gray-600 mb-1">คำอธิบาย (≥2 อัน, ≤90 — อย่างน้อย 1 อัน ≤60) — ตอนนี้ {filledD.length}</p>
            <div className="space-y-1.5">
              {descriptions.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={d} onChange={e => setDescriptions(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    placeholder={i === 0 ? 'คำอธิบายสั้น (≤60)' : `คำอธิบายที่ ${i + 1}`}
                    className={cn('flex-1 px-2.5 py-1.5 text-xs border rounded-lg bg-white', d.trim().length > 90 ? 'border-red-300' : 'border-gray-200')}/>
                  <span className={cn('text-[10px] w-9 text-right', d.trim().length > 90 ? 'text-red-600' : 'text-gray-400')}>{d.trim().length}/90</span>
                  {descriptions.length > 2 && (
                    <button onClick={() => setDescriptions(prev => prev.filter((_, j) => j !== i))} className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5"/></button>
                  )}
                </div>
              ))}
            </div>
            {descriptions.length < 5 && (
              <button onClick={() => setDescriptions(prev => [...prev, ''])} className="mt-1 text-[11px] text-orange-700 hover:underline">+ เพิ่มคำอธิบาย</button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {imgSlot('landscape', 'Landscape *', '1.91:1 เช่น 1200×628')}
            {imgSlot('square', 'Square *', '1:1 เช่น 1200×1200')}
            {imgSlot('logo', 'Logo *', '1:1 พื้นหลังโปร่งได้')}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={requestCreate} disabled={!ready || creating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 rounded-lg transition-colors">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle2 className="w-3.5 h-3.5"/>}
              {creating ? 'กำลังสร้าง...' : 'สร้าง Asset Group (PAUSED)'}
            </button>
            {!ready && (
              <span className="text-[11px] text-gray-500">ต้องครบ: ชื่อ, URL, พาดหัว ≥3, long headline, คำอธิบาย ≥2 (มี ≤60), ชื่อธุรกิจ, รูปครบ 3 ช่อง</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function CampaignEditorPage() {
  const searchParams = useSearchParams()
  const initCustomerId = searchParams.get('customerId') ?? ''

  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState(initCustomerId)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // Campaign list filter — free-text name search + status
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENABLED' | 'PAUSED'>('ALL')

  // Re-approve gate: every push (status/bidding/keywords) opens this modal first,
  // showing exactly what will change; nothing hits Google Ads until ยืนยัน.
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [statusTogglingIds, setStatusTogglingIds] = useState<Set<string>>(new Set())
  const [statusResult, setStatusResult] = useState<{ message: string; ok: boolean } | null>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load accounts
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then((d: { accounts?: Array<{ id: string; descriptiveName?: string; name?: string; currencyCode?: string }> }) => {
        const list: Account[] = (d.accounts ?? []).map(a => ({
          id: a.id, name: a.descriptiveName ?? a.name ?? a.id, currencyCode: a.currencyCode,
        }))
        setAccounts(list)
        if (!selectedCustomer && list.length > 0) setSelectedCustomer(list[0].id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load campaigns
  const loadCampaigns = useCallback(async (customerId: string) => {
    if (!customerId) return
    setCampaignsLoading(true)
    setSelectedIds(new Set())
    setActiveTabId(null)
    try {
      const res = await fetch(`/api/campaign-edit/campaigns?customerId=${customerId}`)
      const data = await res.json() as { campaigns?: CampaignSummary[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setCampaigns(data.campaigns ?? [])
    } catch {
      setCampaigns([])
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedCustomer) loadCampaigns(selectedCustomer)
  }, [selectedCustomer, loadCampaigns])

  // Selection helpers
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (activeTabId === id) setActiveTabId(next.size > 0 ? Array.from(next)[0] : null)
      } else {
        next.add(id)
        if (!activeTabId) setActiveTabId(id)
      }
      return next
    })
  }

  function selectAll() {
    // Only what passes the current filter — filtering then Select All is the
    // natural "act on this subset" flow.
    const ids = visibleCampaigns.map(c => c.campaignId)
    setSelectedIds(new Set(ids))
    if (ids.length > 0 && !activeTabId) setActiveTabId(ids[0])
  }

  function deselectAll() {
    setSelectedIds(new Set())
    setActiveTabId(null)
  }

  const selectedCampaigns = campaigns.filter(c => selectedIds.has(c.campaignId))

  // List actually shown (and targeted by Select All) after name/status filters.
  const visibleCampaigns = campaigns.filter(c => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    if (filterText.trim() && !c.campaignName.toLowerCase().includes(filterText.trim().toLowerCase())) return false
    return true
  })

  // Reapprove gate for enable/pause: show what will change, push only after ยืนยัน.
  function requestToggleStatus(status: 'ENABLED' | 'PAUSED') {
    if (!selectedCampaigns.length) return
    setPendingConfirm({
      title: status === 'ENABLED' ? 'ยืนยันเปิด (Enable) campaigns?' : 'ยืนยันหยุด (Pause) campaigns?',
      detail: selectedCampaigns.map(c => `${c.campaignName} — ${c.status} → ${status}`),
      confirmLabel: status === 'ENABLED' ? `เปิด ${selectedCampaigns.length} campaigns` : `หยุด ${selectedCampaigns.length} campaigns`,
      tone: status === 'ENABLED' ? 'emerald' : 'amber',
      run: () => toggleStatusForSelected(status),
    })
  }

  // Status toggle for selected campaigns — all requests fire in parallel
  async function toggleStatusForSelected(status: 'ENABLED' | 'PAUSED') {
    if (!selectedCampaigns.length) return
    const ids = new Set(selectedCampaigns.map(c => c.campaignId))
    setStatusTogglingIds(ids)

    const results = await Promise.allSettled(
      selectedCampaigns.map(campaign =>
        fetch('/api/campaign-adjustments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit_campaign_status',
            customerId: selectedCustomer,
            campaignResourceName: campaign.campaignResourceName,
            status,
          }),
        }).then(res => {
          if (!res.ok) throw new Error('failed')
          // Update state for this campaign immediately on success
          setCampaigns(prev => prev.map(c => c.campaignId === campaign.campaignId ? { ...c, status } : c))
        })
      )
    )

    const ok   = results.filter(r => r.status === 'fulfilled').length
    const fail = results.filter(r => r.status === 'rejected').length
    setStatusTogglingIds(new Set())
    setStatusResult({ message: `${status === 'ENABLED' ? 'เปิด' : 'หยุด'} ${ok} campaigns${fail > 0 ? ` (ผิดพลาด ${fail})` : ''}`, ok: fail === 0 })
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => setStatusResult(null), 4000)
  }

  // Budget update for selected campaigns — all requests fire in parallel
  async function applyBudgetToSelected(dailyBudgetMicros: number) {
    const campaignsWithBudget = selectedCampaigns.filter(c => c.budgetResourceName)

    const results = await Promise.allSettled(
      campaignsWithBudget.map(campaign =>
        fetch('/api/campaign-adjustments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit_campaign_budget',
            customerId: selectedCustomer,
            budgetResourceName: campaign.budgetResourceName,
            dailyBudgetMicros,
          }),
        }).then(async res => {
          if (!res.ok) {
            const d = await res.json() as { error?: string }
            throw new Error(d.error ?? 'Budget update failed')
          }
          setCampaigns(prev => prev.map(c => c.campaignId === campaign.campaignId ? { ...c, dailyBudgetMicros } : c))
        })
      )
    )

    const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
    if (failed) throw failed.reason
  }

  return (
    <AppShell>
      <div className="space-y-5 pb-24">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campaign Adjustment</h1>
          <p className="text-xs text-gray-400 mt-0.5">แก้ไข campaigns ทุกประเภทใน Google Ads</p>
        </div>

        {/* Account selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
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
            onClick={() => selectedCustomer && loadCampaigns(selectedCustomer)}
            disabled={campaignsLoading || !selectedCustomer}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', campaignsLoading && 'animate-spin')}/>รีเฟรช
          </button>
        </div>

        {/* Campaign checklist */}
        {selectedCustomer && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900">Campaigns</span>
                {campaigns.length > 0 && (
                  <span className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-500 rounded-full">
                    {visibleCampaigns.length === campaigns.length ? campaigns.length : `${visibleCampaigns.length}/${campaigns.length}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Select All</button>
                <span className="text-gray-300">·</span>
                <button onClick={deselectAll} className="text-xs text-gray-500 hover:text-gray-700">Deselect All</button>
              </div>
            </div>

            {/* Filter row: name search + status */}
            {campaigns.length > 0 && (
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2"/>
                  <input
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    placeholder="ค้นหาชื่อ campaign..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {filterText && (
                    <button onClick={() => setFilterText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {(['ALL', 'ENABLED', 'PAUSED'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={cn(
                        'px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors',
                        statusFilter === s
                          ? s === 'ENABLED' ? 'bg-emerald-600 border-emerald-600 text-white'
                            : s === 'PAUSED' ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-gray-800 border-gray-800 text-white'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      {s === 'ALL' ? 'ทั้งหมด' : s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {campaignsLoading && (
              <div className="flex items-center gap-2 px-4 py-6 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin"/>กำลังโหลด campaigns...
              </div>
            )}

            {!campaignsLoading && campaigns.length === 0 && selectedCustomer && (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">ไม่พบ campaigns</div>
            )}

            {!campaignsLoading && campaigns.length > 0 && visibleCampaigns.length === 0 && (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">ไม่มี campaign ตรงกับ filter — ลองแก้คำค้นหรือเปลี่ยน status</div>
            )}

            <div className="divide-y divide-gray-50">
              {visibleCampaigns.map(c => {
                const selected = selectedIds.has(c.campaignId)
                const toggling = statusTogglingIds.has(c.campaignId)
                return (
                  <label key={c.campaignId} className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors', selected && 'bg-blue-50/40')}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(c.campaignId)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{c.campaignName}</span>
                    </span>
                    <TypeBadge type={c.type}/>
                    <span className={cn('px-2 py-0.5 text-[11px] font-semibold rounded-full', c.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {toggling ? <Loader2 className="w-3 h-3 animate-spin inline"/> : c.status}
                    </span>
                    <span className="text-[11px] text-gray-400">฿{(c.dailyBudgetMicros / 1_000_000).toLocaleString()}/day</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selectedCampaigns.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600 font-medium">
              เลือก {selectedCampaigns.length} campaigns:
            </span>
            <div className="flex flex-wrap gap-2 flex-1">
              {selectedCampaigns.map(c => (
                <span key={c.campaignId} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full">
                  {c.campaignName}
                  <button onClick={() => toggleSelect(c.campaignId)} className="hover:text-blue-900 ml-0.5"><X className="w-3 h-3"/></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {statusResult && (
                <span className={cn('text-xs font-medium', statusResult.ok ? 'text-emerald-600' : 'text-red-600')}>{statusResult.message}</span>
              )}
              <button
                onClick={() => requestToggleStatus('ENABLED')}
                disabled={statusTogglingIds.size > 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <ToggleRight className="w-3.5 h-3.5"/>Enable All
              </button>
              <button
                onClick={() => requestToggleStatus('PAUSED')}
                disabled={statusTogglingIds.size > 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <ToggleLeft className="w-3.5 h-3.5"/>Pause All
              </button>
              <button
                onClick={() => setShowBudgetModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 rounded-lg transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5"/>Adjust Budget
              </button>
            </div>
          </div>
        )}

        {/* Campaign tabs + editors */}
        {selectedCampaigns.length > 0 && (
          <div className="space-y-4">
            {/* Tab bar */}
            <div className="flex flex-wrap gap-1 border-b border-gray-200">
              {selectedCampaigns.map(c => (
                <button
                  key={c.campaignId}
                  onClick={() => setActiveTabId(c.campaignId)}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px',
                    activeTabId === c.campaignId
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {(() => { const meta = TYPE_META[c.type]; return <meta.Icon className="w-3.5 h-3.5"/>})()}
                    <span className="truncate max-w-[140px]">{c.campaignName}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Active tab content */}
            {activeTabId && (() => {
              const campaign = selectedCampaigns.find(c => c.campaignId === activeTabId)
              if (!campaign) return null
              return (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <TypeBadge type={campaign.type}/>
                    <span className="font-semibold text-gray-900">{campaign.campaignName}</span>
                    <span className={cn('px-2 py-0.5 text-[11px] font-semibold rounded-full', campaign.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {campaign.status}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">฿{(campaign.dailyBudgetMicros / 1_000_000).toLocaleString()}/day</span>
                  </div>
                  <CampaignEditorPanel campaign={campaign} customerId={selectedCustomer}/>
                  {/* Deeper levels — bidding, ad groups, keywords, extensions, audiences,
                      PMax images — every push goes through the reapprove modal.
                      Keyed by campaign so form/AI state resets when switching tabs. */}
                  <BiddingSection key={`bid-${campaign.campaignId}`} campaign={campaign} customerId={selectedCustomer} confirm={setPendingConfirm}/>
                  {(campaign.type === 'SEARCH' || campaign.type === 'DISPLAY') && (
                    <AdGroupBidsSection key={`ag-${campaign.campaignId}`} campaign={campaign} customerId={selectedCustomer} confirm={setPendingConfirm}/>
                  )}
                  {campaign.type === 'SEARCH' && (
                    <KeywordsSection key={`kw-${campaign.campaignId}`} campaign={campaign} customerId={selectedCustomer} confirm={setPendingConfirm}/>
                  )}
                  {(campaign.type === 'SEARCH' || campaign.type === 'DISPLAY' || campaign.type === 'PERFORMANCE_MAX' || campaign.type === 'DEMAND_GEN') && (
                    <ExtensionsSection key={`ext-${campaign.campaignId}`} campaign={campaign} customerId={selectedCustomer} confirm={setPendingConfirm}/>
                  )}
                  {campaign.type !== 'PERFORMANCE_MAX' && (
                    <AudienceSection key={`aud-${campaign.campaignId}`} campaign={campaign} customerId={selectedCustomer} confirm={setPendingConfirm}/>
                  )}
                  {campaign.type === 'PERFORMANCE_MAX' && (
                    <AssetGroupImagesSection key={`img-${campaign.campaignId}`} campaign={campaign} customerId={selectedCustomer} confirm={setPendingConfirm}/>
                  )}
                  {campaign.type === 'PERFORMANCE_MAX' && (
                    <NewAssetGroupSection key={`newag-${campaign.campaignId}`} campaign={campaign} customerId={selectedCustomer} confirm={setPendingConfirm}/>
                  )}
                </div>
              )
            })()}
          </div>
        )}

      </div>

      {/* Budget modal */}
      {showBudgetModal && (
        <BudgetModal
          campaigns={selectedCampaigns}
          onClose={() => setShowBudgetModal(false)}
          onApply={applyBudgetToSelected}
        />
      )}

      {/* Reapprove modal — every status/bidding/keyword push passes through here */}
      {pendingConfirm && (
        <ConfirmActionModal pending={pendingConfirm} onClose={() => setPendingConfirm(null)}/>
      )}
    </AppShell>
  )
}

export default function CampaignEditorPageWrapper() {
  return <Suspense><CampaignEditorPage /></Suspense>
}
