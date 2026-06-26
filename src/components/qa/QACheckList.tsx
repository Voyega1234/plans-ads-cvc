import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import { QACheckResult } from '@/types'
import { cn } from '@/lib/utils'

const statusConfig = {
  pass: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200' },
  fail: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 border-yellow-200' },
}

const severityBadge = {
  error: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
}

export default function QACheckList({ checks }: { checks: QACheckResult[] }) {
  return (
    <div className="space-y-2">
      {checks.map((check, i) => {
        const config = statusConfig[check.status]
        const Icon = config.icon
        return (
          <div key={i} className={cn('rounded-lg border p-3', config.bg)}>
            <div className="flex items-start gap-3">
              <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{check.checkName}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', severityBadge[check.severity])}>
                    {check.severity}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{check.message}</p>
                {check.recommendation && (
                  <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {check.recommendation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
