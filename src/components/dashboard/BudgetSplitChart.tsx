'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface BudgetItem {
  name: string
  value: number
  color: string
}

interface BudgetSplitChartProps {
  data: BudgetItem[]
  total: number
}

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981']

export default function BudgetSplitChart({ data, total }: BudgetSplitChartProps) {
  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`฿${value.toLocaleString()}`, 'Budget']}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="w-full space-y-2 mt-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-gray-600 truncate max-w-[140px]">{item.name}</span>
            </div>
            <span className="font-medium text-gray-800">
              {Math.round((item.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
