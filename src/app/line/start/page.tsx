import { redirect, notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/line-tracking/services/projectService";
import { getConnectionConfig } from "@/lib/line-tracking/services/connectionStore";
import { buildLineLoginUrl, isMockLineEnabled } from "@/lib/line-tracking/services/lineService";
import { getTrackingBaseUrl } from "@/lib/line-tracking/services/trackingService";
import type { LineConfig } from "@/lib/line-tracking/connectors";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LineStartPage({
  searchParams,
}: {
  searchParams: { project?: string; click_id?: string; next?: string; mode?: string };
}) {
  const slug = searchParams.project;
  if (!slug) notFound();
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const config = await getConnectionConfig<LineConfig>(project.id, "LINE");
  const clickId = searchParams.click_id;
  const next = searchParams.next;
  const wantLogin = searchParams.mode === "login"; // precise attribution (opt-in)

  const realLineDest = next || config.addFriendUrl;

  // Default = SMOOTH: straight to LINE add-friend (one tap, no login page).
  if (!wantLogin && realLineDest) redirect(realLineDest);

  // Opt-in = PRECISE: LINE Login (carries click_id in state for per-person attr).
  const realLoginUrl = buildLineLoginUrl(config, {
    projectSlug: project.slug,
    clickId,
    redirectUri: `${getTrackingBaseUrl()}/line/callback`,
  });
  if (realLoginUrl) redirect(realLoginUrl);

  // Fallbacks.
  if (realLineDest) redirect(realLineDest);

  // 3) No LINE configured at all. Real visitors get a plain "not ready yet"
  //    notice — the simulate button only exists when ALLOW_MOCK_LINE=true on a
  //    dev machine, because clicking it writes a real Lead and fires real
  //    conversions. Never offer it to whoever happens to land here.
  const mockHref = `/line/callback/mock?project=${project.slug}${clickId ? `&click_id=${clickId}` : ""}`;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-line-500/10 to-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          ยังไม่ได้เชื่อมต่อ LINE สำหรับโปรเจกต์นี้ — กรุณาติดต่อผู้ดูแลระบบ
        </p>
        {isMockLineEnabled() && (
          <Link href={mockHref} className="btn-ghost mt-4 w-full py-3">
            🧪 Simulate LINE Add (dev เท่านั้น)
          </Link>
        )}
      </div>
    </main>
  );
}
