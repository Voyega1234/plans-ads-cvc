import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@/lib/line-tracking/enums";
import { enqueueForLead } from "./conversionQueueService";
import type { Lead } from "@prisma/client";

const PURCHASE_STATUSES = new Set<LeadStatus>(["WON", "PAID"]);

/**
 * Change a lead's status: write history, set purchase fields if applicable,
 * then run the conversion-rule processor (queues events).
 */
export async function changeLeadStatus(
  leadId: string,
  newStatus: LeadStatus,
  opts: { changedBy?: string; note?: string } = {}
): Promise<Lead> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.status === newStatus) return lead;

  const data: Record<string, unknown> = { status: newStatus };
  if (PURCHASE_STATUSES.has(newStatus) && !lead.purchasedAt) {
    data.purchasedAt = new Date();
    data.purchaseId = lead.purchaseId || `ord_${lead.id.slice(-8)}`;
  }

  const updated = await prisma.lead.update({ where: { id: leadId }, data });

  await prisma.leadStatusHistory.create({
    data: {
      leadId,
      oldStatus: lead.status,
      newStatus,
      changedBy: opts.changedBy ?? "Agency Admin",
      note: opts.note,
    },
  });

  await enqueueForLead(updated);
  return updated;
}

/** Create a lead from a LINE add / click, or return the existing one. */
export async function upsertLeadFromClick(params: {
  projectId: string;
  lineUserId?: string | null;
  clickId?: string | null;
  displayName?: string | null;
  defaultValue: number;
  currency: string;
}): Promise<{ lead: Lead; created: boolean }> {
  // De-dupe by lineUser within the project.
  if (params.lineUserId) {
    const existing = await prisma.lead.findFirst({
      where: { projectId: params.projectId, lineUserId: params.lineUserId },
    });
    if (existing) return { lead: existing, created: false };
  }

  let click = params.clickId
    ? await prisma.adClick.findUnique({ where: { clickId: params.clickId } })
    : null;

  // No explicit click (e.g. webhook follow) → attribute to the most recent
  // Add-LINE click for this project so the lead gets a real channel (not Direct).
  // Prefer someone who actually clicked the Add-LINE button, within 3h; else the
  // most recent click within 30m. Skip clicks already used by another lead.
  if (!click) {
    const win3h = new Date(Date.now() - 3 * 3600 * 1000);
    let candidates = await prisma.adClick.findMany({
      where: { projectId: params.projectId, lineClickedAt: { not: null }, createdAt: { gte: win3h } },
      orderBy: { lineClickedAt: "desc" },
      take: 20,
    });
    if (candidates.length === 0) {
      candidates = await prisma.adClick.findMany({
        where: { projectId: params.projectId, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }
    for (const c of candidates) {
      const used = await prisma.lead.findFirst({ where: { projectId: params.projectId, clickId: c.clickId } });
      if (!used) { click = c; break; }
    }
  }

  // Lead inherits the click's channel; a LINE add with no click = Direct.
  const channelGroup = click?.channelGroup ?? "Direct";
  const channel = click?.channel ?? "line / add-friend";

  const lead = await prisma.lead.create({
    data: {
      projectId: params.projectId,
      lineUserId: params.lineUserId ?? undefined,
      clickId: params.clickId ?? click?.clickId ?? undefined,
      displayName: params.displayName ?? undefined,
      source: click?.source,
      campaign: click?.campaign,
      adset: click?.adset,
      content: click?.content,
      keyword: click?.keyword,
      gclid: click?.gclid,
      fbclid: click?.fbclid,
      ttclid: click?.ttclid,
      msclkid: click?.msclkid,
      twclid: click?.twclid,
      scclid: click?.scclid,
      gaClientId: click?.gaClientId,
      channel,
      channelGroup,
      value: params.defaultValue,
      currency: params.currency,
      status: "NEW",
    },
  });

  await prisma.leadStatusHistory.create({
    data: { leadId: lead.id, newStatus: "NEW", changedBy: "System", note: "Lead created from LINE add" },
  });

  // Run NEW-status rule (GA4 generate_lead enabled by default).
  await enqueueForLead(lead);

  return { lead, created: true };
}

export function listLeads(projectId: string) {
  return prisma.lead.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      lineUser: true,
      conversionEvents: { orderBy: { createdAt: "desc" } },
    },
  });
}
