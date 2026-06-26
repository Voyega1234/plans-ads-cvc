import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, Clock, Loader } from 'lucide-react'

const config: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-600', icon: Clock },
  running: { label: 'Running', color: 'bg-blue-100 text-blue-700', icon: Loader },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
}

export default function PushStatusBadge({ status }: { status: string }) {
  const c = config[status] ?? config.pending
  const Icon = c.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', c.color)}>
      <Icon className={cn('w-3 h-3', status === 'running' ? 'animate-spin' : '')} />
      {c.label}
    </span>
  )
}
