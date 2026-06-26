import { AdCopy } from '@/types'

export default function AdsPreviewCard({ ad }: { ad: AdCopy }) {
  const domain = ad.finalUrl.replace('https://', '').replace('http://', '').split('/')[0]
  const path = ad.displayPath || ''

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="text-xs text-green-700 mb-1">{domain}{path ? `/${path}` : ''}</div>
      <div className="text-blue-700 text-base font-medium hover:underline cursor-pointer">
        {ad.headline1} | {ad.headline2} | {ad.headline3}
      </div>
      <div className="text-sm text-gray-600 mt-1">{ad.description1}</div>
      {ad.description2 && <div className="text-sm text-gray-600">{ad.description2}</div>}
    </div>
  )
}
