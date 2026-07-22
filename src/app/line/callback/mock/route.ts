import { NextRequest, NextResponse } from "next/server";
import { getProjectBySlug } from "@/lib/line-tracking/services/projectService";
import { prisma } from "@/lib/prisma";
import {
  upsertLineUser,
  generateMockLineUserId,
  randomMockDisplayName,
} from "@/lib/line-tracking/services/lineService";
import { upsertLeadFromClick } from "@/lib/line-tracking/services/leadService";
import { pushLeads } from "@/lib/line-tracking/services/sheetService";
import { processQueue } from "@/lib/line-tracking/services/conversionQueueService";
import { isConnectorReal } from "@/lib/line-tracking/services/connectionStore";

/**
 * MVP mock LINE callback. Creates a fake LINE user, links it to the latest
 * ad click, creates a Lead, best-effort pushes to the Sheet, then redirects
 * to the success page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("project");
  const clickId = searchParams.get("click_id") ?? undefined;

  if (!slug) {
    return NextResponse.json({ error: "missing project" }, { status: 400 });
  }
  const project = await getProjectBySlug(slug);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Prefer the passed click; otherwise fall back to the latest click for the project.
  let clickIdToUse = clickId;
  if (!clickIdToUse) {
    const latest = await prisma.adClick.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    });
    clickIdToUse = latest?.clickId ?? undefined;
  }

  const lineUserId = generateMockLineUserId();
  const displayName = randomMockDisplayName();

  const lineUser = await upsertLineUser({
    projectId: project.id,
    lineUserId,
    displayName,
    clickId: clickIdToUse,
  });

  const { lead } = await upsertLeadFromClick({
    projectId: project.id,
    lineUserId: lineUser.id,
    clickId: clickIdToUse,
    displayName,
    defaultValue: project.defaultConversionValue,
    currency: project.currency,
  });

  // Send generate_lead (+ any enabled platforms) to GA4/ads in real time.
  try {
    await processQueue({ projectId: project.id });
  } catch {
    /* safety-net cron will retry */
  }

  // Best-effort sheet sync (mock or real). Never block the redirect on failure.
  if (await isConnectorReal(project.id, "GOOGLE_SHEET")) {
    try {
      await pushLeads(project.id);
    } catch {
      /* logged inside pushLeads */
    }
  }

  const base = new URL(req.url).origin;
  return NextResponse.redirect(`${base}/line/success?lead_id=${lead.id}`);
}
