'use client'

import AppShell from '@/components/layout/AppShell'
import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader2, RefreshCw, Zap, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const ADMIN_EMAILS = ['bob@convertcake.com', 'apps@convertcake.com']

interface IntegrationStatus {
  configured: boolean
  mock: boolean
  live: boolean
}

interface IntegrationStatuses {
  google_ads: IntegrationStatus
  anthropic: IntegrationStatus
  ga4: IntegrationStatus
  gtm: IntegrationStatus
  google_sheets: IntegrationStatus
  google_drive: IntegrationStatus
}

type Provider = keyof IntegrationStatuses

const integrationMeta: Array<{
  provider: Provider
  name: string
  logo: string
  logoColor: string
  description: string
  setupNote: string
}> = [
  {
    provider: 'google_ads',
    name: 'Google Ads',
    logo: 'GA',
    logoColor: 'bg-blue-500',
    description: 'Push campaigns, sync performance, ดึง keyword ideas, ปรับ budget/bid จากระบบ',
    setupNote: 'ตั้งค่า GOOGLE_ADS_* ใน .env.local',
  },
  {
    provider: 'anthropic',
    name: 'AI — Vertex Gemini',
    logo: 'AI',
    logoColor: 'bg-violet-500',
    description:
      'สร้าง Media Plan, Keyword Strategy, Blueprint, Morning Brief และ AI Media Buyer recommendations',
    setupNote: 'ตั้งค่า GCP Workload Identity/OIDC env · ปิด MOCK_AI=true',
  },
  {
    provider: 'ga4',
    name: 'Google Analytics 4',
    logo: 'G4',
    logoColor: 'bg-orange-500',
    description: 'Conversion Events, Audience, Landing Page Performance สำหรับ Remarketing',
    setupNote:
      'ตั้งค่า GA4_PROPERTY_ID + GA4_SERVICE_ACCOUNT_EMAIL + GA4_SERVICE_ACCOUNT_PRIVATE_KEY',
  },
  {
    provider: 'gtm',
    name: 'Google Tag Manager',
    logo: 'GTM',
    logoColor: 'bg-sky-500',
    description: 'ตรวจสอบ Conversion Tags, Remarketing Tags และ Tracking Readiness',
    setupNote: 'ตั้งค่า GTM_ACCOUNT_ID + GTM_CONTAINER_ID ใน .env.local',
  },
  {
    provider: 'google_sheets',
    name: 'Google Sheets',
    logo: 'GS',
    logoColor: 'bg-green-600',
    description: 'Export Media Plan และ Campaign Blueprint เป็น Google Sheets',
    setupNote: 'ตั้งค่า GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY',
  },
  {
    provider: 'google_drive',
    name: 'Google Drive',
    logo: 'GD',
    logoColor: 'bg-yellow-500',
    description: 'เก็บ asset ไฟล์ รูปภาพ และเอกสารที่เกี่ยวกับ campaign',
    setupNote: 'ตั้งค่า GOOGLE_DRIVE_FOLDER_ID + GOOGLE_DRIVE_ENABLED=true',
  },
]

export default function IntegrationsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [statuses, setStatuses] = useState<IntegrationStatuses | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<Partial<Record<Provider, boolean>>>({})
  const [testResult, setTestResult] = useState<Partial<Record<Provider, 'ok' | 'fail'>>>({})

  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email ?? '')

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!isAdmin) {
      router.replace('/dashboard')
      return
    }
  }, [sessionStatus, isAdmin, router])

  const fetchStatuses = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/integrations/status')
      const data = (await res.json()) as IntegrationStatuses
      setStatuses(data)
    } finally {
      setLoading(false)
    }
  }

  async function testConnection(provider: Provider) {
    setTesting((t) => ({ ...t, [provider]: true }))
    setTestResult((r) => ({ ...r, [provider]: undefined }))
    try {
      const res = await fetch('/api/integrations/status')
      const data = (await res.json()) as IntegrationStatuses
      setStatuses(data)
      setTestResult((r) => ({ ...r, [provider]: data[provider]?.live ? 'ok' : 'fail' }))
    } catch {
      setTestResult((r) => ({ ...r, [provider]: 'fail' }))
    } finally {
      setTesting((t) => ({ ...t, [provider]: false }))
      setTimeout(() => setTestResult((r) => ({ ...r, [provider]: undefined })), 3000)
    }
  }

  useEffect(() => {
    if (isAdmin) fetchStatuses()
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const connected = integrationMeta.filter((m) => statuses?.[m.provider]?.live).length
  const total = integrationMeta.length

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && !isAdmin)) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!isAdmin) return null

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Automation Integrations Settings</h1>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                ADMIN ONLY
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              เชื่อมต่อ API ทั้งหมด {loading ? '...' : `${connected}/${total} connected`}
            </p>
          </div>
          <button
            onClick={fetchStatuses}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Summary bar */}
        {!loading && statuses && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-gray-900">{connected} Connected</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {integrationMeta.map((m) => {
                const s = statuses[m.provider]
                return (
                  <span
                    key={m.provider}
                    className={cn(
                      'text-[10px] font-medium px-2 py-0.5 rounded-full',
                      s.live
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : s.mock
                          ? 'bg-amber-50 text-amber-700 border border-amber-100'
                          : 'bg-gray-50 text-gray-400 border border-gray-100'
                    )}
                  >
                    {m.name.split(' ')[0]}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Cards */}
        <div className="space-y-3">
          {integrationMeta.map((meta) => {
            const s = statuses?.[meta.provider]
            const isLive = s?.live ?? false
            const isMock = s?.mock ?? false
            const isConfigured = s?.configured ?? false

            return (
              <div
                key={meta.provider}
                className={cn(
                  'bg-white rounded-xl border p-4 transition-colors',
                  isLive ? 'border-emerald-200' : isMock ? 'border-amber-200' : 'border-gray-200'
                )}
              >
                <div className="flex items-center gap-4">
                  {/* Logo */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                      meta.logoColor
                    )}
                  >
                    {meta.logo}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{meta.name}</span>

                        {loading ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-300 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Checking...
                          </span>
                        ) : isLive ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                            <CheckCircle className="w-3 h-3" /> Connected
                          </span>
                        ) : isMock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                            Mock Mode
                          </span>
                        ) : isConfigured ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                            Configured
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
                            <XCircle className="w-3 h-3" /> Not configured
                          </span>
                        )}
                      </div>

                      {/* Test Connection button */}
                      {isConfigured && !loading && (
                        <button
                          onClick={() => testConnection(meta.provider)}
                          disabled={!!testing[meta.provider]}
                          className={cn(
                            'flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-60',
                            testResult[meta.provider] === 'ok'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : testResult[meta.provider] === 'fail'
                                ? 'bg-red-50 text-red-600 border-red-200'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                          )}
                        >
                          {testing[meta.provider] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : testResult[meta.provider] === 'ok' ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : testResult[meta.provider] === 'fail' ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <Wifi className="w-3 h-3" />
                          )}
                          {testing[meta.provider]
                            ? 'Testing...'
                            : testResult[meta.provider] === 'ok'
                              ? 'Connected!'
                              : testResult[meta.provider] === 'fail'
                                ? 'Failed'
                                : 'Test Connection'}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{meta.description}</p>
                    {!isConfigured && !loading && (
                      <p className="text-[11px] text-gray-400 mt-1 italic">{meta.setupNote}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* How to apply */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">How to apply credentials</p>
          <p>
            Edit{' '}
            <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">.env.local</code>{' '}
            at the project root. All env vars are pre-defined with empty values — just fill them in
            and restart the dev server.
          </p>
        </div>
      </div>
    </AppShell>
  )
}
