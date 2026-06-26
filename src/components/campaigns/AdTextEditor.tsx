'use client'

import React, { useRef, useState } from 'react'
import { Plus, X, Image as ImageIcon, Upload, CheckCircle2, AlertTriangle, Link, Phone, List, Tag, ChevronDown, ChevronUp } from 'lucide-react'
import type { CampaignBlueprintItem, RsaAdCopy, PMaxAssetGroup, DisplayAdCopy, AdGroup, AdCopy } from '@/types'
import { cn } from '@/lib/utils'

// ─── Char Limits ───────────────────────────────────────────────────────────────
const H_MAX = 30
const D_MAX = 90
const LH_MAX = 90
const BIZ_MAX = 25
const PATH_MAX = 15

// ─── Ad Strength ──────────────────────────────────────────────────────────────

type StrengthLevel = 'Poor' | 'Average' | 'Good' | 'Excellent'

function calcAdStrength(headlines: string[], descriptions: string[]): StrengthLevel {
  const h = headlines.filter(Boolean).length
  const d = descriptions.filter(Boolean).length
  if (h >= 10 && d >= 3) return 'Excellent'
  if (h >= 7  && d >= 3) return 'Good'
  if (h >= 5  && d >= 2) return 'Average'
  return 'Poor'
}

function AdStrengthBar({ headlines, descriptions }: { headlines: string[]; descriptions: string[] }) {
  const level = calcAdStrength(headlines, descriptions)
  const levels: StrengthLevel[] = ['Poor', 'Average', 'Good', 'Excellent']
  const idx = levels.indexOf(level)
  const colors: Record<StrengthLevel, string> = {
    Poor:      'bg-red-500',
    Average:   'bg-amber-400',
    Good:      'bg-blue-500',
    Excellent: 'bg-emerald-500',
  }
  const textColors: Record<StrengthLevel, string> = {
    Poor:      'text-red-600',
    Average:   'text-amber-600',
    Good:      'text-blue-600',
    Excellent: 'text-emerald-600',
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {levels.map((l, i) => (
          <div
            key={l}
            className={cn(
              'h-1.5 w-8 rounded-full transition-colors',
              i <= idx ? colors[level] : 'bg-gray-200'
            )}
          />
        ))}
      </div>
      <span className={cn('text-xs font-semibold', textColors[level])}>
        Ad Strength: {level}
        {level === 'Excellent' && <CheckCircle2 className="inline w-3 h-3 ml-1" />}
      </span>
    </div>
  )
}

// ─── Char Counter Input ────────────────────────────────────────────────────────

function CharInput({
  value,
  onChange,
  maxLen,
  placeholder,
  multiline = false,
}: {
  value: string
  onChange: (v: string) => void
  maxLen: number
  placeholder?: string
  multiline?: boolean
}) {
  const len = value.length
  const over = len > maxLen
  const warn = !over && len > maxLen * 0.85

  const baseClass = cn(
    'w-full px-3 py-2 pr-14 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors resize-none',
    over  ? 'border-red-400 bg-red-50 focus:ring-red-400'
    : warn ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
    : 'border-gray-200 bg-white focus:ring-blue-500'
  )

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={baseClass}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={baseClass}
        />
      )}
      <span className={cn(
        'absolute right-2 top-2 text-[11px] font-mono tabular-nums select-none',
        over ? 'text-red-500 font-bold' : warn ? 'text-amber-500' : 'text-gray-300'
      )}>
        {len}/{maxLen}
      </span>
    </div>
  )
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ label, count, min, max }: { label: string; count: number; min?: number; max?: number }) {
  const underMin = min !== undefined && count < min
  const overMax  = max !== undefined && count > max
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <span className={cn(
        'text-[11px] font-medium px-1.5 py-0.5 rounded-full',
        underMin || overMax ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
      )}>
        {count}{max ? `/${max}` : ''}
        {min && count < min ? ` (min ${min})` : ''}
      </span>
    </div>
  )
}

// ─── Image upload slot (with real API upload) ─────────────────────────────────

// Google Ads PMax actual requirements
// Landscape: min 1, max 20 | Square: min 1, max 20 | Portrait: optional max 20
// Logo (1200×1200): min 1, max 5 | Square Logo (128×128): optional max 5
const IMAGE_SPECS: Record<string, { label: string; size: string; ratio: string; required: boolean; min: number; max: number }> = {
  MARKETING_IMAGE:          { label: 'Landscape',     size: '1200×628',   ratio: '1.91:1', required: true,  min: 1, max: 20 },
  SQUARE_MARKETING_IMAGE:   { label: 'Square',        size: '1200×1200',  ratio: '1:1',    required: true,  min: 1, max: 20 },
  PORTRAIT_MARKETING_IMAGE: { label: 'Portrait',      size: '960×1200',   ratio: '4:5',    required: false, min: 0, max: 20 },
  LOGO:                     { label: 'Logo',          size: '1200×1200',  ratio: '1:1',    required: true,  min: 1, max: 5  },
  SQUARE_LOGO:              { label: 'Square Logo',   size: '128×128',    ratio: '1:1',    required: false, min: 0, max: 5  },
}

function ImageUploadSlot({
  assetType, imageUrl, onUploaded, compact = false,
}: {
  assetType: string
  imageUrl?: string
  onUploaded: (url: string) => void
  compact?: boolean
}) {
  const spec = IMAGE_SPECS[assetType] ?? { label: assetType, size: '—', ratio: '—', required: false, min: 0, max: 1 }
  const [preview, setPreview] = useState<string | null>(imageUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true); setError(null)
    const localUrl = URL.createObjectURL(file)
    if (!compact) setPreview(localUrl)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd })
      const text = await res.text()
      let data: { url?: string; error?: string }
      try { data = JSON.parse(text) } catch { throw new Error('Upload server error') }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      if (!compact) setPreview(data.url!)
      onUploaded(data.url!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      if (!compact) setPreview(null)
    } finally {
      setUploading(false)
      if (compact && inputRef.current) inputRef.current.value = ''
    }
  }

  // Compact mode: small "+" button for adding additional images
  if (compact) {
    return (
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 hover:border-blue-300 bg-gray-50 hover:bg-blue-50/20 flex items-center justify-center transition-all disabled:opacity-50"
        >
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          {uploading
            ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            : <Plus className="w-5 h-5 text-gray-400" />}
        </button>
        {error && <p className="text-[9px] text-red-500 mt-1 text-center max-w-[64px]">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-all group',
          preview ? 'border-emerald-300 bg-emerald-50/20' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/20'
        )}
        style={{ aspectRatio: spec.ratio.replace(':', '/') }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : preview ? (
          <>
            <img src={preview} alt={spec.label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <div className="text-white text-xs font-medium flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> เปลี่ยนรูป</div>
            </div>
            <div className="absolute top-1.5 right-1.5 bg-emerald-500 rounded-full p-0.5">
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-400">
            <ImageIcon className="w-6 h-6" />
            <span className="text-[10px] font-medium">คลิกเพื่ออัปโหลด</span>
            <span className="text-[9px] text-gray-300">{spec.size}</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="text-xs font-semibold text-gray-700">
          {spec.label} {spec.required && <span className="text-red-400">*</span>}
        </p>
        <p className="text-[10px] text-gray-400">{spec.size} · {spec.ratio}</p>
        {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
      </div>
    </div>
  )
}

// ─── Extensions Editor ────────────────────────────────────────────────────────

type Sitelink = { text: string; description1: string; description2: string; finalUrl: string }
type StructuredSnippet = { header: string; values: string[] }

function ExtensionsEditor({
  sitelinks = [], callouts = [], structuredSnippets = [], phoneNumbers = [],
  onChange,
}: {
  sitelinks?: Sitelink[]
  callouts?: string[]
  structuredSnippets?: StructuredSnippet[]
  phoneNumbers?: string[]
  onChange: (patch: { sitelinks?: Sitelink[]; callouts?: string[]; structuredSnippets?: StructuredSnippet[]; phoneNumbers?: string[] }) => void
}) {
  const [open, setOpen] = useState(false)

  function updateSitelink(i: number, field: keyof Sitelink, val: string) {
    const next = sitelinks.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
    onChange({ sitelinks: next })
  }
  function addSitelink() {
    onChange({ sitelinks: [...sitelinks, { text: '', description1: '', description2: '', finalUrl: '' }] })
  }
  function removeSitelink(i: number) {
    onChange({ sitelinks: sitelinks.filter((_, idx) => idx !== i) })
  }

  function updateCallout(i: number, val: string) {
    const next = callouts.map((c, idx) => idx === i ? val : c)
    onChange({ callouts: next })
  }
  function addCallout() { onChange({ callouts: [...callouts, ''] }) }
  function removeCallout(i: number) { onChange({ callouts: callouts.filter((_, idx) => idx !== i) }) }

  function updateSnippetValue(si: number, vi: number, val: string) {
    const next = structuredSnippets.map((s, idx) => idx !== si ? s : { ...s, values: s.values.map((v, ji) => ji === vi ? val : v) })
    onChange({ structuredSnippets: next })
  }
  function addSnippet() { onChange({ structuredSnippets: [...structuredSnippets, { header: 'บริการ', values: ['', '', ''] }] }) }
  function removeSnippet(i: number) { onChange({ structuredSnippets: structuredSnippets.filter((_, idx) => idx !== i) }) }

  const total = sitelinks.length + callouts.length + structuredSnippets.length + phoneNumbers.length

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Ad Extensions</span>
          {total > 0 && (
            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
              {total} รายการ
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-5">

          {/* Sitelinks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Link className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Sitelinks</p>
                <span className="text-[10px] text-gray-400">≤4 | text ≤25 chars</span>
              </div>
              {sitelinks.length < 4 && (
                <button onClick={addSitelink} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> เพิ่ม
                </button>
              )}
            </div>
            <div className="space-y-3">
              {sitelinks.map((s, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <CharInput value={s.text} onChange={v => updateSitelink(i, 'text', v)} maxLen={25} placeholder="Sitelink text" />
                    </div>
                    <button onClick={() => removeSitelink(i)} className="p-1 text-gray-300 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <CharInput value={s.description1} onChange={v => updateSitelink(i, 'description1', v)} maxLen={35} placeholder="Description line 1 (≤35)" />
                  <CharInput value={s.description2} onChange={v => updateSitelink(i, 'description2', v)} maxLen={35} placeholder="Description line 2 (≤35)" />
                  <input value={s.finalUrl} onChange={e => updateSitelink(i, 'finalUrl', e.target.value)}
                    placeholder="URL" className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              ))}
              {sitelinks.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">ยังไม่มี Sitelink — ช่วยเพิ่ม CTR ได้มาก</p>
              )}
            </div>
          </div>

          {/* Callouts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-purple-500" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Callouts</p>
                <span className="text-[10px] text-gray-400">≤25 chars each | min 6</span>
              </div>
              <button onClick={addCallout} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> เพิ่ม
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {callouts.map((c, i) => (
                <div key={i} className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1">
                  <input value={c} onChange={e => updateCallout(i, e.target.value)}
                    placeholder="callout text"
                    className="text-xs bg-transparent focus:outline-none text-purple-800 w-28" />
                  <span className={cn('text-[9px] font-mono', c.length > 25 ? 'text-red-500' : 'text-purple-400')}>{c.length}/25</span>
                  <button onClick={() => removeCallout(i)} className="text-purple-300 hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {callouts.length === 0 && (
                <p className="text-xs text-gray-400 py-1">เช่น "รับประกัน 100%", "ฟรีปรึกษา", "ส่งด่วน 24 ชม."</p>
              )}
            </div>
          </div>

          {/* Structured Snippets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <List className="w-3.5 h-3.5 text-teal-500" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Structured Snippets</p>
              </div>
              {structuredSnippets.length < 3 && (
                <button onClick={addSnippet} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> เพิ่ม
                </button>
              )}
            </div>
            <div className="space-y-3">
              {structuredSnippets.map((s, si) => (
                <div key={si} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <select value={s.header} onChange={e => {
                      const next = structuredSnippets.map((x, xi) => xi === si ? { ...x, header: e.target.value } : x)
                      onChange({ structuredSnippets: next })
                    }} className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                      {['บริการ', 'สินค้า', 'แบรนด์', 'หลักสูตร', 'จุดหมาย', 'ประกันภัย', 'ย่านที่ตั้ง', 'โมเดล', 'ประเภทสินค้า'].map(h => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                    <button onClick={() => removeSnippet(si)} className="ml-auto text-gray-300 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.values.map((v, vi) => (
                      <input key={vi} value={v} onChange={e => updateSnippetValue(si, vi, e.target.value)}
                        placeholder={`ค่า ${vi + 1}`}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none w-28" />
                    ))}
                    {s.values.length < 10 && (
                      <button onClick={() => {
                        const next = structuredSnippets.map((x, xi) => xi === si ? { ...x, values: [...x.values, ''] } : x)
                        onChange({ structuredSnippets: next })
                      }} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 border border-dashed border-blue-300 rounded">
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phone Numbers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Call Extensions</p>
              </div>
              <button onClick={() => onChange({ phoneNumbers: [...phoneNumbers, ''] })}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> เพิ่ม
              </button>
            </div>
            <div className="space-y-2">
              {phoneNumbers.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <input value={p} onChange={e => {
                    const next = phoneNumbers.map((x, xi) => xi === i ? e.target.value : x)
                    onChange({ phoneNumbers: next })
                  }} placeholder="เช่น +66-2-000-0000"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  <button onClick={() => onChange({ phoneNumbers: phoneNumbers.filter((_, xi) => xi !== i) })}
                    className="text-gray-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {phoneNumbers.length === 0 && (
                <p className="text-xs text-gray-400">เพิ่มเบอร์โทรเพื่อให้ผู้ใช้โทรหาได้จากโฆษณาโดยตรง</p>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Google Search Ad Preview ──────────────────────────────────────────────────

function GoogleSearchPreview({
  headlines,
  descriptions,
  displayPath1,
  displayPath2,
  finalUrl,
}: {
  headlines: string[]
  descriptions: string[]
  displayPath1?: string
  displayPath2?: string
  finalUrl?: string
}) {
  const filled = headlines.filter(Boolean)
  const filledDesc = descriptions.filter(Boolean)
  if (filled.length === 0) return null

  const h1 = filled[0] ?? ''
  const h2 = filled[1] ?? ''
  const h3 = filled[2] ?? ''
  const title = [h1, h2, h3].filter(Boolean).join(' | ')
  const desc = filledDesc.slice(0, 2).join(' ')

  const domain = finalUrl
    ? (() => { try { return new URL(finalUrl).hostname } catch { return finalUrl } })()
    : 'www.yourwebsite.com'

  const pathParts = [domain, displayPath1, displayPath2].filter(Boolean).join('/')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="max-w-full">
        {/* Sponsored tag */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] border border-gray-400 text-gray-500 px-1 py-0.5 rounded font-medium leading-none">Sponsored</span>
          <span className="text-[11px] text-gray-500 truncate">{pathParts}</span>
        </div>
        {/* Title */}
        <p className="text-base font-normal text-blue-700 leading-snug hover:underline cursor-pointer line-clamp-2">{title || 'Your headline will appear here'}</p>
        {/* Description */}
        {desc ? (
          <p className="text-xs text-gray-700 mt-0.5 leading-snug line-clamp-3">{desc}</p>
        ) : (
          <p className="text-xs text-gray-400 mt-0.5 italic">Description will appear here...</p>
        )}
      </div>
    </div>
  )
}

// ─── Emotion tag helpers ───────────────────────────────────────────────────────

const EMOTION_PATTERNS: { label: string; color: string; patterns: RegExp[] }[] = [
  { label: 'CTA',          color: 'bg-blue-100 text-blue-700',    patterns: [/ติดต่อ|โทร|ลงทะเบียน|สมัคร|เริ่ม|ดูเลย|ทดลอง|คลิก|รับ|ขอ|จอง|ซื้อ|order|contact|sign.?up|get.?started|try|buy|book|call/i] },
  { label: 'Sale',         color: 'bg-red-100 text-red-700',      patterns: [/ลด|ฟรี|โปร|ราคา|ส่วนลด|บาท|฿|\d+%|discount|free|promo|sale|offer|price/i] },
  { label: 'Inspirational',color: 'bg-purple-100 text-purple-700',patterns: [/เติบโต|ความสำเร็จ|เปลี่ยน|ดีกว่า|ยกระดับ|พัฒนา|grow|success|transform|better|elevate|improve/i] },
  { label: 'Informational',color: 'bg-gray-100 text-gray-600',    patterns: [/คือ|ได้แก่|ประกอบด้วย|มี|ให้บริการ|includes|features|provides|offers|what is|how to/i] },
]

function detectEmotion(text: string): { label: string; color: string } | null {
  for (const e of EMOTION_PATTERNS) {
    if (e.patterns.some(p => p.test(text))) return { label: e.label, color: e.color }
  }
  return null
}

// ─── RSA Editor ───────────────────────────────────────────────────────────────

function RsaEditor({
  rsa,
  label,
  onChange,
  allHeadlines = [],
  allDescriptions = [],
}: {
  rsa: RsaAdCopy
  label: string
  onChange: (updated: RsaAdCopy) => void
  allHeadlines?: string[]   // headlines from other ads in the same adgroup (for dup check)
  allDescriptions?: string[]
}) {

  function updateHeadline(i: number, val: string) {
    const next = [...rsa.headlines]; next[i] = val
    onChange({ ...rsa, headlines: next })
  }
  function addHeadline() {
    if (rsa.headlines.length >= 15) return
    onChange({ ...rsa, headlines: [...rsa.headlines, ''] })
  }
  function removeHeadline(i: number) {
    if (rsa.headlines.length <= 3) return
    onChange({ ...rsa, headlines: rsa.headlines.filter((_, idx) => idx !== i) })
  }
  function updateDescription(i: number, val: string) {
    const next = [...rsa.descriptions]; next[i] = val
    onChange({ ...rsa, descriptions: next })
  }
  function addDescription() {
    if (rsa.descriptions.length >= 4) return
    onChange({ ...rsa, descriptions: [...rsa.descriptions, ''] })
  }
  function removeDescription(i: number) {
    if (rsa.descriptions.length <= 2) return
    onChange({ ...rsa, descriptions: rsa.descriptions.filter((_, idx) => idx !== i) })
  }

  const hViolations = rsa.headlines.map((h, i) => h.length > H_MAX ? { i, text: h, len: h.length } : null).filter(Boolean) as { i: number; text: string; len: number }[]
  const dViolations = rsa.descriptions.map((d, i) => d.length > D_MAX ? { i, text: d, len: d.length } : null).filter(Boolean) as { i: number; text: string; len: number }[]

  // Duplicate detection — within this ad and across other ads
  const filledH = rsa.headlines.filter(Boolean)
  const filledD = rsa.descriptions.filter(Boolean)
  const dupHSet = new Set<string>()
  const intraHDups = new Set<number>()
  const crossHDups = new Set<number>()
  filledH.forEach(h => { if (filledH.filter(x => x === h).length > 1) intraHDups.add(rsa.headlines.indexOf(h)) })
  rsa.headlines.forEach((h, i) => { if (h && allHeadlines.includes(h)) crossHDups.add(i) })
  const dupDSet = new Set<string>()
  const intraDDups = new Set<number>()
  const crossDDups = new Set<number>()
  filledD.forEach(d => { if (filledD.filter(x => x === d).length > 1) intraDDups.add(rsa.descriptions.indexOf(d)) })
  rsa.descriptions.forEach((d, i) => { if (d && allDescriptions.includes(d)) crossDDups.add(i) })
  void dupHSet; void dupDSet  // suppress unused warning

  const isValid = rsa.headlines.length >= 3 && rsa.headlines.length <= 15
    && rsa.descriptions.length >= 2 && rsa.descriptions.length <= 4
    && hViolations.length === 0 && dViolations.length === 0
  const isExcellent = rsa.headlines.filter(Boolean).length >= 10 && rsa.descriptions.filter(Boolean).length >= 3 && isValid

  const hasDups = intraHDups.size > 0 || crossHDups.size > 0 || intraDDups.size > 0 || crossDDups.size > 0

  // Emotion coverage check
  const emotionCoverage = new Set(rsa.headlines.map(h => detectEmotion(h)?.label).filter(Boolean))
  const coverageGaps = ['CTA', 'Sale', 'Inspirational', 'Informational'].filter(e => !emotionCoverage.has(e))

  return (
    <div className={cn('border rounded-xl overflow-hidden', isExcellent && !hasDups ? 'border-emerald-300' : isValid ? 'border-gray-200' : 'border-red-300')}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <AdStrengthBar headlines={rsa.headlines} descriptions={rsa.descriptions} />
      </div>

      {/* Violations + Duplicates panel */}
      {(hViolations.length > 0 || dViolations.length > 0 || hasDups || coverageGaps.length > 0) && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 space-y-0.5">
          {hViolations.map(v => (
            <p key={v.i} className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" /> Headline {v.i + 1} เกิน {H_MAX} chars ({v.len})
            </p>
          ))}
          {dViolations.map(v => (
            <p key={v.i} className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" /> Description {v.i + 1} เกิน {D_MAX} chars ({v.len})
            </p>
          ))}
          {(intraHDups.size > 0 || intraDDups.size > 0) && (
            <p className="text-[11px] text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" /> มี Headlines/Descriptions ซ้ำกันใน Ad นี้
            </p>
          )}
          {(crossHDups.size > 0 || crossDDups.size > 0) && (
            <p className="text-[11px] text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" /> มี Headlines/Descriptions ซ้ำกับ Ad อื่นใน Ad Group
            </p>
          )}
          {coverageGaps.length > 0 && (
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              ⚡ ยังขาด emotion: {coverageGaps.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Main content — 2 columns: edit left, preview right */}
      <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

        {/* LEFT — edit fields */}
        <div className="flex-1 min-w-0 p-4 space-y-4">
          {/* Headlines */}
          <div>
            <SectionLabel label="Headlines" count={rsa.headlines.length} min={3} max={15} />
            <div className="space-y-1.5">
              {rsa.headlines.map((h, i) => {
                const emotion = detectEmotion(h)
                const isDup = intraHDups.has(i) || crossHDups.has(i)
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-300 w-4 text-right shrink-0">{i + 1}</span>
                    <div className={cn('flex-1', isDup && 'ring-1 ring-amber-300 rounded-lg')}>
                      <CharInput value={h} onChange={v => updateHeadline(i, v)} maxLen={H_MAX} placeholder={`Headline ${i + 1}`} />
                    </div>
                    {emotion && (
                      <span className={cn('text-[9px] font-semibold px-1 py-0.5 rounded shrink-0', emotion.color)}>{emotion.label}</span>
                    )}
                    {rsa.headlines.length > 3 && (
                      <button onClick={() => removeHeadline(i)} className="p-1 text-gray-200 hover:text-red-400 transition-colors shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {rsa.headlines.length < 15 && (
              <button onClick={addHeadline} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> Add headline
              </button>
            )}
          </div>

          {/* Descriptions */}
          <div>
            <SectionLabel label="Descriptions" count={rsa.descriptions.length} min={2} max={4} />
            <div className="space-y-1.5">
              {rsa.descriptions.map((d, i) => {
                const isDup = intraDDups.has(i) || crossDDups.has(i)
                return (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-[10px] text-gray-300 w-4 text-right mt-2.5 shrink-0">{i + 1}</span>
                    <div className={cn('flex-1', isDup && 'ring-1 ring-amber-300 rounded-lg')}>
                      <CharInput value={d} onChange={v => updateDescription(i, v)} maxLen={D_MAX} placeholder={`Description ${i + 1}`} multiline />
                    </div>
                    {rsa.descriptions.length > 2 && (
                      <button onClick={() => removeDescription(i)} className="p-1 mt-2 text-gray-200 hover:text-red-400 transition-colors shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {rsa.descriptions.length < 4 && (
              <button onClick={addDescription} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> Add description
              </button>
            )}
          </div>

          {/* Display Paths */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Display Paths (URL suffix)</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <CharInput
                  value={rsa.displayPath1 ?? ''}
                  onChange={v => onChange({ ...rsa, displayPath1: v.slice(0, PATH_MAX) })}
                  maxLen={PATH_MAX}
                  placeholder="path1 เช่น google-ads"
                />
              </div>
              <div className="flex-1">
                <CharInput
                  value={rsa.displayPath2 ?? ''}
                  onChange={v => onChange({ ...rsa, displayPath2: v.slice(0, PATH_MAX) })}
                  maxLen={PATH_MAX}
                  placeholder="path2 เช่น ราคา"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">URL จะแสดงเป็น: domain.com/{rsa.displayPath1 || 'path1'}/{rsa.displayPath2 || 'path2'} — เลือก keyword ที่แตกต่างจาก headline</p>
          </div>
        </div>

        {/* RIGHT — Google Search Preview */}
        <div className="w-full lg:w-80 shrink-0 p-4 bg-gray-50/50">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Preview — Google Search</p>
          <GoogleSearchPreview
            headlines={rsa.headlines}
            descriptions={rsa.descriptions}
            displayPath1={rsa.displayPath1}
            displayPath2={rsa.displayPath2}
            finalUrl={rsa.finalUrl}
          />
          {/* Emotion coverage legend */}
          <div className="mt-3">
            <p className="text-[10px] text-gray-400 mb-1.5 font-medium">Emotion Coverage</p>
            <div className="flex flex-wrap gap-1">
              {EMOTION_PATTERNS.map(e => (
                <span key={e.label} className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', emotionCoverage.has(e.label) ? e.color : 'bg-gray-100 text-gray-300')}>
                  {emotionCoverage.has(e.label) ? '✓' : '○'} {e.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PMax Asset Group Editor ───────────────────────────────────────────────────

const PMAX_IMAGE_SLOTS: { assetType: string; label: string; required: boolean; min: number; max: number }[] = [
  { assetType: 'MARKETING_IMAGE',          label: 'Landscape',   required: true,  min: 1, max: 20 },
  { assetType: 'SQUARE_MARKETING_IMAGE',   label: 'Square',      required: true,  min: 1, max: 20 },
  { assetType: 'PORTRAIT_MARKETING_IMAGE', label: 'Portrait',    required: false, min: 0, max: 20 },
  { assetType: 'LOGO',                     label: 'Logo',        required: true,  min: 1, max: 5  },
  { assetType: 'SQUARE_LOGO',              label: 'Square Logo', required: false, min: 0, max: 5  },
]

function PMaxAssetGroupEditor({
  group,
  onChange,
}: {
  group: PMaxAssetGroup
  onChange: (updated: PMaxAssetGroup) => void
}) {
  function updateHeadline(i: number, val: string) {
    const next = [...group.headlines]; next[i] = val; onChange({ ...group, headlines: next })
  }
  function addHeadline() {
    if (group.headlines.length >= 15) return
    onChange({ ...group, headlines: [...group.headlines, ''] })
  }
  function removeHeadline(i: number) {
    if (group.headlines.length <= 3) return
    onChange({ ...group, headlines: group.headlines.filter((_, idx) => idx !== i) })
  }
  function updateLongHeadline(i: number, val: string) {
    const next = [...group.longHeadlines]; next[i] = val; onChange({ ...group, longHeadlines: next })
  }
  function addLongHeadline() {
    if (group.longHeadlines.length >= 5) return
    onChange({ ...group, longHeadlines: [...group.longHeadlines, ''] })
  }
  function removeLongHeadline(i: number) {
    if (group.longHeadlines.length <= 1) return
    onChange({ ...group, longHeadlines: group.longHeadlines.filter((_, idx) => idx !== i) })
  }
  function updateDescription(i: number, val: string) {
    const next = [...group.descriptions]; next[i] = val; onChange({ ...group, descriptions: next })
  }
  function addDescription() {
    if (group.descriptions.length >= 4) return
    onChange({ ...group, descriptions: [...group.descriptions, ''] })
  }
  function removeDescription(i: number) {
    if (group.descriptions.length <= 2) return
    onChange({ ...group, descriptions: group.descriptions.filter((_, idx) => idx !== i) })
  }

  function handleImageAdded(assetType: string, url: string) {
    const spec = IMAGE_SPECS[assetType]
    const current = (group.imageAssets ?? []).filter(a => a.assetType === assetType)
    if (spec && current.length >= spec.max) return
    const updated = [...(group.imageAssets ?? []), { assetType: assetType as PMaxAssetGroup['imageAssets'][0]['assetType'], description: assetType.replace(/_/g, ' '), imageUrl: url }]
    onChange({ ...group, imageAssets: updated })
  }

  function handleImageRemoved(assetType: string, removeIdx: number) {
    let count = 0
    const updated = (group.imageAssets ?? []).filter(a => {
      if (a.assetType !== assetType) return true
      const keep = count !== removeIdx
      count++
      return keep
    })
    onChange({ ...group, imageAssets: updated })
  }

  const safeHeadlines     = group.headlines     ?? []
  const safeLongHeadlines = group.longHeadlines ?? []
  const safeDescriptions  = group.descriptions  ?? []
  const safeBusinessName  = group.businessName  ?? ''
  const safeImageAssets   = group.imageAssets   ?? []

  const missing = PMAX_IMAGE_SLOTS.filter(s => {
    const count = safeImageAssets.filter(a => a.assetType === s.assetType && a.imageUrl).length
    return count < s.min
  })
  const isValid =
    safeHeadlines.length >= 3 && safeHeadlines.length <= 15 &&
    safeLongHeadlines.length >= 1 && safeLongHeadlines.length <= 5 &&
    safeDescriptions.length >= 2 && safeDescriptions.length <= 4 &&
    safeBusinessName.length <= BIZ_MAX && missing.length === 0

  return (
    <div className={cn('border rounded-xl overflow-hidden', isValid ? 'border-emerald-200' : 'border-amber-200')}>
      {/* header */}
      <div className={cn('px-4 py-2.5 flex items-center justify-between', isValid ? 'bg-emerald-50' : 'bg-amber-50')}>
        <p className="text-sm font-semibold text-gray-800">{group.assetGroupName}</p>
        {isValid
          ? <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
          : <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {missing.length > 0 ? `ขาดรูป ${missing.map(m => m.label).join(', ')}` : 'ไม่ครบ'}</span>
        }
      </div>

      {/* 2-column body */}
      <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

        {/* LEFT — text assets */}
        <div className="flex-1 p-4 space-y-4">
          {/* Business Name + Final URL */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel label="Business Name" count={safeBusinessName.length} max={BIZ_MAX} />
              <CharInput value={safeBusinessName} onChange={v => onChange({ ...group, businessName: v })} maxLen={BIZ_MAX} placeholder="ชื่อธุรกิจ" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Final URL</p>
              <input value={group.finalUrl ?? ''} onChange={e => onChange({ ...group, finalUrl: e.target.value })}
                placeholder="https://example.com" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>

          {/* Headlines */}
          <div>
            <SectionLabel label="Headlines" count={safeHeadlines.length} min={3} max={15} />
            <div className="space-y-1.5">
              {safeHeadlines.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-300 w-4 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1">
                    <CharInput value={h} onChange={v => updateHeadline(i, v)} maxLen={H_MAX} placeholder={`Headline ${i + 1} (≤${H_MAX})`} />
                  </div>
                  {safeHeadlines.length > 3 && (
                    <button onClick={() => removeHeadline(i)} className="p-1 text-gray-300 hover:text-red-400 shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {safeHeadlines.length < 15 && (
              <button onClick={addHeadline} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> เพิ่ม headline
              </button>
            )}
          </div>

          {/* Long Headlines */}
          <div>
            <SectionLabel label="Long Headlines" count={safeLongHeadlines.length} min={1} max={5} />
            <div className="space-y-1.5">
              {safeLongHeadlines.map((lh, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-gray-300 w-4 text-right shrink-0 mt-2.5">{i + 1}</span>
                  <div className="flex-1">
                    <CharInput value={lh} onChange={v => updateLongHeadline(i, v)} maxLen={LH_MAX} placeholder={`Long headline ${i + 1} (≤${LH_MAX})`} multiline />
                  </div>
                  {safeLongHeadlines.length > 1 && (
                    <button onClick={() => removeLongHeadline(i)} className="p-1 mt-2 text-gray-300 hover:text-red-400 shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {safeLongHeadlines.length < 5 && (
              <button onClick={addLongHeadline} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> เพิ่ม long headline
              </button>
            )}
          </div>

          {/* Descriptions */}
          <div>
            <SectionLabel label="Descriptions" count={safeDescriptions.length} min={2} max={4} />
            <div className="space-y-1.5">
              {safeDescriptions.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-gray-300 w-4 text-right shrink-0 mt-2.5">{i + 1}</span>
                  <div className="flex-1">
                    <CharInput value={d} onChange={v => updateDescription(i, v)} maxLen={D_MAX} placeholder={`Description ${i + 1} (≤${D_MAX})`} multiline />
                  </div>
                  {safeDescriptions.length > 2 && (
                    <button onClick={() => removeDescription(i)} className="p-1 mt-2 text-gray-300 hover:text-red-400 shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {safeDescriptions.length < 4 && (
              <button onClick={addDescription} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> เพิ่ม description
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — image assets */}
        <div className="w-full lg:w-80 p-4 border-t lg:border-t-0 lg:border-l border-gray-100">
          {missing.length > 0 && (
            <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>ขาดรูป {missing.map(s => `${s.label} (${IMAGE_SPECS[s.assetType]?.size})`).join(', ')}</span>
            </div>
          )}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Image Assets
          </p>
          <div className="space-y-4">
            {PMAX_IMAGE_SLOTS.map(slot => {
              const spec = IMAGE_SPECS[slot.assetType]
              const uploaded = safeImageAssets.filter(a => a.assetType === slot.assetType && a.imageUrl)
              const count = uploaded.length
              const canAdd = count < slot.max
              const meetsMin = count >= slot.min
              return (
                <div key={slot.assetType}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-700">{slot.label} {slot.required && <span className="text-red-400">*</span>}</span>
                      <span className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                        meetsMin ? 'bg-emerald-100 text-emerald-700' : slot.required ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                      )}>
                        {count}/{slot.max}
                      </span>
                    </div>
                    <span className="text-[9px] text-gray-400">{spec?.size} · {spec?.ratio}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uploaded.map((img, imgIdx) => (
                      <div key={imgIdx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-emerald-200 group">
                        <img src={img.imageUrl} alt={slot.label} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleImageRemoved(slot.assetType, imgIdx)}
                          className="absolute top-0.5 right-0.5 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                    {canAdd && (
                      <ImageUploadSlot
                        key={`${slot.assetType}-add-${count}`}
                        assetType={slot.assetType}
                        onUploaded={url => handleImageAdded(slot.assetType, url)}
                        compact
                      />
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1">
                    {slot.required ? `ต้องมีอย่างน้อย ${slot.min} รูป` : 'ไม่บังคับ'} · สูงสุด {slot.max} รูป
                  </p>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">* = จำเป็น | รองรับ JPG, PNG, GIF</p>
        </div>

      </div>
    </div>
  )
}

// ─── Display/DemandGen Ad Editor ───────────────────────────────────────────────

function DisplayAdEditor({
  ad,
  onChange,
}: {
  ad: DisplayAdCopy
  onChange: (updated: DisplayAdCopy) => void
}) {
  function updateHeadline(i: number, val: string) {
    const next = [...ad.headlines]; next[i] = val
    onChange({ ...ad, headlines: next })
  }
  function addHeadline() {
    if (ad.headlines.length >= 5) return
    onChange({ ...ad, headlines: [...ad.headlines, ''] })
  }
  function removeHeadline(i: number) {
    if (ad.headlines.length <= 1) return
    onChange({ ...ad, headlines: ad.headlines.filter((_, idx) => idx !== i) })
  }

  function updateDescription(i: number, val: string) {
    const next = [...ad.descriptions]; next[i] = val
    onChange({ ...ad, descriptions: next })
  }
  function addDescription() {
    if (ad.descriptions.length >= 5) return
    onChange({ ...ad, descriptions: [...ad.descriptions, ''] })
  }
  function removeDescription(i: number) {
    if (ad.descriptions.length <= 1) return
    onChange({ ...ad, descriptions: ad.descriptions.filter((_, idx) => idx !== i) })
  }

  const safeH   = ad.headlines     ?? []
  const safeLH  = ad.longHeadlines ?? ['']
  const safeD   = ad.descriptions  ?? []
  const safeBiz = ad.businessName  ?? ''
  const safeIA  = (ad.imageAssets  ?? []) as { assetType: string; description: string; imageUrl?: string }[]

  const isValid =
    safeH.length >= 1 && safeH.length <= 5 &&
    safeLH.length === 1 &&
    safeD.length >= 1 && safeD.length <= 5 &&
    safeBiz.length <= BIZ_MAX &&
    safeH.every(h => h.length <= H_MAX) &&
    safeLH.every(lh => lh.length <= LH_MAX) &&
    safeD.every(d => d.length <= D_MAX)

  return (
    <div className={cn('border rounded-xl p-4 space-y-4', isValid ? 'border-emerald-200' : 'border-red-200')}>
      {/* Business Name */}
      <div>
        <SectionLabel label="Business Name" count={safeBiz.length} max={BIZ_MAX} />
        <CharInput value={safeBiz} onChange={v => onChange({ ...ad, businessName: v })} maxLen={BIZ_MAX} placeholder="Business name" />
      </div>

      {/* Headlines */}
      <div>
        <SectionLabel label="Headlines" count={safeH.length} min={1} max={5} />
        <div className="space-y-2">
          {safeH.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <CharInput value={h} onChange={v => updateHeadline(i, v)} maxLen={H_MAX} placeholder={`Headline ${i + 1}`} />
              </div>
              {safeH.length > 1 && (
                <button onClick={() => removeHeadline(i)} className="p-1.5 text-gray-300 hover:text-red-400 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {safeH.length < 5 && (
          <button onClick={addHeadline} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3 h-3" /> Add headline
          </button>
        )}
      </div>

      {/* Long Headline — exactly 1 required */}
      <div>
        <SectionLabel label="Long Headline (exactly 1 required)" count={safeLH.length} min={1} max={1} />
        <CharInput
          value={safeLH[0] ?? ''}
          onChange={v => onChange({ ...ad, longHeadlines: [v] })}
          maxLen={LH_MAX}
          placeholder="Long headline (≤90 chars)"
          multiline
        />
      </div>

      {/* Descriptions */}
      <div>
        <SectionLabel label="Descriptions" count={safeD.length} min={1} max={5} />
        <div className="space-y-2">
          {safeD.map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <CharInput value={d} onChange={v => updateDescription(i, v)} maxLen={D_MAX} placeholder={`Description ${i + 1}`} multiline />
              </div>
              {safeD.length > 1 && (
                <button onClick={() => removeDescription(i)} className="p-1.5 mt-1 text-gray-300 hover:text-red-400 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {safeD.length < 5 && (
          <button onClick={addDescription} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3 h-3" /> Add description
          </button>
        )}
      </div>

      {/* Image Assets */}
      <div>
        <SectionLabel label="Image Assets" count={safeIA.length} min={3} />
        <div className="grid grid-cols-2 gap-3">
          {safeIA.map((asset, i) => (
            <ImageUploadSlot
              key={i}
              assetType={asset.assetType}
              imageUrl={asset.imageUrl}
              onUploaded={url => {
                const next = safeIA.map((a, idx) => idx === i ? { ...a, imageUrl: url } : a)
                onChange({ ...ad, imageAssets: next })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Search Ad Group Editor ────────────────────────────────────────────────────

function emptyRsa(): RsaAdCopy {
  return { adType: 'RSA', headlines: ['', '', ''], descriptions: ['', ''], finalUrl: '', displayPath1: '', displayPath2: '' }
}

function emptyAdCopy(): AdCopy {
  return { headline1: '', headline2: '', headline3: '', description1: '', description2: '', finalUrl: '', rsa: emptyRsa() }
}

function SearchAdGroupEditor({
  adGroup,
  onChange,
}: {
  adGroup: AdGroup
  onChange: (updated: AdGroup) => void
}) {
  const ads = adGroup.ads.length > 0
    ? adGroup.ads
    : [emptyAdCopy(), emptyAdCopy()]

  function handleRsaChange(adIdx: number, updatedRsa: RsaAdCopy) {
    const base = adGroup.ads.length > 0 ? adGroup.ads : [emptyAdCopy(), emptyAdCopy()]
    const updatedAds = base.map((ad, i) => i !== adIdx ? ad : { ...ad, rsa: updatedRsa })
    onChange({ ...adGroup, ads: updatedAds })
  }

  function addRsa() {
    const base = adGroup.ads.length > 0 ? adGroup.ads : [emptyAdCopy(), emptyAdCopy()]
    onChange({ ...adGroup, ads: [...base, emptyAdCopy()] })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">{adGroup.adGroupName}</p>
        {ads.length < 3 && (
          <button onClick={addRsa} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3 h-3" /> เพิ่ม RSA
          </button>
        )}
      </div>
      {adGroup.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {adGroup.keywords.map((kw, i) => (
            <span key={i} className="text-[11px] bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded">
              {kw} <span className="text-blue-400">[{adGroup.matchTypes?.[i] ?? 'BROAD'}]</span>
            </span>
          ))}
        </div>
      )}

      {ads.map((ad, adIdx) => {
        const rsa = ad.rsa ?? emptyRsa()
        // Collect headlines/descriptions from OTHER ads for duplicate detection
        const otherAdsH = ads.filter((_, i) => i !== adIdx).flatMap(a => (a.rsa ?? emptyRsa()).headlines.filter(Boolean))
        const otherAdsD = ads.filter((_, i) => i !== adIdx).flatMap(a => (a.rsa ?? emptyRsa()).descriptions.filter(Boolean))
        return (
          <RsaEditor
            key={adIdx}
            rsa={rsa}
            label={`RSA Ad ${adIdx + 1}`}
            onChange={(updated) => handleRsaChange(adIdx, updated)}
            allHeadlines={otherAdsH}
            allDescriptions={otherAdsD}
          />
        )
      })}
    </div>
  )
}

// ─── Main Export ───────────────────────────────────────────────────────────────

interface Props {
  campaign: CampaignBlueprintItem
  onChange: (updated: CampaignBlueprintItem) => void
}

export default function AdTextEditor({ campaign, onChange }: Props) {
  // Normalise type — API / blueprints may use different casings or aliases
  const rawType = (campaign.campaignType ?? '').toUpperCase().trim()
  const type =
    rawType === 'SEARCH' || rawType === 'SEM'                                      ? 'SEARCH'          :
    rawType === 'PERFORMANCE_MAX' || rawType === 'PMAX' || rawType === 'PMAX_FEED' ? 'PERFORMANCE_MAX' :
    rawType === 'DISPLAY' || rawType === 'GDN'                                     ? 'DISPLAY'         :
    rawType === 'DEMAND_GEN' || rawType === 'DISCOVERY'                            ? 'DEMAND_GEN'      :
    rawType === 'SHOPPING'                                                         ? 'SHOPPING'        :
    rawType === 'VIDEO' || rawType === 'YOUTUBE'                                   ? 'VIDEO'           :
    rawType === 'APP_CAMPAIGN' || rawType === 'APP'                                ? 'APP_CAMPAIGN'    :
    rawType || 'SEARCH'

  // ── SHOPPING / VIDEO / APP — read-only notice ──────────────────────────────
  if (type === 'SHOPPING') {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <p className="font-semibold mb-1">Shopping Campaign — Product Feed Driven</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-700">
          <li>ไม่มี ad copy — ดึงข้อมูลจาก Merchant Center product feed</li>
          <li>ต้องการ: merchantId, feedLabel</li>
          <li>ตั้งค่าผ่าน Google Merchant Center</li>
        </ul>
      </div>
    )
  }

  if (type === 'VIDEO' || type === 'YOUTUBE') {
    return (
      <div className="p-4 bg-pink-50 border border-pink-200 rounded-xl text-sm text-pink-800">
        <p className="font-semibold mb-1">Video / YouTube Campaign</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs text-pink-700">
          <li>ต้องการ: YouTube video URL</li>
          <li>Headline ≤30 chars, finalUrl required</li>
          <li>อัปโหลดวิดีโอผ่าน YouTube ก่อนตั้งค่า campaign</li>
        </ul>
      </div>
    )
  }

  if (type === 'APP_CAMPAIGN') {
    return (
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800">
        <p className="font-semibold mb-1">App Campaign</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs text-indigo-700">
          <li>Headlines: 2–4 items, each ≤30 chars</li>
          <li>Descriptions: 1–4 items, each ≤90 chars</li>
          <li>ไม่มี ad groups — Google AI จัดการ placement อัตโนมัติ</li>
        </ul>
      </div>
    )
  }

  // ── Shared handlers (declared before any early returns that use them) ─────────
  const handleAssetGroupChange = (idx: number, updated: PMaxAssetGroup) => {
    const assetGroups = campaign.assetGroups ?? []
    const next = assetGroups.map((ag, i) => i === idx ? updated : ag)
    onChange({ ...campaign, assetGroups: next })
  }

  const handleDisplayChange = (agIdx: number, adIdx: number, updated: DisplayAdCopy) => {
    const newAdGroups = (campaign.adGroups ?? []).map((ag, i) => {
      if (i !== agIdx) return ag
      return {
        ...ag,
        ads: ag.ads.map((ad, j) => j !== adIdx ? ad : { ...ad, display: updated }),
      }
    })
    onChange({ ...campaign, adGroups: newAdGroups })
  }

  const handleSearchAdGroupChange = (agIdx: number, updated: AdGroup) => {
    const newAdGroups = (campaign.adGroups ?? []).map((ag, i) => i === agIdx ? updated : ag)
    onChange({ ...campaign, adGroups: newAdGroups })
  }

  // ── PERFORMANCE MAX ──────────────────────────────────────────────────────────
  if (type === 'PERFORMANCE_MAX') {
    const assetGroups = campaign.assetGroups ?? []
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-gray-500 font-medium">PMax uses Asset Groups — no traditional ad groups or keywords</span>
        </div>
        {assetGroups.length === 0 && (
          <p className="text-xs text-red-500">ไม่มี Asset Group — ต้องมีอย่างน้อย 1</p>
        )}
        {assetGroups.map((ag, i) => (
          <PMaxAssetGroupEditor key={i} group={ag} onChange={updated => handleAssetGroupChange(i, updated)} />
        ))}
        <ExtensionsEditor
          sitelinks={campaign.sitelinks}
          callouts={campaign.callouts}
          structuredSnippets={campaign.structuredSnippets}
          phoneNumbers={campaign.phoneNumbers}
          onChange={patch => onChange({ ...campaign, ...patch })}
        />
      </div>
    )
  }

  // ── DISPLAY / DEMAND_GEN ──────────────────────────────────────────────────────
  if (type === 'DISPLAY' || type === 'DEMAND_GEN') {
    return (
      <div className="space-y-6">
        {(campaign.adGroups ?? []).map((ag, agIdx) => (
          <div key={agIdx} className="space-y-3">
            <p className="text-sm font-semibold text-gray-800">{ag.adGroupName}</p>
            {ag.audiences && ag.audiences.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ag.audiences.map((aud, i) => (
                  <span key={i} className="text-[11px] bg-purple-50 border border-purple-200 text-purple-700 px-1.5 py-0.5 rounded">
                    {aud}
                  </span>
                ))}
              </div>
            )}
            {ag.ads.map((ad, adIdx) => {
              const display = ad.display
              if (!display) return (
                <div key={adIdx} className="text-xs text-gray-400 italic px-3 py-2 border border-dashed rounded-lg">
                  ไม่มีข้อมูล Display Ad
                </div>
              )
              return (
                <DisplayAdEditor
                  key={adIdx}
                  ad={display}
                  onChange={updated => handleDisplayChange(agIdx, adIdx, updated)}
                />
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── Unknown type fallback ─────────────────────────────────────────────────────
  if (type !== 'SEARCH' && (campaign.adGroups ?? []).length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
        <p className="font-semibold mb-1">Campaign Type: {campaign.campaignType || 'Unknown'}</p>
        <p className="text-xs text-gray-400">ไม่พบ ad groups สำหรับ campaign นี้</p>
      </div>
    )
  }

  // ── SEARCH (default) ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {(campaign.adGroups ?? []).map((ag, agIdx) => (
        <SearchAdGroupEditor
          key={agIdx}
          adGroup={ag}
          onChange={updated => handleSearchAdGroupChange(agIdx, updated)}
        />
      ))}
      <ExtensionsEditor
        sitelinks={campaign.sitelinks}
        callouts={campaign.callouts}
        structuredSnippets={campaign.structuredSnippets}
        phoneNumbers={campaign.phoneNumbers}
        onChange={patch => onChange({ ...campaign, ...patch })}
      />
    </div>
  )
}
