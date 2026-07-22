import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushLeads, pullStatuses } from "@/lib/line-tracking/services/sheetService";
import { processQueue } from "@/lib/line-tracking/services/conversionQueueService";
import { isAuthorized } from "@/lib/line-tracking/cron";

/**
 * Google Sheet sync endpoint (per project).
 *   ?direction=push | pull | both  (default: both)
 * Push appends new leads; pull imports status changes and then runs the
 * conversion processor. Failures are logged (inside the service) and returned.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const direction = new URL(req.url).searchParams.get("direction") ?? "both";
  const results: Record<string, unknown> = {};

  try {
    if (direction === "push" || direction === "both") {
      results.push = await pushLeads(project.id);
    }
    if (direction === "pull" || direction === "both") {
      const pull = await pullStatuses(project.id);
      results.pull = pull;
      // After importing statuses, flush the conversion queue for this project.
      results.conversions = await processQueue({ projectId: project.id });
    }
    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Convenience GET for manual browser triggering in local dev.
export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return POST(req, ctx);
}
