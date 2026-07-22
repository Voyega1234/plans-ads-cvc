import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LEAD_STATUS_LABEL } from "@/lib/line-tracking/enums";
import type { LeadStatus } from "@/lib/line-tracking/enums";

export const dynamic = "force-dynamic";

export default async function LineSuccessPage({
  searchParams,
}: {
  searchParams: { lead_id?: string };
}) {
  const leadId = searchParams.lead_id;
  if (!leadId) notFound();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { project: true },
  });
  if (!lead) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-line-500/10 to-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-line-500 text-3xl text-white">
          ✓
        </div>
        <h1 className="text-xl font-bold text-slate-900">เพิ่มเพื่อนสำเร็จ! 🎉</h1>
        <p className="mt-2 text-sm text-slate-500">
          ขอบคุณที่แอด LINE ของ {lead.project.name} — ทีมงานจะติดต่อกลับโดยเร็ว
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Lead</span><span className="font-medium">{lead.displayName}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Source</span><span>{lead.source ?? "-"}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Status</span><span>{LEAD_STATUS_LABEL[lead.status as LeadStatus]}</span></div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Lead ถูกบันทึกในระบบและส่ง event <code>generate_lead</code> เข้า GA4 (ถ้าตั้งค่าไว้)
        </p>

        {lead.project.websiteUrl && (
          <a href={lead.project.websiteUrl} target="_blank" rel="noreferrer" className="btn-line mt-6 w-full">
            🌐 ไปที่เว็บไซต์ {lead.project.clientName}
          </a>
        )}

        <Link href={`/projects/${lead.projectId}/leads`} className="btn-ghost mt-3 w-full">
          ดูใน Dashboard →
        </Link>
      </div>
    </main>
  );
}
