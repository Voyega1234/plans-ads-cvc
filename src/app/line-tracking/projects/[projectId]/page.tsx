import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getProjectStats,
  setupProgress,
  connectionStatusMap,
  getChannelBreakdown,
  getStatusDistribution,
  getFunnel,
  getLineLifecycle,
  getPeriodComparison,
} from "@/lib/line-tracking/services/projectService";
import { setProjectStatusAction } from "@/lib/line-tracking/actions";
import { getAuthSession } from "@/lib/session";
import { SectionCard, StatusBadge, Progress, EmptyRow, KpiCard } from "@/components/line-tracking/ui";
import { DonutChart, ChartLegend, GroupedBar } from "@/components/line-tracking/Charts";
import { CopyButton } from "@/components/line-tracking/CopyButton";
import {
  CONNECTION_TYPES,
  CONNECTION_LABEL,
  LEAD_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
} from "@/lib/line-tracking/enums";
import type { LeadStatus, ProjectStatus } from "@/lib/line-tracking/enums";
import { platformLabel } from "@/lib/line-tracking/platforms";
import { fmtDate, fmtMoney } from "@/lib/line-tracking/format";

export const dynamic = "force-dynamic";

export default async function ProjectOverview({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { connections: true, trackingLinks: true },
  });
  if (!project) notFound();

  // Staff (next-auth) see full controls/setup; client viewers get a read-only overview.
  const session = await getAuthSession();
  const isStaff = !!session?.user?.id;

  // Auto period-over-period comparison (last N days vs the N days before).
  const cmp = await getPeriodComparison(project.id, days);

  const [stats, channels, statusDist, funnel, lineLife, recentLeads, recentEvents] =
    await Promise.all([
      getProjectStats(project.id),
      getChannelBreakdown(project.id),
      getStatusDistribution(project.id),
      getFunnel(project.id),
      getLineLifecycle(project.id),
      prisma.lead.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 6 }),
      prisma.conversionEvent.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);

  const progress = setupProgress(project.connections);
  const statusMap = connectionStatusMap(project.connections);

  const channelDonut = channels.map((c) => ({ name: c.channelGroup, value: c.leads }));
  const statusDonut = statusDist.map((s) => ({ name: LEAD_STATUS_LABEL[s.status as LeadStatus], value: s.count }));
  const grouped = channels.map((c) => ({ name: c.channelGroup, leads: c.leads, purchases: c.purchases }));
  const purchaseStage = funnel.stages[funnel.stages.length - 1];
  const cvr = funnel.stages[0].count > 0 ? (purchaseStage.count / funnel.stages[0].count) * 100 : 0;
  // Use the cumulative funnel count so the KPI matches the funnel bar (not the exact-status count).
  const qualifiedReached = funnel.stages.find((s) => s.key === "qualified")?.count ?? stats.qualifiedLeads;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
            <StatusBadge status={project.status} label={PROJECT_STATUS_LABEL[project.status as ProjectStatus]} />
          </div>
          <p className="text-sm text-slate-500">
            {project.clientName} · {project.businessType} · {project.currency}
          </p>
        </div>
        {/* Staff-only controls — clients never see Funnel/Setup/Pause here (they use the sidebar). */}
        {isStaff && (
          <div className="flex items-center gap-2">
            <Link href={`/line-tracking/projects/${project.id}/funnel`} className="btn-ghost">🔻 Funnel</Link>
            <Link href={`/line-tracking/projects/${project.id}/setup`} className="btn-ghost">🧩 Setup</Link>
            <form action={setProjectStatusAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="status" value={project.status === "LIVE" ? "PAUSED" : "LIVE"} />
              <button
                className={project.status === "LIVE" ? "btn-primary" : "btn-primary bg-emerald-600 hover:bg-emerald-700"}
                type="submit"
                title={project.status === "LIVE" ? "หยุดโปรเจกต์ = ตัดการเข้าถึงของลูกค้า (client login จะเข้าไม่ได้)" : "เปิดใช้งาน = ให้ลูกค้าเข้าดูได้"}
              >
                {project.status === "LIVE" ? "⏸ Pause (ตัดสิทธิ์ลูกค้า)" : "▶ Go Live (เปิดให้ลูกค้า)"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Period comparison — this N days vs the previous N days (auto) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">เทียบกับช่วงก่อนหน้า</h2>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`/line-tracking/projects/${project.id}?days=${d}`}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${
                  days === d ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                {d} วัน
              </Link>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            { label: "Leads ใหม่", cur: cmp.current.leads, prev: cmp.previous.leads, d: cmp.delta.leads, money: false },
            { label: "ปิดการขาย", cur: cmp.current.purchases, prev: cmp.previous.purchases, d: cmp.delta.purchases, money: false },
            { label: "ยอดขาย", cur: cmp.current.revenue, prev: cmp.previous.revenue, d: cmp.delta.revenue, money: true },
          ] as const).map((m) => {
            const up = m.d > 0, flat = Math.abs(m.d) < 0.5;
            const good = up; // more is better for all three
            return (
              <div key={m.label} className="rounded-lg border border-slate-100 p-3">
                <div className="text-xs text-slate-400">{m.label} · {days} วันล่าสุด</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-800">
                    {m.money ? fmtMoney(m.cur, project.currency) : m.cur.toLocaleString()}
                  </span>
                  <span className={`text-xs font-semibold ${flat ? "text-slate-400" : good ? "text-emerald-600" : "text-rose-500"}`}>
                    {flat ? "→ 0%" : `${up ? "▲" : "▼"} ${Math.abs(m.d).toFixed(0)}%`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  ก่อนหน้า: {m.money ? fmtMoney(m.prev, project.currency) : m.prev.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="เข้าเว็บ (ทุกช่องทาง)" value={funnel.stages[0].count.toLocaleString()} accent="bg-sky-100" icon="👆" />
        <KpiCard label="Leads (แอด LINE)" value={stats.totalLeads.toLocaleString()} accent="bg-teal-100" icon="🧑‍🤝‍🧑" />
        <KpiCard label="คุณภาพผ่าน (สะสม)" value={qualifiedReached.toLocaleString()} accent="bg-violet-100" icon="⭐" />
        <KpiCard label="ปิดการขาย" value={stats.purchases.toLocaleString()} accent="bg-line-500/15" icon="💰" />
        <KpiCard label="ยอดขายรวม" value={fmtMoney(funnel.revenue, project.currency)} accent="bg-orange-100" icon="฿" />
        <KpiCard label="Conversion (คลิก→ซื้อ)" value={`${cvr.toFixed(2)}%`} accent="bg-indigo-100" icon="📈" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Lead แยกตามช่องทาง">
          <DonutChart data={channelDonut} centerValue={stats.totalLeads.toLocaleString()} centerLabel="leads" />
          <div className="mt-3"><ChartLegend data={channelDonut} /></div>
        </SectionCard>

        <SectionCard title="สถานะ Lead">
          <DonutChart data={statusDonut} centerValue={stats.totalLeads.toLocaleString()} centerLabel="ทั้งหมด" />
          <div className="mt-3"><ChartLegend data={statusDonut} /></div>
        </SectionCard>

        <SectionCard title="สถานะ LINE ตอนนี้">
          <p className="-mt-2 mb-2 text-[11px] text-slate-400">จำนวน ณ ปัจจุบัน (ไม่ใช่ยอดสะสม) — ต่างจาก funnel ด้านล่างที่นับแบบสะสม</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: lineLife.friends, l: "เพื่อนตอนนี้", c: "text-sky-600" },
              { n: lineLife.engaged, l: "เคยทัก", c: "text-line-600" },
              { n: lineLife.blocked, l: "บล็อก", c: "text-rose-600" },
            ].map((x) => (
              <div key={x.l} className="rounded-xl border border-slate-100 p-3 text-center">
                <div className={`text-2xl font-bold ${x.c}`}>{x.n}</div>
                <div className="text-xs text-slate-500">{x.l}</div>
              </div>
            ))}
          </div>
          {/* mini funnel bars */}
          <div className="mt-4 space-y-1.5">
            {funnel.stages.map((s, i) => {
              const top = funnel.stages[0].count || 1;
              const w = Math.max((s.count / top) * 100, s.count > 0 ? 6 : 2);
              const colors = ["bg-blue-700", "bg-blue-600", "bg-blue-500", "bg-sky-500", "bg-sky-400", "bg-sky-300", "bg-sky-300"];
              return (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-slate-500">{s.label}</span>
                  <div className="flex-1 rounded bg-slate-50">
                    <div className={`rounded py-1 text-right text-[10px] font-semibold text-white ${colors[i]}`} style={{ width: `${w}%`, paddingRight: 6 }}>
                      {s.count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Grouped bar: leads vs purchases by channel */}
      <SectionCard title="Leads เทียบ ปิดการขาย แยกตามช่องทาง">
        <GroupedBar data={grouped} />
      </SectionCard>

      {/* Channel revenue table */}
      <SectionCard title="ยอดขายแยกช่องทาง">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">ช่องทาง</th>
                <th className="th text-right">Leads</th>
                <th className="th text-right">ปิดได้</th>
                <th className="th text-right">อัตราปิด</th>
                <th className="th text-right">ยอดขาย</th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 && <EmptyRow colSpan={5} text="ยังไม่มีข้อมูล" />}
              {channels.map((c) => (
                <tr key={c.channelGroup} className="border-b border-slate-50">
                  <td className="td"><StatusBadge status={c.channelGroup} label={c.channelGroup} /></td>
                  <td className="td text-right font-medium">{c.leads}</td>
                  <td className="td text-right">{c.purchases}</td>
                  <td className="td text-right text-slate-500">{c.leads > 0 ? `${((c.purchases / c.leads) * 100).toFixed(0)}%` : "—"}</td>
                  <td className="td text-right font-medium text-line-600">{fmtMoney(c.revenue, project.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Setup progress — staff only (clients must not see connection/credential status) */}
      {isStaff && (
        <SectionCard title="Setup progress" action={<span className="text-sm text-slate-500">{progress.percent}%</span>}>
          <Progress percent={progress.percent} />
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {CONNECTION_TYPES.map((t) => (
              <div key={t} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="truncate text-xs text-slate-600">{CONNECTION_LABEL[t]}</span>
                <StatusBadge status={statusMap[t]} label={statusMap[t] === "CONNECTED" ? "✓" : statusMap[t] === "ERROR" ? "!" : "—"} />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Recent tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Leads ล่าสุด" action={<Link href={`/line-tracking/projects/${project.id}/leads`} className="btn-ghost text-xs">ดูทั้งหมด</Link>}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="border-b border-slate-100"><th className="th">Lead</th><th className="th">Channel</th><th className="th">Status</th><th className="th text-right">Value</th></tr></thead>
              <tbody>
                {recentLeads.length === 0 && <EmptyRow colSpan={4} text="ยังไม่มี lead" />}
                {recentLeads.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="td font-medium">{l.fullName ?? l.displayName ?? "(no name)"}</td>
                    <td className="td"><StatusBadge status={l.channelGroup ?? "Direct"} label={l.channelGroup ?? "Direct"} /></td>
                    <td className="td"><StatusBadge status={l.status} label={LEAD_STATUS_LABEL[l.status as LeadStatus]} /></td>
                    <td className="td text-right">{fmtMoney(l.value, l.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Conversion ล่าสุด" action={<Link href={`/line-tracking/projects/${project.id}/conversions`} className="btn-ghost text-xs">Queue</Link>}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="border-b border-slate-100"><th className="th">Event</th><th className="th">Platform</th><th className="th">Status</th><th className="th">เวลา</th></tr></thead>
              <tbody>
                {recentEvents.length === 0 && <EmptyRow colSpan={4} text="ยังไม่มี event" />}
                {recentEvents.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50">
                    <td className="td font-medium">{e.eventName}</td>
                    <td className="td">{platformLabel(e.platform)}</td>
                    <td className="td"><StatusBadge status={e.status} /></td>
                    <td className="td text-slate-400">{fmtDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Tracking links */}
      <SectionCard title="Tracking links" action={<Link href={`/line-tracking/projects/${project.id}/tracking-links`} className="btn-ghost text-xs">จัดการ</Link>}>
        <div className="space-y-2">
          {project.trackingLinks.slice(0, 3).map((tl) => (
            <div key={tl.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
              <StatusBadge status="CONNECTED" label={tl.platform} />
              <code className="flex-1 truncate text-xs text-slate-500">{tl.url}</code>
              <CopyButton text={tl.url} />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
