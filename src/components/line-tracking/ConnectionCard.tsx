import { CONNECTOR_META, maskSecret, serviceAccountEmail } from "@/lib/line-tracking/connectors";
import { CONNECTOR_GUIDE } from "@/lib/line-tracking/connector-guide";
import { parseJson } from "@/lib/line-tracking/json";
import { StatusBadge, MockBadge } from "@/components/line-tracking/ui";
import { saveConnectionAction, testConnectionAction } from "@/lib/line-tracking/actions";
import { isRealMode } from "@/lib/line-tracking/connectors";
import { CopyButton } from "@/components/line-tracking/CopyButton";
import { CollapsibleCard } from "@/components/line-tracking/CollapsibleCard";
import { getTrackingBaseUrl } from "@/lib/line-tracking/services/trackingService";
import type { ConnectionType } from "@/lib/line-tracking/enums";
import type { ProjectConnection } from "@prisma/client";
import { fmtDate } from "@/lib/line-tracking/format";

/**
 * Secret fields render EMPTY on purpose — the stored value is never sent to the
 * browser, and a blank submit means "keep what's saved" (saveConnectionConfig skips
 * blank values). That contract breaks if something else fills the box for the user:
 * a browser password manager sees several `type="password"` inputs on this page and
 * can inject a saved login into them. The injected value is NOT blank, so it sails
 * past the keep-existing guard and overwrites the real channel secret / access token
 * on the next Save — after which LINE's signature check fails and webhook events are
 * rejected with nothing on screen to explain it. These attributes tell Chrome/Safari
 * and the common password managers to leave the field alone.
 */
function secretFieldGuards(isSecret?: boolean) {
  if (!isSecret) return { autoComplete: "off" };
  return {
    autoComplete: "new-password",
    "data-1p-ignore": "true",
    "data-lpignore": "true",
    "data-bwignore": "true",
  };
}

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
  // Was reading TRACKING_BASE_URL / NEXT_PUBLIC_APP_URL directly, so with neither set
  // this rendered a domain-less "/api/webhooks/line/<id>" — paste that into LINE and no
  // event ever reaches us. getTrackingBaseUrl() is the same helper the tracking links
  // already use and falls back to the Vercel deployment URL, so the address is correct
  // out of the box; setting TRACKING_BASE_URL still overrides it (e.g. a custom domain).
  const baseUrl = getTrackingBaseUrl();
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
          {baseUrl.includes("localhost") && (
            <div className="mt-1 text-rose-500">
              ⚠️ นี่เป็น URL ของเครื่อง dev — LINE เรียกไม่ถึง ตั้ง TRACKING_BASE_URL เป็นโดเมนจริงก่อนใช้งาน
            </div>
          )}
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
                  {...secretFieldGuards(f.secret)}
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
                {...secretFieldGuards(f.secret)}
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
