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
import { getAuthSession } from "@/lib/session";
import { getClientSession } from "@/lib/line-tracking/clientAuth";
import { canManageClients } from "@/lib/line-tracking/clientAdmins";

async function getDefaultAgencyId(): Promise<string> {
  const agency = await getDefaultAgency();
  return agency.id;
}

// ---- Authorization --------------------------------------------------------
//
// The middleware gates PAGES by path, but a Server Action posts to the URL of the
// page it was rendered on — so it inherits whatever path the caller is already
// allowed to load, not the path of the data it touches. A Line Tracking client
// viewer, who may legitimately sit on /line-tracking/projects/<their own id>, can
// therefore hand-craft a post to any action in this file carrying somebody else's
// projectId. Every exported action below has to check for itself; these three
// helpers are that check.

const DENIED = "ไม่มีสิทธิ์ดำเนินการกับโปรเจกต์นี้";

/**
 * Staff (next-auth) only. Used for everything a client viewer has no UI for:
 * project setup, connections, tracking links, the sheet and the conversion queue.
 */
async function requireStaff(): Promise<void> {
  const session = await getAuthSession();
  if (!session?.user?.id) throw new Error(DENIED);
}

/** Staff on any project, or a client viewer on their own project only. */
async function requireProjectAccess(projectId: string): Promise<void> {
  if (!projectId) throw new Error(DENIED);
  const session = await getAuthSession();
  if (session?.user?.id) return;
  const clientSession = await getClientSession();
  if (clientSession?.projectId === projectId) return;
  throw new Error(DENIED);
}

/**
 * Child rows are addressed by their own id, so an authorized projectId sitting next
 * to another project's leadId/eventId/ruleId would still cross the boundary. Confirm
 * the row actually belongs to the project that was just authorized.
 */
async function requireOwnedBy(
  kind: "lead" | "event" | "rule" | "trackingLink" | "shortLink",
  id: string,
  projectId: string
): Promise<void> {
  const select = { projectId: true } as const;
  const owner = await (kind === "lead"
    ? prisma.lead.findUnique({ where: { id }, select })
    : kind === "event"
      ? prisma.conversionEvent.findUnique({ where: { id }, select })
      : kind === "rule"
        ? prisma.conversionRule.findUnique({ where: { id }, select })
        : kind === "trackingLink"
          ? prisma.trackingLink.findUnique({ where: { id }, select })
          : prisma.shortLink.findUnique({ where: { id }, select }));
  if (!owner || owner.projectId !== projectId) throw new Error(DENIED);
}

// ---- Projects -------------------------------------------------------------

export async function createProjectAction(formData: FormData) {
  await requireStaff();
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
  await requireStaff();
  const sourceId = String(formData.get("projectId"));
  const created = await duplicateProject(sourceId);
  revalidatePath("/line-tracking/projects");
  redirect(`/line-tracking/projects/${created.id}`);
}

export async function setProjectStatusAction(formData: FormData) {
  // Staff only on purpose: pausing a project cuts the client viewer's own access
  // (the [projectId] layout bounces PAUSED clients back to the login page), so a
  // client must not be able to lock themselves out.
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const status = String(formData.get("status")) as ProjectStatus;
  await setProjectStatus(projectId, status);
  revalidatePath(`/line-tracking/projects/${projectId}`);
  revalidatePath("/line-tracking/projects");
}

// ---- Connections ----------------------------------------------------------

export async function saveConnectionAction(formData: FormData) {
  await requireStaff();
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
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const type = String(formData.get("type")) as ConnectionType;
  await testConnection(projectId, type);
  revalidatePath(`/line-tracking/projects/${projectId}/setup`);
  revalidatePath(`/line-tracking/projects/${projectId}`);
}

// ---- Conversion rules -----------------------------------------------------

export async function updateConversionRuleAction(formData: FormData) {
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const ruleId = String(formData.get("ruleId"));
  await requireOwnedBy("rule", ruleId, projectId);

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

/**
 * Permanently delete a Line Tracking project.
 *
 * This is the most destructive action in the app: the schema cascades from
 * lt_project into 11 tables, so it also removes that project's leads (real
 * customer names/phones/values), ad clicks, LINE users, conversion events,
 * tracking links, short links and client logins. There is no undo.
 *
 * Two independent guards, because a mis-click here is unrecoverable:
 *   1. Only the LT admins (same list that may mint client logins) can delete.
 *   2. The caller must echo back the project's exact slug.
 * The UI enforces both as well; these server-side checks are what actually
 * count, since a form post can be crafted by hand.
 */
export async function deleteProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const confirmSlug = String(formData.get("confirmSlug") || "").trim();

  const session = await getAuthSession();
  if (!canManageClients(session?.user?.email)) {
    throw new Error("ไม่มีสิทธิ์ลบโปรเจกต์ — เฉพาะผู้ดูแลระบบเท่านั้น");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { slug: true },
  });
  if (!project) throw new Error("ไม่พบโปรเจกต์นี้ (อาจถูกลบไปแล้ว)");
  if (confirmSlug !== project.slug) {
    throw new Error("ข้อความยืนยันไม่ตรงกับ slug ของโปรเจกต์ — ยกเลิกการลบ");
  }

  await prisma.project.delete({ where: { id: projectId } });

  revalidatePath("/line-tracking");
  revalidatePath("/line-tracking/projects");
  // Back to the list, not the dashboard — deleting is usually done several times
  // in a row, and the deleted project's own pages no longer exist.
  redirect("/line-tracking/projects");
}

// ---- Tracking links -------------------------------------------------------

export async function createTrackingLinkAction(formData: FormData) {
  await requireStaff();
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
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  await requireOwnedBy("trackingLink", id, projectId);
  await prisma.trackingLink.delete({ where: { id } });
  revalidatePath(`/line-tracking/projects/${projectId}/tracking-links`);
}

// ---- Short links ----------------------------------------------------------

export async function createShortLinkAction(formData: FormData) {
  await requireStaff();
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
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  await requireOwnedBy("shortLink", id, projectId);
  await prisma.shortLink.delete({ where: { id } });
  revalidatePath(`/line-tracking/projects/${projectId}/tracking-links`);
}

// ---- Leads ----------------------------------------------------------------

export async function changeLeadStatusAction(formData: FormData) {
  // The Leads page is one of the three a client viewer may open, and its table is
  // interactive for them today — so this stays open to a client on their OWN
  // project rather than being narrowed to staff.
  const projectId = String(formData.get("projectId"));
  const leadId = String(formData.get("leadId"));
  await requireProjectAccess(projectId);
  await requireOwnedBy("lead", leadId, projectId);
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
  await requireProjectAccess(projectId);
  await requireOwnedBy("lead", leadId, projectId);
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
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  await processQueue({ projectId });
  revalidatePath(`/line-tracking/projects/${projectId}/conversions`);
  revalidatePath(`/line-tracking/projects/${projectId}`);
}

export async function retryEventAction(formData: FormData) {
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const eventId = String(formData.get("eventId"));
  await requireOwnedBy("event", eventId, projectId);
  await retryEvent(eventId);
  revalidatePath(`/line-tracking/projects/${projectId}/conversions`);
}

export async function markSkippedAction(formData: FormData) {
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const eventId = String(formData.get("eventId"));
  await requireOwnedBy("event", eventId, projectId);
  await markEventSkipped(eventId);
  revalidatePath(`/line-tracking/projects/${projectId}/conversions`);
}

// ---- Sheet ----------------------------------------------------------------

export async function sheetPushAction(formData: FormData) {
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  await pushLeads(projectId);
  revalidatePath(`/line-tracking/projects/${projectId}/sheet`);
}

export async function sheetPullAction(formData: FormData) {
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  await pullStatuses(projectId);
  revalidatePath(`/line-tracking/projects/${projectId}/sheet`);
  revalidatePath(`/line-tracking/projects/${projectId}/leads`);
}
