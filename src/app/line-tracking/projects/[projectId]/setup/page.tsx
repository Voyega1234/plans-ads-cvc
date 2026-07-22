import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setupProgress } from "@/lib/line-tracking/services/projectService";
import { getProjectReadiness } from "@/lib/line-tracking/services/readinessService";
import { getAuthSession } from "@/lib/session";
import { canManageClients } from "@/lib/line-tracking/clientAdmins";
import ClientAccessManager from "@/components/line-tracking/ClientAccessManager";
import { ConnectionCard } from "@/components/line-tracking/ConnectionCard";
import { ConversionRuleRow } from "@/components/line-tracking/ConversionRuleRow";
import { CopyButton } from "@/components/line-tracking/CopyButton";
import { Progress, StatusBadge } from "@/components/line-tracking/ui";
import { setProjectStatusAction } from "@/lib/line-tracking/actions";
import { buildTrackingUrl } from "@/lib/line-tracking/services/trackingService";
import type { ConnectionType } from "@/lib/line-tracking/enums";
import { AD_CONNECTION_TYPES, LEAD_STATUS, LEAD_STATUS_LABEL } from "@/lib/line-tracking/enums";
import type { LeadStatus } from "@/lib/line-tracking/enums";
import { PLATFORMS, PLATFORM_DATA_SENT } from "@/lib/line-tracking/platforms";

export const dynamic = "force-dynamic";

const STEPS = [
  { key: "info", label: "Project Info" },
  { key: "line", label: "Connect LINE OA" },
  { key: "sheet", label: "Connect Google Sheet" },
  { key: "ga4", label: "Connect GA4" },
  { key: "ads", label: "Connect Ads Platforms" },
  { key: "conversions", label: "Conversion Mapping" },
  { key: "links", label: "Tracking Links" },
  { key: "golive", label: "Test & Go Live" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function conn(connections: { type: string }[], type: ConnectionType) {
  return connections.find((c) => c.type === type) as never;
}

export default async function SetupWizard({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { connections: true, conversionRules: { orderBy: { leadStatus: "asc" } } },
  });
  if (!project) notFound();

  const step = (STEPS.find((s) => s.key === query.step)?.key ?? "info") as StepKey;
  const progress = setupProgress(project.connections);
  const readiness = await getProjectReadiness(project.id);
  const notReady = readiness.filter((r) => !r.ready);
  // Only allowlisted staff (apps/bob/varn@convertcake.com) may create client logins.
  const staffSession = await getAuthSession();
  const canManage = canManageClients(staffSession?.user?.email);
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const base = `/line-tracking/projects/${project.id}/setup`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Setup Wizard · {project.name}</h1>
          <p className="text-sm text-slate-500">ตั้งค่าการเชื่อมต่อทั้งหมดของโปรเจกต์นี้ทีละขั้น</p>
        </div>
        <div className="w-full sm:w-48">
          <Progress percent={progress.percent} />
          <div className="mt-1 text-right text-xs text-slate-400">{progress.percent}% connected</div>
        </div>
      </div>

      {/* ── ข้อมูลที่ยังขาด (missing-data reporter) ───────────────────────────── */}
      <div className="card">
        <h2 className="mb-1 text-base font-semibold text-slate-800">สถานะความพร้อมส่ง Conversion</h2>
        <p className="mb-3 text-xs text-slate-500">
          ระบบเช็คให้ว่าแต่ละแพลตฟอร์มขาด credential อะไร และ Lead ล่าสุดมี click id ที่จำเป็นหรือยัง (90 วันล่าสุด)
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {readiness.map((r) => {
            const clickWarn =
              r.clickIdField &&
              r.ready &&
              r.recentLeads > 0 &&
              (r.leadsWithClickId ?? 0) === 0;
            return (
              <div
                key={r.type}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                  r.ready
                    ? clickWarn
                      ? "border-amber-200 bg-amber-50"
                      : "border-emerald-200 bg-emerald-50"
                    : "border-rose-200 bg-rose-50"
                }`}
              >
                <span className="mt-0.5">{r.ready ? (clickWarn ? "⚠️" : "✅") : "❌"}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{r.label}</div>
                  {!r.ready && (
                    <div className="text-xs text-rose-700">
                      ขาด: {r.missingCredentials.join(", ")}
                    </div>
                  )}
                  {r.ready && r.clickIdField && (
                    <div className={`text-xs ${clickWarn ? "text-amber-700" : "text-slate-500"}`}>
                      {r.clickIdField}: {r.leadsWithClickId}/{r.recentLeads} leads
                      {r.clickIdRequired && (r.leadsWithClickId ?? 0) === 0 && r.recentLeads > 0
                        ? " · ต้องมี click id นี้ถึงจะส่ง conversion ได้"
                        : ""}
                    </div>
                  )}
                  {r.ready && !r.clickIdField && (
                    <div className="text-xs text-emerald-700">พร้อมส่ง</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {notReady.length === 0 && (
          <p className="mt-2 text-xs text-emerald-700">ทุกแพลตฟอร์มที่ตั้งค่าไว้พร้อมส่ง Conversion แล้ว ✓</p>
        )}
      </div>

      {/* Client Login management — allowlisted staff only */}
      {canManage && <ClientAccessManager projectId={project.id} />}

      {/* step nav */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <Link
            key={s.key}
            href={`${base}?step=${s.key}`}
            className={`rounded-full px-3 py-1.5 text-sm ${
              s.key === step
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {i + 1}. {s.label}
          </Link>
        ))}
      </div>

      {/* step content */}
      <div className="space-y-4">
        {step === "info" && (
          <div className="card space-y-2">
            <h2 className="text-base font-semibold">Project Info</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <Info label="Project" value={project.name} />
              <Info label="Client" value={project.clientName} />
              <Info label="Business type" value={project.businessType} />
              <Info label="Slug" value={project.slug} />
              <Info label="Currency" value={project.currency} />
              <Info label="Timezone" value={project.timezone} />
              <Info label="Default value" value={String(project.defaultConversionValue)} />
              <Info label="Main channel" value={project.mainSalesChannel} />
              <Info label="Status" value={project.status} />
            </dl>
          </div>
        )}

        {step === "line" && (
          <ConnectionCard projectId={project.id} type="LINE" connection={conn(project.connections, "LINE")} />
        )}
        {step === "sheet" && (
          <ConnectionCard projectId={project.id} type="GOOGLE_SHEET" connection={conn(project.connections, "GOOGLE_SHEET")} />
        )}
        {step === "ga4" && (
          <ConnectionCard projectId={project.id} type="GA4" connection={conn(project.connections, "GA4")} />
        )}
        {step === "ads" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {AD_CONNECTION_TYPES.map((t) => (
              <ConnectionCard key={t} projectId={project.id} type={t} connection={conn(project.connections, t)} />
            ))}
          </div>
        )}

        {step === "conversions" && (
          <div className="space-y-4">
            {/* Reference: event names per status × platform */}
            <div className="card overflow-x-auto">
              <h2 className="text-base font-semibold">📋 Event ทั้งหมด (สถานะ Lead → ชื่อ event แต่ละแพลตฟอร์ม)</h2>
              <p className="mb-2 text-sm text-slate-500">ตารางอ้างอิง — เมื่อ Lead เปลี่ยนสถานะ ระบบยิง event ชื่อนี้ไปแต่ละแพลตฟอร์ม</p>
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
                </tbody>
              </table>
              <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-600">
                🚫 <b>line_block</b> → GA4 (นอกเหนือจากตาราง) — ยิงอัตโนมัติเมื่อลูกค้า <b>บล็อก LINE OA</b>
                เพื่อให้เห็น flow ครบ (แอด → ทัก → ปิดการขาย → บล็อก) ส่งเฉพาะ GA4 ไม่ส่ง ad platform
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
              <h2 className="text-base font-semibold">Conversion Mapping (เปิด/ปิด ต่อสถานะ)</h2>
              <p className="text-sm text-slate-500">
                กำหนดว่าแต่ละสถานะ Lead จะส่ง event ไปแพลตฟอร์มไหนบ้าง (ติ๊กเปิด/ปิดได้)
              </p>
              {project.conversionRules.map((rule) => (
                <ConversionRuleRow key={rule.id} projectId={project.id} rule={rule} />
              ))}
            </div>
          </div>
        )}

        {step === "links" && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Generate Tracking Links</h2>
              <Link href={`/line-tracking/projects/${project.id}/tracking-links`} className="btn-ghost text-sm">
                จัดการ Tracking Links →
              </Link>
            </div>
            {(["GOOGLE", "META", "TIKTOK"] as const).map((p) => {
              const url = buildTrackingUrl(p, project.slug);
              return (
                <div key={p} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <StatusBadge status="CONNECTED" label={p} />
                  <code className="flex-1 truncate text-xs text-slate-500">{url}</code>
                  <CopyButton text={url} />
                </div>
              );
            })}
          </div>
        )}

        {step === "golive" && (
          <div className="card space-y-4">
            <h2 className="text-base font-semibold">Test &amp; Go Live</h2>
            <p className="text-sm text-slate-500">
              เชื่อมต่อแล้ว {progress.done}/{progress.total} ตัว. ทดสอบ flow ได้จากลิงก์ tracking แล้วกด Go Live
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={`/t/${project.slug}`} target="_blank" className="btn-ghost" rel="noreferrer">
                🔗 เปิดหน้า Tracking (ทดสอบ)
              </a>
              <Link href={`/line-tracking/projects/${project.id}/leads`} className="btn-ghost">🧑‍🤝‍🧑 ดู Leads</Link>
              <Link href={`/line-tracking/projects/${project.id}/conversions`} className="btn-ghost">⚡ ดู Conversion Queue</Link>
              <form action={setProjectStatusAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="status" value="LIVE" />
                <button className="btn-primary" type="submit">▶ Go Live</button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* step footer nav */}
      <div className="flex items-center justify-between">
        {stepIndex > 0 ? (
          <Link href={`${base}?step=${STEPS[stepIndex - 1].key}`} className="btn-ghost">← ก่อนหน้า</Link>
        ) : <span />}
        {stepIndex < STEPS.length - 1 ? (
          <Link href={`${base}?step=${STEPS[stepIndex + 1].key}`} className="btn-primary">ถัดไป →</Link>
        ) : (
          <Link href={`/line-tracking/projects/${project.id}`} className="btn-primary">เสร็จสิ้น → ไปหน้าโปรเจกต์</Link>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
