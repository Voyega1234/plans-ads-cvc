import { NextRequest, NextResponse } from "next/server";
import { processQueue } from "@/lib/line-tracking/services/conversionQueueService";
import { isAuthorized } from "@/lib/line-tracking/cron";

/**
 * Process the conversion queue. Optional ?projectId=... to scope to one project.
 * Intended to be triggered by a cron/scheduler; protect with CRON_SECRET in prod.
 * Retries failed events up to MAX_RETRY (handled inside processQueue).
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  try {
    const summary = await processQueue({ projectId });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
