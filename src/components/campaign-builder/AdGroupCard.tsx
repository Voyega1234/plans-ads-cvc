import { AdGroup } from '@/types'

export default function AdGroupCard({ adGroup }: { adGroup: AdGroup }) {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
      <h4 className="font-semibold text-sm text-gray-800">{adGroup.adGroupName}</h4>
      {adGroup.keywords.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 font-medium mb-1">Keywords ({adGroup.keywords.length})</p>
          <div className="flex flex-wrap gap-1">
            {adGroup.keywords.map((kw, i) => (
              <span key={i} className="text-xs bg-white border border-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                [{adGroup.matchTypes[i] || 'PHRASE'}] {kw}
              </span>
            ))}
          </div>
        </div>
      )}
      {adGroup.audiences && adGroup.audiences.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 font-medium mb-1">Audiences</p>
          <div className="flex flex-wrap gap-1">
            {adGroup.audiences.map((aud, i) => (
              <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                {aud}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
