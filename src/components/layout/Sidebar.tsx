'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useSession, signOut, signIn } from 'next-auth/react'
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
  ShoppingBag,
  LogOut,
  LogIn,
  Activity,
  History,
  ChevronDown,
  ChevronRight,
  Rocket,
  ClipboardList,
  Wrench,
  PlusCircle,
  Wand2,
  FileClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientAccount {
  id: string
  name?: string
  descriptiveName?: string
}

const ADMIN_EMAILS = ['bob@convertcake.com', 'apps@convertcake.com']

// Module-level cache — persists for the lifetime of the browser session (page
// reload clears it). Avoids re-fetching /api/clients on every page navigation.
let cachedAccounts: ClientAccount[] | null = null

const mainNav = [
  { href: '/morning-brief',      label: 'Morning Brief',     icon: Sun },
  { href: '/dashboard',          label: 'Campaign Monitor',  icon: Home },
  { href: '/clients',            label: 'My Clients',        icon: Users },
  { href: '/launch-today',       label: 'Launch Today',      icon: Rocket },
]

const mediaPlansNav = [
  { href: '/media-plans/plan',      label: 'New Plan',            icon: PlusCircle },
  { href: '/media-plans',           label: 'All Plans',           icon: FileText },
  { href: '/campaign-generator',    label: 'Campaign Generator',  icon: Wand2 },
]

const toolsNav = [
  { href: '/keyword-planner',    label: 'Keyword Planner',   icon: Search },
  { href: '/campaign-editor',    label: 'Campaign Adjustment', icon: Zap },
  { href: '/tracking-setup',     label: 'Tracking Setup',    icon: Activity },
  { href: '/shopping-products',  label: 'Shopping Products', icon: ShoppingBag },
  { href: '/reports',            label: 'Reports',           icon: BarChart2 },
  { href: '/optimization-log',   label: 'Optimization Log',  icon: FileClock },
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
  const [clientsOpen, setClientsOpen] = useState(pathname.startsWith('/clients'))
  const [clients, setClients] = useState<ClientAccount[]>([])
  const toolsPaths = toolsNav.map(t => t.href)
  const [toolsOpen, setToolsOpen] = useState(toolsPaths.some(p => pathname.startsWith(p)) || pathname === '/tools')
  const [mediaPlansOpen, setMediaPlansOpen] = useState(pathname === '/media-plans' || pathname.startsWith('/media-plans/') || pathname.startsWith('/campaign-generator'))

  useEffect(() => {
    if (cachedAccounts) {
      setClients(cachedAccounts)
      return
    }
    fetch('/api/clients')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.accounts) {
          const accounts = d.accounts.slice(0, 10) as ClientAccount[]
          cachedAccounts = accounts
          setClients(accounts)
        }
      })
      .catch(() => {})
  }, [])

  // The Campaign Generator lives at /media-plans/[id]/build — treat it as the
  // "Campaign Generator" nav item, not "All Plans", so the sidebar isn't misleading.
  const isCampaignGenerator = (p: string) =>
    p.startsWith('/campaign-generator') || /^\/media-plans\/[^/]+\/build/.test(p)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/campaign-generator') return isCampaignGenerator(pathname)
    if (href === '/media-plans') return !isCampaignGenerator(pathname) && (pathname === '/media-plans' || (pathname.startsWith('/media-plans/') && !pathname.startsWith('/media-plans/plan')))
    if (href === '/media-plans/plan') return pathname.startsWith('/media-plans/plan')
    if (href === '/tools') return pathname === '/tools'
    return pathname.startsWith(href)
  }
  const isToolsActive = toolsPaths.some(p => pathname.startsWith(p)) || pathname === '/tools'

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
          {mainNav.map((item) => {
            if (item.href === '/clients') {
              const active = isActive('/clients')
              return (
                <div key="/clients">
                  {/* Clients dropdown header */}
                  <button
                    onClick={() => setClientsOpen(o => !o)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors',
                      active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    )}
                  >
                    <Users className={cn('w-4 h-4 flex-shrink-0', active ? 'text-gray-700' : 'text-gray-400')} />
                    <span className={cn('text-sm flex-1 text-left', active ? 'font-semibold text-gray-900' : 'font-medium')}>
                      My Clients
                    </span>
                    {clients.length > 0 && (
                      <span className="text-[10px] bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">{clients.length}</span>
                    )}
                    {clientsOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                  </button>
                  {/* Client list */}
                  {clientsOpen && (
                    <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                      {clients.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-gray-300">Loading...</p>
                      ) : (
                        clients.map(c => {
                          const label = c.descriptiveName || c.name || c.id
                          const href = `/clients/${c.id}`
                          const clientActive = pathname.startsWith(href)
                          return (
                            <Link
                              key={c.id}
                              href={href}
                              className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                                clientActive
                                  ? 'bg-gray-100 text-gray-900 font-semibold'
                                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                              )}
                            >
                              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', clientActive ? 'bg-blue-500' : 'bg-gray-300')} />
                              <span className="truncate">{label}</span>
                            </Link>
                          )
                        })
                      )}
                      <Link
                        href="/clients"
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
                        ดูทั้งหมด →
                      </Link>
                    </div>
                  )}
                </div>
              )
            }
            return (
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
            )
          })}

          {/* Media Plans dropdown */}
          <div>
            <div className={cn(
              'flex items-center rounded-lg transition-colors',
              (pathname === '/media-plans' || pathname.startsWith('/media-plans/') || pathname.startsWith('/campaign-generator')) ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            )}>
              <button
                onClick={() => setMediaPlansOpen(o => !o)}
                className="flex-1 flex items-center gap-2.5 px-3 py-2"
              >
                <ClipboardList className={cn('w-4 h-4 flex-shrink-0', (pathname === '/media-plans' || pathname.startsWith('/media-plans/') || pathname.startsWith('/campaign-generator')) ? 'text-gray-700' : 'text-gray-400')} />
                <span className={cn('text-sm flex-1 text-left', (pathname === '/media-plans' || pathname.startsWith('/media-plans/') || pathname.startsWith('/campaign-generator')) ? 'font-semibold text-gray-900' : 'font-medium')}>
                  Media Plans
                </span>
              </button>
              <button onClick={() => setMediaPlansOpen(o => !o)} className="pr-3 py-2">
                {mediaPlansOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
              </button>
            </div>
            {mediaPlansOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                {mediaPlansNav.map(t => {
                  const active = isActive(t.href)
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                        active ? 'bg-gray-100 text-gray-900 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                      )}
                    >
                      <t.icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-gray-700' : 'text-gray-400')} />
                      <span className="truncate">{t.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tools dropdown */}
          <div>
            <div className={cn(
              'flex items-center rounded-lg transition-colors',
              isToolsActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            )}>
              <Link href="/tools" className="flex-1 flex items-center gap-2.5 px-3 py-2">
                <Wrench className={cn('w-4 h-4 flex-shrink-0', isToolsActive ? 'text-gray-700' : 'text-gray-400')} />
                <span className={cn('text-sm flex-1 text-left', isToolsActive ? 'font-semibold text-gray-900' : 'font-medium')}>
                  Tools
                </span>
              </Link>
              <button onClick={() => setToolsOpen(o => !o)} className="pr-3 py-2">
                {toolsOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
              </button>
            </div>
            {toolsOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                {toolsNav.map(t => {
                  const active = isActive(t.href)
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                        active ? 'bg-gray-100 text-gray-900 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                      )}
                    >
                      <t.icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-gray-700' : 'text-gray-400')} />
                      <span className="truncate">{t.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
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
          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            title="เข้าสู่ระบบด้วย Google"
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
              <LogIn className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-gray-800 truncate">เข้าสู่ระบบ</p>
              <p className="text-xs text-gray-400 truncate">Login ด้วย Google</p>
            </div>
          </button>
        )}
      </div>
    </aside>
  )
}
