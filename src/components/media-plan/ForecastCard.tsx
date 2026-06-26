'use client'

import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import { MediaPlanForecast } from '@/types'
import { TrendingUp, Eye, MousePointer, DollarSign, BarChart2, RefreshCw } from 'lucide-react'

interface AccountMetrics {
  clicks: number
  impressions: number
  cost: number
  ctr: number
  cpc: number
  conversions: number
  cpa: number
  conversionRate: number
}

interface Props {
  forecast: MediaPlanForecast
  accountMetrics?: AccountMetrics | null
}

export default function ForecastCard({ forecast, accountMetrics }: Props) {
  // AI Forecast — basic metrics only, no conversion/CPA/ROAS
  const forecastMetrics = [
    { label: 'Total Budget', value: formatCurrency(forecast.totalMonthlyBudget), icon: DollarSign, color: 'text-blue-600 bg-blue-50' },
    { label: 'Expected Impressions', value: formatNumber(forecast.totalExpectedImpressions), icon: Eye, color: 'text-pink-600 bg-pink-50' },
    { label: 'Expected Clicks', value: formatNumber(forecast.totalExpectedClicks), icon: MousePointer, color: 'text-orange-600 bg-orange-50' },
    { label: 'Blended CTR', value: formatPercent(forecast.blendedCTR), icon: TrendingUp, color: 'text-indigo-600 bg-indigo-50' },
  ]

  return (
    <div className="space-y-4">
      {/* AI Forecast — basic metrics */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ประมาณการจาก AI (งบที่ตั้ง)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {forecastMetrics.map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                <m.icon className="w-4 h-4" />
              </div>
              <p className="text-xs text-gray-500 font-medium">{m.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Account Real Data — pulled from Google Ads (30 days) */}
      {accountMetrics ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">ข้อมูลจริงจาก Account (30 วันล่าสุด)</p>
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">
              <RefreshCw className="w-2.5 h-2.5" /> Live
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Spend (30d)', value: formatCurrency(accountMetrics.cost), icon: DollarSign, color: 'text-blue-600 bg-blue-50' },
              { label: 'Impressions', value: formatNumber(accountMetrics.impressions), icon: Eye, color: 'text-pink-600 bg-pink-50' },
              { label: 'Clicks', value: formatNumber(accountMetrics.clicks), icon: MousePointer, color: 'text-orange-600 bg-orange-50' },
              { label: 'CTR', value: `${accountMetrics.ctr.toFixed(2)}%`, icon: TrendingUp, color: 'text-indigo-600 bg-indigo-50' },
            ].map((m) => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                  <m.icon className="w-4 h-4" />
                </div>
                <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Conversion section — only if account has real conversion data */}
          {accountMetrics.conversions > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Conversion Data (จาก Account จริง)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Conversions', value: String(Math.round(accountMetrics.conversions)), icon: BarChart2, color: 'text-emerald-600 bg-emerald-50' },
                  { label: 'CPA', value: formatCurrency(accountMetrics.cpa), icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
                  { label: 'Conv. Rate', value: `${accountMetrics.conversionRate.toFixed(2)}%`, icon: TrendingUp, color: 'text-teal-600 bg-teal-50' },
                ].map((m) => (
                  <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                      <m.icon className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">ยังไม่มีข้อมูลจาก Account — เชื่อม Google Ads account เพื่อดู performance จริง</p>
        </div>
      )}
    </div>
  )
}
