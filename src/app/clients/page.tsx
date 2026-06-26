'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import {
  Users, RefreshCw, ExternalLink, Brain,
  TrendingUp, AlertCircle, CheckCircle2, Wifi, WifiOff,
} from 'lucide-react'

interface AccountSummary {
  spend: number
  campaigns: number
  currency: string
}

interface GoogleAdsAccount {
  id: string
  resourceName: string
  descriptiveName: string
  currencyCode: string
  timeZone: string
  testAccount: boolean
  summary: AccountSummary | null
}

interface ClientsResponse {
  accounts: GoogleAdsAccount[]
  userEmail: string | null
  source: 'google_ads_api' | 'mock'
}

export default function ClientsPage() {
  const [data,    setData]    = useState<ClientsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/clients')
      if (!res.ok) {
        const j = await res.json() as { error: string }
        throw new Error(j.error)
      }
      setData(await res.json() as ClientsResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const isReal = data?.source === 'google_ads_api'

  return (
    <AppShell>
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            My Clients
          </h1>
          {data?.userEmail && (
            <p className="text-sm text-gray-400 mt-0.5">
              Google Ads accounts ที่เข้าถึงได้จาก{' '}
              <span className="font-medium text-gray-600">{data.userEmail}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Live / Mock badge */}
          {data && (
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
              isReal
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            }`}>
              {isReal
                ? <><Wifi className="w-3 h-3" /> Live API</>
                : <><WifiOff className="w-3 h-3" /> Mock data</>
              }
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Not connected warning */}
      {data && !isReal && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm">
          <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">แสดง Mock data อยู่</p>
            <p className="text-yellow-700 mt-0.5">
              ตั้งค่า <code className="bg-yellow-100 px-1 rounded">GOOGLE_ADS_DEVELOPER_TOKEN</code> และ{' '}
              <code className="bg-yellow-100 px-1 rounded">MOCK_GOOGLE_ADS=false</code> ใน .env.local
              แล้ว login ใหม่เพื่อดึงข้อมูลจริง
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Accounts list */}
      {!loading && data && data.accounts.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">ไม่พบ Google Ads accounts</p>
          <p className="text-gray-400 text-xs mt-1">บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าถึง Google Ads account ใดๆ</p>
        </div>
      )}

      {!loading && data && data.accounts.length > 0 && (
        <div className="grid gap-3">
          {data.accounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: account info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold text-sm">
                      {acc.descriptiveName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-gray-900 text-sm truncate">
                        {acc.descriptiveName}
                      </h2>
                      {acc.testAccount && (
                        <span className="text-[10px] font-medium bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                          Test
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 font-mono">
                        {acc.id}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {acc.timeZone} · {acc.currencyCode}
                    </p>
                  </div>
                </div>

                {/* Right: stats + actions */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  {/* 30-day spend */}
                  {acc.summary && (
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-gray-400">30-day spend</p>
                      <p className="text-sm font-semibold text-gray-900">
                        ฿{acc.summary.spend.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400">
                        {acc.summary.campaigns} campaigns
                      </p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1.5">
                    <Link
                      href={`/clients/${acc.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                    >
                      <TrendingUp className="w-3 h-3" />
                      ดูรายงาน
                    </Link>
                    <Link
                      href={`/automation/run?customerId=${acc.id}&clientName=${encodeURIComponent(acc.descriptiveName)}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium"
                    >
                      <TrendingUp className="w-3 h-3" />
                      Run Campaign
                    </Link>
                    <Link
                      href={`/clients/${acc.id}/memory`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium"
                    >
                      <Brain className="w-3 h-3" />
                      Client Memory
                    </Link>
                  </div>
                </div>
              </div>

              {/* Connected indicator */}
              {isReal && (
                <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected via Google Ads API
                  <a
                    href={`https://ads.google.com/aw/overview?ocid=${acc.id.replace(/-/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-gray-400 hover:text-gray-600"
                  >
                    Open in Google Ads <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </AppShell>
  )
}
