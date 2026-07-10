'use client'

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── Muted infographic palette (soft teal / clay orange / warm neutrals) ────────
export const MUTED = {
  teal:      '#5B9E92',
  tealSoft:  '#A9CCC4',
  clay:      '#DD8E63',
  claySoft:  '#EFC7AE',
  slate:     '#8FA3B0',
  sand:      '#C9AF6E',
  plum:      '#A48EB8',
  moss:      '#84AE8C',
  rose:      '#D08C8C',
  ink:       '#3D4852',
  axis:      '#A3ADB8',
  grid:      '#EEF0EF',
}
export const MUTED_SERIES = [MUTED.teal, MUTED.clay, MUTED.slate, MUTED.sand, MUTED.plum, MUTED.moss, MUTED.rose, MUTED.tealSoft]

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 12,
  border: '1px solid #E6E9E8',
  boxShadow: '0 4px 16px rgba(61,72,82,0.08)',
  padding: '8px 12px',
} as const

interface TrendPoint { date: string; cost: number; conv: number }
interface CampaignPoint { name: string; spend: number; conv: number }

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={MUTED.teal} stopOpacity={0.28} />
            <stop offset="95%" stopColor={MUTED.teal} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={MUTED.clay} stopOpacity={0.25} />
            <stop offset="95%" stopColor={MUTED.clay} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={MUTED.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="cost" orientation="left"  tick={{ fontSize: 10, fill: MUTED.axis }} tickLine={false} axisLine={false} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} width={42} />
        <YAxis yAxisId="conv" orientation="right" tick={{ fontSize: 10, fill: MUTED.axis }} tickLine={false} axisLine={false} width={30} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(value, name) => [name === 'cost' ? `฿${Number(value).toLocaleString()}` : value, name === 'cost' ? 'Spend' : 'Conversions']} />
        <Area yAxisId="cost" type="monotone" dataKey="cost" stroke={MUTED.teal} strokeWidth={2.5} fill="url(#gCost)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Area yAxisId="conv" type="monotone" dataKey="conv" stroke={MUTED.clay} strokeWidth={2.5} fill="url(#gConv)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function CampaignBarChart({ data }: { data: CampaignPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="32%">
        <CartesianGrid strokeDasharray="3 3" stroke={MUTED.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED.axis }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="spend" orientation="left"  tick={{ fontSize: 10, fill: MUTED.axis }} tickLine={false} axisLine={false} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} width={42} />
        <YAxis yAxisId="conv"  orientation="right" tick={{ fontSize: 10, fill: MUTED.axis }} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(91,158,146,0.06)' }}
          formatter={(v, name) => [name === 'spend' ? `฿${Number(v).toLocaleString()}` : v, name === 'spend' ? 'Spend' : 'Conversions']} />
        <Bar yAxisId="spend" dataKey="spend" fill={MUTED.tealSoft} radius={[6, 6, 0, 0]} />
        <Bar yAxisId="conv"  dataKey="conv"  fill={MUTED.clay}     radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Donut with side legend — like the reference infographic/wallet dashboards ──
export interface DonutSlice { name: string; value: number }

export function DonutChart({ data, format = (v: number) => v.toLocaleString(), centerLabel, height = 210 }: {
  data: DonutSlice[]
  format?: (v: number) => string
  centerLabel?: string
  height?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name"
              innerRadius="64%" outerRadius="92%" paddingAngle={2} cornerRadius={6}
              stroke="none" startAngle={90} endAngle={-270}>
              {data.map((_, i) => <Cell key={i} fill={MUTED_SERIES[i % MUTED_SERIES.length]} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [format(v), name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold tabular-nums" style={{ color: MUTED.ink }}>{format(total)}</span>
          {centerLabel && <span className="text-[10px]" style={{ color: MUTED.axis }}>{centerLabel}</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0
          return (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MUTED_SERIES[i % MUTED_SERIES.length] }} />
              <span className="truncate flex-1" style={{ color: MUTED.ink }}>{d.name}</span>
              <span className="tabular-nums font-semibold shrink-0" style={{ color: MUTED.ink }}>{format(d.value)}</span>
              <span className="tabular-nums w-11 text-right shrink-0" style={{ color: MUTED.axis }}>{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Marketing funnel — centered tapering trapezoids (classic funnel shape) ─────
export interface FunnelStage { label: string; value: number }

export function FunnelBars({ stages, format = (v: number) => v.toLocaleString() }: {
  stages: FunnelStage[]
  format?: (v: number) => string
}) {
  const n = stages.length
  if (n === 0) return null
  // Geometric taper 100% → 42% regardless of values (values shown as numbers) — the
  // classic marketing-funnel silhouette from the reference design
  const step = n > 1 ? 58 / (n - 1) : 0
  const widthPct = (i: number) => 100 - i * step

  return (
    <div className="max-w-xl mx-auto">
      {stages.map((st, i) => {
        const prev = i > 0 ? stages[i - 1].value : null
        const rate = prev && prev > 0 ? (st.value / prev) * 100 : null
        const w = widthPct(i)
        const wNext = i < n - 1 ? widthPct(i + 1) : Math.max(w - step, 30)
        const inset = ((1 - wNext / w) / 2) * 100
        const color = MUTED_SERIES[i % MUTED_SERIES.length]
        return (
          <div key={st.label}>
            {rate !== null && (
              <div className="flex items-center justify-center gap-3 py-1 text-[11px]">
                {rate <= 100 ? (
                  <>
                    <span className="font-semibold" style={{ color: MUTED.teal }}>↓ ผ่านต่อ {rate.toFixed(1)}%</span>
                    <span style={{ color: MUTED.rose }}>หลุด {(100 - rate).toFixed(1)}%</span>
                  </>
                ) : (
                  <span className="font-semibold" style={{ color: MUTED.sand }}>
                    ↑ {rate.toFixed(0)}% ของขั้นก่อน — ขั้นก่อนอาจ track ไม่ครบ
                  </span>
                )}
              </div>
            )}
            <div className="mx-auto" style={{ width: `${w}%` }}>
              <div className="flex items-center justify-center gap-3 px-6 py-3.5 text-white"
                style={{
                  background: `linear-gradient(135deg, ${color}, ${color}CC)`,
                  clipPath: `polygon(0 0, 100% 0, ${(100 - inset).toFixed(2)}% 100%, ${inset.toFixed(2)}% 100%)`,
                }}>
                <span className="text-base font-bold tabular-nums whitespace-nowrap">{format(st.value)}</span>
                <span className="text-xs font-semibold opacity-95 whitespace-nowrap">{st.label}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
