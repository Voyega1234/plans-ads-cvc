'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FlowStep =
  | 'brief'
  | 'structure'
  | 'research'
  | 'mediaplan'
  | 'adcopy'
  | 'qa'
  | 'push'

interface StepConfig {
  key: FlowStep
  label: string
  shortLabel: string
}

const STEPS: StepConfig[] = [
  { key: 'brief',     label: '1. Brief',               shortLabel: 'Brief'     },
  { key: 'structure', label: '2. Campaign Structure',   shortLabel: 'Structure' },
  { key: 'research',  label: '3. Keyword & Audience',   shortLabel: 'Research'  },
  { key: 'mediaplan', label: '4. Media Plan',           shortLabel: 'Plan'      },
  { key: 'adcopy',    label: '5. Ad Copy',              shortLabel: 'Ad Copy'   },
  { key: 'qa',        label: '6. QA Review',            shortLabel: 'QA'        },
  { key: 'push',      label: '7. Push',                 shortLabel: 'Push'      },
]

interface Props {
  planId: string
  currentStep: FlowStep
}

export default function FlowProgressBar({ planId, currentStep }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep)
  const buildHref = `/media-plans/${planId}/build`

  return (
    <div className="w-full bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex items-center min-w-max py-3 gap-0">
            {STEPS.map((step, idx) => {
              const done = idx < currentIdx
              const current = step.key === currentStep
              const clickable = done && step.key !== 'brief'

              const pill = (
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                    current
                      ? 'bg-blue-600 text-white shadow-sm'
                      : done
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-gray-50 text-gray-400 border border-gray-200',
                    clickable ? 'cursor-pointer hover:opacity-80' : '',
                    !clickable && !current ? 'opacity-50 cursor-default' : '',
                  )}
                >
                  {done ? (
                    <Check className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <span className={cn(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                      current ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                    )}>
                      {idx + 1}
                    </span>
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </div>
              )

              return (
                <div key={step.key} className="flex items-center">
                  {clickable ? (
                    <Link href={buildHref}>{pill}</Link>
                  ) : (
                    pill
                  )}
                  {idx < STEPS.length - 1 && (
                    <div className={cn(
                      'h-px w-4 mx-1 flex-shrink-0',
                      done ? 'bg-emerald-300' : 'bg-gray-200'
                    )} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
