import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/session";
import { canManageClients } from "@/lib/line-tracking/clientAdmins";
import ClientAccessManager from "@/components/line-tracking/ClientAccessManager";

export const dynamic = "force-dynamic";

// Client Login management — moved out of the setup wizard into its own
// settings sub-page. Allowlisted staff only (same rule as before).
export default async function ClientLoginSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, session] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
    getAuthSession(),
  ]);
  if (!project) notFound();
  if (!canManageClients(session?.user?.email)) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🔑 Client Login · {project.name}</h1>
          <p className="text-sm text-slate-500">สร้าง/จัดการบัญชีให้ลูกค้าเข้าดูโปรเจกต์ของตัวเอง</p>
        </div>
        <Link href={`/line-tracking/projects/${project.id}/settings`} className="btn-ghost text-sm">
          ← Settings
        </Link>
      </div>

      <ClientAccessManager projectId={project.id} />
    </div>
  );
}
