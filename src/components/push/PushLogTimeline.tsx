import { CheckCircle, XCircle, Clock, Loader } from 'lucide-react'
import { PushCampaignResult } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  campaigns: PushCampaignResult[]
  status: string
  startedAt?: string
  finishedAt?: string
}

const statusConfig = {
  success: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  skipped: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-50' },
}

export default function PushLogTimeline({ campaigns, status, startedAt, finishedAt }: Props) {
  return (
    <div className="space-y-3">
      {campaigns.map((camp, i) => {
        const config = statusConfig[camp.status] ?? statusConfig.skipped
        const Icon = config.icon
        return (
          <div key={i} className={cn('rounded-lg border p-4', config.bg)}>
            <div className="flex items-start gap-3">
              <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', config.color)} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900">{camp.campaignName}</p>
                {camp.status === 'success' && (
                  <div className="mt-1 space-y-0.5">
                    {camp.googleAdsCampaignId && (
                      <p className="text-xs text-gray-500">Campaign ID: <span className="font-mono">{camp.googleAdsCampaignId}</span></p>
                    )}
                    {camp.adGroupsCreated !== undefined && (
                      <p className="text-xs text-emerald-600">
                        {camp.adGroupsCreated} ad groups, {camp.adsCreated} ads created
                      </p>
                    )}
                  </div>
                )}
                {camp.error && (
                  <p className="text-xs text-red-600 mt-1">{camp.error}</p>
                )}
              </div>
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded',
                camp.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                camp.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              )}>
                {camp.status}
              </span>
            </div>
          </div>
        )
      })}

      {startedAt && finishedAt && (
        <div className="pt-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
          <span>Started: {new Date(startedAt).toLocaleTimeString()}</span>
          <span>Finished: {new Date(finishedAt).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  )
}
