import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  label: string
  value: string
  change: number
  changeLabel: string
  icon: React.ReactNode
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red'
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
}

export default function KPICard({ label, value, change, changeLabel, icon, color = 'blue' }: KPICardProps) {
  const isPositive = change >= 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={cn('p-2.5 rounded-lg', colorMap[color])}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-emerald-500" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-500" />
        )}
        <span className={cn('text-sm font-medium', isPositive ? 'text-emerald-600' : 'text-red-600')}>
          {isPositive ? '+' : ''}{change}%
        </span>
        <span className="text-sm text-gray-400">{changeLabel}</span>
      </div>
    </div>
  )
}
