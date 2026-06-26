'use client'

import { useState, useEffect } from 'react'
import { Loader2, ChevronRight, CheckCircle2, AlertTriangle, Sparkles, SkipForward, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface IntakeQuestion {
  id: string
  question: string
  type: 'text' | 'select' | 'multiselect' | 'yesno'
  options: string[] | null
  required: boolean
  category: string
}

export interface IntakeAnalysis {
  businessType: string
  businessTypeReason: string
  missingCritical: string[]
  canProceed: boolean
  proceedWithAssumptions: boolean
  assumptions: string[]
  questions: IntakeQuestion[]
  intakeMode: 'full' | 'quick' | 'launch'
}

export interface IntakeAnswers {
  [key: string]: string | string[] | boolean
}

interface Props {
  brief: Record<string, unknown>
  taskType: 'media-plan'
  onComplete: (answers: IntakeAnswers, analysis: IntakeAnalysis) => void
  onSkip?: () => void
  className?: string
}

// ─── Category Labels ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  business:   'ธุรกิจและสินค้า',
  objective:  'เป้าหมายและ KPI',
  budget:     'งบประมาณและ Timeline',
  audience:   'กลุ่มเป้าหมาย',
  tracking:   'Tracking & Data',
  remarketing:'Remarketing Readiness',
  creative:   'Creative Assets',
  ecommerce:  'eCommerce Setup',
  local:      'Local Business',
  b2b:        'B2B Setup',
  app:        'App Setup',
}

const CATEGORY_COLORS: Record<string, string> = {
  business:   'bg-blue-50 border-blue-200 text-blue-700',
  objective:  'bg-violet-50 border-violet-200 text-violet-700',
  budget:     'bg-emerald-50 border-emerald-200 text-emerald-700',
  audience:   'bg-amber-50 border-amber-200 text-amber-700',
  tracking:   'bg-orange-50 border-orange-200 text-orange-700',
  remarketing:'bg-purple-50 border-purple-200 text-purple-700',
  creative:   'bg-pink-50 border-pink-200 text-pink-700',
  ecommerce:  'bg-teal-50 border-teal-200 text-teal-700',
  local:      'bg-sky-50 border-sky-200 text-sky-700',
  b2b:        'bg-indigo-50 border-indigo-200 text-indigo-700',
  app:        'bg-rose-50 border-rose-200 text-rose-700',
}

// ─── Single Question Component ────────────────────────────────────────────────

function QuestionCard({
  question,
  value,
  onChange,
}: {
  question: IntakeQuestion
  value: string | string[] | undefined
  onChange: (val: string | string[]) => void
}) {
  const catStyle = CATEGORY_COLORS[question.category] ?? 'bg-gray-50 border-gray-200 text-gray-600'

  return (
    <div className={cn('rounded-xl border p-4 space-y-3', catStyle)}>
      <div className="flex items-start gap-2">
        <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 mt-0.5', catStyle)}>
          {CATEGORY_LABELS[question.category] ?? question.category}
        </span>
        {question.required && (
          <span className="text-[10px] font-semibold text-red-500 shrink-0 mt-0.5">* จำเป็น</span>
        )}
      </div>
      <p className="text-sm font-medium text-gray-800 leading-relaxed">{question.question}</p>

      {question.type === 'yesno' && (
        <div className="flex gap-2">
          {['ใช่', 'ไม่ใช่'].map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                value === opt
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.type === 'select' && question.options && (
        <div className="grid gap-1.5">
          {question.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm border transition-all',
                value === opt
                  ? 'bg-blue-600 border-blue-600 text-white font-medium'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.type === 'multiselect' && question.options && (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((opt) => {
            const selected = Array.isArray(value) ? value.includes(opt) : false
            return (
              <button
                key={opt}
                onClick={() => {
                  const current = Array.isArray(value) ? value : []
                  onChange(selected ? current.filter(v => v !== opt) : [...current, opt])
                }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  selected
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                )}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {question.type === 'text' && (
        <textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="พิมพ์คำตอบที่นี่..."
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"
        />
      )}
    </div>
  )
}

// ─── Business Type Badge ──────────────────────────────────────────────────────

const BIZ_TYPE_ICONS: Record<string, string> = {
  'eCommerce / Online Store': '🛍️',
  'Lead Generation Service': '🎯',
  'Local Service Business': '📍',
  'B2B / High-Ticket Service': '🏢',
  'Education / Course / Training': '📚',
  'Real Estate / Property': '🏠',
  'Travel / Visa / Tourism Service': '✈️',
  'Healthcare / Beauty / Wellness': '💊',
  'Restaurant / Retail / Offline Branch': '🍽️',
  'App / Platform / SaaS': '📱',
  'Brand Awareness / New Product Launch': '🚀',
  'Marketplace / Multi-SKU Retail': '🏪',
  'Subscription / Membership Business': '♻️',
  'Event / Promotion / Short Campaign': '🎪',
  'Mixed Objective Business': '🎲',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PrePlanningIntake({ brief, taskType, onComplete, onSkip, className }: Props) {
  const [loading, setLoading] = useState(true)
  const [analysis, setAnalysis] = useState<IntakeAnalysis | null>(null)
  const [answers, setAnswers] = useState<IntakeAnswers>({})
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/intake/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief, taskType }),
    })
      .then(r => r.json())
      .then((data: IntakeAnalysis) => {
        setAnalysis(data)
        setLoading(false)
      })
      .catch(() => {
        setError('ไม่สามารถโหลดคำถามได้ กรุณาลองใหม่')
        setLoading(false)
      })
  }, [brief, taskType])

  const handleAnswer = (id: string, val: string | string[]) => {
    setAnswers(prev => ({ ...prev, [id]: val }))
  }

  const requiredQuestions = analysis?.questions.filter(q => q.required) ?? []
  const answeredRequired = requiredQuestions.filter(q => {
    const v = answers[q.id]
    return v !== undefined && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
  })
  const canProceed = answeredRequired.length >= requiredQuestions.length

  const handleSubmit = () => {
    if (!analysis) return
    onComplete(answers, analysis)
  }

  const handleSkipAll = () => {
    if (!analysis) return
    onComplete({}, analysis)
  }

  if (loading) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-gray-500">Mercy กำลังวิเคราะห์ข้อมูลธุรกิจ...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('p-6 text-center', className)}>
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-red-600">{error}</p>
        {onSkip && (
          <button onClick={onSkip} className="mt-3 text-sm text-blue-600 underline">
            ข้ามและดำเนินการต่อ
          </button>
        )}
      </div>
    )
  }

  if (!analysis) return null

  const bizIcon = BIZ_TYPE_ICONS[analysis.businessType] ?? '🏷️'
  const modeLabel = analysis.intakeMode === 'launch' ? 'Launch Today Mode' : analysis.intakeMode === 'full' ? 'Full Planning Mode' : 'Quick Plan Mode'

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">Pre-Planning Intake</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                {modeLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Mercy จะถามคำถามเพิ่มเติมเพื่อสร้างแผนที่เหมาะสมกับธุรกิจของคุณ
            </p>
          </div>
        </div>

        {/* Business type */}
        <div className="mt-4 flex items-center gap-2 bg-white rounded-xl px-4 py-3 border border-blue-100">
          <span className="text-xl">{bizIcon}</span>
          <div>
            <p className="text-xs text-gray-500">ประเภทธุรกิจที่ตรวจพบ</p>
            <p className="text-sm font-semibold text-gray-800">{analysis.businessType}</p>
            <p className="text-xs text-gray-400 mt-0.5">{analysis.businessTypeReason}</p>
          </div>
        </div>
      </div>

      {/* Assumptions (if any) */}
      {analysis.assumptions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50">
          <button
            onClick={() => setShowAssumptions(!showAssumptions)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-sm font-medium text-amber-800">
                ข้อมูลที่ขาดหายไป — ระบบจะใช้ค่าสมมติ ({analysis.assumptions.length} รายการ)
              </span>
            </div>
            {showAssumptions ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4 text-amber-500" />}
          </button>
          {showAssumptions && (
            <ul className="px-4 pb-3 space-y-1">
              {analysis.assumptions.map((a, i) => (
                <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                  <span className="text-amber-400 shrink-0 mt-0.5">•</span> {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Questions */}
      {analysis.questions.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              คำถามเพิ่มเติม ({answeredRequired.length}/{requiredQuestions.length} จำเป็นต้องตอบ)
            </h3>
            {onSkip && (
              <button
                onClick={handleSkipAll}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <SkipForward className="w-3.5 h-3.5" />
                ข้ามทั้งหมด
              </button>
            )}
          </div>

          {analysis.questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              value={answers[q.id] as string | string[] | undefined}
              onChange={(val) => handleAnswer(q.id, val)}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-4 border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">ข้อมูลครบพร้อมสร้างแผน</p>
            <p className="text-xs text-emerald-600 mt-0.5">ข้อมูลที่มีอยู่เพียงพอสำหรับการสร้าง Media Plan</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {onSkip && analysis.questions.length > 0 && (
          <button
            onClick={handleSkipAll}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            ข้ามคำถาม — ใช้ค่าสมมติ
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!canProceed && analysis.questions.some(q => q.required)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all',
            canProceed || analysis.questions.every(q => !q.required)
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          สร้าง Media Plan
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Progress indicator */}
      {requiredQuestions.length > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${(answeredRequired.length / requiredQuestions.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
