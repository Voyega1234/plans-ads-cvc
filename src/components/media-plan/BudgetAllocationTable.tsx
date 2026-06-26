'use client'

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { CampaignMixItem } from '@/types'
import { cn } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  SEARCH:          '#3b82f6',
  PERFORMANCE_MAX: '#f97316',
  DISPLAY:         '#8b5cf6',
  VIDEO:           '#ec4899',
  YOUTUBE:         '#ef4444',
  SHOPPING:        '#10b981',
  DEMAND_GEN:      '#14b8a6',
  APP_CAMPAIGN:    '#6366f1',
}

const TYPE_BG: Record<string, string> = {
  SEARCH:          'bg-blue-100 text-blue-700',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-700',
  DISPLAY:         'bg-purple-100 text-purple-700',
  VIDEO:           'bg-pink-100 text-pink-700',
  YOUTUBE:         'bg-red-100 text-red-700',
  SHOPPING:        'bg-emerald-100 text-emerald-700',
  DEMAND_GEN:      'bg-teal-100 text-teal-700',
  APP_CAMPAIGN:    'bg-indigo-100 text-indigo-700',
}

const TYPE_LABEL: Record<string, string> = {
  SEARCH: 'Search', PERFORMANCE_MAX: 'PMax', DISPLAY: 'Display',
  VIDEO: 'Video', YOUTUBE: 'YouTube', SHOPPING: 'Shopping',
  DEMAND_GEN: 'Demand Gen', APP_CAMPAIGN: 'App',
}

function recalc(campaigns: CampaignMixItem[]): CampaignMixItem[] {
  // Primary field: dailyBudget. monthlyBudget = dailyBudget × 30 (for reference only)
  const normalized = campaigns.map(c => {
    const daily = c.dailyBudget ?? (c.monthlyBudget > 0 ? Math.round(c.monthlyBudget / 30) : 0)
    return { ...c, dailyBudget: daily, monthlyBudget: daily * 30 }
  })
  const totalDaily = normalized.reduce((s, c) => s + (c.dailyBudget ?? 0), 0)
  return normalized.map(c => ({
    ...c,
    budgetPercent: totalDaily > 0 ? Math.round(((c.dailyBudget ?? 0) / totalDaily) * 100) : 0,
  }))
}

function InlineNumber({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft)
          if (!isNaN(n) && n >= 0) onChange(n)
          setEditing(false)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { const n = Number(draft); if (!isNaN(n) && n >= 0) onChange(n); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-28 px-2 py-1 text-sm font-semibold text-right border border-blue-400 rounded-lg ring-2 ring-blue-200 outline-none bg-white"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(String(value)); setEditing(true) }}
      className="px-2 py-1 text-sm font-semibold text-gray-900 hover:bg-blue-50 rounded-lg cursor-pointer text-right w-full transition-colors"
      title="คลิกเพื่อแก้ไข"
    >
      ฿{value.toLocaleString()}
    </button>
  )
}

// Custom pie label
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-gray-800 mb-0.5">{d.name}</p>
      <p className="text-gray-600">฿{d.value.toLocaleString()}/วัน</p>
      <p className="text-blue-600 font-medium">{d.payload.pct}%</p>
    </div>
  )
}

interface Props {
  campaigns: CampaignMixItem[]
  totalBudget: number
  onChange?: (campaigns: CampaignMixItem[]) => void
}

export default function BudgetAllocationTable({ campaigns, totalBudget, onChange }: Props) {
  const [items, setItems] = useState<CampaignMixItem[]>(() => recalc(campaigns))

  function push(next: CampaignMixItem[]) {
    const updated = recalc(next)
    setItems(updated)
    onChange?.(updated)
  }

  function updateBudget(i: number, daily: number) {
    push(items.map((c, idx) => idx === i ? { ...c, dailyBudget: daily, monthlyBudget: daily * 30 } : c))
  }

  function remove(i: number) {
    push(items.filter((_, idx) => idx !== i))
  }

  function add() {
    push([...items, {
      campaignName: 'CVC - New Campaign',
      type: 'SEARCH',
      objective: 'Leads',
      dailyBudget: 0,
      monthlyBudget: 0,
      budgetPercent: 0,
      targetCPA: 0,
      expectedClicks: 0,
      expectedImpressions: 0,
      expectedConversions: 0,
      bidStrategy: 'MAXIMIZE_CLICKS',
      networks: ['GOOGLE_SEARCH'],
      targeting: { locations: ['Thailand'], languages: ['th'], devices: ['DESKTOP', 'MOBILE'] },
    }])
  }

  const totalDaily = items.reduce((s, c) => s + (c.dailyBudget ?? 0), 0)
  // totalBudget prop is monthlyBudget — convert for comparison
  const totalBudgetDaily = totalBudget > 0 ? Math.round(totalBudget / 30) : 0
  const over = totalBudgetDaily > 0 && totalDaily > totalBudgetDaily * 1.05

  const pieData = useMemo(() => items
    .filter(c => (c.dailyBudget ?? 0) > 0)
    .map(c => ({
      name: c.campaignName.replace(/^CVC\s*-\s*/i, '').split('|')[0].trim(),
      value: c.dailyBudget ?? 0,
      pct: c.budgetPercent,
      color: TYPE_COLORS[c.type] ?? '#94a3b8',
    })), [items])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">Budget Allocation</h2>
          <p className="text-xs text-gray-400 mt-0.5">คลิกงบเพื่อแก้ไข · pie chart อัปเดต real-time</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">รวม/วัน</p>
          <p className={cn('text-base font-bold', over ? 'text-red-600' : 'text-gray-900')}>
            ฿{totalDaily.toLocaleString()}<span className="text-xs font-normal text-gray-500">/วัน</span>
            {totalBudgetDaily > 0 && (
              <span className="text-xs font-normal text-gray-400 ml-1">/ ฿{totalBudgetDaily.toLocaleString()}</span>
            )}
          </p>
          <p className="text-xs text-gray-400">≈ ฿{(totalDaily * 30).toLocaleString()}/เดือน</p>
          {over && <p className="text-[10px] text-red-500">เกินงบที่ตั้งไว้</p>}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Table — left */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">แคมเปญ</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">งบ/วัน</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">สัดส่วน</th>
                {onChange && <th className="py-2.5 px-2" />}
              </tr>
            </thead>
            <tbody>
              {items.map((c, i) => {
                const color = TYPE_COLORS[c.type] ?? '#94a3b8'
                const pct = c.budgetPercent
                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors group">
                    {/* Campaign name */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm font-medium text-gray-800 truncate max-w-[200px]" title={c.campaignName}>
                          {c.campaignName.replace(/^CVC\s*-\s*/i, '')}
                        </span>
                      </div>
                    </td>

                    {/* Type badge */}
                    <td className="py-3 px-3 text-center">
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', TYPE_BG[c.type] ?? 'bg-gray-100 text-gray-600')}>
                        {TYPE_LABEL[c.type] ?? c.type}
                      </span>
                    </td>

                    {/* Daily budget — primary, editable */}
                    <td className="py-2 px-2 text-right">
                      {onChange ? (
                        <InlineNumber value={c.dailyBudget ?? 0} onChange={v => updateBudget(i, v)} />
                      ) : (
                        <span className="text-sm font-semibold text-gray-900">฿{(c.dailyBudget ?? 0).toLocaleString()}/วัน</span>
                      )}
                    </td>

                    {/* % bar */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-8 text-right shrink-0">{pct}%</span>
                      </div>
                    </td>

                    {/* Remove */}
                    {onChange && (
                      <td className="py-3 px-2">
                        <button
                          onClick={() => remove(i)}
                          className="text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="ลบแคมเปญ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {/* Total row */}
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="py-2.5 px-4 text-xs font-bold text-gray-700" colSpan={2}>รวม ({items.length} แคมเปญ)</td>
                <td className="py-2.5 px-2 text-right">
                  <span className={cn('text-sm font-bold', over ? 'text-red-600' : 'text-gray-900')}>
                    ฿{totalDaily.toLocaleString()}<span className="text-xs font-normal text-gray-500">/วัน</span>
                  </span>
                </td>
                <td className="py-2.5 px-4 text-xs font-bold text-gray-700">100%</td>
                {onChange && <td />}
              </tr>
            </tfoot>
          </table>

          {/* Add button */}
          {onChange && (
            <div className="px-4 py-2.5 border-t border-gray-100">
              <button
                onClick={add}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่มแคมเปญ
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-gray-100 self-stretch" />

        {/* Pie chart — right */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col items-center justify-center px-4 py-6 bg-gray-50/40">
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="w-full space-y-1.5 mt-1">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-gray-600 truncate">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800 shrink-0 ml-2">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-xs text-gray-400 py-8">กรอกงบเพื่อดู chart</div>
          )}
        </div>
      </div>
    </div>
  )
}
