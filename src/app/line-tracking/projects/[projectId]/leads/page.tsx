import { notFound } from "next/navigation";
import { listLeads } from "@/lib/line-tracking/services/leadService";
import { prisma } from "@/lib/prisma";
import { LeadStatusSelect } from "@/components/line-tracking/LeadStatusSelect";
import { LeadEdit } from "@/components/line-tracking/LeadEdit";
import { StatusBadge, EmptyRow } from "@/components/line-tracking/ui";
import { fmtDate, fmtMoney } from "@/lib/line-tracking/format";

export const dynamic = "force-dynamic";

function ClickIdChips({ lead }: { lead: { gclid: string | null; fbclid: string | null; ttclid: string | null } }) {
  return (
    <div className="flex gap-1">
      {lead.gclid && <span className="badge bg-sky-100 text-sky-700" title={lead.gclid}>g</span>}
      {lead.fbclid && <span className="badge bg-blue-100 text-blue-700" title={lead.fbclid}>fb</span>}
      {lead.ttclid && <span className="badge bg-slate-800 text-white" title={lead.ttclid}>tt</span>}
      {!lead.gclid && !lead.fbclid && !lead.ttclid && <span className="text-xs text-slate-300">—</span>}
    </div>
  );
}

function LineStage({ lineUser }: { lineUser: { friendStatus: string; lastMessageAt: Date | null; blockedAt: Date | null } | null }) {
  if (!lineUser) return <span className="text-xs text-slate-300">—</span>;
  if (lineUser.friendStatus === "BLOCKED")
    return <span className="badge bg-rose-100 text-rose-700" title="บล็อก OA">🚫 บล็อก</span>;
  if (lineUser.lastMessageAt)
    return <span className="badge bg-line-500/10 text-line-600" title="ทักเราแล้ว">💬 ทักแล้ว</span>;
  return <span className="badge bg-sky-100 text-sky-700" title="แอดเพื่อนแล้ว">✓ แอดแล้ว</span>;
}

export default async function LeadsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();
  const leads = await listLeads(project.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Leads CRM · {project.name}</h1>
          <p className="text-sm text-slate-500">
            เปลี่ยนสถานะ Lead แล้วระบบจะรัน conversion rule + ส่ง event อัตโนมัติ ({leads.length} leads)
          </p>
        </div>
        <a
          href={`/api/projects/${project.id}/leads/export`}
          className="btn-primary"
          download
        >
          ⬇ Export CSV (ให้ลูกค้า)
        </a>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="th">Lead / LINE</th>
              <th className="th">Channel</th>
              <th className="th">LINE</th>
              <th className="th">Campaign</th>
              <th className="th">Click IDs</th>
              <th className="th">Value</th>
              <th className="th">ชื่อ/เบอร์ (เซลส์กรอก)</th>
              <th className="th">Conversion</th>
              <th className="th">Last event</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && <EmptyRow colSpan={10} text="ยังไม่มี lead — ลองเปิด tracking link แล้ว simulate Add LINE" />}
            {leads.map((l) => {
              const lastEvent = l.conversionEvents[0];
              return (
                <tr key={l.id} className="border-b border-slate-50 align-middle">
                  <td className="td">
                    <div className="font-medium">{l.fullName ?? l.displayName ?? l.lineUser?.displayName ?? "(no name)"}</div>
                    <div className="text-xs text-slate-400">
                      {l.displayName ? `LINE: ${l.displayName}` : ""}{l.phone ? ` · ${l.phone}` : ""}
                    </div>
                    <div className="text-xs text-slate-400">{fmtDate(l.createdAt)}</div>
                  </td>
                  <td className="td">
                    <StatusBadge status={l.channelGroup ?? "Direct"} label={l.channelGroup ?? "Direct"} />
                    <div className="text-xs text-slate-400">{l.channel ?? l.source ?? "-"}</div>
                  </td>
                  <td className="td"><LineStage lineUser={l.lineUser} /></td>
                  <td className="td text-slate-500">{l.campaign ?? "-"}</td>
                  <td className="td"><ClickIdChips lead={l} /></td>
                  <td className="td">
                    {fmtMoney(l.value, l.currency)}
                    {l.slipAmount != null && (
                      <div className="mt-0.5 text-[10px] font-medium text-line-600" title="OCR อ่านจากสลิป — ยืนยันก่อนกด PAID">
                        📎 สลิป: {fmtMoney(l.slipAmount, l.currency)}
                      </div>
                    )}
                  </td>
                  <td className="td">
                    <LeadEdit projectId={project.id} leadId={l.id} fullName={l.fullName} phone={l.phone} salesOwner={l.salesOwner} value={l.value} currency={l.currency} />
                  </td>
                  <td className="td"><StatusBadge status={l.conversionState} /></td>
                  <td className="td text-xs text-slate-400">
                    {lastEvent ? `${lastEvent.eventName} · ${lastEvent.platform}` : "—"}
                  </td>
                  <td className="td">
                    <LeadStatusSelect projectId={project.id} leadId={l.id} status={l.status} />
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
