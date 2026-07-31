import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/session";
import { canManageClients } from "@/lib/line-tracking/clientAdmins";

export const dynamic = "force-dynamic";

// Project settings hub — Conversion Mapping and Client Login moved here from the
// setup wizard so day-to-day configuration lives in one predictable place.
export default async function ProjectSettingsPage({
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
  const canManage = canManageClients(session?.user?.email);

  const items = [
    {
      href: `/line-tracking/projects/${project.id}/settings/conversion-mapping`,
      icon: "⚡",
      title: "Conversion Mapping",
      desc: "ตาราง event ทุกสถานะ Lead ต่อแพลตฟอร์ม · เปิด/ปิดกฎ · แก้ชื่อ event (standard/custom)",
      show: true,
    },
    {
      href: `/line-tracking/projects/${project.id}/settings/client-login`,
      icon: "🔑",
      title: "Client Login",
      desc: "สร้าง/จัดการบัญชีให้ลูกค้าเข้าดูโปรเจกต์ของตัวเอง (เฉพาะแอดมิน)",
      show: canManage,
    },
  ].filter((i) => i.show);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">⚙️ Settings · {project.name}</h1>
        <p className="text-sm text-slate-500">ตั้งค่าโปรเจกต์ — แยกจาก Setup Wizard เพื่อให้แก้ทีหลังได้ง่าย</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="card flex items-start gap-3 border border-slate-200 transition-colors hover:border-brand-400 hover:bg-brand-500/5"
          >
            <span className="text-2xl">{i.icon}</span>
            <span>
              <span className="block font-semibold text-slate-800">{i.title}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{i.desc}</span>
            </span>
          </Link>
        ))}
      </div>

      <Link href={`/line-tracking/projects/${project.id}/setup`} className="btn-ghost text-sm">
        ← กลับไป Setup Wizard
      </Link>
    </div>
  );
}
