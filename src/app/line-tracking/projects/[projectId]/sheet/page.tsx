import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getConnectionConfig } from "@/lib/line-tracking/services/connectionStore";
import { listSyncLogs, SHEET_COLUMNS } from "@/lib/line-tracking/services/sheetService";
import { isRealMode } from "@/lib/line-tracking/connectors";
import type { SheetConfig } from "@/lib/line-tracking/connectors";
import { sheetPushAction, sheetPullAction } from "@/lib/line-tracking/actions";
import { SectionCard, StatusBadge, MockBadge, EmptyRow } from "@/components/line-tracking/ui";
import { fmtDate } from "@/lib/line-tracking/format";

export const dynamic = "force-dynamic";

export default async function SheetPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const [config, logs] = await Promise.all([
    getConnectionConfig<SheetConfig>(project.id, "GOOGLE_SHEET"),
    listSyncLogs(project.id),
  ]);
  const real = isRealMode("GOOGLE_SHEET", config as Record<string, unknown>);
  const lastSync = logs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Google Sheet Sync · {project.name}</h1>
          <p className="text-sm text-slate-500">ซิงก์ Lead ไป-กลับกับ Google Sheet ให้ทีมเซลส์อัปเดตสถานะ</p>
        </div>
        <MockBadge mock={!real} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="การตั้งค่า Sheet">
          <dl className="space-y-2 text-sm">
            <Row label="Sheet URL" value={config.sheetUrl || "— (ยังไม่ตั้งค่า)"} />
            <Row label="Sheet ID" value={config.sheetId || "—"} />
            <Row label="Tab name" value={config.tabName || "Leads"} />
            <Row label="Service account" value={config.serviceAccountJson ? "✓ ตั้งค่าแล้ว (ซ่อน)" : "— ยังไม่ตั้งค่า"} />
            <Row label="Last sync" value={lastSync ? fmtDate(lastSync.createdAt) : "ยังไม่เคยซิงก์"} />
            <div className="flex items-center gap-2 pt-1">
              <span className="text-slate-400">Sync status:</span>
              {lastSync ? <StatusBadge status={lastSync.status} /> : <span className="text-slate-400">—</span>}
            </div>
          </dl>
          {!real && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
              โหมด Mock — ตั้งค่า Service Account JSON + Sheet ID ที่ Setup → Connect Google Sheet เพื่อใช้งานจริง
            </p>
          )}
        </SectionCard>

        <SectionCard title="Column mapping">
          <div className="flex flex-wrap gap-1">
            {SHEET_COLUMNS.map((c) => (
              <span key={c} className="badge bg-slate-100 text-slate-600">{c}</span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={sheetPushAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <button className="btn-primary text-sm" type="submit">⬆ Push leads to Sheet</button>
            </form>
            <form action={sheetPushAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <button className="btn-ghost text-sm" type="submit">Push sample lead</button>
            </form>
            <form action={sheetPullAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <button className="btn-ghost text-sm" type="submit">⬇ Import statuses</button>
            </form>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Sync logs">
        <div className="overflow-x-auto"><table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Direction</th>
              <th className="th">Status</th>
              <th className="th">Details</th>
              <th className="th">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <EmptyRow colSpan={4} text="ยังไม่มี log การซิงก์" />}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-50">
                <td className="td">{log.direction}</td>
                <td className="td"><StatusBadge status={log.status} /></td>
                <td className="td text-slate-500">
                  {log.details}
                  {log.errorMessage && <span className="block text-rose-500">{log.errorMessage}</span>}
                </td>
                <td className="td text-slate-400">{fmtDate(log.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}
