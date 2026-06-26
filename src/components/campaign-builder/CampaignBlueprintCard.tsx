import { DollarSign, Target, MapPin, Globe } from 'lucide-react'
import { CampaignBlueprintItem } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

const typeColors: Record<string, string> = {
  SEARCH: 'bg-blue-100 text-blue-700',
  DISPLAY: 'bg-purple-100 text-purple-700',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-700',
  VIDEO: 'bg-pink-100 text-pink-700',
}

interface Props {
  campaign: CampaignBlueprintItem
  expanded?: boolean
}

export default function CampaignBlueprintCard({ campaign, expanded }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', typeColors[campaign.campaignType] ?? 'bg-gray-100 text-gray-600')}>
            {campaign.campaignType}
          </span>
          <h3 className="font-semibold text-gray-900">{campaign.campaignName}</h3>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" />
            <span>{formatCurrency(campaign.budget)}/day</span>
          </div>
          {campaign.targetCPA && (
            <div className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              <span>CPA {formatCurrency(campaign.targetCPA)}</span>
            </div>
          )}
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium',
            campaign.status === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
          )}>
            {campaign.status}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <MapPin className="w-3.5 h-3.5" />
              <span>{campaign.locationTargets.join(', ')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <Globe className="w-3.5 h-3.5" />
              <span>{campaign.languageTargets.join(', ')}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ad Groups ({campaign.adGroups.length})</p>
            <div className="space-y-2">
              {campaign.adGroups.map((ag, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="font-medium text-sm text-gray-800">{ag.adGroupName}</p>
                  {ag.keywords.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ag.keywords.map((kw, j) => (
                        <span key={j} className="text-xs bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                  {ag.ads.slice(0, 1).map((ad, j) => (
                    <div key={j} className="mt-2 text-xs text-blue-700 font-medium">
                      {ad.headline1} | {ad.headline2} | {ad.headline3}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {campaign.sitelinks && campaign.sitelinks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sitelinks</p>
              <div className="flex flex-wrap gap-2">
                {campaign.sitelinks.map((sl, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200">
                    {sl.text}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
