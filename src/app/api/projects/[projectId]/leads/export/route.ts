import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Export a project's leads as a CSV file (for the agency to hand to the client).
 * UTF-8 with BOM so Thai opens correctly in Excel.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const leads = await prisma.lead.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    include: { lineUser: true },
  });

  const headers = [
    "created_at",
    "full_name",
    "line_name",
    "phone",
    "channel",
    "source",
    "campaign",
    "keyword",
    "status",
    "value",
    "currency",
    "slip_amount",
    "sales_owner",
    "conversion_state",
    "line_stage",
  ];

  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lineStage = (l: (typeof leads)[number]) =>
    l.lineUser?.friendStatus === "BLOCKED"
      ? "blocked"
      : l.lineUser?.lastMessageAt
        ? "messaged"
        : l.lineUser
          ? "added"
          : "";

  const rows = leads.map((l) =>
    [
      l.createdAt.toISOString(),
      l.fullName ?? "",
      l.displayName ?? l.lineUser?.displayName ?? "",
      l.phone ?? "",
      l.channelGroup ?? "",
      l.source ?? "",
      l.campaign ?? "",
      l.keyword ?? "",
      l.status,
      l.value,
      l.currency,
      l.slipAmount ?? "",
      l.salesOwner ?? "",
      l.conversionState,
      lineStage(l),
    ]
      .map(esc)
      .join(",")
  );

  const csv = "﻿" + [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${project.slug}-leads-${date}.csv`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
