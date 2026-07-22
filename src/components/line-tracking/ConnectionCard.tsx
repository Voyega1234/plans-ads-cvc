import { CONNECTOR_META, maskSecret, serviceAccountEmail } from "@/lib/line-tracking/connectors";
import { CONNECTOR_GUIDE } from "@/lib/line-tracking/connector-guide";
import { parseJson } from "@/lib/line-tracking/json";
import { StatusBadge, MockBadge } from "@/components/line-tracking/ui";
import { saveConnectionAction, testConnectionAction } from "@/lib/line-tracking/actions";
import { isRealMode } from "@/lib/line-tracking/connectors";
import { CopyButton } from "@/components/line-tracking/CopyButton";
import { CollapsibleCard } from "@/components/line-tracking/CollapsibleCard";
import type { ConnectionType } from "@/lib/line-tracking/enums";
import type { ProjectConnection } from "@prisma/client";
import { fmtDate } from "@/lib/line-tracking/format";

export async function ConnectionCard({
  projectId,
  type,
  connection,
}: {
  projectId: string;
  type: ConnectionType;
  connection?: ProjectConnection;
}) {
  const meta = CONNECTOR_META[type];
  const config = parseJson<Record<string, string>>(connection?.configJson, {});
  const real = isRealMode(type, config);
  const status = connection?.status ?? "NOT_CONNECTED";

  // Google Sheet: the #1 confusion is "which email do I share the sheet with?"
  const shareEmail =
    type === "GOOGLE_SHEET"
      ? serviceAccountEmail(config.serviceAccountJson)
      : null;

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">{meta.title}</h3>
          <StatusBadge status={status} />
          <MockBadge mock={!real} />
        </div>
        <p className="text-sm text-slate-500">{meta.description}</p>
      </div>
    </div>
  );

  const guide = CONNECTOR_GUIDE[type];
  const baseUrl = process.env.TRACKING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const lineWebhookUrl = type === "LINE" ? `${baseUrl}/api/webhooks/line/${projectId}` : null;

  return (
    <CollapsibleCard header={header} defaultOpen={false}>
      {guide && (
        <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700">
          <div className="mb-1.5 flex items-center gap-2 font-semibold text-blue-800">
            📋 วิธีเชื่อม (ทำตามทีละขั้น)
            {guide.link && (
              <a href={guide.link.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline">
                {guide.link.label} ↗
              </a>
            )}
          </div>
          <p className="mb-2 text-slate-500">{guide.intro}</p>
          <ol className="list-decimal space-y-1 pl-4">
            {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}

      {lineWebhookUrl && (
        <div className="mt-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-700">
          <div className="font-semibold">Webhook URL (ก็อปไปวางใน LINE → Messaging API → Webhook URL):</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-slate-700">{lineWebhookUrl}</code>
            <CopyButton text={lineWebhookUrl} label="Copy" />
          </div>
          {!baseUrl && <div className="mt-1 text-rose-500">⚠️ ยังไม่ได้ตั้ง TRACKING_BASE_URL — URL จะไม่สมบูรณ์</div>}
        </div>
      )}

      {type === "GOOGLE_SHEET" && (
        <div className="mt-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-700">
          {shareEmail ? (
            <>
              <div className="font-semibold">วิธีต่อ (ง่าย ๆ):</div>
              <div className="mt-1">
                1. เปิด Google Sheet ของคุณ → <b>Share</b> → วางอีเมลนี้ (สิทธิ์ Editor):
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-2 py-1 text-slate-700">{shareEmail}</code>
                <CopyButton text={shareEmail} label="Copy" />
              </div>
              <div className="mt-1">2. วาง <b>Sheet ID</b> ด้านล่าง → Save → Test</div>
            </>
          ) : (
            <>
              💡 ใส่ <b>Service Account JSON ใหม่ของโปรเจกต์นี้</b> ด้านล่าง แล้วแชร์ Sheet ให้อีเมล Service Account
            </>
          )}
        </div>
      )}

      <form action={saveConnectionAction} className="mt-3 space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="type" value={type} />
        {meta.fields.map((f) => {
          const current = config[f.key];
          if (f.textarea) {
            return (
              <div key={f.key}>
                <label className="label">
                  {f.label} {f.optional && <span className="text-slate-300">(optional)</span>}
                </label>
                <textarea
                  name={f.key}
                  rows={3}
                  className="input font-mono text-xs"
                  placeholder={
                    f.secret && current
                        ? "•••••• (บันทึกไว้แล้ว — เว้นว่างถ้าไม่เปลี่ยน)"
                        : f.placeholder
                  }
                />
              </div>
            );
          }
          return (
            <div key={f.key}>
              <label className="label">
                {f.label} {f.optional && <span className="text-slate-300">(optional)</span>}
              </label>
              <input
                name={f.key}
                type={f.secret ? "password" : "text"}
                className="input"
                defaultValue={f.secret ? "" : current ?? ""}
                placeholder={
                    f.secret && current
                      ? `${maskSecret(current)} — เว้นว่างถ้าไม่เปลี่ยน`
                      : f.placeholder
                }
              />
            </div>
          );
        })}

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-slate-400">
            {connection?.lastTestAt ? (
              <>
                Last test:{" "}
                <StatusBadge status={connection.lastTestStatus ?? "FAIL"} />{" "}
                <span>{fmtDate(connection.lastTestAt)}</span>
              </>
            ) : (
              "ยังไม่เคยทดสอบการเชื่อมต่อ"
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">Save</button>
          </div>
        </div>
      </form>

      <form action={testConnectionAction} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="type" value={type} />
        <button type="submit" className="btn-ghost text-sm">Test Connection</button>
        {connection?.lastError && (
          <span className="truncate text-xs text-rose-500" title={connection.lastError}>
            {connection.lastError}
          </span>
        )}
      </form>
    </CollapsibleCard>
  );
}
