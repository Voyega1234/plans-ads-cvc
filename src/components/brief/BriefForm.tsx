'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { briefSchema, BriefInput } from '@/lib/validation/brief'
import { Loader, ChevronRight, ChevronLeft, Sparkles, Building2, Plus, Check, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ResearchKeyword as BaseResearchKeyword } from '@/app/api/keyword-research/generate/route'

type ResearchKeyword = Omit<BaseResearchKeyword, 'group'> & {
  group: BaseResearchKeyword['group'] | 'negative'
}


interface GoogleAdsAccount {
  id: string
  name?: string
  descriptiveName?: string
  currencyCode?: string
  timeZone?: string
}

interface BriefFormProps {
  mode?: string
}

const KW_GROUP_LABELS: Record<string, string> = {
  brand:      'Brand',
  product:    'Product',
  service:    'Service',
  generic:    'Generic',
  competitor: 'Competitor',
  negative:   'Negative',
  // legacy remaps — AI may still return these briefly
  high_intent:    'Service',
  problem_intent: 'Service',
}

const KW_GROUP_COLORS: Record<string, string> = {
  brand:          'bg-blue-100 text-blue-700',
  product:        'bg-emerald-100 text-emerald-700',
  service:        'bg-violet-100 text-violet-700',
  generic:        'bg-yellow-100 text-yellow-700',
  competitor:     'bg-purple-100 text-purple-700',
  negative:       'bg-red-100 text-red-600',
  high_intent:    'bg-violet-100 text-violet-700',
  problem_intent: 'bg-violet-100 text-violet-700',
}

const MATCH_COLORS: Record<string, string> = {
  PHRASE: 'bg-blue-50 text-blue-600',
  BROAD:  'bg-orange-50 text-orange-600',
}

// Step labels — added Keyword Research step
const STEPS = ['Account', 'Business Info', 'Campaign Settings', 'Audience & Goals', 'Schedule', 'Keyword Research']

export default function BriefForm({ mode }: BriefFormProps) {
  const [step, setStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Account selection state
  const [accounts, setAccounts] = useState<GoogleAdsAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isNewAccount, setIsNewAccount] = useState(false)

  // Keyword research state (step 5)
  const [kwLoading, setKwLoading] = useState(false)
  const [kwError, setKwError] = useState('')
  const [keywords, setKeywords] = useState<ResearchKeyword[]>([])
  const [kwSelected, setKwSelected] = useState<Set<number>>(new Set())
  const [kwGenerated, setKwGenerated] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<BriefInput>({
    resolver: zodResolver(briefSchema),
    defaultValues: { currency: 'THB', language: 'th' },
  })

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts ?? [])
        setAccountsLoading(false)
      })
      .catch(() => setAccountsLoading(false))
  }, [])

  const canProceedFromAccount = isNewAccount || !!selectedAccountId

  const stepFields: (keyof BriefInput)[][] = [
    [],
    ['businessName', 'websiteUrl', 'productService'],
    ['objective', 'monthlyBudget', 'currency', 'targetLocation', 'language'],
    ['targetAudience', 'conversionGoal', 'promotion', 'brandTone'],
    ['duration', 'launchDate', 'notes'],
    [],
  ]

  const nextStep = async () => {
    if (step === 0) {
      if (!canProceedFromAccount) return
      setStep(1)
      return
    }
    const valid = await trigger(stepFields[step])
    if (!valid) return
    const nextIdx = step + 1
    setStep(nextIdx)
    // Auto-generate keywords when entering keyword research step
    if (nextIdx === 5 && !kwGenerated) {
      generateKeywords()
    }
  }

  async function generateKeywords() {
    const vals = getValues()
    setKwLoading(true)
    setKwError('')
    setKeywords([])
    setKwSelected(new Set())
    try {
      const res = await fetch('/api/keyword-research/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName:   vals.businessName,
          productService: vals.productService,
          location:       vals.targetLocation ?? 'ทั่วประเทศไทย',
          objective:      vals.objective?.toLowerCase() ?? 'leads',
          language:       vals.language ?? 'th',
        }),
      })
      const data = await res.json() as { keywords?: ResearchKeyword[]; error?: string }
      if (!res.ok || data.error) { setKwError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      const kws = data.keywords ?? []
      setKeywords(kws)
      // Pre-select all non-negative keywords (competitor included — needed for competitor campaign)
      setKwSelected(new Set(
        kws.map((k, i) => ({ k, i }))
           .filter(({ k }) => k.group !== 'negative')
           .map(({ i }) => i)
      ))
      setKwGenerated(true)
    } catch {
      setKwError('ไม่สามารถเชื่อมต่อได้')
    } finally {
      setKwLoading(false)
    }
  }

  function toggleKw(i: number) {
    setKwSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function toggleGroup(group: string) {
    const groupIndices = keywords.map((k, i) => ({ k, i })).filter(({ k }) => k.group === group).map(({ i }) => i)
    const allSelected = groupIndices.every(i => kwSelected.has(i))
    setKwSelected(prev => {
      const next = new Set(prev)
      groupIndices.forEach(i => allSelected ? next.delete(i) : next.add(i))
      return next
    })
  }

  const onSubmit = async (data: BriefInput) => {
    setIsLoading(true)
    setError(null)
    try {
      const selectedKws = keywords.filter((_, i) => kwSelected.has(i))

      const briefPayload = {
        ...data,
        googleAdsCustomerId: isNewAccount ? undefined : (selectedAccountId ?? undefined),
        isNewAccount: isNewAccount || false,
      }

      // 1. Create brief
      const briefRes = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefPayload),
      })
      if (!briefRes.ok) throw new Error('Failed to create brief')
      const brief = await briefRes.json()

      // 2. Generate media plan (pass selected keywords so AI can build campaign mix)
      const planRes = await fetch('/api/media-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefId: brief.id, selectedKeywords: selectedKws }),
      })
      if (!planRes.ok) throw new Error('Failed to generate media plan')
      const plan = await planRes.json()

      // 3. Save selected keywords to the new plan
      if (selectedKws.length > 0) {
        await fetch('/api/keyword-research/save-to-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'existing',
            mediaPlanId: plan.id,
            campaignName: data.businessName,
            keywords: selectedKws,
          }),
        }).catch(() => { /* non-fatal */ })
      }

      router.push(`/media-plans/${plan.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100

  // Group keywords by category for display
  const kwGroups = (['brand', 'product', 'service', 'generic', 'competitor'] as const).map(g => ({
    group: g,
    items: keywords.map((k, i) => ({ k, i })).filter(({ k }) => k.group === g),
  })).filter(({ items }) => items.length > 0)

  const selectedCount = kwSelected.size

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex justify-between mb-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 shrink-0">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                )}
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn('text-xs hidden md:block whitespace-nowrap', i <= step ? 'text-blue-600 font-medium' : 'text-gray-400')}>
                {s}
              </span>
            </div>
          ))}
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full mt-3">
          <div className="h-1.5 bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">

        {/* ── Step 0: Account Selection ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">เลือก Google Ads Account</h2>
              <p className="text-sm text-gray-500">เลือก account ที่จะทำ Media Plan — ระบบจะตรวจ campaigns ซ้ำเฉพาะ account นี้เท่านั้น</p>
            </div>

            {accountsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 py-6 justify-center">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm">กำลังโหลด accounts...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => { setSelectedAccountId(acc.id); setIsNewAccount(false) }}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all',
                      selectedAccountId === acc.id && !isNewAccount
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{acc.descriptiveName ?? acc.name ?? acc.id}</p>
                        <p className="text-xs text-gray-400 font-mono">{acc.id}</p>
                      </div>
                    </div>
                    {selectedAccountId === acc.id && !isNewAccount && (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => { setIsNewAccount(true); setSelectedAccountId(null) }}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all',
                    isNewAccount
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Plus className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">สร้าง Account ใหม่</p>
                      <p className="text-xs text-gray-400">ไม่มี campaigns เดิม — ข้ามการตรวจซ้ำทั้งหมด</p>
                    </div>
                  </div>
                  {isNewAccount && <Check className="w-5 h-5 text-emerald-600" />}
                </button>

                {accounts.length === 0 && !accountsLoading && (
                  <p className="text-xs text-gray-400 text-center py-2">ไม่พบ accounts — เลือก &quot;สร้าง Account ใหม่&quot; เพื่อเริ่มต้น</p>
                )}
              </div>
            )}

            {(selectedAccountId || isNewAccount) && (
              <div className={cn(
                'flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs',
                isNewAccount ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
              )}>
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {isNewAccount
                  ? 'Account ใหม่ — ระบบจะข้ามขั้นตอนตรวจซ้ำ Campaign/Keyword ทั้งหมด'
                  : `จะตรวจซ้ำเฉพาะ campaigns ใน account ${selectedAccountId} เท่านั้น`}
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Business Info ── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">ข้อมูลธุรกิจ</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อธุรกิจ *</label>
              <input
                {...register('businessName')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เช่น ชื่อธุรกิจของคุณ"
              />
              {errors.businessName && <p className="text-xs text-red-500 mt-1">{errors.businessName.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website URL *</label>
              <input
                {...register('websiteUrl')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://www.example.com"
              />
              {errors.websiteUrl && <p className="text-xs text-red-500 mt-1">{errors.websiteUrl.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สินค้า / บริการ *</label>
              <textarea
                {...register('productService')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="อธิบายสินค้าหรือบริการของคุณ"
              />
              {errors.productService && <p className="text-xs text-red-500 mt-1">{errors.productService.message}</p>}
            </div>
          </div>
        )}

        {/* ── Step 2: Campaign Settings ── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">ตั้งค่าแคมเปญ</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วัตถุประสงค์ *</label>
              <select
                {...register('objective')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">เลือกวัตถุประสงค์</option>
                <option value="LEADS">Leads (สร้าง Leads)</option>
                <option value="SALES">Sales (ยอดขาย)</option>
                <option value="AWARENESS">Awareness (การรับรู้)</option>
                <option value="TRAFFIC">Traffic (การเข้าชม)</option>
                <option value="APP_INSTALLS">App Installs (ติดตั้งแอป)</option>
              </select>
              {errors.objective && <p className="text-xs text-red-500 mt-1">{errors.objective.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">งบประมาณรายเดือน (฿) *</label>
                <input
                  {...register('monthlyBudget', { valueAsNumber: true })}
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="50000"
                />
                {errors.monthlyBudget && <p className="text-xs text-red-500 mt-1">{errors.monthlyBudget.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สกุลเงิน</label>
                <select
                  {...register('currency')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="THB">THB (บาท)</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">พื้นที่เป้าหมาย *</label>
                <input
                  {...register('targetLocation')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Thailand"
                />
                {errors.targetLocation && <p className="text-xs text-red-500 mt-1">{errors.targetLocation.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ภาษา</label>
                <select
                  {...register('language')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="th">Thai</option>
                  <option value="en">English</option>
                  <option value="th,en">Thai + English</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Audience & Goals ── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">กลุ่มเป้าหมาย & เป้าหมาย</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">กลุ่มเป้าหมาย *</label>
              <textarea
                {...register('targetAudience')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="อธิบายกลุ่มเป้าหมาย เพศ อายุ ความสนใจ"
              />
              {errors.targetAudience && <p className="text-xs text-red-500 mt-1">{errors.targetAudience.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เป้าหมาย Conversion *</label>
              <input
                {...register('conversionGoal')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เช่น Form submit, Phone call, Purchase"
              />
              {errors.conversionGoal && <p className="text-xs text-red-500 mt-1">{errors.conversionGoal.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">โปรโมชัน / ข้อเสนอพิเศษ</label>
              <input
                {...register('promotion')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เช่น ลด 20% สำหรับเดือนนี้"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Tone</label>
              <input
                {...register('brandTone')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เช่น Professional, Friendly, Trustworthy"
              />
            </div>
          </div>
        )}

        {/* ── Step 4: Schedule ── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">กำหนดการ</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ระยะเวลาแคมเปญ</label>
                <select
                  {...register('duration')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">เลือกระยะเวลา</option>
                  <option value="1 month">1 เดือน</option>
                  <option value="3 months">3 เดือน</option>
                  <option value="6 months">6 เดือน</option>
                  <option value="12 months">12 เดือน</option>
                  <option value="ongoing">ต่อเนื่อง</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มต้น</label>
                <input
                  {...register('launchDate')}
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุเพิ่มเติม</label>
              <textarea
                {...register('notes')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ข้อมูลเพิ่มเติมสำหรับทีม AI"
              />
            </div>

            {/* UTM Parameters */}
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">UTM Parameters (สำหรับ tracking ใน GA4)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">utm_source</label>
                  <input
                    {...register('utmSource')}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="google"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">utm_medium</label>
                  <input
                    {...register('utmMedium')}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="cpc"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">utm_campaign</label>
                  <input
                    {...register('utmCampaign')}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="{campaignname}"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">utm_content</label>
                  <input
                    {...register('utmContent')}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="{adgroupname}"
                  />
                </div>
              </div>
              <p className="text-[10px] text-blue-600">ถ้าไม่ระบุ — ระบบจะใช้ค่า default: utm_source=google, utm_medium=cpc</p>
            </div>
          </div>
        )}

        {/* ── Step 5: Keyword Research ── */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Keyword Research</h2>
                <p className="text-sm text-gray-500 mt-0.5">AI วิเคราะห์ keywords จากข้อมูลธุรกิจ เลือก keywords ที่ต้องการใช้ใน campaign</p>
              </div>
              {kwGenerated && !kwLoading && (
                <button
                  type="button"
                  onClick={generateKeywords}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  Re-generate
                </button>
              )}
            </div>

            {kwLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-sm text-gray-500">AI กำลังวิเคราะห์ keywords + Google Keyword Planner...</p>
              </div>
            )}

            {kwError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                <X className="w-4 h-4 shrink-0" />
                {kwError}
                <button type="button" onClick={generateKeywords} className="ml-auto text-xs underline">ลองใหม่</button>
              </div>
            )}

            {keywords.length > 0 && (
              <>
                {/* Summary bar */}
                <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>พบ <strong>{keywords.length}</strong> keywords — เลือกไว้ <strong>{selectedCount}</strong> คำ</span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => setKwSelected(new Set(keywords.map((_, i) => i)))} className="underline hover:no-underline">เลือกทั้งหมด</button>
                    <span className="text-blue-300">|</span>
                    <button type="button" onClick={() => setKwSelected(new Set())} className="underline hover:no-underline">ยกเลิก</button>
                  </div>
                </div>

                {/* Keywords by group */}
                <div className="space-y-3">
                  {kwGroups.map(({ group, items }) => (
                    <div key={group} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div
                        className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100 cursor-pointer"
                        onClick={() => toggleGroup(group)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', KW_GROUP_COLORS[group])}>
                            {KW_GROUP_LABELS[group]}
                          </span>
                          <span className="text-xs text-gray-400">{items.length} keywords</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {items.filter(({ i }) => kwSelected.has(i)).length}/{items.length} เลือก
                          </span>
                          <button
                            type="button"
                            className="text-[10px] text-blue-600 hover:text-blue-800"
                            onClick={(e) => { e.stopPropagation(); toggleGroup(group) }}
                          >
                            {items.every(({ i }) => kwSelected.has(i)) ? 'ยกเลิกทั้งกลุ่ม' : 'เลือกทั้งกลุ่ม'}
                          </button>
                        </div>
                      </div>
                      <div className="p-3 flex flex-wrap gap-2">
                        {items.map(({ k: kw, i }) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleKw(i)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border transition-all',
                              kwSelected.has(i)
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                            )}
                          >
                            <span className={cn(
                              'text-[9px] font-medium px-1 py-0.5 rounded',
                              kwSelected.has(i) ? 'bg-white/20 text-white' : MATCH_COLORS[kw.matchType] ?? 'bg-gray-100 text-gray-500'
                            )}>
                              {kw.matchType === 'BROAD' ? 'B' : '"P"'}
                            </span>
                            {kw.keyword}
                            {kw.avgMonthlySearches != null && kw.avgMonthlySearches > 0 && (
                              <span className={cn('text-[9px]', kwSelected.has(i) ? 'text-white/70' : 'text-gray-400')}>
                                {kw.avgMonthlySearches >= 1000
                                  ? `${(kw.avgMonthlySearches / 1000).toFixed(1)}K`
                                  : kw.avgMonthlySearches}/mo
                              </span>
                            )}
                            {kwSelected.has(i)
                              ? <Check className="w-3 h-3" />
                              : <Plus className="w-3 h-3 text-gray-300" />
                            }
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                  <strong>หมายเหตุ:</strong> AI จะนำ keywords ที่เลือกไปสร้าง Search Campaigns แยกตามกลุ่ม และแนะนำ Performance Max + Display + Remarketing เพิ่มเติม
                </div>
              </>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              ย้อนกลับ
            </button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={step === 0 && !canProceedFromAccount}
              className={cn(
                'flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg transition-colors',
                step === 0 && !canProceedFromAccount
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'text-white bg-blue-600 hover:bg-blue-700'
              )}
            >
              ถัดไป
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isLoading || kwLoading}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  กำลังสร้าง Media Plan...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Media Plan ({selectedCount} keywords)
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
