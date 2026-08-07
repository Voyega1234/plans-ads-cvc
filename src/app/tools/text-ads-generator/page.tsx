'use client'

// ── Text Ads Generator ────────────────────────────────────────────────────────
// เครื่องมือแยกสำหรับเขียน Text Ads (RSA) โดยไม่ต้องเข้า flow ของ Media plan
// เคสหลัก: ลูกค้าขอปรับ text ads ให้ relate กับแคปชั่น/ราคาใหม่ → gen → ตรวจ →
// export ส่งลูกค้า → ถูกใจแล้ว push เข้าแคมเปญจริงได้เลย
//
// flow: 1 setup (account/campaign/keywords/objective/budget)
//       2 suggestion + exclusion  3 แนบครีเอทีฟ  4 AI Generate
//       5 preview + แก้มือ  6 ไม่ถูกใจวนกลับ 2  7 push  8 export (มี preview ในไฟล์)

import React, { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  Sparkles, RefreshCw, Loader2, AlertCircle, CheckCircle2, Plus, X,
  Download, Upload, ImageIcon, Wand2, Building2, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccountSelect } from '@/components/ui/AccountSelect'
import {
  GoogleSearchPreview, exportTextAdsHtml, exportTextAdsCsv, RSA_LIMITS, type TextAdDraft,
} from '@/components/text-ads/textAdsShared'
import type { GeneratedTextAd } from '@/app/api/text-ads/generate/route'
import type { CampaignSummary } from '@/app/api/campaign-edit/campaigns/route'

interface AdGroupOption { adGroupId: string; adGroupResourceName: string; name: string; status: string }

// ย่อรูปครีเอทีฟก่อนส่งให้ AI (ไม่ต้องส่งไฟล์เต็ม — AI อ่านได้สบายที่ ~1000px)
async function fileToDataUrl(file: File, maxDim = 1000): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    r.readAsDataURL(file)
  })
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('decode failed'))
      im.src = raw
    })
    const longest = Math.max(img.naturalWidth, img.naturalHeight)
    if (longest <= maxDim) return raw
    const scale = maxDim / longest
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return raw
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return raw
  }
}

export default function TextAdsGeneratorPage() {
  // ── 1. Main setup ──────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Array<{ id: string; descriptiveName: string }>>([])
  const [customerId, setCustomerId] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [campaignRn, setCampaignRn] = useState('')   // '' = ไม่ผูกแคมเปญ
  const [campaignsLoading, setCampaignsLoading] = useState(false)

  const [businessName, setBusinessName] = useState('')
  const [productService, setProductService] = useState('')
  const [finalUrl, setFinalUrl] = useState('')
  const [objective, setObjective] = useState('leads')
  const [dailyBudget, setDailyBudget] = useState('')

  // keywords: ดึงจากแคมเปญ / พิมพ์เอง / gen จาก AI
  const [keywords, setKeywords] = useState<string[]>([])
  const [newKw, setNewKw] = useState('')
  const [kwLoading, setKwLoading] = useState(false)
  const [kwGenLoading, setKwGenLoading] = useState(false)

  // ── 2-3. Suggestion / Exclusion / Creatives ───────────────────────────────
  const [suggestions, setSuggestions] = useState('')
  const [exclusions, setExclusions] = useState('')
  const [creatives, setCreatives] = useState<string[]>([])

  // ── 4-5. Generate + Preview/Edit ──────────────────────────────────────────
  const [numAds, setNumAds] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [ads, setAds] = useState<TextAdDraft[]>([])
  const [prevAds, setPrevAds] = useState<GeneratedTextAd[]>([])

  // ── 7. Push ───────────────────────────────────────────────────────────────
  const [adGroups, setAdGroups] = useState<AdGroupOption[]>([])
  const [pushTarget, setPushTarget] = useState('')
  const [pushPaused, setPushPaused] = useState(true)
  const [pushing, setPushing] = useState<Record<number, boolean>>({})
  const [pushResult, setPushResult] = useState<Record<number, { ok: boolean; text: string }>>({})

  // load accounts
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json() as Promise<{ accounts?: Array<{ id: string; descriptiveName: string; manager?: boolean }> }>)
      .then(d => {
        const accs = (d.accounts ?? []).filter(a => !a.manager)
        setAccounts(accs)
        if (accs.length > 0) setCustomerId(accs[0].id)
      })
      .catch(() => {})
  }, [])

  // load campaigns of account
  useEffect(() => {
    if (!customerId) return
    setCampaignsLoading(true)
    setCampaigns([])
    setCampaignRn('')
    fetch(`/api/campaign-edit/campaigns?customerId=${customerId}`)
      .then(r => r.json() as Promise<{ campaigns?: CampaignSummary[] }>)
      .then(d => setCampaigns((d.campaigns ?? []).filter(c => c.type === 'SEARCH')))
      .catch(() => {})
      .finally(() => setCampaignsLoading(false))
  }, [customerId])

  const selectedCampaign = campaigns.find(c => c.campaignResourceName === campaignRn)

  // เลือกแคมเปญ → ดึง keywords เดิม + ad groups (สำหรับ push)
  useEffect(() => {
    if (!campaignRn || !customerId) { setAdGroups([]); setPushTarget(''); return }
    setKwLoading(true)
    fetch(`/api/campaign-edit/keywords?customerId=${customerId}&campaignResourceName=${encodeURIComponent(campaignRn)}`)
      .then(r => r.json() as Promise<{ keywords?: Array<{ keyword?: { text?: string }; text?: string; negative?: boolean }> }>)
      .then(d => {
        const kws = (d.keywords ?? [])
          .filter(k => !k.negative)
          .map(k => k.keyword?.text ?? k.text ?? '')
          .filter(Boolean)
        if (kws.length > 0) setKeywords(prev => Array.from(new Set([...prev, ...kws])))
      })
      .catch(() => {})
      .finally(() => setKwLoading(false))
    fetch(`/api/campaign-edit/ad-groups?customerId=${customerId}&campaignResourceName=${encodeURIComponent(campaignRn)}`)
      .then(r => r.json() as Promise<{ adGroups?: AdGroupOption[] }>)
      .then(d => {
        setAdGroups(d.adGroups ?? [])
        if ((d.adGroups ?? []).length > 0) setPushTarget(d.adGroups![0].adGroupResourceName)
      })
      .catch(() => {})
  }, [campaignRn, customerId])

  // Gen keywords จาก AI (เคสไม่ได้ดึงจากแคมเปญ)
  async function genKeywords() {
    if (!businessName.trim() || !productService.trim()) {
      setGenError('ใส่ชื่อธุรกิจ + สินค้า/บริการก่อน gen keyword')
      return
    }
    setKwGenLoading(true)
    setGenError('')
    try {
      const res = await fetch('/api/keyword-research/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, productService, objective, customerId }),
      })
      const data = await res.json() as { keywords?: Array<{ keyword: string; selected: boolean }>; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Gen keyword ไม่สำเร็จ')
      const kws = (data.keywords ?? []).filter(k => k.selected).map(k => k.keyword)
      setKeywords(prev => Array.from(new Set([...prev, ...kws])))
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Gen keyword ไม่สำเร็จ')
    } finally {
      setKwGenLoading(false)
    }
  }

  async function handleCreativeFiles(files: FileList | null) {
    if (!files) return
    const room = 3 - creatives.length
    const list = Array.from(files).slice(0, room)
    for (const f of list) {
      if (!f.type.startsWith('image/')) continue
      try {
        const url = await fileToDataUrl(f)
        setCreatives(prev => prev.length < 3 ? [...prev, url] : prev)
      } catch { /* ข้ามไฟล์ที่อ่านไม่ได้ */ }
    }
  }

  // ── 4. Generate ───────────────────────────────────────────────────────────
  async function generate() {
    if (!businessName.trim()) { setGenError('ใส่ชื่อธุรกิจ/แบรนด์ก่อน'); return }
    setGenerating(true)
    setGenError('')
    setPushResult({})
    try {
      const res = await fetch('/api/text-ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, productService, finalUrl, objective,
          ...(Number(dailyBudget) > 0 ? { dailyBudget: Number(dailyBudget) } : {}),
          keywords, suggestions, exclusions, creatives, numAds,
          // รอบ regenerate: ส่งของเดิมไปให้ AI รู้ว่าไม่ถูกใจ จะได้ไม่เขียนซ้ำแนวเดิม
          ...(ads.length > 0 ? { previous: prevAds } : {}),
        }),
      })
      const data = await res.json() as { ads?: GeneratedTextAd[]; error?: string }
      if (!res.ok || !data.ads) throw new Error(data.error ?? 'Generate ไม่สำเร็จ')
      setPrevAds(data.ads)
      setAds(data.ads.map(a => ({
        headlines: a.headlines,
        descriptions: a.descriptions,
        finalUrl: finalUrl.trim() || 'https://',
        path1: a.path1, path2: a.path2,
      })))
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generate ไม่สำเร็จ')
    } finally {
      setGenerating(false)
    }
  }

  // ── 5. แก้มือ ─────────────────────────────────────────────────────────────
  const editAd = useCallback((idx: number, patch: Partial<TextAdDraft>) => {
    setAds(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a))
  }, [])

  // ── 7. Push เข้าแคมเปญ (ใช้ create-RSA API ของ Campaign Adjustment) ────────
  async function pushAd(idx: number) {
    const ad = ads[idx]
    if (!pushTarget || !customerId) return
    setPushing(p => ({ ...p, [idx]: true }))
    setPushResult(p => ({ ...p, [idx]: undefined as never }))
    try {
      const res = await fetch(`/api/campaign-edit/ads?customerId=${customerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adType: 'RSA',
          adGroupResourceName: pushTarget,
          headlines: ad.headlines.map(h => h.trim()).filter(Boolean),
          descriptions: ad.descriptions.map(d => d.trim()).filter(Boolean),
          finalUrls: [ad.finalUrl.trim()],
          path1: ad.path1 ?? '', path2: ad.path2 ?? '',
          status: pushPaused ? 'PAUSED' : 'ENABLED',
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Push ไม่สำเร็จ')
      setPushResult(p => ({ ...p, [idx]: { ok: true, text: `Push แล้ว (${pushPaused ? 'PAUSED — เปิดเองเมื่อพร้อม' : 'ENABLED'})` } }))
    } catch (e) {
      setPushResult(p => ({ ...p, [idx]: { ok: false, text: e instanceof Error ? e.message : 'Push ไม่สำเร็จ' } }))
    } finally {
      setPushing(p => ({ ...p, [idx]: false }))
    }
  }

  const exportTitle = businessName.trim() || selectedCampaign?.campaignName || 'text-ads'

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Text Ads Generator</h1>
          <p className="text-sm text-gray-500 mt-1">เขียน Text Ads ใหม่ / ปรับตามที่ลูกค้าขอ → ตรวจ → export ส่งลูกค้า → push เข้าแคมเปญ</p>
        </div>

        {/* ── 1. Main Setup ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">1 · Setup</p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400 shrink-0"/>
              <label className="text-xs font-semibold text-gray-500 uppercase shrink-0">Ad Account</label>
              <AccountSelect accounts={accounts} value={customerId} onChange={setCustomerId}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"/>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <label className="text-xs font-semibold text-gray-500 uppercase shrink-0">Campaign (ไม่บังคับ)</label>
              <select value={campaignRn} onChange={e => setCampaignRn(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                <option value="">— ไม่ผูกแคมเปญ (เขียนลอย ๆ) —</option>
                {campaigns.map(c => <option key={c.campaignId} value={c.campaignResourceName}>{c.campaignName}</option>)}
              </select>
              {campaignsLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-300 shrink-0"/>}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">เลือกแคมเปญ = ดึง keywords เดิมมาใช้ + push กลับเข้าแคมเปญนั้นได้ (เฉพาะแคมเปญ Search)</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="ชื่อธุรกิจ/แบรนด์ *"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"/>
            <input value={productService} onChange={e => setProductService(e.target.value)} placeholder="สินค้า/บริการหลัก"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"/>
            <select value={objective} onChange={e => setObjective(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
              <option value="leads">Leads / สอบถาม</option>
              <option value="sales">Sales / ซื้อสินค้า</option>
              <option value="calls">Phone Calls</option>
              <option value="awareness">Awareness</option>
              <option value="appointment">นัดหมาย / Booking</option>
              <option value="real_estate">อสังหาริมทรัพย์</option>
            </select>
            <input type="number" value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} placeholder="งบ/วัน (฿ ไม่บังคับ)"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"/>
          </div>
          <input value={finalUrl} onChange={e => setFinalUrl(e.target.value)} placeholder="Final URL — https://..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"/>

          {/* Keywords */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase">Keywords ({keywords.length})</label>
              {kwLoading && <span className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/>ดึงจากแคมเปญ...</span>}
              <button onClick={genKeywords} disabled={kwGenLoading}
                className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50">
                {kwGenLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>}
                Gen Keyword ด้วย AI
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {keywords.map((k, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                  {k}
                  <button onClick={() => setKeywords(prev => prev.filter((_, j) => j !== i))}
                    className="opacity-40 hover:opacity-100"><X className="w-3 h-3"/></button>
                </span>
              ))}
              {keywords.length === 0 && <span className="text-xs text-gray-400">ยังไม่มี — ดึงจากแคมเปญ, พิมพ์เอง หรือกด Gen</span>}
            </div>
            <div className="flex items-center gap-2">
              <input value={newKw} onChange={e => setNewKw(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newKw.trim()) {
                    setKeywords(prev => Array.from(new Set([...prev, newKw.trim()])))
                    setNewKw('')
                  }
                }}
                placeholder="พิมพ์ keyword แล้วกด Enter"
                className="flex-1 max-w-xs px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"/>
              <button onClick={() => { if (newKw.trim()) { setKeywords(prev => Array.from(new Set([...prev, newKw.trim()]))); setNewKw('') } }}
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"><Plus className="w-3.5 h-3.5"/></button>
            </div>
          </div>
        </div>

        {/* ── 2-3. Suggestion + Creative ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">2 · บอก AI ว่าอยากได้อะไร</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-emerald-600 uppercase mb-1">อยากให้เขียนอะไร (Do)</label>
              <textarea value={suggestions} onChange={e => setSuggestions(e.target.value)} rows={3}
                placeholder="เช่น เน้นแคปชั่นห้องเพดานสูง 4.3 ม. ราคาใหม่ 6.89 ลบ. / ใส่ CTA นัดชมโครงการ"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y focus:outline-none focus:border-emerald-400"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-red-500 uppercase mb-1">ไม่เอาอะไร (Don&apos;t)</label>
              <textarea value={exclusions} onChange={e => setExclusions(e.target.value)} rows={3}
                placeholder="เช่น ห้ามใช้คำว่า ถูกที่สุด / ไม่พูดถึงโปรเก่า / ไม่เอาภาษาอังกฤษล้วน"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y focus:outline-none focus:border-red-400"/>
            </div>
          </div>

          {/* creative attach */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
              แนบครีเอทีฟให้ AI อ่านประกอบ (ไม่บังคับ สูงสุด 3 รูป)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {creatives.map((c, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c} alt={`creative ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-gray-200"/>
                  <button onClick={() => setCreatives(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 p-0.5 bg-white rounded-full shadow text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5"/>
                  </button>
                </div>
              ))}
              {creatives.length < 3 && (
                <label className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-500 cursor-pointer transition-colors">
                  <ImageIcon className="w-5 h-5"/>
                  <span className="text-[10px] mt-1">เพิ่มรูป</span>
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { handleCreativeFiles(e.target.files); e.target.value = '' }}/>
                </label>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">AI จะอ่านข้อความ/ราคา/โปรโมชั่นในรูป แล้วเขียน text ads ให้ตรงกับครีเอทีฟ</p>
          </div>

          {/* generate */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button onClick={generate} disabled={generating || !businessName.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin"/>กำลังเขียน...</>
                : ads.length > 0
                  ? <><RefreshCw className="w-4 h-4"/>Generate ใหม่ (ตาม Do/Don&apos;t ที่แก้)</>
                  : <><Sparkles className="w-4 h-4"/>AI Generate</>}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              จำนวนชุด
              <select value={numAds} onChange={e => setNumAds(Number(e.target.value))}
                className="px-2 py-1 border border-gray-200 rounded-lg bg-white focus:outline-none">
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </label>
            {genError && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="w-4 h-4"/>{genError}</p>}
            {ads.length > 0 && !generating && (
              <p className="text-[11px] text-gray-400">ไม่ถูกใจ? แก้ Do/Don&apos;t ข้างบนแล้วกด Generate ใหม่ — AI จะไม่เขียนซ้ำแนวเดิม</p>
            )}
          </div>
        </div>

        {/* ── 5-8. Preview / Edit / Export / Push ── */}
        {ads.map((ad, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ad {idx + 1}</p>
              <span className="text-[11px] text-gray-400">{ad.headlines.filter(h => h.trim()).length} headlines · {ad.descriptions.filter(d => d.trim()).length} descriptions</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => exportTextAdsHtml(exportTitle, [ad], businessName)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <FileText className="w-3.5 h-3.5"/>HTML
                </button>
                <button onClick={() => exportTextAdsCsv(exportTitle, [ad])}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Download className="w-3.5 h-3.5"/>CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* editor */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Headlines</label>
                  <div className="space-y-1.5">
                    {ad.headlines.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={h}
                          onChange={e => editAd(idx, { headlines: ad.headlines.map((x, j) => j === i ? e.target.value : x) })}
                          className={cn('flex-1 px-2.5 py-1.5 text-sm border rounded-lg',
                            h.trim().length > RSA_LIMITS.HEADLINE_MAX ? 'border-red-300 bg-red-50/40' : 'border-gray-200')}/>
                        <span className={cn('text-[10px] w-10 text-right', h.trim().length > RSA_LIMITS.HEADLINE_MAX ? 'text-red-600' : 'text-gray-400')}>
                          {h.trim().length}/{RSA_LIMITS.HEADLINE_MAX}
                        </span>
                        <button onClick={() => editAd(idx, { headlines: ad.headlines.filter((_, j) => j !== i) })}
                          className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5"/></button>
                      </div>
                    ))}
                  </div>
                  {ad.headlines.length < RSA_LIMITS.HEADLINE_COUNT_MAX && (
                    <button onClick={() => editAd(idx, { headlines: [...ad.headlines, ''] })}
                      className="mt-1 text-[11px] text-blue-600 hover:underline">+ เพิ่ม headline</button>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Descriptions</label>
                  <div className="space-y-1.5">
                    {ad.descriptions.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <textarea value={d} rows={2}
                          onChange={e => editAd(idx, { descriptions: ad.descriptions.map((x, j) => j === i ? e.target.value : x) })}
                          className={cn('flex-1 px-2.5 py-1.5 text-sm border rounded-lg resize-y',
                            d.trim().length > RSA_LIMITS.DESC_MAX ? 'border-red-300 bg-red-50/40' : 'border-gray-200')}/>
                        <span className={cn('text-[10px] w-10 text-right', d.trim().length > RSA_LIMITS.DESC_MAX ? 'text-red-600' : 'text-gray-400')}>
                          {d.trim().length}/{RSA_LIMITS.DESC_MAX}
                        </span>
                        <button onClick={() => editAd(idx, { descriptions: ad.descriptions.filter((_, j) => j !== i) })}
                          className="p-0.5 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5"/></button>
                      </div>
                    ))}
                  </div>
                  {ad.descriptions.length < RSA_LIMITS.DESC_COUNT_MAX && (
                    <button onClick={() => editAd(idx, { descriptions: [...ad.descriptions, ''] })}
                      className="mt-1 text-[11px] text-blue-600 hover:underline">+ เพิ่ม description</button>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Final URL</label>
                    <input value={ad.finalUrl} onChange={e => editAd(idx, { finalUrl: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg"/>
                  </div>
                  <div className="w-24">
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">path 1</label>
                    <input value={ad.path1 ?? ''} maxLength={15} onChange={e => editAd(idx, { path1: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg"/>
                  </div>
                  <div className="w-24">
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">path 2</label>
                    <input value={ad.path2 ?? ''} maxLength={15} onChange={e => editAd(idx, { path2: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg"/>
                  </div>
                </div>
              </div>

              {/* live preview */}
              <div>
                <GoogleSearchPreview ad={ad} brandName={businessName || undefined}/>
                <p className="text-[10px] text-gray-400 mt-2">Google สลับ headline/description อัตโนมัติ — นี่คือหนึ่งในรูปแบบที่เป็นไปได้ (ไฟล์ export มี preview นี้ให้ลูกค้าดูด้วย)</p>
              </div>
            </div>

            {/* push */}
            <div className="border-t border-gray-100 pt-3 flex items-center gap-3 flex-wrap">
              <Upload className="w-4 h-4 text-gray-400 shrink-0"/>
              {campaignRn && adGroups.length > 0 ? (
                <>
                  <select value={pushTarget} onChange={e => setPushTarget(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
                    {adGroups.map(g => <option key={g.adGroupId} value={g.adGroupResourceName}>{g.name}{g.status === 'PAUSED' ? ' (หยุดอยู่)' : ''}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={pushPaused} onChange={e => setPushPaused(e.target.checked)} className="rounded text-blue-600"/>
                    สร้างเป็น PAUSED ไว้ตรวจก่อน
                  </label>
                  <button onClick={() => pushAd(idx)}
                    disabled={pushing[idx] || ad.headlines.filter(h => h.trim()).length < 3 || ad.descriptions.filter(d => d.trim()).length < 2 || !/^https?:\/\//i.test(ad.finalUrl)}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                    {pushing[idx] ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle2 className="w-3.5 h-3.5"/>}
                    Push เข้าแคมเปญ
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400">เลือกแคมเปญ Search ที่ Setup ข้างบนก่อน ถึงจะ push ได้ (หรือ export ส่งลูกค้าอย่างเดียวก็ได้)</span>
              )}
              {pushResult[idx] && (
                <span className={cn('text-xs font-medium', pushResult[idx].ok ? 'text-emerald-600' : 'text-red-600')}>
                  {pushResult[idx].text}
                </span>
              )}
            </div>
          </div>
        ))}

        {ads.length > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => exportTextAdsHtml(exportTitle, ads, businessName)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 bg-white">
              <FileText className="w-4 h-4"/>Export ทุกชุด (HTML)
            </button>
            <button onClick={() => exportTextAdsCsv(exportTitle, ads)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 bg-white">
              <Download className="w-4 h-4"/>Export ทุกชุด (CSV)
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
