'use client'

import Link from 'next/link'
import { Search, Zap, Activity, ShoppingBag, BarChart2, ChevronRight, Ban } from 'lucide-react'

const tools = [
  {
    href: '/keyword-planner',
    icon: Search,
    label: 'Keyword Planner',
    desc: 'ค้นหา keyword ที่เหมาะสม วิเคราะห์ search volume และ competition',
    color: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  {
    href: '/campaign-editor',
    icon: Zap,
    label: 'Campaign Adjustment',
    desc: 'แก้ไขแคมเปญ ปรับ budget, bid, status ได้ทุก campaign type',
    color: 'bg-yellow-50 text-yellow-600 border-yellow-100',
  },
  {
    href: '/tracking-setup',
    icon: Activity,
    label: 'Tracking Setup',
    desc: 'ตั้งค่า Conversion Tracking, GTM, Enhanced Conversions',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  {
    href: '/negative-keywords',
    icon: Ban,
    label: 'Negative Keywords',
    desc: 'ดึง search terms ของแต่ละแคมเปญ คัดคำที่เปลืองงบ แล้วอัพเดตเป็น negative keyword',
    color: 'bg-red-50 text-red-600 border-red-100',
  },
  {
    href: '/shopping-products',
    icon: ShoppingBag,
    label: 'Shopping Products',
    desc: 'จัดการ product listing, product groups และ Shopping feed',
    color: 'bg-purple-50 text-purple-600 border-purple-100',
  },
  {
    href: '/reports',
    icon: BarChart2,
    label: 'Reports',
    desc: 'ดู performance report, export ข้อมูล และ custom dashboard',
    color: 'bg-rose-50 text-rose-600 border-rose-100',
  },
]

export default function ToolsPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
        <p className="text-sm text-gray-500 mt-1">เครื่องมือช่วยจัดการ Google Ads ทุกด้าน</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-2xl hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${tool.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{tool.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tool.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5 transition-colors" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
