"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ConnectionType, LeadStatus, ProjectStatus, TrackingPlatform } from "@/lib/line-tracking/enums";
import {
  createProject,
  duplicateProject,
  setProjectStatus,
} from "@/lib/line-tracking/services/projectService";
import { saveConnectionConfig } from "@/lib/line-tracking/services/connectionStore";
import { testConnection } from "@/lib/line-tracking/services/connectionTestService";
import { buildTrackingUrl, getTrackingBaseUrl } from "@/lib/line-tracking/services/trackingService";
import { changeLeadStatus } from "@/lib/line-tracking/services/leadService";
import {
  processQueue,
  retryEvent,
  markEventSkipped,
} from "@/lib/line-tracking/services/conversionQueueService";
import { pushLeads, pullStatuses } from "@/lib/line-tracking/services/sheetService";
import { CONNECTOR_META } from "@/lib/line-tracking/connectors";
import { PLATFORMS } from "@/lib/line-tracking/platforms";

import { getDefaultAgency } from "@/lib/line-tracking/services/agencyService";

async function getDefaultAgencyId(): Promise<string> {
  const agency = await getDefaultAgency();
  return agency.id;
}

// ---- Projects -------------------------------------------------------------

export async function createProjectAction(formData: FormData) {
  const agencyId = await getDefaultAgencyId();
  const project = await createProject({
    agencyId,
    name: String(formData.get("name") || "").trim(),
    clientName: String(formData.get("clientName") || "").trim(),
    businessType: String(formData.get("businessType") || "").trim(),
    websiteUrl: String(formData.get("websiteUrl") || "").trim(),
    currency: String(formData.get("currency") || "THB"),
    timezone: String(formData.get("timezone") || "Asia/Bangkok"),
    defaultConversionValue: Number(formData.get("defaultConversionValue") || 0),
    mainSalesChannel: String(formData.get("mainSalesChannel") || "LINE"),
  });
  revalidatePath("/line-tracking/projects");
  redirect(`/line-tracking/projects/${project.id}/setup`);
}

export async function duplicateProjectAction(formData: FormData) {
  const sourceId = String(formData.get("projectId"));
  const created = await duplicateProject(sourceId);
  revalidatePath("/line-tracking/projects");
  redirect(`/line-tracking/projects/${created.id}`);
}

export async function setProjectStatusAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const status = String(formData.get("status")) as ProjectStatus;
  await setProjectStatus(projectId, status);
  revalidatePath(`/line-tracking/projects/${projectId}`);
  revalidatePath("/line-tracking/projects");
}

// ---- Connections ----------------------------------------------------------

export async function saveConnectionAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const type = String(formData.get("type")) as ConnectionType;
  const meta = CONNECTOR_META[type];
  const patch: Record<string, unknown> = {};
  for (const field of meta.fields) {
    patch[field.key] = String(formData.get(field.key) ?? "");
  }
  await saveConnectionConfig(projectId, type, patch);
  revalidatePath(`/line-tracking/projects/${projectId}/setup`);
  revalidatePath(`/line-tracking/projects/${projectId}`);
}

export async function testConnectionAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const type = String(formData.get("type")) as ConnectionType;
  await testConnection(projectId, type);
  revalidatePath(`/line-tracking/projects/${projectId}/setup`);
  revalidatePath(`/line-tracking/projects/${projectId}`);
}

// ---- Conversion rules -----------------------------------------------------

export async function updateConversionRuleAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const ruleId = String(formData.get("ruleId"));

  // Rebuild platformsJson from the dynamic per-platform fields (p_<id>, evt_<id>).
  const platforms: Record<string, { enabled: boolean; eventName: string }> = {};
  for (const p of PLATFORMS) {
    const eventName = String(formData.get(`evt_${p.id}`) ?? "").trim();
    if (!eventName) continue; // no event for this status (e.g. LOST)
    platforms[p.id] = {
      enabled: formData.get(`p_${p.id}`) === "on",
      eventName,
    };
  }

  await prisma.conversionRule.update({
    where: { id: ruleId },
    data: {
      enabled: formData.get("enabled") === "on",
      platformsJson: JSON.stringify(platforms),
      defaultValue: Number(formData.get("defaultValue") || 0),
    },
  });
  revalidatePath(`/line-tracking/projects/${projectId}/setup`);
}

// ---- Tracking links -------------------------------------------------------

export async function createTrackingLinkAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const platform = String(formData.get("platform")) as TrackingPlatform;
  const name = String(formData.get("name") || "Custom link");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const custom = String(formData.get("url") || "").trim();
  const url = custom || buildTrackingUrl(platform, project.slug);
  await prisma.trackingLink.create({ data: { projectId, platform, name, url } });
  revalidatePath(`/line-tracking/projects/${projectId}/tracking-links`);
}

export async function deleteTrackingLinkAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  await prisma.trackingLink.delete({ where: { id } });
  revalidatePath(`/line-tracking/projects/${projectId}/tracking-links`);
}

// ---- Short links ----------------------------------------------------------

export async function createShortLinkAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const name = String(formData.get("name") || "Short link").trim();
  const customUrl = String(formData.get("customUrl") || "").trim();
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  let targetUrl = customUrl;
  if (!targetUrl) {
    const base = getTrackingBaseUrl();
    const dest = String(formData.get("dest") || "go"); // go = ตรงเข้า LINE, t = landing
    const params = new URLSearchParams();
    const src = String(formData.get("source") || "").trim();
    const med = String(formData.get("medium") || "").trim();
    const camp = String(formData.get("campaign") || "").trim() || name;
    if (src) params.set("utm_source", src);
    if (med) params.set("utm_medium", med);
    if (camp) params.set("utm_campaign", camp);
    targetUrl = `${base}/${dest === "t" ? "t" : "go"}/${project.slug}?${params.toString()}`;
  }

  const { createShortLink } = await import("@/lib/line-tracking/services/shortLinkService");
  await createShortLink(projectId, name, targetUrl);
  revalidatePath(`/line-tracking/projects/${projectId}/tracking-links`);
}

export async function deleteShortLinkAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  await prisma.shortLink.delete({ where: { id } });
  revalidatePath(`/line-tracking/projects/${projectId}/tracking-links`);
}

// ---- Leads ----------------------------------------------------------------

export async function changeLeadStatusAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const leadId = String(formData.get("leadId"));
  const status = String(formData.get("status")) as LeadStatus;
  await changeLeadStatus(leadId, status, { changedBy: "Agency Admin (dashboard)" });
  // Process the queue immediately so the UI reflects sends right away.
  await processQueue({ projectId });
  revalidatePath(`/line-tracking/projects/${projectId}/leads`);
  revalidatePath(`/line-tracking/projects/${projectId}/conversions`);
  revalidatePath(`/line-tracking/projects/${projectId}`);
}

export async function updateLeadContactAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const leadId = String(formData.get("leadId"));
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      fullName: String(formData.get("fullName") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
      salesOwner: String(formData.get("salesOwner") || "").trim() || null,
      value: Number(formData.get("value") || 0),
    },
  });
  revalidatePath(`/line-tracking/projects/${projectId}/leads`);
}

// ---- Conversion queue -----------------------------------------------------

export async function processQueueAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  await processQueue({ projectId });
  revalidatePath(`/line-tracking/projects/${projectId}/conversions`);
  revalidatePath(`/line-tracking/projects/${projectId}`);
}

export async function retryEventAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const eventId = String(formData.get("eventId"));
  await retryEvent(eventId);
  revalidatePath(`/line-tracking/projects/${projectId}/conversions`);
}

export async function markSkippedAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const eventId = String(formData.get("eventId"));
  await markEventSkipped(eventId);
  revalidatePath(`/line-tracking/projects/${projectId}/conversions`);
}

// ---- Sheet ----------------------------------------------------------------

export async function sheetPushAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  await pushLeads(projectId);
  revalidatePath(`/line-tracking/projects/${projectId}/sheet`);
}

export async function sheetPullAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  await pullStatuses(projectId);
  revalidatePath(`/line-tracking/projects/${projectId}/sheet`);
  revalidatePath(`/line-tracking/projects/${projectId}/leads`);
}
