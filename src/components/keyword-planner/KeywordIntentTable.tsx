import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { KeywordItem } from '@/types'

const intentColors = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

const matchTypeColors = {
  EXACT: 'bg-blue-100 text-blue-700',
  PHRASE: 'bg-purple-100 text-purple-700',
  BROAD: 'bg-gray-100 text-gray-600',
}

const competitionColors = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-green-100 text-green-700',
}

interface Props {
  keywords: KeywordItem[]
  adGroupName: string
}

export default function KeywordIntentTable({ keywords, adGroupName }: Props) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{adGroupName}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Keyword</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Match</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Intent</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium text-xs">Avg. Monthly</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Competition</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium text-xs">Bid</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 px-3 font-medium text-gray-800">{kw.keyword}</td>
                <td className="py-2 px-3">
                  <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', matchTypeColors[kw.matchType])}>
                    {kw.matchType}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', intentColors[kw.intent])}>
                    {kw.intent}
                  </span>
                </td>
                <td className="py-2 px-3 text-right text-gray-600">
                  {kw.avgMonthlySearches?.toLocaleString() ?? '-'}
                </td>
                <td className="py-2 px-3">
                  {kw.competition && (
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', competitionColors[kw.competition])}>
                      {kw.competition}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right text-gray-700">
                  {kw.suggestedBid ? formatCurrency(kw.suggestedBid) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
