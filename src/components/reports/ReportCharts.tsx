'use client'

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface TrendPoint { date: string; cost: number; conv: number }
interface CampaignPoint { name: string; spend: number; conv: number }

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="cost" orientation="left"  tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => `฿${(v/1000).toFixed(0)}k`} width={40} />
        <YAxis yAxisId="conv" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={30} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          formatter={(value, name) => [name === 'cost' ? `฿${Number(value).toLocaleString()}` : value, name === 'cost' ? 'Cost' : 'Conv']} />
        <Area yAxisId="cost" type="monotone" dataKey="cost" stroke="#60a5fa" strokeWidth={2} fill="url(#gCost)" dot={false} />
        <Area yAxisId="conv" type="monotone" dataKey="conv" stroke="#34d399" strokeWidth={2} fill="url(#gConv)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function CampaignBarChart({ data }: { data: CampaignPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="spend" orientation="left"  tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => `฿${(v/1000).toFixed(0)}k`} width={40} />
        <YAxis yAxisId="conv"  orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(v, name) => [name === 'spend' ? `฿${Number(v).toLocaleString()}` : v, name === 'spend' ? 'Spend' : 'Conv']} />
        <Bar yAxisId="spend" dataKey="spend" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="conv"  dataKey="conv"  fill="#6ee7b7" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
