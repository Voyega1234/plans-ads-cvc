import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/line-tracking/services/projectService";
import { recordAdClick, extractParams } from "@/lib/line-tracking/services/trackingService";

export const dynamic = "force-dynamic";

export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectSlug } = await params;
  const query = await searchParams;
  const project = await getProjectBySlug(projectSlug);
  if (!project) notFound();

  // Build a URLSearchParams from the incoming query for the extractor.
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string") sp.set(k, v);
  }

  const h = await headers();
  const captured = extractParams(sp);
  const click = await recordAdClick(project.id, {
    ...captured,
    landingUrl: `/t/${project.slug}?${sp.toString()}`,
    referrer: h.get("referer") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });

  const continueHref = `/line/start?project=${project.slug}&click_id=${click.clickId}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-line-500/10 to-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-line-500 text-2xl font-bold text-white">
          {project.name.charAt(0)}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{project.clientName}</p>

        <p className="mt-6 text-slate-600">
          สนใจสอบถามข้อมูลเพิ่มเติม? แอดไลน์เพื่อคุยกับทีมงานของเราได้เลย 🙌
        </p>

        <Link href={continueHref} className="btn-line mt-6 w-full py-3 text-base">
          ➕ แอด LINE คุยกับเรา
        </Link>
        <Link href={continueHref} className="mt-3 block text-sm text-slate-400 hover:text-slate-600">
          Continue to LINE →
        </Link>

        {project.websiteUrl && (
          <a
            href={project.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block text-sm text-brand-600 hover:underline"
          >
            🌐 เยี่ยมชมเว็บไซต์
          </a>
        )}

        <p className="mt-6 text-[11px] text-slate-300">
          click_id: {click.clickId}
          {captured.source ? ` · source: ${captured.source}` : ""}
        </p>
      </div>
    </main>
  );
}
