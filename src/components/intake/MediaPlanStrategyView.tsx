'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Target, DollarSign, BarChart3, Zap, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MediaPlanStrategy } from '@/app/api/intake/generate-plan/route'

interface Props {
  strategy: MediaPlanStrategy
  onBuildCampaigns?: () => void
  className?: string
}

const FUNNEL_COLORS: Record<string, string> = {
  Awareness:     'bg-purple-100 text-purple-700',
  Consideration: 'bg-blue-100 text-blue-700',
  Conversion:    'bg-emerald-100 text-emerald-700',
  Retention:     'bg-amber-100 text-amber-700',
}

const TRACKING_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ready:     { label: 'พร้อมแล้ว', color: 'text-emerald-600' },
  partial:   { label: 'บางส่วน', color: 'text-amber-600' },
  not_ready: { label: 'ยังไม่พร้อม', color: 'text-red-600' },
  unknown:   { label: 'ไม่ทราบ', color: 'text-gray-500' },
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

export default function MediaPlanStrategyView({ strategy, onBuildCampaigns, className }: Props) {
  const { intakeSummary, budgetAllocation, campaignStructure, funnelMapping, measurementPlan, optimizationPlan, risks, executiveSummary } = strategy

  const trackingInfo = TRACKING_STATUS_LABEL[intakeSummary.trackingStatus] ?? TRACKING_STATUS_LABEL.unknown
  const remarketingInfo = TRACKING_STATUS_LABEL[intakeSummary.remarketingReadiness] ?? TRACKING_STATUS_LABEL.unknown
  const creativeInfo = TRACKING_STATUS_LABEL[intakeSummary.creativeReadiness] ?? TRACKING_STATUS_LABEL.unknown

  return (
    <div className={cn('space-y-5', className)}>
      {/* Executive Summary */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5" />
          <h2 className="font-bold text-lg">Media Plan Strategy</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 border border-white/30">
            {strategy.businessType}
          </span>
        </div>
        <p className="text-sm text-blue-100 leading-relaxed">{executiveSummary}</p>

        {/* Quick status row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Tracking', value: trackingInfo.label, ok: intakeSummary.trackingStatus === 'ready' },
            { label: 'Remarketing', value: remarketingInfo.label, ok: intakeSummary.remarketingReadiness === 'ready' },
            { label: 'Creative', value: creativeInfo.label, ok: intakeSummary.creativeReadiness === 'ready' || intakeSummary.creativeReadiness === 'partial' },
          ].map(({ label, value, ok }) => (
            <div key={label} className="bg-white/10 rounded-xl px-3 py-2">
              <p className="text-[10px] text-blue-200 mb-0.5">{label}</p>
              <div className="flex items-center gap-1">
                {ok
                  ? <CheckCircle2 className="w-3 h-3 text-emerald-300 shrink-0" />
                  : <AlertTriangle className="w-3 h-3 text-amber-300 shrink-0" />
                }
                <p className="text-xs font-medium text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Strategy */}
      <Section title="แนะนำกลยุทธ์" icon={<Zap className="w-4 h-4 text-yellow-500" />}>
        <p className="text-sm text-gray-700 leading-relaxed">{strategy.recommendedStrategy}</p>
        {intakeSummary.keyAssumptions.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-xs font-semibold text-amber-700 mb-1">ข้อสมมติที่ใช้ในแผนนี้:</p>
            <ul className="space-y-0.5">
              {intakeSummary.keyAssumptions.map((a, i) => (
                <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                  <span className="text-amber-400 shrink-0">•</span> {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Budget Allocation */}
      <Section title="การจัดสรรงบประมาณ" icon={<DollarSign className="w-4 h-4 text-emerald-500" />}>
        <div className="space-y-3">
          {budgetAllocation.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="shrink-0 w-12 text-center">
                <span className="text-lg font-bold text-gray-800">{item.budgetPct}%</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{item.campaignType}</span>
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', FUNNEL_COLORS[item.funnelStage] ?? 'bg-gray-100 text-gray-600')}>
                    {item.funnelStage}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{item.strategicRole}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-gray-500">รายเดือน: <span className="font-medium text-gray-700">฿{item.monthlyBudget.toLocaleString()}</span></span>
                  <span className="text-xs text-gray-500">รายวัน: <span className="font-medium text-gray-700">฿{item.dailyBudget.toLocaleString()}</span></span>
                </div>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${item.budgetPct}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-gray-400">KPI</p>
                <p className="text-xs font-medium text-gray-700">{item.mainKpi}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Campaign Structure */}
      <Section title="Campaign Structure" icon={<BarChart3 className="w-4 h-4 text-blue-500" />}>
        <div className="space-y-4">
          {campaignStructure.search.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Search Campaigns</p>
              <div className="space-y-2">
                {campaignStructure.search.map((c, i) => (
                  <div key={i} className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-800">{c.name}</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Ad Groups: {c.adGroups.join(' • ')}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Themes: {c.keywordThemes.join(', ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {campaignStructure.pmax.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Performance Max</p>
              <div className="space-y-2">
                {campaignStructure.pmax.map((c, i) => (
                  <div key={i} className="bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
                    <p className="text-xs font-semibold text-orange-800">{c.name}</p>
                    <p className="text-[10px] text-orange-600 mt-0.5">Asset Groups: {c.assetGroups.join(' • ')}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Signals: {c.audienceSignals.join(', ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {campaignStructure.remarketing.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Remarketing</p>
              <div className="space-y-2">
                {campaignStructure.remarketing.map((c, i) => (
                  <div key={i} className="bg-purple-50 rounded-lg px-3 py-2 border border-purple-100">
                    <p className="text-xs font-semibold text-purple-800">{c.name}</p>
                    <p className="text-[10px] text-purple-600 mt-0.5">Audience: {c.audience} ({c.lookbackWindow}d)</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{c.messageAngle}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {campaignStructure.demandGen.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">Demand Gen</p>
              <div className="space-y-2">
                {campaignStructure.demandGen.map((c, i) => (
                  <div key={i} className="bg-teal-50 rounded-lg px-3 py-2 border border-teal-100">
                    <p className="text-xs font-semibold text-teal-800">{c.name}</p>
                    <p className="text-[10px] text-teal-600 mt-0.5">{c.funnelStage} | {c.audience}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{c.creativeAngle}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Funnel Mapping */}
      <Section title="Funnel Mapping" icon={<TrendingUp className="w-4 h-4 text-indigo-500" />} defaultOpen={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Funnel Stage</th>
                <th className="pb-2 font-medium">Campaign Type</th>
                <th className="pb-2 font-medium">Message</th>
                <th className="pb-2 font-medium">Goal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {funnelMapping.map((row, i) => (
                <tr key={i}>
                  <td className="py-2 pr-2">
                    <span className={cn('px-1.5 py-0.5 rounded-full font-semibold', FUNNEL_COLORS[row.funnelStage] ?? 'bg-gray-100 text-gray-600')}>
                      {row.funnelStage}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-gray-600">{row.campaignType}</td>
                  <td className="py-2 pr-2 text-gray-500">{row.messageAngle}</td>
                  <td className="py-2 text-gray-600 font-medium">{row.conversionGoal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Measurement Plan */}
      <Section title="Measurement Plan" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} defaultOpen={false}>
        <div className="space-y-2">
          <div className="flex gap-2">
            <span className="text-xs font-semibold text-gray-500 w-32 shrink-0">Primary Conversion</span>
            <span className="text-xs text-gray-800">{measurementPlan.primaryConversion}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-xs font-semibold text-gray-500 w-32 shrink-0">Secondary</span>
            <span className="text-xs text-gray-800">{measurementPlan.secondaryConversion}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-xs font-semibold text-gray-500 w-32 shrink-0">Micro Conversion</span>
            <span className="text-xs text-gray-800">{measurementPlan.microConversion}</span>
          </div>
          {measurementPlan.trackingRisks.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs font-semibold text-amber-700 mb-1">Tracking Risks:</p>
              <ul className="space-y-0.5">
                {measurementPlan.trackingRisks.map((r, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* Optimization Plan */}
      <Section title="Optimization Timeline" icon={<TrendingUp className="w-4 h-4 text-purple-500" />} defaultOpen={false}>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { period: 'Week 1–2', items: optimizationPlan.week1_2, color: 'bg-blue-50 border-blue-100' },
            { period: 'Week 3–4', items: optimizationPlan.week3_4, color: 'bg-violet-50 border-violet-100' },
            { period: 'Month 2+', items: optimizationPlan.month2plus, color: 'bg-emerald-50 border-emerald-100' },
          ].map(({ period, items, color }) => (
            <div key={period} className={cn('rounded-xl p-3 border', color)}>
              <p className="text-xs font-bold text-gray-700 mb-2">{period}</p>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-gray-400 shrink-0">•</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Risks */}
      {risks.filter(Boolean).length > 0 && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm font-semibold text-red-800">ความเสี่ยงที่ต้องระวัง</p>
          </div>
          <ul className="space-y-1.5">
            {risks.filter(Boolean).map((r, i) => (
              <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                <span className="text-red-400 shrink-0 mt-0.5">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      {onBuildCampaigns && (
        <button
          onClick={onBuildCampaigns}
          className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors shadow-sm"
        >
          ดำเนินการสร้าง Campaign Structure →
        </button>
      )}
    </div>
  )
}
