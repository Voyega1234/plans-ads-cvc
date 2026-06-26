'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import {
  Home,
  FileText,
  Search,
  Zap,
  BarChart2,
  Bot,
  Plug,
  Settings,
  Sun,
  Users,
  LayoutTemplate,
  ShoppingBag,
  LogOut,
  Activity,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ADMIN_EMAILS = ['bob@convertcake.com', 'apps@convertcake.com']

const mainNav = [
  { href: '/morning-brief',     label: 'Morning Brief',     icon: Sun },
  { href: '/dashboard',         label: 'Dashboard',         icon: Home },
  { href: '/clients',           label: 'My Clients',        icon: Users },
  { href: '/media-plans',       label: 'Media Plan',        icon: FileText },
  { href: '/keyword-planner',   label: 'Keyword Planner',   icon: Search },
  { href: '/campaign-builder',  label: 'Campaign Builder',  icon: Zap },
  { href: '/tracking-setup',    label: 'Tracking Setup',    icon: Activity },
  { href: '/shopping-products', label: 'Shopping Products', icon: ShoppingBag },
  { href: '/reports',           label: 'Reports',           icon: BarChart2 },
  { href: '/templates',         label: 'Templates',         icon: LayoutTemplate },
]

const systemNav = [
  { href: '/automation', label: 'Automation', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const adminNav = [
  { href: '/push-logs',    label: 'Push Log',    icon: History },
  { href: '/integrations', label: 'Integrations', icon: Plug },
]

function MercyLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <Image src="/mercy-logo.png" alt="Mercy" width={32} height={32} className="object-contain" />
      <span className="text-xl font-bold text-gray-900 tracking-tight select-none">Mercy</span>
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email ?? '')

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 flex flex-col bg-white border-r border-gray-100 z-50">
      {/* Logo */}
      <div className="flex items-center px-4 py-4 border-b border-gray-100">
        <MercyLogo />
      </div>


      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin">
        {/* Main */}
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors',
                isActive(item.href)
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              )}
            >
              <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive(item.href) ? 'text-gray-700' : 'text-gray-400')} />
              <span className={cn('text-sm', isActive(item.href) ? 'font-semibold text-gray-900' : 'font-medium')}>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* System */}
        <div className="pt-2 space-y-0.5">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-300">
            System
          </p>
          {systemNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              )}
            >
              <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive(item.href) ? 'text-gray-700' : 'text-gray-400')} />
              {item.label}
            </Link>
          ))}

          {/* Admin-only items — visible to bob@convertcake.com only */}
          {isAdmin && adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-red-50 text-red-700 font-medium'
                  : 'text-red-400 hover:bg-red-50 hover:text-red-600'
              )}
            >
              <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive(item.href) ? 'text-red-600' : 'text-red-300')} />
              {item.label}
              <span className="ml-auto text-[9px] font-bold bg-red-100 text-red-600 px-1 rounded">ADMIN</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* User Footer */}
      <div className="border-t border-gray-100 px-3 py-3">
        {status === 'loading' ? (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
              <div className="h-2.5 bg-gray-200 rounded animate-pulse w-32" />
            </div>
          </div>
        ) : session ? (
          <div className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
            {session.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name ?? 'User'}
                className="w-7 h-7 rounded-full flex-shrink-0 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {session.user?.name?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{session.user?.name ?? 'User'}</p>
              <p className="text-xs text-gray-400 truncate">{session.user?.email ?? ''}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              title="ออกจากระบบ"
              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold flex-shrink-0">
              ?
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">Guest</p>
              <p className="text-xs text-gray-400 truncate">ไม่ได้ login</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
