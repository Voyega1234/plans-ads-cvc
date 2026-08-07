'use client'

// Left sidebar scoped to ONE Line Tracking project. Staff see everything including
// the Settings sub-pages; client viewers see only Overview / Leads / Funnel (never
// Settings, which holds platform credentials).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { BarChart3, Users, Filter, Settings, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react'

export default function ProjectSidebar({
  projectId,
  projectName,
  isClient,
}: {
  projectId: string
  projectName: string
  isClient: boolean
}) {
  const pathname = usePathname()
  const base = `/line-tracking/projects/${projectId}`
  const [settingsOpen, setSettingsOpen] = useState(true)

  const main = [
    { href: base, label: 'ภาพรวม (Overview)', icon: BarChart3 },
    { href: `${base}/leads`, label: 'Leads CRM', icon: Users },
    { href: `${base}/funnel`, label: 'Marketing Funnel', icon: Filter },
  ]
  const settingsSub = [
    { href: `${base}/setup`, label: 'ตั้งค่า / เชื่อมต่อ' },
    { href: `${base}/tracking-links`, label: 'Tracking Links' },
    { href: `${base}/conversions`, label: 'Conversions' },
    { href: `${base}/sheet`, label: 'Google Sheet' },
    // สองอันนี้เคยหายาก (ซ่อนอยู่หลัง Setup Wizard) — ย้ายมาอยู่กับเพื่อนในเมนูนี้
    { href: `${base}/settings/conversion-mapping`, label: 'Conversion Mapping' },
    { href: `${base}/settings/client-login`, label: 'Client Login' },
  ]

  const linkCls = (active: boolean) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
      active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50'
    }`

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
      {/* Back to all projects — staff only (clients are locked to one project) */}
      {!isClient && (
        <Link
          href="/line-tracking/projects"
          className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> โปรเจกต์ทั้งหมด
        </Link>
      )}
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {projectName}
        </div>
      </div>
      <nav className="space-y-1 p-2">
        {main.map((m) => {
          const active = pathname === m.href
          return (
            <Link key={m.href} href={m.href} className={linkCls(active)}>
              <m.icon className="h-4 w-4 shrink-0" />
              {m.label}
            </Link>
          )
        })}

        {/* Settings — staff only */}
        {!isClient && (
          <div className="pt-1">
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              {settingsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {settingsOpen && (
              <div className="ml-4 space-y-0.5 border-l border-slate-100 pl-2">
                {settingsSub.map((s) => {
                  const active = pathname === s.href
                  return (
                    <Link key={s.href} href={s.href} className={linkCls(active) + ' text-[13px]'}>
                      {s.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  )
}
