'use client'

import { Bell, ChevronRight } from 'lucide-react'
import { usePathname } from 'next/navigation'

const breadcrumbMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/media-plans': 'Media Plans',
  '/brief': 'Brief',
  '/brief/new': 'New Brief',
  '/keyword-planner': 'Keyword Planner',
  '/campaign-builder': 'Campaign Builder',
  '/review': 'QA Review',
  '/push-log': 'Push Log',
  '/automation': 'Automation Center',
  '/reports': 'Reports',
  '/integrations': 'Integrations',
  '/settings': 'Settings',
}

export default function Topbar() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const breadcrumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/')
    return {
      label: breadcrumbMap[href] || seg.charAt(0).toUpperCase() + seg.slice(1),
      href,
    }
  })

  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-white border-b border-gray-100 flex items-center px-6 gap-4 z-40">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 flex-1 min-w-0">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
            <span
              className={
                i === breadcrumbs.length - 1
                  ? 'text-gray-800 font-semibold text-sm'
                  : 'text-gray-400 text-sm'
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Notification */}
      <button className="relative p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
        <Bell className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
      </button>

      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold cursor-pointer">
        A
      </div>
    </header>
  )
}
