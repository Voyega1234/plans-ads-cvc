import { AlertTriangle, Info, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Alert {
  severity: string
  title: string
  message: string
  campaignName: string
}

interface AutomationAlertCardProps {
  alerts: Alert[]
}

const severityConfig = {
  warning: { icon: AlertTriangle, bg: 'bg-yellow-50', border: 'border-yellow-200', iconColor: 'text-yellow-600', titleColor: 'text-yellow-800' },
  info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', iconColor: 'text-blue-600', titleColor: 'text-blue-800' },
  success: { icon: CheckCircle, bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-600', titleColor: 'text-emerald-800' },
  error: { icon: AlertTriangle, bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-600', titleColor: 'text-red-800' },
}

export default function AutomationAlertCard({ alerts }: AutomationAlertCardProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400">
        <CheckCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">ไม่มีการแจ้งเตือน</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, i) => {
        const config = severityConfig[alert.severity as keyof typeof severityConfig] ?? severityConfig.info
        const Icon = config.icon
        return (
          <div key={i} className={cn('rounded-lg border p-3', config.bg, config.border)}>
            <div className="flex items-start gap-2.5">
              <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.iconColor)} />
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', config.titleColor)}>{alert.title}</p>
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{alert.message}</p>
                <p className="text-xs text-gray-400 mt-1">{alert.campaignName}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
