'use client'

import { useState, useEffect } from 'react'
import { Users, Plus, Check, Loader, RefreshCw, Info, AlertCircle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RemarketingAudience {
  id: string
  resourceName: string
  name: string
  type: string
  membershipLifeSpan: number
  memberCount: number
}

interface Props {
  customerId: string
  planId: string
  hasDisplayCampaign: boolean
  hasWebsite: boolean
  websiteUrl: string
}

const PRESET_AUDIENCES = [
  { name: 'All Website Visitors (30d)', lifeSpan: 30, description: 'ทุกคนที่เข้าเว็บภายใน 30 วัน', recommended: true },
  { name: 'All Website Visitors (90d)', lifeSpan: 90, description: 'ทุกคนที่เข้าเว็บภายใน 90 วัน', recommended: false },
  { name: 'Product/Service Page Visitors (30d)', lifeSpan: 30, description: 'คนที่เข้าหน้าสินค้า/บริการ', recommended: true },
  { name: 'Converted Visitors (90d)', lifeSpan: 90, description: 'คนที่เคย convert แล้ว (exclude หรือ upsell)', recommended: false },
]

export default function AudienceManager({ customerId, planId, hasDisplayCampaign, hasWebsite, websiteUrl }: Props) {
  const [audiences, setAudiences] = useState<RemarketingAudience[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [created, setCreated] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [manualInstructions, setManualInstructions] = useState<{ instructions: string[]; googleAdsUrl: string; presetName: string } | null>(null)

  const canFetch = !!customerId

  useEffect(() => {
    if (canFetch) loadAudiences()
  }, [customerId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAudiences() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/audiences?customerId=${customerId}`)
      const data = await res.json() as { audiences?: RemarketingAudience[]; error?: string }
      if (res.ok) {
        setAudiences(data.audiences ?? [])
        // Mark presets as created if name matches
        const names = new Set((data.audiences ?? []).map(a => a.name))
        const preCreated = PRESET_AUDIENCES.filter(p => names.has(p.name)).map(p => p.name)
        setCreated(new Set(preCreated))
      } else {
        setError(data.error ?? 'โหลดไม่สำเร็จ')
      }
    } catch {
      setError('เชื่อมต่อไม่ได้')
    }
    setLoading(false)
  }

  async function createAudience(preset: typeof PRESET_AUDIENCES[0]) {
    setCreating(preset.name)
    setError('')
    try {
      const res = await fetch('/api/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          name: preset.name,
          membershipLifeSpan: preset.lifeSpan,
          description: `${preset.description} — สร้างโดย Mercy`,
        }),
      })
      const data = await res.json() as {
        success?: boolean; message?: string; error?: string
        requiresManual?: boolean; instructions?: string[]; googleAdsUrl?: string
      }
      if (data.requiresManual) {
        setManualInstructions({
          instructions: data.instructions ?? [],
          googleAdsUrl: data.googleAdsUrl ?? '',
          presetName: preset.name,
        })
      } else if (res.ok && data.success) {
        setCreated(prev => { const next = new Set(Array.from(prev)); next.add(preset.name); return next })
        await loadAudiences()
      } else {
        setError(data.error ?? 'สร้างไม่สำเร็จ')
      }
    } catch {
      setError('เชื่อมต่อไม่ได้')
    }
    setCreating(null)
  }

  if (!hasDisplayCampaign && !customerId) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Remarketing Audiences</h3>
        </div>
        {canFetch && (
          <button
            onClick={loadAudiences}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            รีโหลด
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg mb-4">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-1">
          <p>Remarketing audience ต้องการ <strong>Google Ads Remarketing Tag</strong> หรือ <strong>GA4 Audience</strong> ติดบนเว็บก่อน</p>
          <p>ระบบจะสร้าง User List ใน Google Ads — จะเริ่มสะสม visitors ภายใน 24-48 ชั่วโมงหลัง tag ทำงาน</p>
          {websiteUrl && <p>เว็บ: <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="underline">{websiteUrl}</a></p>}
        </div>
      </div>

      {!customerId && (
        <p className="text-sm text-gray-400 text-center py-4">เลือก Google Ads Account ก่อนจึงจะสร้าง audience ได้</p>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Manual instructions modal */}
      {manualInstructions && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-amber-800">วิธีสร้าง &quot;{manualInstructions.presetName}&quot; ใน Google Ads</p>
            <button onClick={() => setManualInstructions(null)} className="text-amber-500 hover:text-amber-700 text-xs">ปิด ×</button>
          </div>
          <ol className="space-y-1 mb-3">
            {manualInstructions.instructions.map((step, i) => (
              <li key={i} className="text-xs text-amber-800">{step}</li>
            ))}
          </ol>
          <a
            href={manualInstructions.googleAdsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            เปิด Google Ads Audience Manager
          </a>
        </div>
      )}

      {canFetch && (
        <>
          {/* Existing audiences */}
          {audiences.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Audiences ที่มีอยู่ ({audiences.length})
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {audiences.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {a.membershipLifeSpan}d · {a.memberCount > 0 ? `${a.memberCount.toLocaleString()} members` : 'รอ visitors'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create preset audiences */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">สร้าง Audience ใหม่</p>
            <div className="space-y-2">
              {PRESET_AUDIENCES.map(preset => {
                const isCreated = created.has(preset.name)
                const isCreating = creating === preset.name
                return (
                  <div
                    key={preset.name}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all',
                      isCreated ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{preset.name}</p>
                        {preset.recommended && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">แนะนำ</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500">{preset.description}</p>
                    </div>
                    {isCreated ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium shrink-0">
                        <Check className="w-3.5 h-3.5" />สร้างแล้ว
                      </span>
                    ) : (
                      <button
                        onClick={() => createAudience(preset)}
                        disabled={isCreating || !!creating}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors shrink-0"
                      >
                        {isCreating ? (
                          <><Loader className="w-3.5 h-3.5 animate-spin" />สร้าง...</>
                        ) : (
                          <><Plus className="w-3.5 h-3.5" />สร้าง</>
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
