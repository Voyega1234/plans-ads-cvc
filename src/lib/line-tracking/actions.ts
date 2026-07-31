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

/**
 * Test step 1 of onboarding ("วางโค้ด Tracking บนเว็บไซต์ลูกค้า") on demand,
 * the same way the LINE card has a Test button. The checklist itself only flips
 * once real traffic arrives, which gives no answer to "did I paste it right?" —
 * so this fetches the client site and looks for embed.js bound to THIS project
 * slug. The verdict travels back in the query string, so no schema change.
 */
/**
 * Look inside the site's published GTM container(s) for our embed snippet.
 * Returns:
 *  - "okgtm"    — snippet found in a container, bound to THIS project slug
 *  - "wrongslug"— snippet found in a container but bound to another project
 *  - "gtmnotag" — site loads GTM but no container carries the snippet
 *                 (typically: tag added in GTM but not Published yet)
 *  - "missing"  — no GTM on the page at all
 * Inside the served container the tag HTML is JSON-escaped — quotes become \",
 * slashes \/ and angle brackets < — and GTM even rewrites the script's src
 * attribute to data-gtmsrc. Verified live against convertcake.com's container
 * (GTM-P7PCL3P): the binding there appears as window.LINEHubProject=\"convert-cake\"
 * with NO ?project= on the src at all. So the slug match must accept every
 * binding form (src query, data-project, LINEHubProject global) with optionally
 * escaped quotes — a plain data-project="slug" check finds nothing and would
 * misreport a correct install as wrongslug.
 */
async function scanGtmContainers(
  html: string,
  slug: string
): Promise<"okgtm" | "wrongslug" | "gtmnotag" | "missing"> {
  const ids = [...new Set(html.match(/GTM-[A-Z0-9]{4,}/g) ?? [])].slice(0, 3);
  if (ids.length === 0) return "missing";

  const containers = await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`https://www.googletagmanager.com/gtm.js?id=${id}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(6_000),
        });
        return res.ok ? await res.text() : "";
      } catch {
        return "";
      }
    })
  );

  // \\?["'] = an optionally backslash-escaped quote (how quotes survive inside
  // the container's JSON-encoded tag HTML).
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const slugBound = new RegExp(
    `embed\\.js\\?project=${escaped}` +
      `|data-project=\\\\?["']${escaped}` +
      `|LINEHubProject\\s*=\\s*\\\\?["']${escaped}`
  );

  let sawEmbed = false;
  for (const js of containers) {
    if (!js.includes("embed.js")) continue;
    sawEmbed = true;
    if (slugBound.test(js)) return "okgtm";
  }
  return sawEmbed ? "wrongslug" : "gtmnotag";
}

export async function testEmbedAction(formData: FormData) {
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const base = `/line-tracking/projects/${projectId}/setup`;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { slug: true, websiteUrl: true },
  });
  if (!project) redirect(base);

  const site = project.websiteUrl?.trim();
  if (!site) redirect(`${base}?embedTest=nourl`);

  let verdict: "ok" | "oktraffic" | "okgtm" | "gtmnotag" | "wrongslug" | "missing" | "unreachable";
  let html = "";
  try {
    const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;
    const res = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      // Some sites serve a different page to unknown agents — look like a browser.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LINEHubSetupCheck/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      verdict = "unreachable";
    } else {
      html = await res.text();
      const hasScript = html.includes("/embed.js");
      const hasSlug =
        html.includes(`/embed.js?project=${project.slug}`) ||
        html.includes(`data-project="${project.slug}"`) ||
        html.includes(`data-project='${project.slug}'`) ||
        // Two-line install variant: window.LINEHubProject="slug" + bare embed.js tag
        new RegExp(`LINEHubProject\\s*=\\s*["']${project.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(html);
      verdict = hasScript && hasSlug ? "ok" : hasScript ? "wrongslug" : "missing";
    }
  } catch {
    // DNS failure, TLS error, timeout — all "we could not read the page".
    verdict = "unreachable";
  }

  // The scan reads server-rendered HTML only, so it cannot see a snippet injected
  // at runtime — GTM Custom HTML being the documented install path on real sites
  // (see src/app/embed.js/route.ts). Recorded clicks prove the code runs, and the
  // checklist badge already says so; without this override the page would show
  // "✅ 966 clicks" and "❌ code not found" side by side about the same install.
  if (verdict !== "ok") {
    const clicks = await prisma.adClick.count({ where: { projectId } });
    if (clicks > 0) {
      verdict = "oktraffic";
    } else if (verdict === "missing") {
      // Fresh GTM install: no tag in raw HTML AND no clicks yet — the common state
      // right after setup. Published GTM containers are public JS, and a Custom
      // HTML tag's markup is embedded in that JS verbatim (only <, > and quotes
      // are escaped), so fetching the container tells us whether the snippet is
      // actually installed — and catches the #1 GTM mistake: saved but never
      // published (an unpublished tag is absent from the served container).
      verdict = await scanGtmContainers(html, project.slug);
    }
  }

  revalidatePath(base);
  redirect(`${base}?embedTest=${verdict}`);
}

// ---- Conversion rules -----------------------------------------------------

export async function updateConversionRuleAction(formData: FormData) {
  await requireStaff();
  const projectId = String(formData.get("projectId"));
  const ruleId = String(formData.get("ruleId"));
  await requireOwnedBy("rule", ruleId, projectId);

  // Rebuild platformsJson from the dynamic per-platform fields.
  // Event name resolution: the free-text Custom box (evtcustom_<id>) OVERRIDES
  // the standard-event dropdown (evt_<id>) when non-empty — so users either pick
  // a standard event or type their own, matching events already set up in that
  // platform's account.
  const platforms: Record<string, { enabled: boolean; eventName: string }> = {};
  for (const p of PLATFORMS) {
    const custom = String(formData.get(`evtcustom_${p.id}`) ?? "").trim();
    const eventName = custom || String(formData.get(`evt_${p.id}`) ?? "").trim();
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
  revalidatePath(`/line-tracking/projects/${projectId}/settings/conversion-mapping`);
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
