import { CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Integration {
  name: string
  status: 'connected' | 'disconnected'
  detail?: string
}

interface IntegrationStatusCardProps {
  integrations: Integration[]
}

export default function IntegrationStatusCard({ integrations }: IntegrationStatusCardProps) {
  return (
    <div className="space-y-3">
      {integrations.map((integration) => (
        <div key={integration.name} className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                integration.status === 'connected'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
              )}
            >
              {integration.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{integration.name}</p>
              {integration.detail && (
                <p className="text-xs text-gray-500">{integration.detail}</p>
              )}
            </div>
          </div>
          {integration.status === 'connected' ? (
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          ) : (
            <XCircle className="w-5 h-5 text-gray-300" />
          )}
        </div>
      ))}
    </div>
  )
}
