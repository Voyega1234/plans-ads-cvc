'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { X, Plus, Sparkles, Loader2, Upload, ImageIcon, CheckCircle2 } from 'lucide-react'
import { PMaxSignal } from '@/types'

interface Props {
  campaignName: string
  signal: PMaxSignal
  onChange: (signal: PMaxSignal) => void
  briefContext?: {
    businessName?: string
    productService?: string
    targetAudience?: string
    objective?: string
  }
}

type TabId = 'customIntent' | 'searchThemes' | 'remarketing' | 'inMarket' | 'demographics' | 'customerList'

const TABS: { id: TabId; label: string }[] = [
  { id: 'customIntent', label: 'Custom Intent' },
  { id: 'searchThemes', label: 'Search Themes' },
  { id: 'remarketing', label: 'Remarketing' },
  { id: 'inMarket', label: 'In-Market' },
  { id: 'demographics', label: 'Demographics' },
  { id: 'customerList', label: 'Customer Lists' },
]

const REMARKETING_OPTIONS = [
  'All Website Visitors (30d)',
  'All Website Visitors (90d)',
  'Cart Abandoners',
  'Past Converters',
  'YouTube Viewers',
  'LINE Click Audience',
  'App Users',
]

const IN_MARKET_OPTIONS = [
  'Real Estate > Residential Properties',
  'Financial Services > Personal Loans',
  'Travel > International Travel',
  'Automotive > New Vehicles',
  'Home & Garden > Home Improvement',
  'Beauty & Personal Care',
  'Health & Fitness',
  'Education > Online Courses',
  'Business Services > B2B Services',
  'Retail > Apparel & Accessories',
]

const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown']
const GENDERS = ['Male', 'Female', 'Unknown']
const HOUSEHOLD_INCOMES = ['Top 10%', '11-20%', '21-30%', '31-40%', '41-50%', 'Lower 50%', 'Unknown']

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 rounded-full px-2.5 py-1 text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 hover:text-blue-900 transition-colors"
        aria-label={`Remove ${label}`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

function TagInput({
  value,
  onChange,
  placeholder,
  max,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
  max: number
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addItem() {
    const trimmed = input.trim()
    if (!trimmed || value.includes(trimmed) || value.length >= max) return
    onChange([...value, trimmed])
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addItem()
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={value.length >= max}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={value.length >= max || !input.trim()}
          className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <Chip
            key={item}
            label={item}
            onRemove={() => onChange(value.filter((v) => v !== item))}
          />
        ))}
      </div>
    </div>
  )
}

function CheckboxList({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option))
    } else {
      onChange([...selected, option])
    }
  }

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
        </label>
      ))}
    </div>
  )
}

export default function AudienceSignalBuilder({ campaignName, signal, onChange, briefContext }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('customIntent')
  const [inMarketSearch, setInMarketSearch] = useState('')
  const [customRemarketingInput, setCustomRemarketingInput] = useState('')
  const [customInMarketInput, setCustomInMarketInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)
  const [imgResult, setImgResult] = useState<{ keywords: string[]; themes: string[]; inMarket: string[] } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const as = signal.audienceSignals

  function updateSignal(patch: Partial<PMaxSignal>) {
    onChange({ ...signal, ...patch })
  }

  function updateAudienceSignals(patch: Partial<PMaxSignal['audienceSignals']>) {
    onChange({ ...signal, audienceSignals: { ...as, ...patch } })
  }

  function updateDemographics(patch: Partial<PMaxSignal['audienceSignals']['demographics']>) {
    updateAudienceSignals({ demographics: { ...as.demographics, ...patch } })
  }

  // Remarketing: combine preset + custom (custom = those not in REMARKETING_OPTIONS)
  const presetRemarketing = REMARKETING_OPTIONS
  const customRemarketing = as.remarketing.filter((r) => !REMARKETING_OPTIONS.includes(r))
  const selectedRemarketing = as.remarketing

  function toggleRemarketingPreset(opt: string) {
    if (selectedRemarketing.includes(opt)) {
      updateAudienceSignals({ remarketing: selectedRemarketing.filter((v) => v !== opt) })
    } else {
      updateAudienceSignals({ remarketing: [...selectedRemarketing, opt] })
    }
  }

  function addCustomRemarketing() {
    const trimmed = customRemarketingInput.trim()
    if (!trimmed || selectedRemarketing.includes(trimmed)) return
    updateAudienceSignals({ remarketing: [...selectedRemarketing, trimmed] })
    setCustomRemarketingInput('')
  }

  // In-market: same pattern
  const filteredInMarket = IN_MARKET_OPTIONS.filter((opt) =>
    opt.toLowerCase().includes(inMarketSearch.toLowerCase())
  )
  const customInMarket = as.inMarket.filter((r) => !IN_MARKET_OPTIONS.includes(r))

  function toggleInMarket(opt: string) {
    if (as.inMarket.includes(opt)) {
      updateAudienceSignals({ inMarket: as.inMarket.filter((v) => v !== opt) })
    } else {
      updateAudienceSignals({ inMarket: [...as.inMarket, opt] })
    }
  }

  function addCustomInMarket() {
    const trimmed = customInMarketInput.trim()
    if (!trimmed || as.inMarket.includes(trimmed)) return
    updateAudienceSignals({ inMarket: [...as.inMarket, trimmed] })
    setCustomInMarketInput('')
  }

  async function analyzeImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setImgError('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImgError('ขนาดไฟล์ต้องไม่เกิน 5MB')
      return
    }
    setImgLoading(true)
    setImgError(null)
    setImgResult(null)

    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/audience-signal/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: file.type,
          campaignName,
          businessName: briefContext?.businessName ?? '',
          productService: briefContext?.productService ?? '',
        }),
      })
      if (!res.ok) throw new Error('Analyze failed')
      const data = await res.json() as { keywords: string[]; themes: string[]; inMarket: string[] }
      setImgResult(data)
    } catch {
      setImgError('วิเคราะห์รูปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setImgLoading(false)
    }
  }

  function applyImageResult() {
    if (!imgResult) return
    const newKeywords = imgResult.keywords.filter((k) => !as.customIntent.includes(k))
    const newThemes   = imgResult.themes.filter((t) => !as.searchThemes.includes(t))
    const newInMarket = imgResult.inMarket.filter((m) => !as.inMarket.includes(m))
    updateAudienceSignals({
      customIntent:  [...as.customIntent, ...newKeywords].slice(0, 50),
      searchThemes:  [...as.searchThemes, ...newThemes].slice(0, 25),
      inMarket:      [...as.inMarket, ...newInMarket],
    })
    setImgResult(null)
  }

  async function generateWithAI() {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/audience-signal/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName,
          businessName:   briefContext?.businessName ?? '',
          productService: briefContext?.productService ?? '',
          targetAudience: briefContext?.targetAudience ?? '',
          objective:      briefContext?.objective ?? '',
        }),
      })
      if (!res.ok) throw new Error('AI generate failed')
      const data = await res.json() as { signal: PMaxSignal['audienceSignals'] }
      onChange({ ...signal, audienceSignals: data.signal })
    } catch {
      setAiError('AI generate ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
      {/* Card Header */}
      <div className="px-5 py-4 border-b border-orange-200 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate">{campaignName}</h3>
          <p className="text-xs text-orange-600 mt-0.5">Performance Max — Audience Signal Builder</p>
        </div>
        <button
          type="button"
          onClick={generateWithAI}
          disabled={aiLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
        >
          {aiLoading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลัง Generate...</>
            : <><Sparkles className="w-3.5 h-3.5" /> AI Generate</>
          }
        </button>
      </div>
      {aiError && (
        <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          {aiError}
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 pt-4 pb-0 flex gap-1 flex-wrap border-b border-orange-100">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors mb-3 ${
              activeTab === tab.id
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {/* ── Tab 1: Custom Intent ──────────────────────────────── */}
        {activeTab === 'customIntent' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Search terms คนที่กำลังหาสินค้า/บริการแบบนี้ — Google ใช้เพื่อหาคนที่ intent เหมือนกัน
            </p>

            {/* Image Upload Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                const file = e.dataTransfer.files[0]
                if (file) analyzeImage(file)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-orange-200 bg-orange-50/40 hover:border-orange-400 hover:bg-orange-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) analyzeImage(file)
                  e.target.value = ''
                }}
              />
              {imgLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
                  <p className="text-xs text-orange-600 font-medium">AI กำลังวิเคราะห์รูป...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-orange-400" />
                    <Upload className="w-4 h-4 text-orange-300" />
                  </div>
                  <p className="text-xs font-medium text-orange-700">อัปโหลดรูปเพื่อหา Audience Signal</p>
                  <p className="text-[11px] text-orange-400">วาง หรือ คลิกเลือกรูป · JPG, PNG, WEBP · ไม่เกิน 5MB</p>
                  <p className="text-[11px] text-gray-400">เช่น รูปสินค้า, screenshot website, รูปกลุ่มลูกค้า, รูป competitor</p>
                </div>
              )}
            </div>

            {imgError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{imgError}</p>
            )}

            {/* AI Image Result */}
            {imgResult && (
              <div className="border border-orange-200 bg-white rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-xs font-semibold text-orange-700">AI วิเคราะห์รูปแล้ว</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImgResult(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-4 py-3 space-y-3">
                  {imgResult.keywords.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Custom Intent Keywords ({imgResult.keywords.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {imgResult.keywords.map((k) => (
                          <span key={k} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2.5 py-0.5">{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {imgResult.themes.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Search Themes ({imgResult.themes.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {imgResult.themes.map((t) => (
                          <span key={t} className="text-xs bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2.5 py-0.5">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {imgResult.inMarket.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">In-Market Segments ({imgResult.inMarket.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {imgResult.inMarket.map((m) => (
                          <span key={m} className="text-xs bg-green-50 text-green-700 border border-green-100 rounded-full px-2.5 py-0.5">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={applyImageResult}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    เพิ่มเข้า Audience Signal ทั้งหมด
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <span className="text-xs text-gray-400">{as.customIntent.length}/50</span>
            </div>
            <TagInput
              value={as.customIntent}
              onChange={(v) => updateAudienceSignals({ customIntent: v })}
              placeholder="เพิ่ม search term แล้วกด Enter..."
              max={50}
            />
          </div>
        )}

        {/* ── Tab 2: Search Themes ──────────────────────────────── */}
        {activeTab === 'searchThemes' && (
          <div>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Search Themes บอก Google ว่าธุรกิจของคุณเกี่ยวกับอะไร — ต่างจาก keywords ตรงที่ไม่มี match type,
              Google ใช้เป็น theme signal เท่านั้น — สูงสุด 25 themes
            </p>
            <div className="flex justify-end mb-2">
              <span className="text-xs text-gray-400">
                {(as.searchThemes ?? []).length}/25
              </span>
            </div>
            <TagInput
              value={as.searchThemes ?? []}
              onChange={(v) => updateAudienceSignals({ searchThemes: v })}
              placeholder="เพิ่ม search theme แล้วกด Enter..."
              max={25}
            />
          </div>
        )}

        {/* ── Tab 3: Remarketing ────────────────────────────────── */}
        {activeTab === 'remarketing' && (
          <div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              รายชื่อผู้เคยเข้าเว็บหรือทำ conversion — เพิ่มเป็น signal เพื่อให้ PMax เข้าใจ customer profile
            </p>
            <CheckboxList
              options={presetRemarketing}
              selected={selectedRemarketing}
              onChange={(v) => updateAudienceSignals({ remarketing: v })}
            />
            {/* Custom remarketing input */}
            <div className="mt-4 pt-4 border-t border-orange-100">
              <p className="text-xs text-gray-500 mb-2">เพิ่ม custom list:</p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={customRemarketingInput}
                  onChange={(e) => setCustomRemarketingInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRemarketing() } }}
                  placeholder="ชื่อ remarketing list..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={addCustomRemarketing}
                  disabled={!customRemarketingInput.trim()}
                  className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {customRemarketing.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customRemarketing.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      onRemove={() =>
                        updateAudienceSignals({ remarketing: selectedRemarketing.filter((v) => v !== item) })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 4: In-Market ─────────────────────────────────── */}
        {activeTab === 'inMarket' && (
          <div>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Google&apos;s pre-built audience segments — คนที่กำลังจะซื้อสินค้าใน category นี้อยู่แล้ว
            </p>
            {/* Search filter */}
            <input
              type="text"
              value={inMarketSearch}
              onChange={(e) => setInMarketSearch(e.target.value)}
              placeholder="ค้นหา segment..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent mb-3"
            />
            <CheckboxList
              options={filteredInMarket}
              selected={as.inMarket}
              onChange={(v) => {
                // Merge with custom (not in IN_MARKET_OPTIONS)
                updateAudienceSignals({ inMarket: [...customInMarket, ...v.filter((x) => IN_MARKET_OPTIONS.includes(x))] })
              }}
            />
            {/* Custom in-market */}
            <div className="mt-4 pt-4 border-t border-orange-100">
              <p className="text-xs text-gray-500 mb-2">เพิ่ม custom segment:</p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={customInMarketInput}
                  onChange={(e) => setCustomInMarketInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomInMarket() } }}
                  placeholder="ชื่อ in-market segment..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={addCustomInMarket}
                  disabled={!customInMarketInput.trim()}
                  className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {customInMarket.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customInMarket.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      onRemove={() =>
                        updateAudienceSignals({ inMarket: as.inMarket.filter((v) => v !== item) })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 5: Demographics ───────────────────────────────── */}
        {activeTab === 'demographics' && (
          <div className="space-y-6">
            {/* Age Ranges */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Age Ranges</h4>
              <CheckboxList
                options={AGE_RANGES}
                selected={as.demographics?.ageRanges ?? []}
                onChange={(v) => updateDemographics({ ageRanges: v })}
              />
            </div>
            {/* Genders */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Genders</h4>
              <CheckboxList
                options={GENDERS}
                selected={as.demographics?.genders ?? []}
                onChange={(v) => updateDemographics({ genders: v })}
              />
            </div>
            {/* Household Income */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Household Income</h4>
              <CheckboxList
                options={HOUSEHOLD_INCOMES}
                selected={as.demographics?.householdIncome ?? []}
                onChange={(v) => updateDemographics({ householdIncome: v })}
              />
            </div>
          </div>
        )}

        {/* ── Tab 6: Customer Lists ─────────────────────────────── */}
        {activeTab === 'customerList' && (
          <div>
            <p className="text-xs text-gray-500 mb-1 leading-relaxed">
              Upload ชื่อ list ที่ match กับ Google Customer Match lists ใน account
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              ต้องมี Customer Match list ใน Google Ads account ก่อน
            </p>
            <TagInput
              value={as.customerList}
              onChange={(v) => updateAudienceSignals({ customerList: v })}
              placeholder="ชื่อ Customer Match list แล้วกด Enter..."
              max={100}
            />
          </div>
        )}
      </div>
    </div>
  )
}
