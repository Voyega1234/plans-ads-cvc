'use client'

import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  AdCopy,
  RsaAdCopy,
  PMaxAssetGroup,
  DisplayAdCopy,
} from '@/types'
import {
  Plus,
  X,
  Pin,
  Loader,
  Sparkles,
  Youtube,
  Image as ImageIcon,
} from 'lucide-react'
import { FileUpload, type UploadedFile } from '@/components/ui/FileUpload'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  campaignName: string
  campaignType: string
  adCopy: AdCopy
  onChange: (updated: AdCopy) => void
  onAIRewrite: () => Promise<void>
  isGenerating?: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const over = (s: string, max: number) => s.length > max

function CharBadge({ value, max }: { value: string; max: number }) {
  const len = value.length
  return (
    <span
      className={cn(
        'text-xs font-mono ml-1 tabular-nums',
        over(value, max) ? 'text-red-500 font-semibold' : 'text-gray-400'
      )}
    >
      {len}/{max}
    </span>
  )
}

function FieldInput({
  value,
  max,
  placeholder,
  onChange,
  onRemove,
  className,
}: {
  value: string
  max: number
  placeholder?: string
  onChange: (v: string) => void
  onRemove?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex-1 text-sm border rounded-md px-3 py-1.5 outline-none focus:ring-2 transition',
          over(value, max)
            ? 'border-red-400 focus:ring-red-200 bg-red-50'
            : 'border-gray-300 focus:ring-blue-200 focus:border-blue-400'
        )}
      />
      <CharBadge value={value} max={max} />
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── SERP Preview ──────────────────────────────────────────────────────────────

function SerpPreview({ rsa, finalUrl, path1, path2 }: {
  rsa: RsaAdCopy
  finalUrl: string
  path1: string
  path2: string
}) {
  const h1 = rsa.headlines[0] || 'Headline 1'
  const h2 = rsa.headlines[1] || 'Headline 2'
  const h3 = rsa.headlines[2] || 'Headline 3'
  const d1 = rsa.descriptions[0] || 'Description line 1 will appear here.'
  const d2 = rsa.descriptions[1] || ''

  let displayDomain = 'example.com'
  try {
    const url = new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`)
    displayDomain = url.hostname
  } catch {}
  const paths = [path1, path2].filter(Boolean).join('/')
  const displayUrl = paths ? `${displayDomain}/${paths}` : displayDomain

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">SERP Preview</p>
      <div className="space-y-0.5">
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-gray-200 text-gray-600 text-[9px] font-bold">Ad</span>
          <span className="text-emerald-700">{displayUrl}</span>
        </p>
        <p className="text-xl text-blue-700 font-medium leading-tight hover:underline cursor-pointer">
          {h1}
          {h2 ? ` | ${h2}` : ''}
          {h3 ? ` | ${h3}` : ''}
        </p>
        <p className="text-sm text-gray-700 leading-snug">
          {d1}
          {d2 ? ` ${d2}` : ''}
        </p>
      </div>
      {(rsa.headlines.length < 3 || rsa.descriptions.length < 2) && (
        <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          ต้องการ Headline อย่างน้อย 3 รายการ และ Description อย่างน้อย 2 รายการ
        </p>
      )}
    </div>
  )
}

// ─── RSA Editor ────────────────────────────────────────────────────────────────

function RsaEditor({ adCopy, onChange }: { adCopy: AdCopy; onChange: (a: AdCopy) => void }) {
  const rsa: RsaAdCopy = adCopy.rsa ?? {
    adType: 'RSA',
    headlines: [adCopy.headline1, adCopy.headline2, adCopy.headline3].filter(Boolean),
    descriptions: [adCopy.description1, adCopy.description2].filter(Boolean),
    finalUrl: adCopy.finalUrl,
    displayPath1: adCopy.displayPath ?? '',
    displayPath2: '',
  }

  const pinned = rsa.pinnedHeadlines ?? {}

  function updateRsa(next: RsaAdCopy) {
    onChange({
      ...adCopy,
      headline1: next.headlines[0] ?? '',
      headline2: next.headlines[1] ?? '',
      headline3: next.headlines[2] ?? '',
      description1: next.descriptions[0] ?? '',
      description2: next.descriptions[1] ?? '',
      rsa: next,
    })
  }

  function setHeadline(i: number, val: string) {
    const h = [...rsa.headlines]
    h[i] = val
    updateRsa({ ...rsa, headlines: h })
  }
  function addHeadline() {
    if (rsa.headlines.length >= 15) return
    updateRsa({ ...rsa, headlines: [...rsa.headlines, ''] })
  }
  function removeHeadline(i: number) {
    if (rsa.headlines.length <= 1) return
    const h = rsa.headlines.filter((_, idx) => idx !== i)
    updateRsa({ ...rsa, headlines: h })
  }
  function togglePin(i: number, pos: number) {
    const np = { ...pinned }
    if (np[pos] === i) { delete np[pos] } else { np[pos] = i }
    updateRsa({ ...rsa, pinnedHeadlines: np })
  }

  function setDescription(i: number, val: string) {
    const d = [...rsa.descriptions]
    d[i] = val
    updateRsa({ ...rsa, descriptions: d })
  }
  function addDescription() {
    if (rsa.descriptions.length >= 4) return
    updateRsa({ ...rsa, descriptions: [...rsa.descriptions, ''] })
  }
  function removeDescription(i: number) {
    if (rsa.descriptions.length <= 1) return
    updateRsa({ ...rsa, descriptions: rsa.descriptions.filter((_, idx) => idx !== i) })
  }

  const pinnedPositionOf = (i: number): number | null => {
    const entry = Object.entries(pinned).find(([, hi]) => hi === i)
    return entry ? Number(entry[0]) : null
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left: Editor */}
      <div className="space-y-5">
        {/* Headlines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">
              Headlines <span className="text-gray-400 font-normal">({rsa.headlines.length}/15, min 3)</span>
            </p>
            {rsa.headlines.length < 15 && (
              <button onClick={addHeadline} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add headline
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {rsa.headlines.map((h, i) => {
              const pinnedPos = pinnedPositionOf(i)
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <FieldInput
                    value={h}
                    max={30}
                    placeholder={`Headline ${i + 1}`}
                    onChange={(v) => setHeadline(i, v)}
                    onRemove={rsa.headlines.length > 1 ? () => removeHeadline(i) : undefined}
                    className="flex-1"
                  />
                  {/* Pin to positions 1/2/3 */}
                  {[1, 2, 3].map((pos) => (
                    <button
                      key={pos}
                      onClick={() => togglePin(i, pos)}
                      title={`Pin to position ${pos}`}
                      className={cn(
                        'flex items-center justify-center w-6 h-6 rounded text-xs font-bold border transition',
                        pinned[pos] === i
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500'
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                  {pinnedPos !== null && (
                    <span className="text-xs text-blue-600 flex items-center gap-0.5">
                      <Pin className="w-3 h-3" /> {pinnedPos}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Descriptions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">
              Descriptions <span className="text-gray-400 font-normal">({rsa.descriptions.length}/4, min 2)</span>
            </p>
            {rsa.descriptions.length < 4 && (
              <button onClick={addDescription} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add description
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {rsa.descriptions.map((d, i) => (
              <FieldInput
                key={i}
                value={d}
                max={90}
                placeholder={`Description ${i + 1}`}
                onChange={(v) => setDescription(i, v)}
                onRemove={rsa.descriptions.length > 1 ? () => removeDescription(i) : undefined}
              />
            ))}
          </div>
        </div>

        {/* Display Paths */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Display URL Paths</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <FieldInput
                value={rsa.displayPath1 ?? ''}
                max={15}
                placeholder="Path 1"
                onChange={(v) => updateRsa({ ...rsa, displayPath1: v })}
              />
            </div>
            <div className="flex-1">
              <FieldInput
                value={rsa.displayPath2 ?? ''}
                max={15}
                placeholder="Path 2"
                onChange={(v) => updateRsa({ ...rsa, displayPath2: v })}
              />
            </div>
          </div>
        </div>

        {/* Final URL */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Final URL</p>
          <input
            type="url"
            value={rsa.finalUrl}
            placeholder="https://example.com/page"
            onChange={(e) => {
              updateRsa({ ...rsa, finalUrl: e.target.value })
              onChange({ ...adCopy, finalUrl: e.target.value })
            }}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
        </div>
      </div>

      {/* Right: Preview */}
      <div className="xl:sticky xl:top-4 self-start">
        <SerpPreview
          rsa={rsa}
          finalUrl={rsa.finalUrl}
          path1={rsa.displayPath1 ?? ''}
          path2={rsa.displayPath2 ?? ''}
        />
      </div>
    </div>
  )
}

// ─── Image Dropzone (wraps FileUpload) ─────────────────────────────────────────

interface UploadedImage { file: File; objectUrl: string }

interface DropzoneProps {
  label: string
  spec: string
  min?: number
  max: number
  images: UploadedImage[]
  urlInputs: string[]
  onAdd: (imgs: UploadedImage[]) => void
  onRemove: (i: number) => void
  onUrlChange: (i: number, url: string) => void
  onAddUrl: () => void
  onRemoveUrl: (i: number) => void
}

function ImageDropzone({ label, spec, min, max, images, urlInputs, onAdd, onRemove, onUrlChange, onAddUrl, onRemoveUrl }: DropzoneProps) {
  const files: UploadedFile[] = images.map((img) => ({ file: img.file, objectUrl: img.objectUrl }))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{spec}</p>
        {min !== undefined && images.length < min && (
          <span className="text-xs text-red-500 font-medium">min {min} required ({images.length}/{max})</span>
        )}
      </div>

      <FileUpload
        title={label}
        accept="image/*"
        acceptLabel="JPG, PNG, WebP"
        maxSizeMB={20}
        multiple
        maxFiles={max}
        files={files}
        onAdd={(newFiles) => onAdd(newFiles.map((f) => ({ file: f.file, objectUrl: f.objectUrl ?? URL.createObjectURL(f.file) })))}
        onRemove={onRemove}
      />

      {/* Thumbnail grid for images */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.objectUrl} alt={img.file.name} className="w-full h-full object-cover" />
              <button
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* URL inputs */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500 font-medium">หรือใส่ URL รูปภาพ</p>
        {urlInputs.map((url, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="url"
              value={url}
              placeholder="https://example.com/image.jpg"
              onChange={(e) => onUrlChange(i, e.target.value)}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-300"
            />
            <button onClick={() => onRemoveUrl(i)} className="p-1 text-gray-400 hover:text-red-500 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button onClick={onAddUrl} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
          <Plus className="w-3 h-3" /> เพิ่ม URL
        </button>
      </div>
    </div>
  )
}

// ─── PMax Editor ───────────────────────────────────────────────────────────────

type PMaxTab = 'text' | 'images' | 'video'

type ImageKey = 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'PORTRAIT_MARKETING_IMAGE' | 'LOGO' | 'LANDSCAPE_LOGO'

const IMAGE_SPECS: { key: ImageKey; label: string; spec: string; min?: number; max: number }[] = [
  { key: 'MARKETING_IMAGE', label: 'Marketing Image (Landscape)', spec: '1.91:1 · min 1200×628px · ไฟล์ max 20 MB', min: 1, max: 20 },
  { key: 'SQUARE_MARKETING_IMAGE', label: 'Square Marketing Image', spec: '1:1 · min 1200×1200px · ไฟล์ max 20 MB', min: 1, max: 20 },
  { key: 'PORTRAIT_MARKETING_IMAGE', label: 'Portrait Marketing Image', spec: '4:5 · min 960×1200px · ไฟล์ max 20 MB · optional', max: 20 },
  { key: 'LOGO', label: 'Logo', spec: '1:1 · min 1200×1200px · ไฟล์ max 5 MB', min: 1, max: 5 },
  { key: 'LANDSCAPE_LOGO', label: 'Landscape Logo', spec: '4:1 · min 512×128px · optional', max: 5 },
]

type ImageStore = Record<ImageKey, UploadedImage[]>
type UrlStore = Record<ImageKey, string[]>

function PMaxEditor({ adCopy, onChange }: { adCopy: AdCopy; onChange: (a: AdCopy) => void }) {
  const [activeTab, setActiveTab] = useState<PMaxTab>('text')
  const [imageStore, setImageStore] = useState<ImageStore>({
    MARKETING_IMAGE: [], SQUARE_MARKETING_IMAGE: [], PORTRAIT_MARKETING_IMAGE: [], LOGO: [], LANDSCAPE_LOGO: [],
  })
  const [urlStore, setUrlStore] = useState<UrlStore>({
    MARKETING_IMAGE: [''], SQUARE_MARKETING_IMAGE: [''], PORTRAIT_MARKETING_IMAGE: [''], LOGO: [''], LANDSCAPE_LOGO: [''],
  })

  const pmax: PMaxAssetGroup = adCopy.pmax ?? {
    assetGroupName: 'Asset Group 1',
    headlines: [adCopy.headline1, adCopy.headline2, adCopy.headline3].filter(Boolean),
    longHeadlines: [],
    descriptions: [adCopy.description1, adCopy.description2].filter(Boolean),
    businessName: '',
    finalUrl: adCopy.finalUrl,
    imageAssets: [],
  }

  function updatePmax(next: PMaxAssetGroup) {
    onChange({ ...adCopy, pmax: next })
  }

  function setHeadline(i: number, val: string) { const h = [...pmax.headlines]; h[i] = val; updatePmax({ ...pmax, headlines: h }) }
  function addHeadline() { if (pmax.headlines.length < 15) updatePmax({ ...pmax, headlines: [...pmax.headlines, ''] }) }
  function removeHeadline(i: number) { if (pmax.headlines.length > 1) updatePmax({ ...pmax, headlines: pmax.headlines.filter((_, j) => j !== i) }) }

  function setLongHeadline(i: number, val: string) { const h = [...pmax.longHeadlines]; h[i] = val; updatePmax({ ...pmax, longHeadlines: h }) }
  function addLongHeadline() { if (pmax.longHeadlines.length < 5) updatePmax({ ...pmax, longHeadlines: [...pmax.longHeadlines, ''] }) }
  function removeLongHeadline(i: number) { updatePmax({ ...pmax, longHeadlines: pmax.longHeadlines.filter((_, j) => j !== i) }) }

  function setDescription(i: number, val: string) { const d = [...pmax.descriptions]; d[i] = val; updatePmax({ ...pmax, descriptions: d }) }
  function addDescription() { if (pmax.descriptions.length < 4) updatePmax({ ...pmax, descriptions: [...pmax.descriptions, ''] }) }
  function removeDescription(i: number) { if (pmax.descriptions.length > 1) updatePmax({ ...pmax, descriptions: pmax.descriptions.filter((_, j) => j !== i) }) }

  const [videoUrl, setVideoUrl] = useState<string>(pmax.videoAssets?.[0]?.url ?? '')

  function getYoutubeEmbedUrl(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)
    return match ? `https://www.youtube.com/embed/${match[1]}` : null
  }

  const tabs: { id: PMaxTab; label: string }[] = [
    { id: 'text', label: 'Text Assets' },
    { id: 'images', label: 'Image Assets' },
    { id: 'video', label: 'Video Assets' },
  ]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left: Editor (2/3 width) */}
      <div className="xl:col-span-2 space-y-4">
        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition',
                activeTab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Text Assets Tab */}
        {activeTab === 'text' && (
          <div className="space-y-5">
            {/* Business Name */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1.5">Business Name</p>
              <FieldInput
                value={pmax.businessName}
                max={25}
                placeholder="Your Business Name"
                onChange={(v) => updatePmax({ ...pmax, businessName: v })}
              />
            </div>

            {/* Headlines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">
                  Headlines <span className="text-gray-400 font-normal">({pmax.headlines.length}/15, min 3, recommended 15)</span>
                </p>
                {pmax.headlines.length < 15 && (
                  <button onClick={addHeadline} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {pmax.headlines.map((h, i) => (
                  <FieldInput key={i} value={h} max={30} placeholder={`Headline ${i + 1}`}
                    onChange={(v) => setHeadline(i, v)}
                    onRemove={pmax.headlines.length > 1 ? () => removeHeadline(i) : undefined}
                  />
                ))}
              </div>
            </div>

            {/* Long Headlines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">
                  Long Headlines <span className="text-gray-400 font-normal">({pmax.longHeadlines.length}/5, min 1)</span>
                </p>
                {pmax.longHeadlines.length < 5 && (
                  <button onClick={addLongHeadline} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {pmax.longHeadlines.map((h, i) => (
                  <FieldInput key={i} value={h} max={90} placeholder={`Long Headline ${i + 1}`}
                    onChange={(v) => setLongHeadline(i, v)}
                    onRemove={() => removeLongHeadline(i)}
                  />
                ))}
                {pmax.longHeadlines.length === 0 && (
                  <button onClick={addLongHeadline} className="w-full border-2 border-dashed border-gray-300 rounded-md py-2 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition">
                    + เพิ่ม Long Headline
                  </button>
                )}
              </div>
            </div>

            {/* Descriptions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">
                  Descriptions <span className="text-gray-400 font-normal">({pmax.descriptions.length}/4, min 2)</span>
                </p>
                {pmax.descriptions.length < 4 && (
                  <button onClick={addDescription} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {pmax.descriptions.map((d, i) => (
                  <FieldInput key={i} value={d} max={90} placeholder={`Description ${i + 1}`}
                    onChange={(v) => setDescription(i, v)}
                    onRemove={pmax.descriptions.length > 1 ? () => removeDescription(i) : undefined}
                  />
                ))}
              </div>
            </div>

            {/* Final URL */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1.5">Final URL</p>
              <input type="url" value={pmax.finalUrl} placeholder="https://example.com"
                onChange={(e) => updatePmax({ ...pmax, finalUrl: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
          </div>
        )}

        {/* Image Assets Tab */}
        {activeTab === 'images' && (
          <div className="space-y-4">
            {IMAGE_SPECS.map((spec) => (
              <ImageDropzone
                key={spec.key}
                label={spec.label}
                spec={spec.spec}
                min={spec.min}
                max={spec.max}
                images={imageStore[spec.key]}
                urlInputs={urlStore[spec.key]}
                onAdd={(imgs) => setImageStore((s) => ({ ...s, [spec.key]: [...s[spec.key], ...imgs] }))}
                onRemove={(i) => setImageStore((s) => ({ ...s, [spec.key]: s[spec.key].filter((_, j) => j !== i) }))}
                onUrlChange={(i, url) => setUrlStore((s) => { const a = [...s[spec.key]]; a[i] = url; return { ...s, [spec.key]: a } })}
                onAddUrl={() => setUrlStore((s) => ({ ...s, [spec.key]: [...s[spec.key], ''] }))}
                onRemoveUrl={(i) => setUrlStore((s) => ({ ...s, [spec.key]: s[spec.key].filter((_, j) => j !== i) }))}
              />
            ))}
          </div>
        )}

        {/* Video Assets Tab */}
        {activeTab === 'video' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1.5">YouTube Video URL</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={videoUrl}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onChange={(e) => {
                    setVideoUrl(e.target.value)
                    updatePmax({
                      ...pmax,
                      videoAssets: e.target.value
                        ? [{ assetType: 'YOUTUBE_VIDEO', url: e.target.value, description: 'Campaign video' }]
                        : [],
                    })
                  }}
                  className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                />
                <Youtube className="w-5 h-5 text-red-500 self-center" />
              </div>
              <p className="text-xs text-gray-400 mt-1">เป็น optional แต่แนะนำให้ใส่ — ช่วยเพิ่ม reach บน YouTube</p>
            </div>
            {videoUrl && getYoutubeEmbedUrl(videoUrl) && (
              <div className="rounded-xl overflow-hidden border border-gray-200 aspect-video">
                <iframe
                  src={getYoutubeEmbedUrl(videoUrl) ?? ''}
                  className="w-full h-full"
                  allowFullScreen
                  title="Video preview"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Asset Group Summary Card */}
      <div className="self-start">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Asset Group Summary</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Business</span>
              <span className="font-medium text-gray-800 truncate max-w-[140px]">{pmax.businessName || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Headlines</span>
              <span className={cn('font-medium', pmax.headlines.length < 3 ? 'text-red-500' : 'text-emerald-600')}>
                {pmax.headlines.length}/15
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Long Headlines</span>
              <span className={cn('font-medium', pmax.longHeadlines.length < 1 ? 'text-amber-500' : 'text-emerald-600')}>
                {pmax.longHeadlines.length}/5
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Descriptions</span>
              <span className={cn('font-medium', pmax.descriptions.length < 2 ? 'text-red-500' : 'text-emerald-600')}>
                {pmax.descriptions.length}/4
              </span>
            </div>
            {IMAGE_SPECS.map((spec) => (
              <div key={spec.key} className="flex justify-between">
                <span className="text-gray-500 text-xs">{spec.label.split(' ').slice(0, 2).join(' ')}</span>
                <span className={cn('text-xs font-medium', spec.min && imageStore[spec.key].length < spec.min ? 'text-red-500' : 'text-emerald-600')}>
                  {imageStore[spec.key].length}/{spec.max}
                  {spec.min && imageStore[spec.key].length < spec.min && ' ⚠'}
                </span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-gray-500">Video</span>
              <span className={cn('text-xs font-medium', videoUrl ? 'text-emerald-600' : 'text-gray-400')}>
                {videoUrl ? '✓' : 'None'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Display Editor ─────────────────────────────────────────────────────────────

const DISPLAY_IMAGE_SPECS: { key: string; label: string; spec: string; min?: number; max: number }[] = [
  { key: 'MARKETING_IMAGE', label: 'Marketing Image', spec: '1.91:1 · min 600×314px', min: 1, max: 10 },
  { key: 'SQUARE_MARKETING_IMAGE', label: 'Square Marketing Image', spec: '1:1 · min 300×300px', min: 1, max: 10 },
  { key: 'LOGO', label: 'Logo', spec: '1:1 · min 128×128px · optional', max: 5 },
]

type DisplayImageKey = 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'LOGO'
type DisplayImageStore = Record<DisplayImageKey, UploadedImage[]>
type DisplayUrlStore = Record<DisplayImageKey, string[]>

function DisplayEditor({ adCopy, onChange }: { adCopy: AdCopy; onChange: (a: AdCopy) => void }) {
  const [imgStore, setImgStore] = useState<DisplayImageStore>({ MARKETING_IMAGE: [], SQUARE_MARKETING_IMAGE: [], LOGO: [] })
  const [urlStore, setUrlStore] = useState<DisplayUrlStore>({ MARKETING_IMAGE: [''], SQUARE_MARKETING_IMAGE: [''], LOGO: [''] })

  const display: DisplayAdCopy = adCopy.display ?? {
    adType: 'RESPONSIVE_DISPLAY',
    headlines: [adCopy.headline1, adCopy.headline2, adCopy.headline3].filter(Boolean),
    longHeadlines: [''],
    descriptions: [adCopy.description1, adCopy.description2].filter(Boolean),
    businessName: '',
    finalUrl: adCopy.finalUrl,
    imageAssets: [],
  }

  function updateDisplay(next: DisplayAdCopy) { onChange({ ...adCopy, display: next }) }

  function setHeadline(i: number, v: string) { const h = [...display.headlines]; h[i] = v; updateDisplay({ ...display, headlines: h }) }
  function addHeadline() { if (display.headlines.length < 5) updateDisplay({ ...display, headlines: [...display.headlines, ''] }) }
  function removeHeadline(i: number) { if (display.headlines.length > 1) updateDisplay({ ...display, headlines: display.headlines.filter((_, j) => j !== i) }) }

  function setDescription(i: number, v: string) { const d = [...display.descriptions]; d[i] = v; updateDisplay({ ...display, descriptions: d }) }
  function addDescription() { if (display.descriptions.length < 5) updateDisplay({ ...display, descriptions: [...display.descriptions, ''] }) }
  function removeDescription(i: number) { if (display.descriptions.length > 1) updateDisplay({ ...display, descriptions: display.descriptions.filter((_, j) => j !== i) }) }

  const longHeadline = display.longHeadlines[0] ?? ''

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left: Editor */}
      <div className="xl:col-span-2 space-y-5">
        {/* Business Name */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Business Name</p>
          <FieldInput value={display.businessName} max={25} placeholder="Your Business Name"
            onChange={(v) => updateDisplay({ ...display, businessName: v })} />
        </div>

        {/* Headlines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Headlines <span className="text-gray-400 font-normal">({display.headlines.length}/5, min 1)</span></p>
            {display.headlines.length < 5 && (
              <button onClick={addHeadline} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {display.headlines.map((h, i) => (
              <FieldInput key={i} value={h} max={30} placeholder={`Headline ${i + 1}`}
                onChange={(v) => setHeadline(i, v)}
                onRemove={display.headlines.length > 1 ? () => removeHeadline(i) : undefined}
              />
            ))}
          </div>
        </div>

        {/* Long Headline */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Long Headline</p>
          <FieldInput value={longHeadline} max={90} placeholder="Long headline ≤90 chars"
            onChange={(v) => updateDisplay({ ...display, longHeadlines: [v] })} />
        </div>

        {/* Descriptions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Descriptions <span className="text-gray-400 font-normal">({display.descriptions.length}/5, min 1)</span></p>
            {display.descriptions.length < 5 && (
              <button onClick={addDescription} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {display.descriptions.map((d, i) => (
              <FieldInput key={i} value={d} max={90} placeholder={`Description ${i + 1}`}
                onChange={(v) => setDescription(i, v)}
                onRemove={display.descriptions.length > 1 ? () => removeDescription(i) : undefined}
              />
            ))}
          </div>
        </div>

        {/* Images */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Image Assets</p>
          <div className="space-y-4">
            {DISPLAY_IMAGE_SPECS.map((spec) => {
              const key = spec.key as DisplayImageKey
              return (
                <ImageDropzone
                  key={key}
                  label={spec.label}
                  spec={spec.spec}
                  min={spec.min}
                  max={spec.max}
                  images={imgStore[key]}
                  urlInputs={urlStore[key]}
                  onAdd={(imgs) => setImgStore((s) => ({ ...s, [key]: [...s[key], ...imgs] }))}
                  onRemove={(i) => setImgStore((s) => ({ ...s, [key]: s[key].filter((_, j) => j !== i) }))}
                  onUrlChange={(i, url) => setUrlStore((s) => { const a = [...s[key]]; a[i] = url; return { ...s, [key]: a } })}
                  onAddUrl={() => setUrlStore((s) => ({ ...s, [key]: [...s[key], ''] }))}
                  onRemoveUrl={(i) => setUrlStore((s) => ({ ...s, [key]: s[key].filter((_, j) => j !== i) }))}
                />
              )
            })}
          </div>
        </div>

        {/* Final URL */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Final URL</p>
          <input type="url" value={display.finalUrl} placeholder="https://example.com"
            onChange={(e) => updateDisplay({ ...display, finalUrl: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Right: Banner Preview */}
      <div className="self-start">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm" style={{ width: 300, minHeight: 250 }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Display Banner Preview (300×250)</p>
          <div className="mx-4 mb-4 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-4 flex flex-col gap-2" style={{ minHeight: 180 }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-blue-200 flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs font-semibold text-gray-700 truncate">{display.businessName || 'Business Name'}</span>
            </div>
            <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-2">
              {display.headlines[0] || 'Your Headline Here'}
            </p>
            <p className="text-xs text-gray-600 line-clamp-3">
              {display.descriptions[0] || 'Your description text will appear here.'}
            </p>
            <button className="mt-auto text-xs bg-blue-600 text-white rounded px-3 py-1 w-fit">Learn More</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Video Editor ──────────────────────────────────────────────────────────────

function VideoEditor({ adCopy, onChange }: { adCopy: AdCopy; onChange: (a: AdCopy) => void }) {
  const [videoUrl, setVideoUrl] = useState('')
  const [cta, setCta] = useState('')
  const [headline, setHeadline] = useState(adCopy.headline1 ?? '')
  const [descLine, setDescLine] = useState(adCopy.description1 ?? '')

  function getYoutubeEmbedUrl(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)
    return match ? `https://www.youtube.com/embed/${match[1]}` : null
  }

  function sync(updates: { videoUrl?: string; cta?: string; headline?: string; desc?: string }) {
    onChange({
      ...adCopy,
      headline1: updates.headline ?? headline,
      description1: updates.desc ?? descLine,
    })
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">YouTube Video URL <span className="text-red-500">*</span></p>
          <div className="flex gap-2">
            <input type="url" value={videoUrl} placeholder="https://www.youtube.com/watch?v=..."
              onChange={(e) => { setVideoUrl(e.target.value); sync({ videoUrl: e.target.value }) }}
              className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
            />
            <Youtube className="w-5 h-5 text-red-500 self-center" />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Headline <span className="text-gray-400 font-normal">(≤15 chars)</span></p>
          <FieldInput value={headline} max={15} placeholder="Click here"
            onChange={(v) => { setHeadline(v); sync({ headline: v }) }} />
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Call-to-Action <span className="text-gray-400 font-normal">(≤10 chars)</span></p>
          <FieldInput value={cta} max={10} placeholder="Learn More"
            onChange={(v) => { setCta(v); sync({ cta: v }) }} />
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Description Line <span className="text-gray-400 font-normal">(≤35 chars)</span></p>
          <FieldInput value={descLine} max={35} placeholder="Short description for the video ad"
            onChange={(v) => { setDescLine(v); sync({ desc: v }) }} />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          <p className="font-semibold mb-1">Companion Banner (optional)</p>
          <p className="text-xs text-blue-600">300×60px — แนบมาพร้อม TrueView in-stream ad ช่วยเพิ่ม brand visibility</p>
        </div>
      </div>

      {/* Right: Video Preview */}
      <div className="space-y-4">
        {videoUrl && getYoutubeEmbedUrl(videoUrl) ? (
          <div className="rounded-xl overflow-hidden border border-gray-200 aspect-video shadow-sm">
            <iframe src={getYoutubeEmbedUrl(videoUrl) ?? ''} className="w-full h-full" allowFullScreen title="YouTube preview" />
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl aspect-video flex flex-col items-center justify-center gap-3">
            <Youtube className="w-12 h-12 text-red-500" />
            <p className="text-gray-400 text-sm">ใส่ YouTube URL เพื่อดู preview</p>
          </div>
        )}

        {/* Mock in-stream overlay */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">In-Stream Ad Overlay</p>
          <div className="bg-gray-900 rounded-lg p-4 relative">
            <div className="absolute top-3 left-3 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">Ad</div>
            <div className="mt-6 space-y-1">
              <p className="text-white text-sm font-medium">{headline || 'Headline'}</p>
              <p className="text-gray-300 text-xs">{descLine || 'Description line'}</p>
            </div>
            <button className="mt-3 bg-blue-600 text-white text-xs rounded px-3 py-1.5 font-medium">
              {cta || 'Learn More'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shopping / Info Card ──────────────────────────────────────────────────────

function ShoppingInfoCard({ adCopy, onChange }: { adCopy: AdCopy; onChange: (a: AdCopy) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5">🛒</div>
          <div>
            <h3 className="font-semibold text-amber-800 mb-1">Shopping Campaign — Product Feed Driven</h3>
            <p className="text-sm text-amber-700 leading-relaxed">
              Shopping campaigns ใช้ข้อมูลจาก <strong>Google Merchant Center Product Feed</strong> โดยตรง — ไม่ต้องเขียน text ads
              Google จะนำข้อมูล Product Title, Description, Image, Price จาก feed ไปแสดงโดยอัตโนมัติ
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Final URL (Landing Page)</p>
          <input type="url" value={adCopy.finalUrl} placeholder="https://example.com/shop"
            onChange={(e) => onChange({ ...adCopy, finalUrl: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Business Name</p>
          <input type="text" placeholder="Your Store Name"
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Checklist สำหรับ Shopping Campaign</p>
        {[
          'เชื่อม Google Merchant Center แล้ว',
          'Product Feed อัปเดตล่าสุดภายใน 30 วัน',
          'Product Title ≤150 chars — ใส่ keywords ที่สำคัญไว้ข้างหน้า',
          'Product Image ขนาด min 100×100px, recommended 800×800px',
          'Price และ Availability ถูกต้องตรงกับหน้าเว็บ',
          'GTIN / MPN ถูกต้อง (ถ้ามี)',
        ].map((item) => (
          <div key={item} className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
            <span className="text-emerald-500 mt-0.5">✓</span>
            <span className="text-sm text-gray-700">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Demand Gen / App Editor (lightweight) ────────────────────────────────────

function DemandGenEditor({ adCopy, onChange }: { adCopy: AdCopy; onChange: (a: AdCopy) => void }) {
  const [headlines, setHeadlines] = useState<string[]>([adCopy.headline1, adCopy.headline2, adCopy.headline3].filter(Boolean))
  const [descriptions, setDescriptions] = useState<string[]>([adCopy.description1, adCopy.description2].filter(Boolean))

  function setH(i: number, v: string) { const h = [...headlines]; h[i] = v; setHeadlines(h); syncToParent(h, descriptions) }
  function setD(i: number, v: string) { const d = [...descriptions]; d[i] = v; setDescriptions(d); syncToParent(headlines, d) }
  function syncToParent(h: string[], d: string[]) {
    onChange({ ...adCopy, headline1: h[0] ?? '', headline2: h[1] ?? '', headline3: h[2] ?? '', description1: d[0] ?? '', description2: d[1] ?? '' })
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 text-sm text-purple-700">
        <strong>Demand Gen</strong> — คล้ายกับ Display แต่แสดงบน YouTube Home Feed, Discover, Gmail
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">Headlines ({headlines.length}/5, min 1)</p>
          {headlines.length < 5 && (
            <button onClick={() => { const h = [...headlines, '']; setHeadlines(h); syncToParent(h, descriptions) }}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {headlines.map((h, i) => (
            <FieldInput key={i} value={h} max={30} placeholder={`Headline ${i + 1}`}
              onChange={(v) => setH(i, v)}
              onRemove={headlines.length > 1 ? () => { const nh = headlines.filter((_, j) => j !== i); setHeadlines(nh); syncToParent(nh, descriptions) } : undefined}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">Descriptions ({descriptions.length}/5, min 1)</p>
          {descriptions.length < 5 && (
            <button onClick={() => { const d = [...descriptions, '']; setDescriptions(d); syncToParent(headlines, d) }}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {descriptions.map((d, i) => (
            <FieldInput key={i} value={d} max={90} placeholder={`Description ${i + 1}`}
              onChange={(v) => setD(i, v)}
              onRemove={descriptions.length > 1 ? () => { const nd = descriptions.filter((_, j) => j !== i); setDescriptions(nd); syncToParent(headlines, nd) } : undefined}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1.5">Final URL</p>
        <input type="url" value={adCopy.finalUrl} placeholder="https://example.com"
          onChange={(e) => onChange({ ...adCopy, finalUrl: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
    </div>
  )
}

function AppCampaignEditor({ adCopy, onChange }: { adCopy: AdCopy; onChange: (a: AdCopy) => void }) {
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
        <strong>App Campaign</strong> — Google สร้าง ad อัตโนมัติจาก text + image + video assets ที่คุณให้มา
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1.5">Headline (≤30 chars)</p>
        <FieldInput value={adCopy.headline1} max={30} placeholder="ดาวน์โหลดแอปฟรี"
          onChange={(v) => onChange({ ...adCopy, headline1: v })} />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1.5">Description (≤90 chars)</p>
        <FieldInput value={adCopy.description1} max={90} placeholder="แอปที่ดีที่สุด ใช้งานง่าย ดาวน์โหลดฟรีวันนี้"
          onChange={(v) => onChange({ ...adCopy, description1: v })} />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1.5">Final URL (App Store / Play Store)</p>
        <input type="url" value={adCopy.finalUrl} placeholder="https://play.google.com/store/apps/..."
          onChange={(e) => onChange({ ...adCopy, finalUrl: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function AdCreativeEditor({
  campaignName,
  campaignType,
  adCopy,
  onChange,
  onAIRewrite,
  isGenerating = false,
}: Props) {
  const typeLabel: Record<string, string> = {
    SEARCH: 'RSA',
    PERFORMANCE_MAX: 'Asset Group',
    DISPLAY: 'Responsive Display Ad',
    VIDEO: 'Video Ad',
    SHOPPING: 'Shopping',
    DEMAND_GEN: 'Demand Gen',
    APP_CAMPAIGN: 'App Campaign',
    YOUTUBE: 'Video Ad',
  }

  const typeColor: Record<string, string> = {
    SEARCH: 'bg-blue-100 text-blue-700',
    PERFORMANCE_MAX: 'bg-orange-100 text-orange-700',
    DISPLAY: 'bg-purple-100 text-purple-700',
    VIDEO: 'bg-pink-100 text-pink-700',
    SHOPPING: 'bg-green-100 text-green-700',
    DEMAND_GEN: 'bg-indigo-100 text-indigo-700',
    APP_CAMPAIGN: 'bg-teal-100 text-teal-700',
    YOUTUBE: 'bg-red-100 text-red-700',
  }

  const showAIRewrite = !['SHOPPING'].includes(campaignType)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('px-2.5 py-0.5 rounded-md text-xs font-semibold', typeColor[campaignType] ?? 'bg-gray-100 text-gray-600')}>
            {typeLabel[campaignType] ?? campaignType}
          </span>
          <h3 className="font-semibold text-gray-900">{campaignName}</h3>
        </div>
        {showAIRewrite && (
          <button
            onClick={onAIRewrite}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:bg-purple-400 transition-colors"
          >
            {isGenerating ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isGenerating ? 'กำลัง Rewrite...' : 'AI Rewrite'}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {(campaignType === 'SEARCH' || campaignType === 'YOUTUBE') && (
          <RsaEditor adCopy={adCopy} onChange={onChange} />
        )}
        {campaignType === 'PERFORMANCE_MAX' && (
          <PMaxEditor adCopy={adCopy} onChange={onChange} />
        )}
        {campaignType === 'DISPLAY' && (
          <DisplayEditor adCopy={adCopy} onChange={onChange} />
        )}
        {campaignType === 'VIDEO' && (
          <VideoEditor adCopy={adCopy} onChange={onChange} />
        )}
        {campaignType === 'SHOPPING' && (
          <ShoppingInfoCard adCopy={adCopy} onChange={onChange} />
        )}
        {campaignType === 'DEMAND_GEN' && (
          <DemandGenEditor adCopy={adCopy} onChange={onChange} />
        )}
        {campaignType === 'APP_CAMPAIGN' && (
          <AppCampaignEditor adCopy={adCopy} onChange={onChange} />
        )}
        {!['SEARCH', 'PERFORMANCE_MAX', 'DISPLAY', 'VIDEO', 'SHOPPING', 'DEMAND_GEN', 'APP_CAMPAIGN', 'YOUTUBE'].includes(campaignType) && (
          <p className="text-sm text-gray-500">Campaign type <strong>{campaignType}</strong> ไม่รองรับ Ad Creative Editor</p>
        )}
      </div>
    </div>
  )
}
