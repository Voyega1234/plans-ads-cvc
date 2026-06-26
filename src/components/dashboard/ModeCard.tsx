import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModeCardProps {
  icon: React.ReactNode
  title: string
  description: string
  features: string[]
  href: string
  buttonLabel: string
  color: 'blue' | 'purple' | 'emerald'
}

const colorStyles = {
  blue: {
    border: 'border-blue-200 hover:border-blue-400',
    iconBg: 'bg-blue-600',
    badge: 'bg-blue-50 text-blue-600 border-blue-200',
    button: 'bg-blue-600 hover:bg-blue-700',
    glow: 'hover:shadow-blue-100',
  },
  purple: {
    border: 'border-purple-200 hover:border-purple-400',
    iconBg: 'bg-purple-600',
    badge: 'bg-purple-50 text-purple-600 border-purple-200',
    button: 'bg-purple-600 hover:bg-purple-700',
    glow: 'hover:shadow-purple-100',
  },
  emerald: {
    border: 'border-emerald-200 hover:border-emerald-400',
    iconBg: 'bg-emerald-600',
    badge: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    button: 'bg-emerald-600 hover:bg-emerald-700',
    glow: 'hover:shadow-emerald-100',
  },
}

export default function ModeCard({ icon, title, description, features, href, buttonLabel, color }: ModeCardProps) {
  const styles = colorStyles[color]

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border-2 p-6 flex flex-col gap-5 transition-all duration-200 hover:shadow-xl',
        styles.border,
        styles.glow
      )}
    >
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg', styles.iconBg)}>
        {icon}
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
      </div>

      <ul className="space-y-2 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            </span>
            <span className="text-sm text-gray-600">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className={cn(
          'flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-white text-sm font-semibold transition-colors',
          styles.button
        )}
      >
        {buttonLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
