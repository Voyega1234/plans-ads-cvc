import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QAScoreCardProps {
  score: number
  totalChecks: number
  passed: number
  failed: number
  warnings: number
  readyToPush: boolean
  summary: string
}

export default function QAScoreCard({ score, totalChecks, passed, failed, warnings, readyToPush, summary }: QAScoreCardProps) {
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600'
  const ring = score >= 80 ? 'stroke-emerald-500' : score >= 60 ? 'stroke-yellow-500' : 'stroke-red-500'
  const circumference = 2 * Math.PI * 45
  const dash = (score / 100) * circumference

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-8">
        {/* Score circle */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="transform -rotate-90" width="128" height="128">
            <circle cx="64" cy="64" r="45" fill="none" stroke="#e5e7eb" strokeWidth="10" />
            <circle
              cx="64" cy="64" r="45"
              fill="none"
              strokeWidth="10"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              className={cn('transition-all duration-700', ring)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-3xl font-bold', color)}>{score}</span>
            <span className="text-xs text-gray-500">/ 100</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-lg font-bold">{passed}</span>
              </div>
              <p className="text-xs text-gray-500">Passed</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-yellow-600">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-lg font-bold">{warnings}</span>
              </div>
              <p className="text-xs text-gray-500">Warnings</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-red-600">
                <XCircle className="w-4 h-4" />
                <span className="text-lg font-bold">{failed}</span>
              </div>
              <p className="text-xs text-gray-500">Failed</p>
            </div>
          </div>

          <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            readyToPush ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
          )}>
            {readyToPush ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {readyToPush ? 'Ready to Push' : 'Review Required'}
          </div>
        </div>
      </div>

      {summary && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">{summary}</p>
        </div>
      )}
    </div>
  )
}
