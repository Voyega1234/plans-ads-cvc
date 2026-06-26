'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { CampaignMixItem } from '@/types'
import { cn } from '@/lib/utils'
import { Trash2, Plus } from 'lucide-react'

// ── Bid strategy options per campaign type ──────────────────────────────────

const BID_STRATEGIES_BY_TYPE: Record<string, string[]> = {
  SEARCH:          ['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'TARGET_IMPRESSION_SHARE', 'MANUAL_CPC'],
  PERFORMANCE_MAX: ['MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE'],
  SHOPPING:        ['TARGET_ROAS', 'MAXIMIZE_CLICKS', 'MANUAL_CPC'],
  DISPLAY:         ['MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'MAXIMIZE_CLICKS', 'CPM'],
  VIDEO:           ['MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'CPV', 'CPM'],
  DEMAND_GEN:      ['MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'MAXIMIZE_CLICKS'],
  APP_CAMPAIGN:    ['MAXIMIZE_CONVERSIONS', 'TARGET_CPA'],
  YOUTUBE:         ['MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'CPV', 'CPM'],
}

const DEFAULT_BID_BY_TYPE: Record<string, string> = {
  SEARCH:          'MAXIMIZE_CLICKS',
  SHOPPING:        'MAXIMIZE_CLICKS',
  DISPLAY:         'MAXIMIZE_CONVERSIONS',
  PERFORMANCE_MAX: 'MAXIMIZE_CONVERSIONS',
  VIDEO:           'MAXIMIZE_CONVERSIONS',
  YOUTUBE:         'MAXIMIZE_CONVERSIONS',
  DEMAND_GEN:      'MAXIMIZE_CONVERSIONS',
  APP_CAMPAIGN:    'MAXIMIZE_CONVERSIONS',
}

const BID_STRATEGY_LABELS: Record<string, string> = {
  MAXIMIZE_CLICKS:           'Maximize Clicks',
  MAXIMIZE_CONVERSIONS:      'Maximize Conversions',
  MAXIMIZE_CONVERSION_VALUE: 'Maximize Conv. Value',
  TARGET_CPA:                'Target CPA',
  TARGET_ROAS:               'Target ROAS',
  TARGET_IMPRESSION_SHARE:   'Target Impr. Share',
  MANUAL_CPC:                'Manual CPC',
  CPM:                       'CPM',
  CPV:                       'CPV',
}

const CAMPAIGN_TYPES = [
  'SEARCH', 'PERFORMANCE_MAX', 'SHOPPING', 'DISPLAY', 'VIDEO', 'DEMAND_GEN', 'APP_CAMPAIGN', 'YOUTUBE',
] as const

// Which field to show per bid strategy
type BidField = 'targetCPA' | 'maxCpc' | 'targetRoas' | 'targetImpressionShare' | null

function getBidField(strategy: string): BidField {
  switch (strategy) {
    case 'TARGET_CPA':              return 'targetCPA'
    case 'MAXIMIZE_CLICKS':         return 'maxCpc'
    case 'MANUAL_CPC':              return 'maxCpc'
    case 'TARGET_ROAS':             return 'targetRoas'
    case 'TARGET_IMPRESSION_SHARE': return 'targetImpressionShare'
    default:                        return null
  }
}

function getBidFieldLabel(strategy: string): string {
  switch (strategy) {
    case 'TARGET_CPA':              return 'Target CPA (THB)'
    case 'MAXIMIZE_CLICKS':         return 'Max CPC (THB)'
    case 'MANUAL_CPC':              return 'Max CPC (THB)'
    case 'TARGET_ROAS':             return 'Target ROAS'
    case 'TARGET_IMPRESSION_SHARE': return 'Imp. Share %'
    default:                        return ''
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAllowedStrategies(type: string): string[] {
  return BID_STRATEGIES_BY_TYPE[type] ?? ['MAXIMIZE_CONVERSIONS']
}

function getFixedBidStrategy(type: string, current: string): string {
  const allowed = getAllowedStrategies(type)
  if (allowed.includes(current)) return current
  return DEFAULT_BID_BY_TYPE[type] ?? allowed[0]
}

function recalcPercents(campaigns: CampaignMixItem[]): CampaignMixItem[] {
  const total = campaigns.reduce((s, c) => s + c.monthlyBudget, 0)
  return campaigns.map((c) => ({
    ...c,
    budgetPercent: total > 0 ? Math.round((c.monthlyBudget / total) * 100) : 0,
  }))
}

// ── Type colors ──────────────────────────────────────────────────────────────

const typeColors: Record<string, string> = {
  SEARCH:          'bg-blue-100 text-blue-700',
  DISPLAY:         'bg-purple-100 text-purple-700',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-700',
  VIDEO:           'bg-pink-100 text-pink-700',
  YOUTUBE:         'bg-red-100 text-red-700',
  SHOPPING:        'bg-green-100 text-green-700',
  DEMAND_GEN:      'bg-teal-100 text-teal-700',
  APP_CAMPAIGN:    'bg-indigo-100 text-indigo-700',
}

// ── Inline editable cell ─────────────────────────────────────────────────────

const PREFIX = 'CVC - '

function enforcePrefix(v: string): string {
  const trimmed = v.trimStart()
  if (trimmed.toUpperCase().startsWith('CVC - ')) {
    return PREFIX + trimmed.slice(6)
  }
  if (trimmed.startsWith(PREFIX)) return trimmed
  return PREFIX + trimmed.replace(/^CVC\s*-?\s*/i, '')
}

function EditableText({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = (v: string) => {
    const fixed = enforcePrefix(v)
    onChange(fixed)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true) }}
        className={cn('cursor-pointer rounded px-1 -mx-1 hover:bg-blue-50 transition-colors', className)}
        title="คลิกเพื่อแก้ไข"
      >
        <span className="text-gray-400 font-normal">{PREFIX}</span>
        <span>{value.startsWith(PREFIX) ? value.slice(PREFIX.length) : value}</span>
      </span>
    )
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => {
        const v = e.target.value
        if (!v.startsWith(PREFIX)) {
          setDraft(PREFIX + v.replace(/^CVC\s*-?\s*/i, ''))
        } else {
          setDraft(v)
        }
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(draft)
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full px-1 py-0.5 text-sm border rounded ring-2 ring-blue-400 outline-none"
    />
  )
}

function EditableNumber({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number | undefined
  onChange: (v: number) => void
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))

  const commit = () => {
    const n = Number(draft)
    if (!isNaN(n) && draft !== '') onChange(n)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(String(value ?? '')); setEditing(true) }}
        className={cn('cursor-pointer rounded px-1 -mx-1 hover:bg-blue-50 transition-colors', className)}
        title="คลิกเพื่อแก้ไข"
      >
        {value != null && value > 0 ? formatCurrency(value) : <span className="text-gray-300 text-xs">{placeholder ?? '—'}</span>}
      </span>
    )
  }

  return (
    <input
      autoFocus
      type="number"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-24 px-1 py-0.5 text-sm border rounded ring-2 ring-blue-400 outline-none text-right"
    />
  )
}

function makeNewCampaign(): CampaignMixItem {
  return {
    campaignName: `${PREFIX}New Campaign`,
    type: 'SEARCH',
    objective: 'Conversions',
    monthlyBudget: 0,
    budgetPercent: 0,
    targetCPA: 0,
    expectedClicks: 0,
    expectedImpressions: 0,
    expectedConversions: 0,
    bidStrategy: 'MAXIMIZE_CLICKS',
    networks: ['GOOGLE_SEARCH'],
    targeting: { locations: ['Thailand'], languages: ['th'], devices: ['DESKTOP', 'MOBILE'] },
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function CampaignMixTable({
  campaigns,
  onChange,
}: {
  campaigns: CampaignMixItem[]
  onChange?: (campaigns: CampaignMixItem[]) => void
}) {
  const initialCampaigns = campaigns.map((c) => ({
    ...c,
    campaignName: enforcePrefix(c.campaignName),
    bidStrategy: getFixedBidStrategy(c.type, c.bidStrategy),
  }))

  const [items, setItems] = useState<CampaignMixItem[]>(initialCampaigns)

  const isEditable = !!onChange

  function push(next: CampaignMixItem[]) {
    const withPercents = recalcPercents(next)
    setItems(withPercents)
    onChange?.(withPercents)
  }

  function update(index: number, patch: Partial<CampaignMixItem>) {
    const next = items.map((c, i) => {
      if (i !== index) return c
      const updated = { ...c, ...patch }
      updated.bidStrategy = getFixedBidStrategy(updated.type, updated.bidStrategy)
      return updated
    })
    push(next)
  }

  function addCampaign() {
    push([...items, makeNewCampaign()])
  }

  function removeCampaign(index: number) {
    push(items.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Campaign</th>
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Type</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium">Monthly Budget</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium">Budget %</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium">Bid Target</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium">Est. Conv.</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium">Est. Clicks</th>
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Bid Strategy</th>
              {isEditable && <th className="py-3 px-2" />}
            </tr>
          </thead>
          <tbody>
            {items.map((c, i) => {
              const bidField = getBidField(c.bidStrategy)
              const bidFieldLabel = getBidFieldLabel(c.bidStrategy)
              const bidValue = bidField === 'targetCPA' ? c.targetCPA
                : bidField === 'maxCpc' ? (c.maxCpc ?? 0)
                : bidField === 'targetRoas' ? (c.targetRoas ?? 0)
                : bidField === 'targetImpressionShare' ? (c.targetImpressionShare ?? 0)
                : 0

              return (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  {/* Campaign Name */}
                  <td className="py-3 px-4 font-medium text-gray-900 min-w-[160px]">
                    {isEditable ? (
                      <EditableText
                        value={c.campaignName}
                        onChange={(v) => update(i, { campaignName: v })}
                      />
                    ) : c.campaignName}
                  </td>

                  {/* Type — editable dropdown */}
                  <td className="py-3 px-4">
                    {isEditable ? (
                      <select
                        value={c.type}
                        onChange={(e) => update(i, { type: e.target.value as CampaignMixItem['type'] })}
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded border border-transparent hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer',
                          typeColors[c.type] ?? 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {CAMPAIGN_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', typeColors[c.type] ?? 'bg-gray-100 text-gray-600')}>
                        {c.type}
                      </span>
                    )}
                  </td>

                  {/* Monthly Budget */}
                  <td className="py-3 px-4 text-right font-semibold text-gray-900">
                    {isEditable ? (
                      <EditableNumber
                        value={c.monthlyBudget}
                        onChange={(v) => {
                          const next = items.map((x, j) => j === i ? { ...x, monthlyBudget: v } : x)
                          push(next)
                        }}
                        className="font-semibold text-gray-900"
                      />
                    ) : formatCurrency(c.monthlyBudget)}
                  </td>

                  {/* Budget % */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${c.budgetPercent}%` }} />
                      </div>
                      <span className="text-gray-600 w-8 text-right">{c.budgetPercent}%</span>
                    </div>
                  </td>

                  {/* Bid Target — dynamic per strategy */}
                  <td className="py-3 px-4 text-right text-gray-700">
                    {isEditable && bidField ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-400 mb-0.5">{bidFieldLabel}</span>
                        <EditableNumber
                          value={bidValue || undefined}
                          onChange={(v) => update(i, { [bidField]: v })}
                          placeholder="ระบุ"
                          className="text-gray-700"
                        />
                      </div>
                    ) : (
                      bidValue > 0 ? formatCurrency(bidValue) : <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Est. Conversions */}
                  <td className="py-3 px-4 text-right font-semibold text-emerald-700">{c.expectedConversions}</td>

                  {/* Est. Clicks */}
                  <td className="py-3 px-4 text-right text-gray-600">{c.expectedClicks.toLocaleString()}</td>

                  {/* Bid Strategy */}
                  <td className="py-3 px-4 text-gray-600 min-w-[160px]">
                    {isEditable ? (
                      <select
                        value={c.bidStrategy}
                        onChange={(e) => update(i, { bidStrategy: e.target.value })}
                        className="w-full text-sm border border-transparent rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-transparent hover:border-gray-200 cursor-pointer"
                      >
                        {getAllowedStrategies(c.type).map((s) => (
                          <option key={s} value={s}>{BID_STRATEGY_LABELS[s] ?? s}</option>
                        ))}
                      </select>
                    ) : (BID_STRATEGY_LABELS[c.bidStrategy] ?? c.bidStrategy)}
                  </td>

                  {/* Remove button */}
                  {isEditable && (
                    <td className="py-3 px-2">
                      <button
                        onClick={() => removeCampaign(i)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        title="ลบแคมเปญ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add campaign row */}
      {isEditable && (
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={addCampaign}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            เพิ่มแคมเปญ
          </button>
        </div>
      )}
    </div>
  )
}
