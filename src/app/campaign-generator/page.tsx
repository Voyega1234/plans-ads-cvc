'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'
import {
  FileText, Zap, ChevronRight, Loader2, Calendar, Wallet,
  ArrowRight, CheckCircle2, Sparkles, Search, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Plan {
  id: string
  title: string
  objective: string
  monthlyBudget: number
  currency: string
  status: string
  createdAt: string
  campaignCount: number
}

const OBJECTIVES = [
  { value: 'LEADS',        label: 'Lead Generation' },
  { value: 'SALES',        label: 'Sales / eCommerce' },
  { value: 'AWARENESS',    label: 'Brand Awareness' },
  { value: 'TRAFFIC',      label: 'Website Traffic' },
  { value: 'APP_INSTALLS', label: 'App Installs' },
]

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  approved:  'bg-emerald-100 text-emerald-700',
  active:    'bg-blue-100 text-blue-700',
  paused:    'bg-yellow-100 text-yellow-700',
  completed: 'bg-purple-100 text-purple-700',
}

// ─── Steps display (visual only, matches build/page.tsx) ──────────────────────

const BUILD_STEPS = [
  { num: 1, label: 'Brief' },
  { num: 2, label: 'Campaign Structure' },
  { num: 3, label: 'Keyword Research' },
  { num: 4, label: 'Audience' },
  { num: 5, label: 'Media Plan & Budget' },
  { num: 6, label: 'Ad Copy' },
  { num: 7, label: 'QA' },
  { num: 8, label: 'Review & Draft' },
  { num: 9, label: 'Push' },
]

function StepPreview() {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-2">
      {BUILD_STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center shrink-0">
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-400 text-xs font-bold flex items-center justify-center">
              {s.num}
            </div>
            <span className="text-[10px] text-gray-400 whitespace-nowrap">{s.label}</span>
          </div>
          {i < BUILD_STEPS.length - 1 && (
            <div className="h-0.5 w-8 mx-1 mb-4 bg-gray-100 rounded-full" />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Mode 1: Select from All Plans ────────────────────────────────────────────

function SelectPlanMode({ onSelect }: { onSelect: (planId: string) => void }) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/media-plans')
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d) ? d : (d.plans ?? [])
        setPlans(arr.map((p: Plan & { blueprints?: unknown[] }) => ({
          ...p,
          campaignCount: p.campaignCount ?? (Array.isArray(p.blueprints) ? p.blueprints.length : 0),
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = plans.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.objective.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">เลือก Media Plan ที่ต้องการสร้าง Campaign</h3>
        <p className="text-sm text-gray-500">กดเลือก plan — ระบบโหลด Brief, Budget และ Campaign Structure ให้อัตโนมัติ แล้วเริ่ม 9 ขั้นตอนได้เลย</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา Media Plan..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400 mb-3">
            {plans.length === 0 ? 'ยังไม่มี Media Plan' : 'ไม่พบ Media Plan ที่ค้นหา'}
          </p>
          {plans.length === 0 && (
            <Link href="/media-plans/plan" className="text-sm text-blue-600 font-semibold hover:underline">
              + สร้าง Media Plan ก่อน
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map(plan => {
            const budget = plan.monthlyBudget > 0
              ? `฿${plan.monthlyBudget.toLocaleString()}/เดือน`
              : '—'
            const date = new Date(plan.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

            return (
              <button
                key={plan.id}
                onClick={() => onSelect(plan.id)}
                className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{plan.title}</p>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0', STATUS_COLOR[plan.status] ?? 'bg-gray-100 text-gray-600')}>
                      {plan.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{budget}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{date}</span>
                    {plan.campaignCount > 0 && (
                      <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{plan.campaignCount} campaigns</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 opacity-0 group-hover:opacity-100 shrink-0 transition-all">
                  เริ่มสร้าง <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Footer link */}
      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">หรือ</p>
        <Link href="/media-plans/plan" className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold">
          <Plus className="w-3.5 h-3.5" /> สร้าง Media Plan ใหม่ก่อน
        </Link>
      </div>
    </div>
  )
}

// ─── Mode 2: Quick brief form ──────────────────────────────────────────────────

function QuickBriefMode({ onCreated }: { onCreated: (planId: string) => void }) {
  const [f, setF] = useState({
    businessName: '',
    websiteUrl: '',
    productService: '',
    objective: 'LEADS',
    monthlyBudget: '',
    targetLocation: 'ประเทศไทย',
    targetAudience: '',
    conversionGoal: '',
    promotion: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const field = (
    label: string,
    key: string,
    opts?: { type?: string; placeholder?: string; rows?: number; required?: boolean }
  ) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {opts?.rows ? (
        <textarea
          value={(f as Record<string, string>)[key]}
          onChange={e => set(key, e.target.value)}
          rows={opts.rows}
          placeholder={opts.placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      ) : (
        <input
          type={opts?.type ?? 'text'}
          value={(f as Record<string, string>)[key]}
          onChange={e => set(key, e.target.value)}
          placeholder={opts?.placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      )}
    </div>
  )

  async function handleSubmit() {
    if (!f.businessName || !f.productService || !f.monthlyBudget || !f.targetAudience || !f.conversionGoal) {
      setErr('กรุณากรอก Business Name, Product/Service, Budget, Target Audience และ Conversion Goal')
      return
    }
    setErr(''); setLoading(true)
    try {
      // Step 1: create Brief
      const briefRes = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName:   f.businessName,
          websiteUrl:     f.websiteUrl || 'https://example.com',
          productService: f.productService,
          objective:      f.objective,
          monthlyBudget:  Number(f.monthlyBudget),
          currency:       'THB',
          targetLocation: f.targetLocation || 'ประเทศไทย',
          language:       'th',
          targetAudience: f.targetAudience,
          conversionGoal: f.conversionGoal,
          promotion:      f.promotion || '',
          notes:          f.notes || '',
          duration:       '3 months',
        }),
      })
      if (!briefRes.ok) throw new Error(await briefRes.text())
      const briefData = await briefRes.json()

      // Step 2: generate MediaPlan from Brief (saves planJson + correct monthlyBudget to DB)
      const planRes = await fetch('/api/media-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefId: briefData.id }),
      })
      if (!planRes.ok) throw new Error(await planRes.text())
      const planData = await planRes.json()

      onCreated(planData.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'สร้าง Campaign ไม่สำเร็จ')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">กรอก Brief เพื่อให้ AI วางแผน Campaign</h3>
        <p className="text-sm text-gray-500">AI จะวิเคราะห์ Brief แล้วพาไปสร้าง Campaign ใน 9 ขั้นตอน</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {field('Business Name', 'businessName', { required: true, placeholder: 'เช่น Convert Cake' })}
        {field('Website URL', 'websiteUrl', { placeholder: 'https://convertcake.com' })}
        <div className="md:col-span-2">
          {field('Product / Service', 'productService', { required: true, rows: 2, placeholder: 'เช่น บริการทำโฆษณา Google Ads & Meta Ads สำหรับ SME ราคาเริ่มต้น 15,000 บาท/เดือน' })}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Objective<span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            value={f.objective}
            onChange={e => set('objective', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {field('Monthly Budget (THB)', 'monthlyBudget', { required: true, type: 'number', placeholder: 'เช่น 80000' })}
        {field('Target Location', 'targetLocation', { placeholder: 'เช่น กรุงเทพฯ และปริมณฑล' })}
        {field('Target Audience', 'targetAudience', { required: true, placeholder: 'เช่น เจ้าของธุรกิจ SME อายุ 30-50 มีงบโฆษณาออนไลน์' })}
        <div className="md:col-span-2">
          {field('Conversion Goal', 'conversionGoal', { required: true, placeholder: 'เช่น Form ขอใบเสนอราคา, LINE OA, โทรหา' })}
        </div>
        {field('Promotion / Offer', 'promotion', { placeholder: 'เช่น ฟรี Audit โฆษณา + ทดลองใช้บริการ 1 เดือน' })}
        <div className="md:col-span-2">
          {field('Additional Notes', 'notes', { rows: 2, placeholder: 'เช่น เน้น B2B, ไม่รับลูกค้าธุรกิจผิดกฎหมาย, เน้น conversion ไม่เน้น awareness' })}
        </div>
      </div>

      {err && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'กำลังสร้าง Campaign...' : 'สร้าง Campaign ด้วย AI →'}
      </button>
    </div>
  )
}

// ─── Redirecting state ─────────────────────────────────────────────────────────

function RedirectingState({ planId }: { planId: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-white" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900 mb-1">พร้อมสร้าง Campaign แล้ว!</h3>
        <p className="text-sm text-gray-500">กำลังพาไปยัง Campaign Builder...</p>
      </div>
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <Link
          href={`/media-plans/${planId}/build`}
          className="flex items-center gap-1.5 text-sm text-blue-600 font-semibold hover:underline"
        >
          คลิกถ้าไม่ redirect อัตโนมัติ <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

type Mode = 'select' | 'from-plan' | 'quick-brief'

export default function CampaignGeneratorPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('select')
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null)

  function handlePlanSelected(planId: string) {
    setRedirectingTo(planId)
    router.push(`/media-plans/${planId}/build`)
  }

  function handleBriefCreated(planId: string) {
    setRedirectingTo(planId)
    router.push(`/media-plans/${planId}/build`)
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Campaign Generator</h1>
            <p className="text-sm text-gray-500 mt-1">
              สร้าง Google Ads Campaign แบบ step-by-step — AI ช่วยทุกขั้นตอน
            </p>
          </div>
          {/* ประวัติชุดที่ push สำเร็จ — ดู/แก้/push ซ้ำ (แยกจากหน้านี้ที่วิ่งจาก media plan) */}
          <Link href="/campaign-generator/history"
            className="shrink-0 px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
            History — ชุดที่ push แล้ว
          </Link>
        </div>

        {/* Step preview */}
        <div className="bg-white border border-gray-200 rounded-2xl px-6 pt-5 pb-4 mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            9 ขั้นตอนสร้าง Campaign
          </p>
          <StepPreview />
        </div>

        {/* Redirecting */}
        {redirectingTo ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8">
            <RedirectingState planId={redirectingTo} />
          </div>
        ) : mode === 'select' ? (
          /* ── Mode selection ── */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option A */}
            <button
              onClick={() => setMode('from-plan')}
              className="group flex flex-col items-start gap-4 p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/30 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-gray-900 mb-1">ดึงจาก Media Plan</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  เลือก Media Plan ที่วางแผนไว้แล้ว — Brief, Budget และ Campaign Structure จะถูกโหลดมาให้อัตโนมัติ
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 group-hover:gap-3 transition-all">
                เลือก Media Plan <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            {/* Option B */}
            <button
              onClick={() => setMode('quick-brief')}
              className="group flex flex-col items-start gap-4 p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-purple-400 hover:bg-purple-50/30 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-gray-900 mb-1">สร้าง Campaign ใหม่</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  กรอก Brief แล้วให้ AI วิเคราะห์และวางแผน Campaign ใน 9 ขั้นตอน เหมือนสร้างใน Google Ads แต่มี AI ช่วย
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 group-hover:gap-3 transition-all">
                เริ่มกรอก Brief <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        ) : (
          /* ── Content panel ── */
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            {/* Back button */}
            <button
              onClick={() => setMode('select')}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
            >
              ← กลับ
            </button>

            {mode === 'from-plan' && (
              <SelectPlanMode onSelect={handlePlanSelected} />
            )}
            {mode === 'quick-brief' && (
              <QuickBriefMode onCreated={handleBriefCreated} />
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
