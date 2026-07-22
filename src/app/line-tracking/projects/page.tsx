import Link from "next/link";
import { listProjects, setupProgress, connectionStatusMap } from "@/lib/line-tracking/services/projectService";
import { duplicateProjectAction } from "@/lib/line-tracking/actions";
import { StatusBadge, Progress } from "@/components/line-tracking/ui";
import { CONNECTION_TYPES, CONNECTION_LABEL, PROJECT_STATUS_LABEL } from "@/lib/line-tracking/enums";
import type { ProjectStatus } from "@/lib/line-tracking/enums";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">โปรเจกต์ลูกค้าทั้งหมด (แต่ละลูกค้าแยก LINE / Sheet / GA4 / Ads)</p>
        </div>
        <Link href="/line-tracking/projects/new" className="btn-primary">+ Create Project</Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="th">Project</th>
              <th className="th">Business</th>
              {CONNECTION_TYPES.map((t) => (
                <th key={t} className="th">{CONNECTION_LABEL[t]}</th>
              ))}
              <th className="th">Setup</th>
              <th className="th">Status</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-400">
                  ยังไม่มีโปรเจกต์ — เริ่มด้วย “Create Project”
                </td>
              </tr>
            )}
            {projects.map((p) => {
              const progress = setupProgress(p.connections);
              const statusMap = connectionStatusMap(p.connections);
              return (
                <tr key={p.id} className="border-b border-slate-50 align-middle">
                  <td className="td">
                    <Link href={`/line-tracking/projects/${p.id}`} className="font-semibold text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-slate-400">{p.clientName} · {p._count.leads} leads</div>
                  </td>
                  <td className="td text-slate-500">{p.businessType}</td>
                  {CONNECTION_TYPES.map((t) => (
                    <td key={t} className="td">
                      <StatusBadge
                        status={statusMap[t]}
                        label={statusMap[t] === "CONNECTED" ? "✓" : statusMap[t] === "ERROR" ? "!" : "—"}
                      />
                    </td>
                  ))}
                  <td className="td w-28">
                    <div className="flex items-center gap-2">
                      <Progress percent={progress.percent} />
                      <span className="text-xs text-slate-400">{progress.percent}%</span>
                    </div>
                  </td>
                  <td className="td">
                    <StatusBadge status={p.status} label={PROJECT_STATUS_LABEL[p.status as ProjectStatus]} />
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Link href={`/line-tracking/projects/${p.id}`} className="btn-ghost text-xs">Open</Link>
                      <form action={duplicateProjectAction}>
                        <input type="hidden" name="projectId" value={p.id} />
                        <button className="btn-ghost text-xs" type="submit">Duplicate</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
