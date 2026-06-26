'use client'

import Link from 'next/link'
import { ArrowRight, Calendar, DollarSign, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface MediaPlanCardProps {
  id: string
  title: string
  objective: string
  monthlyBudget: number
  currency: string
  status: string
  createdAt: string | Date
  campaignCount?: number
  onDeleted?: (id: string) => void
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  approved: 'bg-emerald-100 text-emerald-700',
  active: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-purple-100 text-purple-700',
}

export default function MediaPlanCard({
  id,
  title,
  objective,
  monthlyBudget,
  currency,
  status,
  createdAt,
  campaignCount = 0,
  onDeleted,
}: MediaPlanCardProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function handleDelete() {
    if (!confirm) { setConfirm(true); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/media-plans/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (onDeleted) onDeleted(id)
        else router.refresh()
      } else {
        setDeleting(false)
        setConfirm(false)
      }
    } catch {
      setDeleting(false)
      setConfirm(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{objective}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', statusColors[status] ?? 'bg-gray-100 text-gray-600')}>
            {status}
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title={confirm ? 'คลิกอีกครั้งเพื่อยืนยัน' : 'ลบ Media Plan'}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              confirm
                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                : 'text-gray-300 hover:text-red-500 hover:bg-red-50',
              deleting && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {confirm && (
        <p className="mt-2 text-xs text-red-500 font-medium">คลิกลบอีกครั้งเพื่อยืนยัน</p>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span>{formatCurrency(monthlyBudget, currency)}/day</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>{formatDate(createdAt)}</span>
        </div>
        {campaignCount > 0 && (
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
            {campaignCount} campaigns
          </span>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          href={`/media-plans/${id}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          View Plan <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          href={`/media-plans/${id}/build`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          Build Plan
        </Link>
      </div>
    </div>
  )
}
