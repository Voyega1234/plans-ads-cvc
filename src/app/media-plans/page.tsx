'use client'

import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import MediaPlanCard from '@/components/media-plan/MediaPlanCard'
import Link from 'next/link'
import { Plus, Loader } from 'lucide-react'

interface Plan {
  id: string
  title: string
  objective: string
  monthlyBudget: number
  currency: string
  status: string
  createdAt: string
  campaignCount: number
}

export default function MediaPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const loadPlans = () => {
    setLoading(true)
    fetch('/api/media-plans')
      .then(r => r.json())
      .then(d => {
        // API returns array directly or { plans: [] }
        const arr = Array.isArray(d) ? d : (d.plans ?? [])
        setPlans(arr.map((p: Plan & { blueprints?: unknown[] }) => ({
          ...p,
          campaignCount: p.campaignCount ?? (Array.isArray(p.blueprints) ? p.blueprints.length : 0),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadPlans() }, [])

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Plans</h1>
          <p className="text-gray-500 mt-1">แผนการตลาดทั้งหมดของคุณ</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/brief/new?mode=media-plan"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Media Plan
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader className="w-6 h-6 animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">ยังไม่มี Media Plan</h3>
          <p className="text-gray-500 mb-6">เริ่มต้นด้วยการสร้าง Brief แล้วระบบจะสร้าง Media Plan ให้</p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/brief/new?mode=media-plan"
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              สร้าง Media Plan แรก
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <MediaPlanCard
              key={plan.id}
              id={plan.id}
              title={plan.title}
              objective={plan.objective}
              monthlyBudget={plan.monthlyBudget}
              currency={plan.currency}
              status={plan.status}
              createdAt={new Date(plan.createdAt)}
              campaignCount={plan.campaignCount}
              onDeleted={(deletedId) => setPlans(prev => prev.filter(p => p.id !== deletedId))}
            />
          ))}
        </div>
      )}
    </AppShell>
  )
}
