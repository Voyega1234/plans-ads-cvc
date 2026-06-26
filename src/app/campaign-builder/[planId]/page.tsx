'use client'

import AppShell from '@/components/layout/AppShell'
import FlowProgressBar from '@/components/workflow/FlowProgressBar'
import CampaignBlueprintCard from '@/components/campaign-builder/CampaignBlueprintCard'
import AdTextEditor from '@/components/campaigns/AdTextEditor'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CampaignBlueprintItem, CampaignBlueprintJson, PMaxAssetGroup, AdCopy } from '@/types'
import { Loader, Sparkles, ArrowRight, ArrowLeft, Upload, ImageIcon, Check, Monitor, Smartphone, ExternalLink, ChevronDown, ChevronUp, Plus, Trash2, Phone, Link as LinkIcon, List, AlignLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── PMax Image Upload ─────────────────────────────────────────────────────────
type ImageSlot = {
  assetType: 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'PORTRAIT_MARKETING_IMAGE' | 'LOGO'
  label: string; size: string; required: boolean; description: string
}
const IMAGE_SLOTS: ImageSlot[] = [
  { assetType: 'MARKETING_IMAGE',          label: 'Landscape Image', size: '1200×628px',  required: true,  description: 'Hero image หลัก' },
  { assetType: 'SQUARE_MARKETING_IMAGE',   label: 'Square Image',    size: '1200×1200px', required: true,  description: 'รูปสี่เหลี่ยม' },
  { assetType: 'PORTRAIT_MARKETING_IMAGE', label: 'Portrait Image',  size: '960×1200px',  required: false, description: 'รูปแนวตั้ง' },
  { assetType: 'LOGO',                     label: 'Square Logo',     size: '1200×1200px', required: true,  description: 'โลโก้สี่เหลี่ยม' },
]

function PMaxImageUploader({ assetGroup, assetGroupIndex, campaignIndex, onSave }: {
  assetGroup: PMaxAssetGroup; assetGroupIndex: number; campaignIndex: number
  onSave: (updated: PMaxAssetGroup) => void
}) {
  const [images, setImages] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const img of assetGroup.imageAssets ?? []) {
      const withUrl = img as typeof img & { imageUrl?: string }
      if (withUrl.imageUrl) map[img.assetType] = withUrl.imageUrl
    }
    return map
  })
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function handleFile(slot: ImageSlot, file: File) {
    setUploading(u => ({ ...u, [slot.assetType]: true }))
    setErrors(e => ({ ...e, [slot.assetType]: '' }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      const url = data.url as string
      setImages(prev => {
        const next = { ...prev, [slot.assetType]: url }
        const updatedAssets = IMAGE_SLOTS.map(s => ({
          assetType: s.assetType, description: s.label,
          imageUrl: next[s.assetType] ?? '',
        }))
        onSave({ ...assetGroup, imageAssets: updatedAssets.filter(a => a.imageUrl) as PMaxAssetGroup['imageAssets'] })
        return next
      })
    } catch (err) {
      setErrors(e => ({ ...e, [slot.assetType]: err instanceof Error ? err.message : 'Upload failed' }))
    } finally {
      setUploading(u => ({ ...u, [slot.assetType]: false }))
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Images &amp; Logo</p>
      <div className="grid grid-cols-2 gap-2">
        {IMAGE_SLOTS.map((slot) => {
          const url = images[slot.assetType]; const busy = uploading[slot.assetType]; const err = errors[slot.assetType]
          return (
            <div key={slot.assetType} className="border border-gray-200 rounded-lg overflow-hidden">
              <div
                className={cn('relative cursor-pointer group h-24 flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors')}
                onClick={() => inputRefs.current[slot.assetType]?.click()}
              >
                {url ? (
                  <><img src={url} alt={slot.label} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5"><Check className="w-3 h-3 text-white" /></div></>
                ) : busy ? <Loader className="w-5 h-5 text-gray-400 animate-spin" />
                : <><ImageIcon className="w-6 h-6 text-gray-300 mb-1" /></>}
                <input ref={el => { inputRefs.current[slot.assetType] = el }} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(slot, f) }} />
              </div>
              <div className="px-2 py-1.5 bg-white">
                <p className="text-[11px] font-medium text-gray-700">{slot.label}{slot.required && <span className="text-red-400">*</span>}</p>
                <p className="text-[10px] text-gray-400">{slot.size}</p>
                {err && <p className="text-[10px] text-red-500">{err}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Google Ads RSA Preview ─────────────────────────────────────────────────────
function RSAPreview({ campaign, device }: { campaign: CampaignBlueprintItem; device: 'desktop' | 'mobile' }) {
  const rsaAd = useMemo(() => {
    const firstGroup = campaign.adGroups?.[0]
    if (!firstGroup?.ads?.length) return null
    const adCopy = firstGroup.ads[0] as AdCopy
    const rsa = adCopy.rsa
    if (rsa) {
      return {
        headlines: rsa.headlines.filter(Boolean),
        descriptions: rsa.descriptions.filter(Boolean),
        finalUrl: rsa.finalUrl,
        displayPath: [rsa.displayPath1, rsa.displayPath2].filter(Boolean).join('/')
      }
    }
    // fallback to legacy AdCopy fields
    return {
      headlines: [adCopy.headline1, adCopy.headline2, adCopy.headline3].filter(Boolean),
      descriptions: [adCopy.description1, adCopy.description2].filter(Boolean),
      finalUrl: adCopy.finalUrl,
      displayPath: adCopy.displayPath ?? ''
    }
  }, [campaign])

  if (!rsaAd) return (
    <div className="flex items-center justify-center h-40 text-sm text-gray-400">ไม่มี Ad Copy</div>
  )

  const domain = rsaAd.finalUrl.replace(/^https?:\/\//, '').split('/')[0] || 'yoursite.com'
  const displayUrl = `${domain}${rsaAd.displayPath ? ' › ' + rsaAd.displayPath.replace(/\//g, ' › ') : ''}`
  const h1 = rsaAd.headlines[0] ?? ''
  const h2 = rsaAd.headlines[1] ?? ''
  const h3 = rsaAd.headlines[2] ?? ''
  const d1 = rsaAd.descriptions[0] ?? ''
  const d2 = rsaAd.descriptions[1] ?? ''

  if (device === 'mobile') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-3 max-w-[360px] mx-auto shadow-sm">
        {/* Mobile browser bar */}
        <div className="flex items-center gap-1.5 mb-3 bg-gray-100 rounded-full px-3 py-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-300" />
          <span className="text-[10px] text-gray-500 truncate flex-1">{domain}</span>
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </div>
        {/* Ad card */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] font-bold text-gray-500 bg-gray-100 border border-gray-300 rounded px-1">โฆษณา</span>
            <span className="text-[10px] text-emerald-700 truncate">{displayUrl}</span>
          </div>
          <p className="text-blue-700 font-semibold text-sm leading-tight mb-1">
            {[h1, h2, h3].filter(Boolean).join(' | ')}
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">{d1}</p>
          {d2 && <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{d2}</p>}
        </div>
        <div className="mt-2 text-[9px] text-gray-400 text-center">Mobile Preview · Google Search</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 mb-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-white border border-gray-200 rounded px-2 py-0.5 text-[11px] text-gray-500 truncate">
          google.com/search?q={campaign.adGroups?.[0]?.keywords?.[0] ?? 'keyword'}
        </div>
      </div>
      {/* Search result */}
      <div className="space-y-4">
        {/* Ad result */}
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-[8px] font-bold text-blue-700">G</span>
            </div>
            <span className="text-[11px] text-gray-700">{displayUrl}</span>
            <span className="text-[9px] text-gray-500 border border-gray-300 rounded px-1 ml-auto">โฆษณา</span>
          </div>
          <h3 className="text-[17px] text-blue-700 font-medium hover:underline cursor-pointer leading-snug mb-1">
            {[h1, h2, h3].filter(Boolean).join(' | ')}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">{d1}</p>
          {d2 && <p className="text-sm text-gray-600 leading-relaxed">{d2}</p>}
        </div>
        {/* Placeholder organic results */}
        <div className="space-y-3 opacity-30">
          {[1,2].map(i => (
            <div key={i}>
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-1" />
              <div className="h-2.5 bg-gray-100 rounded w-1/2 mb-1" />
              <div className="h-2 bg-gray-100 rounded w-full mb-0.5" />
              <div className="h-2 bg-gray-100 rounded w-4/5" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100 text-[9px] text-gray-400 text-center">Desktop Preview · Google Search</div>
    </div>
  )
}

// ── PMax Preview ───────────────────────────────────────────────────────────────
function PMaxPreview({ campaign }: { campaign: CampaignBlueprintItem }) {
  const ag = campaign.assetGroups?.[0]
  if (!ag) return <div className="text-sm text-gray-400 text-center py-8">ไม่มี Asset Group</div>
  const h = ag.headlines.slice(0, 3)
  const d = ag.descriptions.slice(0, 2)
  const logoUrl = (ag.imageAssets ?? []).find(i => i.assetType === 'LOGO') as (typeof ag.imageAssets[0] & { imageUrl?: string }) | undefined
  const heroUrl = (ag.imageAssets ?? []).find(i => i.assetType === 'MARKETING_IMAGE') as (typeof ag.imageAssets[0] & { imageUrl?: string }) | undefined

  return (
    <div className="space-y-3">
      {/* Responsive Display Ad preview */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gray-100 h-28 relative flex items-center justify-center overflow-hidden">
          {heroUrl?.imageUrl
            ? <img src={heroUrl.imageUrl} alt="hero" className="w-full h-full object-cover" />
            : <div className="text-gray-300 text-xs">Marketing Image (1200×628)</div>
          }
          <span className="absolute top-2 right-2 text-[9px] bg-white/80 text-gray-500 border border-gray-300 rounded px-1">โฆษณา</span>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
            {logoUrl?.imageUrl
              ? <img src={logoUrl.imageUrl} alt="logo" className="w-5 h-5 rounded object-contain" />
              : <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center"><span className="text-[8px] font-bold text-blue-600">L</span></div>
            }
            <span className="text-xs text-gray-500">{ag.businessName}</span>
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-tight mb-1">{h.join(' | ')}</p>
          <p className="text-xs text-gray-500">{d[0]}</p>
        </div>
      </div>
      <div className="text-[9px] text-gray-400 text-center">Performance Max · Responsive Ad Preview</div>
    </div>
  )
}

// ── Ad Extensions Editor ──────────────────────────────────────────────────────
function AdExtensionsEditor({ campaign, onChange }: {
  campaign: CampaignBlueprintItem
  onChange: (updated: CampaignBlueprintItem) => void
}) {
  const [open, setOpen] = useState(false)
  const sitelinks = campaign.sitelinks ?? []
  const callouts  = campaign.callouts ?? []
  const snippets  = campaign.structuredSnippets ?? []
  const phones    = campaign.phoneNumbers ?? []

  function updateSitelink(i: number, field: keyof typeof sitelinks[0], val: string) {
    const next = sitelinks.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
    onChange({ ...campaign, sitelinks: next })
  }
  function addSitelink() {
    onChange({ ...campaign, sitelinks: [...sitelinks, { text: '', description1: '', description2: '', finalUrl: '' }] })
  }
  function removeSitelink(i: number) {
    onChange({ ...campaign, sitelinks: sitelinks.filter((_, idx) => idx !== i) })
  }

  function updateCallout(i: number, val: string) {
    const next = callouts.map((c, idx) => idx === i ? val : c)
    onChange({ ...campaign, callouts: next })
  }
  function addCallout() { onChange({ ...campaign, callouts: [...callouts, ''] }) }
  function removeCallout(i: number) { onChange({ ...campaign, callouts: callouts.filter((_, idx) => idx !== i) }) }

  function updateSnippet(i: number, field: 'header' | 'values', val: string) {
    const next = snippets.map((s, idx) => idx === i
      ? { ...s, [field]: field === 'values' ? val.split(',').map(v => v.trim()) : val }
      : s
    )
    onChange({ ...campaign, structuredSnippets: next })
  }
  function addSnippet() { onChange({ ...campaign, structuredSnippets: [...snippets, { header: 'บริการ', values: [] }] }) }
  function removeSnippet(i: number) { onChange({ ...campaign, structuredSnippets: snippets.filter((_, idx) => idx !== i) }) }

  function updatePhone(i: number, val: string) {
    const next = phones.map((p, idx) => idx === i ? val : p)
    onChange({ ...campaign, phoneNumbers: next })
  }
  function addPhone() { onChange({ ...campaign, phoneNumbers: [...phones, ''] }) }
  function removePhone(i: number) { onChange({ ...campaign, phoneNumbers: phones.filter((_, idx) => idx !== i) }) }

  const totalExtensions = sitelinks.length + callouts.length + snippets.length + phones.length

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <LinkIcon className="w-4 h-4 text-blue-500" />
          Ad Extensions
          {totalExtensions > 0 && (
            <span className="text-xs font-normal text-gray-400">({totalExtensions} รายการ)</span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-6 bg-white">
          {/* Sitelinks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5" /> Sitelinks
              </p>
              <button onClick={addSitelink} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> เพิ่ม
              </button>
            </div>
            {sitelinks.length === 0 && (
              <p className="text-xs text-gray-400 italic">ยังไม่มี Sitelinks — เพิ่มอย่างน้อย 4 links</p>
            )}
            <div className="space-y-3">
              {sitelinks.map((sl, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-semibold">SITELINK {i + 1}</span>
                    <button onClick={() => removeSitelink(i)} className="text-red-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <input className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Link text (max 25 chars)" maxLength={25} value={sl.text} onChange={e => updateSitelink(i, 'text', e.target.value)} />
                  <input className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Description 1 (optional)" maxLength={35} value={sl.description1} onChange={e => updateSitelink(i, 'description1', e.target.value)} />
                  <input className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Description 2 (optional)" maxLength={35} value={sl.description2} onChange={e => updateSitelink(i, 'description2', e.target.value)} />
                  <input className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Final URL (https://...)" value={sl.finalUrl} onChange={e => updateSitelink(i, 'finalUrl', e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          {/* Callouts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <AlignLeft className="w-3.5 h-3.5" /> Callouts
              </p>
              <button onClick={addCallout} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> เพิ่ม
              </button>
            </div>
            {callouts.length === 0 && (
              <p className="text-xs text-gray-400 italic">ยังไม่มี Callouts — เพิ่ม 4+ callouts</p>
            )}
            <div className="flex flex-wrap gap-2">
              {callouts.map((c, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-100 rounded-full pl-2 pr-1 py-0.5">
                  <input className="bg-transparent text-xs focus:outline-none w-28" maxLength={25} value={c} onChange={e => updateCallout(i, e.target.value)} placeholder="Callout text" />
                  <button onClick={() => removeCallout(i)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Structured Snippets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <List className="w-3.5 h-3.5" /> Structured Snippets
              </p>
              <button onClick={addSnippet} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> เพิ่ม
              </button>
            </div>
            {snippets.length === 0 && (
              <p className="text-xs text-gray-400 italic">ยังไม่มี Structured Snippets</p>
            )}
            <div className="space-y-2">
              {snippets.map((sn, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-semibold">SNIPPET {i + 1}</span>
                    <button onClick={() => removeSnippet(i)} className="text-red-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <input className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Header (e.g. บริการ, สินค้า)" value={sn.header} onChange={e => updateSnippet(i, 'header', e.target.value)} />
                  <input className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Values (คั่นด้วย comma)" value={sn.values.join(', ')} onChange={e => updateSnippet(i, 'values', e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          {/* Call Asset */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Call Asset
              </p>
              <button onClick={addPhone} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3 h-3" /> เพิ่ม
              </button>
            </div>
            {phones.length === 0 && (
              <p className="text-xs text-gray-400 italic">ยังไม่มี Call Asset</p>
            )}
            <div className="space-y-2">
              {phones.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <input className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="เบอร์โทร (e.g. 02-123-4567)" value={p} onChange={e => updatePhone(i, e.target.value)} />
                  <button onClick={() => removePhone(i)} className="text-red-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Type colors ───────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  SEARCH:          'bg-blue-100 text-blue-700 border-blue-200',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-700 border-orange-200',
  DISPLAY:         'bg-purple-100 text-purple-700 border-purple-200',
  VIDEO:           'bg-pink-100 text-pink-700 border-pink-200',
  YOUTUBE:         'bg-red-100 text-red-700 border-red-200',
  SHOPPING:        'bg-green-100 text-green-700 border-green-200',
  DEMAND_GEN:      'bg-teal-100 text-teal-700 border-teal-200',
}

// ── Campaign Name Formatter ────────────────────────────────────────────────────
function formatCampaignName(campaign: CampaignBlueprintItem): string {
  const type = campaign.campaignType
  const bid = campaign.bidStrategy ?? ''

  // Derive keyword group label from ad groups
  const adGroupName = campaign.adGroups?.[0]?.adGroupName ?? ''
  const kwGroup = adGroupName || 'Generic'

  // Bid suffix for YouTube
  const bidSuffix = bid.includes('CPM') ? 'CPM'
    : bid.includes('CPV') ? 'CPV'
    : bid.includes('CPA') || bid.includes('TARGET_CPA') ? 'CPA'
    : bid.includes('ROAS') ? 'ROAS'
    : ''

  // Objective label from campaign name or adGroup
  const existingName = campaign.campaignName ?? ''
  const goalMatch = existingName.match(/Traffic|Leads|Sales|Awareness|Conversion|Engagement|Install/i)
  const goal = goalMatch ? goalMatch[0] : 'Traffic'

  // Audience from assetGroups
  const audience = campaign.assetGroups?.[0]?.assetGroupName ?? 'All Audiences'

  switch (type) {
    case 'SEARCH':
      return `CVC - SEM | ${kwGroup} | ${goal}`
    case 'PERFORMANCE_MAX':
      return `CVC - Performance Max | ${audience}`
    case 'DISPLAY':
      return `CVC - GDN | ${kwGroup}`
    case 'DEMAND_GEN':
      return `CVC - Demand Gen | ${goal}`
    case 'SHOPPING':
      return `CVC - Shopping | ${bidSuffix || 'MAXIMIZE_CLICKS'}`
    case 'VIDEO':
    case 'YOUTUBE':
      return `CVC - YouTube | ${bidSuffix || 'CPV'}`
    case 'APP_CAMPAIGN': {
      // Distinguish install vs engagement from name
      const isEngage = existingName.toLowerCase().includes('engag')
      return isEngage ? `CVC - UACe | App Engagement` : `CVC - UACi | App Install`
    }
    default:
      return `CVC - ${type} | ${goal}`
  }
}

// ── Inline Campaign Name Editor ────────────────────────────────────────────────
function CampaignNameEditor({ campaign, onChange }: {
  campaign: CampaignBlueprintItem
  onChange: (updated: CampaignBlueprintItem) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(campaign.campaignName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(campaign.campaignName) }, [campaign.campaignName])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== campaign.campaignName) onChange({ ...campaign, campaignName: trimmed })
    setEditing(false)
  }

  function autoFormat() {
    const formatted = formatCampaignName(campaign)
    onChange({ ...campaign, campaignName: formatted })
    setDraft(formatted)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {editing ? (
        <>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(campaign.campaignName); setEditing(false) } }}
            className="flex-1 text-sm font-semibold text-gray-900 border border-blue-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button onClick={commit} className="px-2 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0">บันทึก</button>
          <button onClick={() => { setDraft(campaign.campaignName); setEditing(false) }} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 shrink-0">ยกเลิก</button>
        </>
      ) : (
        <>
          <button
            onClick={() => { setDraft(campaign.campaignName); setEditing(true) }}
            className="text-sm font-semibold text-gray-900 hover:text-blue-700 text-left truncate max-w-[320px] group flex items-center gap-1.5"
            title="คลิกเพื่อแก้ไขชื่อ campaign"
          >
            {campaign.campaignName}
            <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.772-8.772z" />
            </svg>
          </button>
          <button
            onClick={autoFormat}
            className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 font-medium"
            title="Auto-format ชื่อตาม CVC naming convention"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            CVC Format
          </button>
        </>
      )}
    </div>
  )
}

export default function CampaignBuilderPage() {
  const params = useParams()
  const router = useRouter()
  const planId = params.planId as string
  const [blueprint, setBlueprint] = useState<CampaignBlueprintJson | null>(null)
  const [blueprintId, setBlueprintId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchExisting() }, [planId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchExisting() {
    try {
      const res = await fetch(`/api/campaign-blueprints/${planId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.id) { setBlueprintId(data.id); setBlueprint(JSON.parse(data.blueprintJson)) }
      }
    } catch {}
    setLoading(false)
  }

  async function generate() {
    setGenerating(true); setError(null)
    try {
      const res = await fetch('/api/campaign-blueprints/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) throw new Error('Failed to generate blueprint')
      const data = await res.json()
      setBlueprintId(data.id)
      setBlueprint(JSON.parse(data.blueprintJson))
      setActiveTab(0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error generating blueprint')
    } finally {
      setGenerating(false)
    }
  }

  function handleCampaignChange(updated: CampaignBlueprintItem) {
    if (!blueprint) return
    const next = { ...blueprint, campaigns: blueprint.campaigns.map((c, idx) => idx === activeTab ? updated : c) }
    setBlueprint(next)
    if (planId) {
      fetch(`/api/campaign-blueprints/${planId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintJson: JSON.stringify(next) }),
      }).catch(() => {})
    }
  }

  function handleAssetGroupChange(campIdx: number, agIdx: number, updated: PMaxAssetGroup) {
    if (!blueprint) return
    const camp = blueprint.campaigns[campIdx]
    handleCampaignChange({ ...camp, assetGroups: (camp.assetGroups ?? []).map((ag, i) => i === agIdx ? updated : ag) })
  }

  const campaign = blueprint?.campaigns[activeTab]
  const isPMax = campaign?.campaignType === 'PERFORMANCE_MAX'

  const hasPMaxNeedingImages = blueprint?.campaigns.some(
    (c) => c.campaignType === 'PERFORMANCE_MAX' && (c.assetGroups?.[0]?.imageAssets?.length ?? 0) === 0
  ) ?? false

  return (
    <AppShell>
      <FlowProgressBar planId={planId as string} currentStep="adcopy" />
      {/* Header */}
      <div className="flex items-center justify-between mb-4 mt-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/campaign-details/${planId}`)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />Campaign Details
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ad Copy Builder</h1>
            <p className="text-gray-500 text-sm">แก้ไข Text Ads · AI เขียนให้แล้ว พร้อม preview เหมือน Google Ads</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!loading && (
            <button onClick={generate} disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:bg-purple-400 transition-colors"
            >
              {generating ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'กำลังสร้าง...' : blueprint ? 'Re-generate' : 'Generate Blueprint'}
            </button>
          )}
          {blueprintId && (
            <button
              onClick={() => router.push(`/review/${planId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              ถัดไป: QA Review <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* PMax image advisory banner — non-blocking, images can be uploaded at push time */}
      {hasPMaxNeedingImages && blueprint && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-sm text-amber-700">
          <Upload className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">แนะนำ: อัปโหลดรูปภาพ PMax</span>
            {' '}— Performance Max campaigns ยังไม่มีรูป คุณสามารถอัปโหลดได้ที่นี่ หรือเพิ่มทีหลังตอน Push:&nbsp;
            {blueprint.campaigns
              .filter((c) => c.campaignType === 'PERFORMANCE_MAX' && (c.assetGroups?.[0]?.imageAssets?.length ?? 0) === 0)
              .map((c) => c.campaignName.split('|').pop()?.trim())
              .join(', ')}
          </div>
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader className="w-8 h-8 text-purple-500 animate-spin" /></div>
      ) : !blueprint ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-5xl mb-4">⚡</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">ยังไม่มี Campaign Blueprint</h3>
          <p className="text-gray-500 mb-6">กด Generate เพื่อให้ AI สร้าง Ad Copy ทั้งหมด</p>
          <button onClick={generate} disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? <><Loader className="w-4 h-4 animate-spin mr-1" />กำลังสร้าง...</> : 'Generate Blueprint'}
          </button>
        </div>
      ) : (
        <div className="space-y-0">
          {/* Campaign tab bar — fixed at top */}
          <div className="bg-white border border-gray-200 rounded-t-xl overflow-x-auto">
            <div className="flex border-b border-gray-200 bg-gray-50">
              {blueprint.campaigns.map((c, i) => {
                const isActive = i === activeTab
                const shortName = c.campaignName.split('|').pop()?.trim() ?? c.campaignName
                return (
                  <button key={i} onClick={() => setActiveTab(i)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0',
                      isActive ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    )}
                  >
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border', TYPE_COLORS[c.campaignType] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                      {c.campaignType === 'PERFORMANCE_MAX' ? 'PMAX' : c.campaignType}
                    </span>
                    <span className="max-w-[150px] truncate">{shortName}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2-column: editor left, preview right */}
          {campaign && (
            <div className="border border-t-0 border-gray-200 rounded-b-xl bg-white overflow-hidden">
              <div className="flex min-h-[600px]">
                {/* ── Left: Editor ──────────────────────────────────────── */}
                <div className="flex-1 border-r border-gray-100 overflow-y-auto max-h-[calc(100vh-180px)]">
                  {/* Campaign name & info bar */}
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0', TYPE_COLORS[campaign.campaignType] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                        {campaign.campaignType === 'PERFORMANCE_MAX' ? 'PMAX' : campaign.campaignType}
                      </span>
                      <CampaignNameEditor campaign={campaign} onChange={handleCampaignChange} />
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Budget: <strong className="text-gray-700">฿{campaign.budget?.toLocaleString()}/วัน</strong></span>
                      <span>Bid: <strong className="text-gray-700">{campaign.bidStrategy?.replace(/_/g, ' ')}</strong></span>
                      {campaign.status && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-700">{campaign.status}</span>}
                    </div>
                  </div>

                  {/* Account settings */}
                  {blueprint.accountSettings && (
                    <div className="px-5 py-2 border-b border-gray-100 flex gap-4 text-xs text-gray-500 bg-gray-50/50">
                      <span>Currency: <strong>{blueprint.accountSettings.currency}</strong></span>
                      <span>Timezone: <strong>{blueprint.accountSettings.timeZone}</strong></span>
                      <span>Auto-tagging: <strong>{blueprint.accountSettings.autoTagging ? 'On' : 'Off'}</strong></span>
                    </div>
                  )}

                  {/* Ad text editor — always open */}
                  <div className="p-5 space-y-5">
                    {isPMax && campaign.assetGroups && campaign.assetGroups.length > 0 ? (
                      <div className="space-y-5">
                        {campaign.assetGroups.map((ag, j) => (
                          <div key={j} className="space-y-4">
                            <p className="text-sm font-semibold text-gray-800">Asset Group {j + 1}: {ag.assetGroupName}</p>
                            <PMaxImageUploader
                              assetGroup={ag} assetGroupIndex={j} campaignIndex={activeTab}
                              onSave={(updated) => handleAssetGroupChange(activeTab, j, updated)}
                            />
                            <div className="pt-2 border-t border-gray-100">
                              <AdTextEditor campaign={campaign} onChange={handleCampaignChange} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <AdTextEditor campaign={campaign} onChange={handleCampaignChange} />
                    )}

                    {/* Ad Extensions Editor */}
                    <AdExtensionsEditor campaign={campaign} onChange={handleCampaignChange} />
                  </div>
                </div>

                {/* ── Right: Preview panel ─────────────────────────────── */}
                <div className="w-[380px] shrink-0 bg-gray-50 overflow-y-auto max-h-[calc(100vh-180px)]">
                  <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Ad Preview</p>
                    {!isPMax && (
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setPreviewDevice('desktop')}
                          className={cn('flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                            previewDevice === 'desktop' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          )}
                        >
                          <Monitor className="w-3 h-3" /> Desktop
                        </button>
                        <button
                          onClick={() => setPreviewDevice('mobile')}
                          className={cn('flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                            previewDevice === 'mobile' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          )}
                        >
                          <Smartphone className="w-3 h-3" /> Mobile
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    {isPMax
                      ? <PMaxPreview campaign={campaign} />
                      : <RSAPreview campaign={campaign} device={previewDevice} />
                    }

                    {/* Ad strength summary */}
                    {!isPMax && (() => {
                      const firstAd = campaign.adGroups?.[0]?.ads?.[0] as AdCopy | undefined
                      const headlines = firstAd?.rsa?.headlines
                        ?? [firstAd?.headline1, firstAd?.headline2, firstAd?.headline3].filter((h): h is string => !!h)
                      return headlines.length > 0 ? (
                        <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                          <p className="text-xs font-semibold text-gray-500 mb-2">HEADLINES</p>
                          <div className="space-y-1">
                            {headlines.filter(Boolean).slice(0, 5).map((h, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="text-[10px] text-gray-400 w-4 shrink-0 mt-0.5">{i+1}.</span>
                                <span className={cn('text-xs', h.length > 30 ? 'text-red-500' : 'text-gray-700')}>{h}</span>
                                <span className={cn('text-[10px] ml-auto shrink-0', h.length > 30 ? 'text-red-400' : 'text-gray-400')}>{h.length}/30</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null
                    })()}

                    {/* Extensions preview */}
                    {campaign.sitelinks && campaign.sitelinks.length > 0 && (
                      <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-2">SITELINKS</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {campaign.sitelinks.slice(0, 4).map((sl, i) => (
                            <div key={i} className="text-[11px]">
                              <p className="text-blue-600 font-medium">{sl.text}</p>
                              {sl.description1 && <p className="text-gray-500">{sl.description1}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {campaign.callouts && campaign.callouts.length > 0 && (
                      <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-2">CALLOUTS</p>
                        <div className="flex flex-wrap gap-1">
                          {campaign.callouts.map((c, i) => (
                            <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Conversion Actions */}
          {(blueprint.conversionActions?.length ?? 0) > 0 && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Conversion Actions ({blueprint.conversionActions.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {blueprint.conversionActions.map((ca, i) => (
                  <div key={i} className="bg-emerald-50 rounded-lg border border-emerald-200 p-3">
                    <p className="font-medium text-sm text-emerald-800">{ca.name}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">{ca.category} • {ca.countingType}</p>
                    {ca.value && <p className="text-xs text-emerald-700 font-medium mt-1">Value: ฿{ca.value}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}
