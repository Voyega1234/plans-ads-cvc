import { Users, Tag, Globe } from 'lucide-react'
import { AudienceSegmentItem } from '@/types'
import { cn } from '@/lib/utils'

const typeColors: Record<string, string> = {
  REMARKETING: 'bg-blue-100 text-blue-700',
  SIMILAR: 'bg-purple-100 text-purple-700',
  IN_MARKET: 'bg-orange-100 text-orange-700',
  CUSTOM_INTENT: 'bg-emerald-100 text-emerald-700',
  CUSTOMER_LIST: 'bg-pink-100 text-pink-700',
}

export default function AudienceSegmentCard({ segment }: { segment: AudienceSegmentItem }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-800">{segment.name}</h4>
            <p className="text-xs text-gray-500">{segment.campaignName}</p>
          </div>
        </div>
        <span className={cn('px-2 py-0.5 rounded text-xs font-medium flex-shrink-0', typeColors[segment.type] ?? 'bg-gray-100 text-gray-600')}>
          {segment.type}
        </span>
      </div>

      {segment.description && (
        <p className="mt-2 text-xs text-gray-600">{segment.description}</p>
      )}

      {segment.keywords && segment.keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Tag className="w-3 h-3 text-gray-400 mt-0.5" />
          {segment.keywords.map((kw, i) => (
            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {kw}
            </span>
          ))}
        </div>
      )}

      {segment.urls && segment.urls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Globe className="w-3 h-3 text-gray-400 mt-0.5" />
          {segment.urls.map((url, i) => (
            <span key={i} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
              {url}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
