import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConversionRuleRow } from "@/components/line-tracking/ConversionRuleRow";
import { LEAD_STATUS, LEAD_STATUS_LABEL } from "@/lib/line-tracking/enums";
import type { LeadStatus } from "@/lib/line-tracking/enums";
import { PLATFORMS, PLATFORM_DATA_SENT } from "@/lib/line-tracking/platforms";

export const dynamic = "force-dynamic";

// Conversion Mapping — moved out of the setup wizard into its own settings
// sub-page. Includes the full event reference table (now with the 🚫 block-OA
// row: line_block fires to EVERY connected platform on unfollow).
export default async function ConversionMappingSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { conversionRules: { orderBy: { leadStatus: "asc" } } },
  });
  if (!project) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">⚡ Conversion Mapping · {project.name}</h1>
          <p className="text-sm text-slate-500">กำหนด event ต่อสถานะ Lead ต่อแพลตฟอร์ม — เลือก Standard event หรือพิมพ์ Custom เอง</p>
        </div>
        <Link href={`/line-tracking/projects/${project.id}/settings`} className="btn-ghost text-sm">
          ← Settings
        </Link>
      </div>

      {/* Reference: event names per status × platform */}
      <div className="card overflow-x-auto">
        <h2 className="text-base font-semibold">📋 Event ทั้งหมด (สถานะ Lead → ชื่อ event แต่ละแพลตฟอร์ม)</h2>
        <p className="mb-2 text-sm text-slate-500">ตารางอ้างอิง — เมื่อ Lead เปลี่ยนสถานะ ระบบยิง event ชื่อนี้ไปแต่ละแพลตฟอร์ม (แก้ชื่อได้ในส่วน Mapping ด้านล่าง)</p>
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">สถานะ</th>
              {PLATFORMS.map((p) => <th key={p.id} className="th">{p.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {LEAD_STATUS.map((st) => (
              <tr key={st} className="border-b border-slate-50">
                <td className="td font-medium">{st}<div className="text-[10px] text-slate-400">{LEAD_STATUS_LABEL[st as LeadStatus]}</div></td>
                {PLATFORMS.map((p) => (
                  <td key={p.id} className="td">{p.events[st as LeadStatus] ?? <span className="text-slate-300">—</span>}</td>
                ))}
              </tr>
            ))}
            {/* 🚫 Block-OA event — fires to every connected platform on unfollow */}
            <tr className="border-b border-slate-50 bg-rose-50/50">
              <td className="td font-medium">🚫 line_block<div className="text-[10px] text-slate-400">ลูกค้าบล็อก LINE OA</div></td>
              {PLATFORMS.map((p) => (
                <td key={p.id} className="td">{p.blockEvent ?? <span className="text-slate-300">—</span>}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-600">
          🚫 <b>line_block</b> ยิงอัตโนมัติเมื่อลูกค้า <b>บล็อก LINE OA</b> — ส่งไป<b>ทุกแพลตฟอร์มที่เชื่อมต่อแล้ว</b>เหมือน event อื่น
          เพื่อวัดว่าแคมเปญ/ช่องทางไหนพาคนที่มาบล็อกเข้ามา (แอด → ทัก → ปิดการขาย → บล็อก ครบ flow)
        </p>
      </div>

      {/* Reference: what data is sent per platform */}
      <div className="card">
        <h2 className="text-base font-semibold">📤 ส่งข้อมูลอะไรไปบ้าง (ต่อแพลตฟอร์ม)</h2>
        <p className="mb-3 rounded-lg bg-line-500/5 p-2 text-xs text-line-600">
          🔒 ไม่ส่งข้อมูลส่วนบุคคล (ชื่อจริง / เบอร์ / อีเมล) เด็ดขาด — ส่งแค่ click id, id เข้ารหัส, และค่า conversion
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {PLATFORMS.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-100 p-3">
              <div className="mb-1 font-semibold text-slate-700">{p.label}</div>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-500">
                {PLATFORM_DATA_SENT[p.id].map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Editable rules */}
      <div className="card space-y-3">
        <h2 className="text-base font-semibold">Conversion Mapping (เปิด/ปิด + แก้ชื่อ event ต่อสถานะ)</h2>
        <p className="text-sm text-slate-500">
          กำหนดว่าแต่ละสถานะ Lead จะส่ง event ไปแพลตฟอร์มไหนบ้าง — เลือก Standard event จาก dropdown
          หรือพิมพ์ Custom event เอง (ช่องพิมพ์เองจะชนะ dropdown เมื่อกรอก) เพื่อให้ตรงกับ event ที่มีอยู่แล้วในบัญชีแพลตฟอร์มนั้น ไม่ให้ซ้ำกัน
        </p>
        {project.conversionRules.map((rule) => (
          <ConversionRuleRow key={rule.id} projectId={project.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}
