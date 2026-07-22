import Link from "next/link";
import {
  getAgencyDashboardStats,
  getAgencyLeadsByProject,
  getAgencyStatusDistribution,
} from "@/lib/line-tracking/services/projectService";
import { KpiCard } from "@/components/line-tracking/ui";
import { GroupedBar, DonutChart, ChartLegend } from "@/components/line-tracking/Charts";
import { LEAD_STATUS_LABEL } from "@/lib/line-tracking/enums";

export const dynamic = "force-dynamic";

// ภาพรวมทุกโปรเจกต์ (dashboard เหมือน Linli) — ทุกคนที่ล้อกอินเห็นเหมือนกัน
export default async function LineTrackingDashboard() {
  const [stats, leadsByProject, statusDist] = await Promise.all([
    getAgencyDashboardStats(),
    getAgencyLeadsByProject(),
    getAgencyStatusDistribution(),
  ]);

  const donutData = statusDist.map((s) => ({
    name: (LEAD_STATUS_LABEL as Record<string, string>)[s.status] ?? s.status,
    value: s.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Line Tracking</h1>
          <p className="text-sm text-slate-500">
            ภาพรวมทุกโปรเจกต์ — Ads → เว็บไซต์ → LINE Lead → Conversion (ทีมทุกคนเห็นเหมือนกัน)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/line-tracking/guide" className="btn-ghost">คู่มือติดตั้ง</Link>
          <Link href="/line-tracking/projects" className="btn-primary">ดูโปรเจกต์ทั้งหมด →</Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="โปรเจกต์ทั้งหมด" value={stats.totalProjects} icon="📁" accent="bg-blue-100" hint={`LIVE ${stats.activeProjects}`} />
        <KpiCard label="Leads ทั้งหมด" value={stats.totalLeads} icon="👥" accent="bg-indigo-100" hint={`Qualified ${stats.qualifiedLeads}`} />
        <KpiCard label="ปิดการขาย" value={stats.purchases} icon="💰" accent="bg-emerald-100" hint="Won / Paid" />
        <KpiCard
          label="Conversion ส่งแล้ว"
          value={stats.conversionSent}
          icon="🚀"
          accent="bg-line-500/20"
          hint={stats.conversionFailed > 0 ? `ล้มเหลว ${stats.conversionFailed}` : "ไม่มีที่ล้มเหลว"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Leads / purchases per project */}
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Leads &amp; ปิดการขาย ต่อโปรเจกต์</h2>
          {leadsByProject.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>
          ) : (
            <GroupedBar data={leadsByProject} />
          )}
        </div>

        {/* Status distribution donut */}
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">สถานะ Lead รวมทุกโปรเจกต์</h2>
          <DonutChart data={donutData} centerValue={String(stats.totalLeads)} centerLabel="Leads" />
          <ChartLegend data={donutData} />
        </div>
      </div>
    </div>
  );
}
