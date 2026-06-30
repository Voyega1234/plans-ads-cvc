'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  configured: boolean
  mock: boolean
}

interface IntegrationsStatus {
  google_oauth?: ServiceStatus
  google_ads?: ServiceStatus
  anthropic?: ServiceStatus
  ga4?: ServiceStatus
  gtm?: ServiceStatus
  google_sheets?: ServiceStatus
  google_drive?: ServiceStatus
}

// ─── Service definitions ───────────────────────────────────────────────────────

interface ServiceDef {
  key: keyof IntegrationsStatus
  name: string
  icon: string
  envVars: string[]
  setupSteps: string[]
}

const SERVICES: ServiceDef[] = [
  {
    key: 'google_oauth',
    name: 'Google OAuth (User Login)',
    icon: 'G',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    setupSteps: [
      'Go to https://console.cloud.google.com → APIs & Services → Credentials',
      'Create an OAuth 2.0 Client ID (Web Application)',
      'Add http://localhost:3010/api/auth/callback/google to Authorized Redirect URIs',
      'Copy Client ID and Client Secret into .env.local',
    ],
  },
  {
    key: 'google_ads',
    name: 'Google Ads API',
    icon: 'A',
    envVars: [
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_ADS_REFRESH_TOKEN',
      'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
      'GOOGLE_ADS_CUSTOMER_ID',
      'COMPANY_MCC_CUSTOMER_ID',
      'MOCK_GOOGLE_ADS',
    ],
    setupSteps: [
      'Apply for a Google Ads Developer Token in your MCC account',
      'Create OAuth2 credentials in Google Cloud Console with ads scope',
      'Use OAuth Playground to generate a refresh token for scope https://www.googleapis.com/auth/adwords',
      'Set MOCK_GOOGLE_ADS=false once all credentials are filled',
    ],
  },
  {
    key: 'anthropic',
    name: 'AI — Vertex Gemini',
    icon: '🤖',
    envVars: [
      'GCP_PROJECT_ID',
      'GCP_PROJECT_NUMBER',
      'GCP_SERVICE_ACCOUNT_EMAIL',
      'GCP_WORKLOAD_IDENTITY_POOL_ID',
      'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
      'AI_MODEL_QUALITY',
      'AI_MODEL_STANDARD',
      'MOCK_AI',
    ],
    setupSteps: [
      'Create a Google Cloud Workload Identity Pool provider that trusts Vercel OIDC',
      'Grant the provider permission to impersonate the Vertex service account',
      'AI_MODEL_QUALITY และ AI_MODEL_STANDARD ตั้งเป็น gemini-3.5-flash',
      'Set MOCK_AI=false to use real AI',
    ],
  },
  {
    key: 'ga4',
    name: 'Google Analytics 4',
    icon: '📊',
    envVars: ['GA4_PROPERTY_ID', 'GA4_SERVICE_ACCOUNT_EMAIL', 'GA4_SERVICE_ACCOUNT_PRIVATE_KEY'],
    setupSteps: [
      'In Google Cloud Console, create a Service Account and download JSON key',
      'In GA4 Admin → Property Access Management, add the service account email with Viewer role',
      'Copy GA4_PROPERTY_ID from Admin → Property Details',
      'Set GA4_SERVICE_ACCOUNT_EMAIL and GA4_SERVICE_ACCOUNT_PRIVATE_KEY from the JSON key',
    ],
  },
  {
    key: 'gtm',
    name: 'Google Tag Manager',
    icon: '🏷',
    envVars: [
      'GTM_ACCOUNT_ID',
      'GTM_CONTAINER_ID',
      'GTM_SERVICE_ACCOUNT_EMAIL',
      'GTM_SERVICE_ACCOUNT_PRIVATE_KEY',
    ],
    setupSteps: [
      'In Google Cloud Console, create a Service Account with Tag Manager API access',
      'In GTM Admin → Container → User Management, add the service account with Edit permission',
      'Copy GTM_ACCOUNT_ID and GTM_CONTAINER_ID from the GTM workspace URL',
      'Set GTM_SERVICE_ACCOUNT_EMAIL and GTM_SERVICE_ACCOUNT_PRIVATE_KEY from the JSON key',
    ],
  },
  {
    key: 'google_sheets',
    name: 'Google Sheets',
    icon: '📄',
    envVars: ['GOOGLE_SHEETS_ENABLED', 'GOOGLE_SHEETS_CLIENT_EMAIL', 'GOOGLE_SHEETS_PRIVATE_KEY'],
    setupSteps: [
      'In Google Cloud Console, create a Service Account and enable the Google Sheets API',
      'Download the JSON key and copy client_email → GOOGLE_SHEETS_CLIENT_EMAIL',
      'Copy private_key → GOOGLE_SHEETS_PRIVATE_KEY (keep \\n line breaks)',
      'Set GOOGLE_SHEETS_ENABLED=true',
    ],
  },
  {
    key: 'google_drive',
    name: 'Google Drive',
    icon: '💾',
    envVars: ['GOOGLE_DRIVE_ENABLED', 'GOOGLE_SHEETS_CLIENT_EMAIL', 'GOOGLE_DRIVE_FOLDER_ID'],
    setupSteps: [
      'Enable the Google Drive API on the same Service Account used for Sheets',
      'Share the target Drive folder with the service account email',
      'Copy the folder ID from the Drive URL → GOOGLE_DRIVE_FOLDER_ID',
      'Set GOOGLE_DRIVE_ENABLED=true',
    ],
  },
]

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ServiceStatus | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <AlertCircle className="w-3.5 h-3.5" />
        Unknown
      </span>
    )
  }
  if (status.configured) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <CheckCircle className="w-3.5 h-3.5" />
        Connected
      </span>
    )
  }
  if (status.mock) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
        <AlertCircle className="w-3.5 h-3.5" />
        Mock
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <XCircle className="w-3.5 h-3.5" />
      Not configured
    </span>
  )
}

// ─── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  status,
}: {
  service: ServiceDef
  status: ServiceStatus | undefined
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-700">
            {service.icon}
          </div>
          <div>
            <p className="font-medium text-gray-900 text-sm">{service.name}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{service.envVars[0]}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Toggle setup instructions"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
          {/* Env var names to copy */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Required env vars
            </p>
            <div className="flex flex-wrap gap-2">
              {service.envVars.map((v) => (
                <span
                  key={v}
                  className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-700"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          {/* Setup steps */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Setup steps
            </p>
            <ol className="space-y-1.5">
              {service.setupSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<IntegrationsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [productionLocked, setProductionLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('production_push_enabled') !== '1'
  })

  function toggleProductionLock() {
    const newVal = !productionLocked
    setProductionLocked(newVal)
    localStorage.setItem('production_push_enabled', newVal ? '0' : '1')
  }

  useEffect(() => {
    fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((data: IntegrationsStatus) => {
        setIntegrations(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const configuredCount = integrations
    ? SERVICES.filter((s) => integrations[s.key]?.configured).length
    : 0

  const totalCount = SERVICES.length

  const readinessPercent = Math.round((configuredCount / totalCount) * 100)

  const readinessColor =
    readinessPercent >= 80
      ? 'bg-green-500'
      : readinessPercent >= 40
        ? 'bg-yellow-500'
        : 'bg-red-500'

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings &amp; Production Readiness</h1>
        <p className="text-gray-500 mt-1">
          Configure your API integrations and verify production setup
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Production Push Lock */}
        <div
          className={`rounded-xl border p-5 ${productionLocked ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {productionLocked ? (
                <Lock className="w-6 h-6 text-red-600" />
              ) : (
                <Unlock className="w-6 h-6 text-emerald-600" />
              )}
              <div>
                <h2
                  className={`font-semibold ${productionLocked ? 'text-red-900' : 'text-emerald-900'}`}
                >
                  Production Push: {productionLocked ? 'LOCKED 🔒' : 'ENABLED ✅'}
                </h2>
                <p
                  className={`text-xs mt-0.5 ${productionLocked ? 'text-red-700' : 'text-emerald-700'}`}
                >
                  {productionLocked
                    ? 'Push campaign จริงถูก lock อยู่ — เปิดใช้เมื่อพร้อม push จริงเท่านั้น'
                    : 'Push campaign จริงถูก enable — ระวัง ระบบจะ push ขึ้น Google Ads จริงได้'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleProductionLock}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                productionLocked
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {productionLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {productionLocked ? 'Enable Production' : 'Lock Production'}
            </button>
          </div>
          {!productionLocked && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Production mode เปิดอยู่ — Campaign Builder และ Tracking Setup สามารถ push ขึ้น
                Google Ads จริงได้ ตรวจสอบ tracking, conversion actions, และ budget ก่อนทุกครั้ง
              </p>
            </div>
          )}
        </div>

        {/* Readiness score */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            <h2 className="font-semibold text-gray-900">Production Readiness</h2>
          </div>

          {loading ? (
            <div className="h-8 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <div className="flex items-end justify-between mb-2">
                <p className="text-3xl font-bold text-gray-900">
                  {configuredCount}
                  <span className="text-lg font-normal text-gray-400"> / {totalCount}</span>
                </p>
                <p className="text-sm text-gray-500">{readinessPercent}% ready</p>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${readinessColor}`}
                  style={{ width: `${readinessPercent}%` }}
                />
              </div>
              {readinessPercent < 100 && (
                <p className="text-sm text-gray-500 mt-3">
                  {totalCount - configuredCount} service(s) still need configuration. Expand each
                  card below for step-by-step setup instructions.
                </p>
              )}
              {readinessPercent === 100 && (
                <p className="text-sm text-green-600 mt-3 font-medium">
                  All services are configured. Ready for production.
                </p>
              )}
            </>
          )}
        </div>

        {/* Per-service cards */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide px-1">
            Service Integrations
          </h2>
          {SERVICES.map((service) => (
            <ServiceCard
              key={service.key}
              service={service}
              status={integrations ? integrations[service.key] : undefined}
            />
          ))}
        </div>

        {/* Env file note */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
          <p className="font-semibold mb-1">How to apply credentials</p>
          <p>
            Edit <code className="bg-blue-100 px-1 rounded font-mono">.env.local</code> at the
            project root. All env vars are pre-defined with empty values — just fill them in and
            restart the dev server. Mock mode stays active as long as the corresponding env vars are
            empty or the MOCK_ flags are set to{' '}
            <code className="bg-blue-100 px-1 rounded font-mono">true</code>.
          </p>
        </div>
      </div>
    </AppShell>
  )
}
