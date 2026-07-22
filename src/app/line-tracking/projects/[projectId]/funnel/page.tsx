import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getFunnel, getChannelBreakdown, getChannelFunnel } from "@/lib/line-tracking/services/projectService";
import { KpiCard, SectionCard, StatusBadge, EmptyRow } from "@/components/line-tracking/ui";
import { DonutChart, ChartLegend } from "@/components/line-tracking/Charts";
import { fmtMoney } from "@/lib/line-tracking/format";

export const dynamic = "force-dynamic";

// Warm funnel palette (top → bottom) matching the reference infographic.
// น้ำเงิน → ฟ้า → ฟ้าอ่อน (blue → sky → light sky)
const COLORS = ["#1d4ed8", "#2563eb", "#3b82f6", "#0ea5e9", "#38bdf8", "#7dd3fc", "#bae6fd"];
const ICONS = ["📢", "👉", "💬", "✍️", "⭐", "🧾", "💰"];
const DESC = [
  "คนเห็นโฆษณา / เข้าเว็บ",
  "กดปุ่ม Add LINE (ทุกช่องทาง)",
  "เพิ่มเพื่อนสำเร็จ",
  "เริ่มทักแชตกับเรา",
  "Lead คุณภาพผ่านเกณฑ์",
  "เสนอราคาแล้ว",
  "ปิดการขาย / จ่ายเงิน",
];

const RANGES = [
  { key: "today", label: "วันนี้" },
  { key: "1d", label: "เมื่อวาน" },
  { key: "7d", label: "7 วัน" },
  { key: "14d", label: "14 วัน" },
  { key: "30d", label: "30 วัน" },
  { key: "all", label: "ทั้งหมด" },
];

function resolveRange(sp: { range?: string; from?: string; to?: string }) {
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 86400000);
  switch (sp.range) {
    case "today": {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from };
    }
    case "1d": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const from = new Date(y.getFullYear(), y.getMonth(), y.getDate());
      const to = new Date(from.getTime() + 86400000 - 1);
      return { from, to };
    }
    case "7d":
      return { from: days(7) };
    case "14d":
      return { from: days(14) };
    case "30d":
      return { from: days(30) };
    case "custom":
      return {
        from: sp.from ? new Date(sp.from) : undefined,
        to: sp.to ? new Date(sp.to + "T23:59:59") : undefined,
      };
    default:
      return undefined;
  }
}

export default async function FunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const range = resolveRange(query);
  const [funnel, channels, channelFunnel] = await Promise.all([
    getFunnel(project.id, range),
    getChannelBreakdown(project.id),
    getChannelFunnel(project.id, range),
  ]);

  const top = funnel.stages[0].count || 1;
  const purchase = funnel.stages[funnel.stages.length - 1];
  const cvr = top > 0 ? (purchase.count / top) * 100 : 0;
  const channelDonut = channels.map((c) => ({ name: c.channelGroup, value: c.leads }));
  const bestCvrChannel = [...channelFunnel]
    .filter((c) => c.visits > 0 && c.purchases > 0)
    .sort((a, b) => b.purchases / b.visits - a.purchases / a.visits)[0]?.channel;
  const activeRange = query.range ?? "all";
  const N = funnel.stages.length;
  const widthAt = (k: number) => 100 - (k / N) * 62; // 100% → ~38%

  const base = `/line-tracking/projects/${project.id}/funnel`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Marketing Funnel · {project.name}</h1>
          <p className="text-sm text-slate-500">เข้าเว็บ → กดปุ่ม LINE → แอด → ทัก → ปิดการขาย (ทุกช่องทาง)</p>
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`${base}?range=${r.key}`}
            className={`rounded-full px-3 py-1.5 text-sm ${
              activeRange === r.key ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {r.label}
          </Link>
        ))}
        <form action={base} method="get" className="flex items-center gap-1">
          <input type="hidden" name="range" value="custom" />
          <input type="date" name="from" defaultValue={query.from} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <span className="text-slate-400">–</span>
          <input type="date" name="to" defaultValue={query.to} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <button type="submit" className={`rounded-full px-3 py-1.5 text-sm ${activeRange === "custom" ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            เลือกช่วง
          </button>
        </form>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="เข้าเว็บ/คลิก" value={funnel.stages[0].count.toLocaleString()} accent="bg-amber-100" icon="👆" />
        <KpiCard label="กดปุ่ม Add LINE" value={funnel.stages[1].count.toLocaleString()} accent="bg-orange-100" icon="👉" />
        <KpiCard label="ปิดการขาย" value={purchase.count.toLocaleString()} accent="bg-line-500/15" icon="💰" />
        <KpiCard label="ยอดขายรวม" value={fmtMoney(funnel.revenue, project.currency)} accent="bg-rose-100" icon="฿" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trapezoid funnel */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
            <div className="mx-auto mb-5 w-fit rounded-full bg-orange-500 px-6 py-2 text-center text-sm font-bold text-white shadow">
              Marketing Funnel · conversion {cvr.toFixed(2)}%
            </div>
            <div>
              {funnel.stages.map((s, i) => {
                const topW = widthAt(i);
                const botW = widthAt(i + 1);
                const clip = `polygon(${(100 - topW) / 2}% 0, ${(100 + topW) / 2}% 0, ${(100 + botW) / 2}% 100%, ${(100 - botW) / 2}% 100%)`;
                const prev = i === 0 ? null : funnel.stages[i - 1].count;
                const stepRate = prev && prev > 0 ? (s.count / prev) * 100 : null;
                return (
                  <div key={s.key} className="flex items-stretch">
                    {/* funnel band */}
                    <div className="w-1/2">
                      <div
                        className="-mt-px flex h-[62px] items-center justify-center gap-2 text-white"
                        style={{ background: COLORS[i], clipPath: clip }}
                      >
                        <span className="text-lg">{ICONS[i]}</span>
                        <span className="text-lg font-extrabold">{s.count.toLocaleString()}</span>
                      </div>
                    </div>
                    {/* label + desc */}
                    <div className="flex flex-1 flex-col justify-center pl-4">
                      <div className="text-sm font-bold text-slate-800">
                        {s.label}
                        {stepRate !== null && (
                          <span className={`ml-2 text-xs font-medium ${stepRate < 60 ? "text-rose-500" : stepRate < 100 ? "text-amber-600" : "text-line-600"}`}>
                            ↓ {stepRate.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{DESC[i]}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side */}
        <div className="space-y-6">
          <SectionCard title="Lead แยกช่องทาง">
            <DonutChart data={channelDonut} centerValue={funnel.stages[2].count.toLocaleString()} centerLabel="leads" />
            <div className="mt-3"><ChartLegend data={channelDonut} /></div>
          </SectionCard>

          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
            <div className="text-sm font-semibold text-rose-700">🚫 บล็อก OA (Churn)</div>
            <div className="mt-1 text-3xl font-bold text-rose-600">{funnel.blocked.toLocaleString()}</div>
            <div className="text-xs text-rose-400">แอดแล้วบล็อกทิ้ง — ยิง line_block เข้า GA4</div>
          </div>
        </div>
      </div>

      {/* Full funnel by channel — เห็นลึกตั้งแต่เข้าเว็บ */}
      <SectionCard title="Funnel แยกตามช่องทาง (ตั้งแต่เข้าเว็บ → ปิดการขาย)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-0">
            <colgroup>
              <col className="w-[26%]" />
              {Array.from({ length: 9 }).map((_, i) => <col key={i} />)}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">ช่องทาง</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">เข้าเว็บ</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">กดปุ่ม</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">แอด</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">ทัก</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">คุณภาพ</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">เสนอ</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">ปิด</th>
                <th className="px-1.5 py-2 text-right text-xs font-semibold uppercase text-slate-500">CVR</th>
                <th className="px-2 py-2 text-right text-xs font-semibold uppercase text-slate-500">ยอดขาย</th>
              </tr>
            </thead>
            <tbody>
              {channelFunnel.length === 0 && <EmptyRow colSpan={10} text="ยังไม่มีข้อมูลในช่วงนี้" />}
              {channelFunnel.map((c) => {
                const rate = c.visits > 0 ? (c.purchases / c.visits) * 100 : 0;
                const best = bestCvrChannel === c.channel && rate > 0;
                return (
                  <tr key={c.channel} className={`border-b border-slate-50 ${best ? "bg-line-500/5" : ""}`}>
                    <td className="px-2 py-2 text-sm">
                      {best && <span title="CVR สูงสุด" className="mr-1">⭐</span>}
                      <StatusBadge status={c.channel} label={c.channel} />
                    </td>
                    <td className="px-1.5 py-2 text-right text-sm font-medium">{c.visits.toLocaleString()}</td>
                    <td className="px-1.5 py-2 text-right text-sm text-slate-500">{c.btnClicks.toLocaleString()}</td>
                    <td className="px-1.5 py-2 text-right text-sm">{c.leads.toLocaleString()}</td>
                    <td className="px-1.5 py-2 text-right text-sm">{c.contacted.toLocaleString()}</td>
                    <td className="px-1.5 py-2 text-right text-sm">{c.qualified.toLocaleString()}</td>
                    <td className="px-1.5 py-2 text-right text-sm">{c.quoted.toLocaleString()}</td>
                    <td className="px-1.5 py-2 text-right text-sm font-medium text-line-600">{c.purchases.toLocaleString()}</td>
                    <td className={`px-1.5 py-2 text-right text-sm ${best ? "font-bold text-line-600" : "text-slate-500"}`}>{rate > 0 ? `${rate.toFixed(2)}%` : "—"}</td>
                    <td className="px-2 py-2 text-right text-sm font-medium">{fmtMoney(c.revenue, project.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
