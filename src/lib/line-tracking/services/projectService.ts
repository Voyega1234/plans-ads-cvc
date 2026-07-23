import { prisma } from "@/lib/prisma";
import { CONNECTION_TYPES } from "@/lib/line-tracking/enums";
import type { ConnectionType, ProjectStatus } from "@/lib/line-tracking/enums";
import { seedDefaultRules } from "./conversionRuleService";
import { ensureDefaultTrackingLinks } from "./trackingService";

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "project";
}

async function uniqueSlug(desired: string): Promise<string> {
  let slug = desired;
  let n = 1;
  while (await prisma.project.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${desired}-${n}`;
  }
  return slug;
}

export interface CreateProjectInput {
  agencyId: string;
  name: string;
  clientName: string;
  businessType: string;
  websiteUrl?: string;
  currency?: string;
  timezone?: string;
  defaultConversionValue?: number;
  mainSalesChannel?: string;
}

export async function createProject(input: CreateProjectInput) {
  const slug = await uniqueSlug(slugify(input.name));
  const project = await prisma.project.create({
    data: {
      agencyId: input.agencyId,
      name: input.name,
      clientName: input.clientName,
      slug,
      businessType: input.businessType,
      websiteUrl: input.websiteUrl || null,
      currency: input.currency || "THB",
      timezone: input.timezone || "Asia/Bangkok",
      defaultConversionValue: input.defaultConversionValue ?? 0,
      mainSalesChannel: input.mainSalesChannel || "LINE",
      status: "SETUP",
    },
  });

  // Create a NOT_CONNECTED row for every connector type.
  await prisma.projectConnection.createMany({
    data: CONNECTION_TYPES.map((type) => ({
      projectId: project.id,
      type,
      status: "NOT_CONNECTED",
      configJson: "{}",
    })),
  });

  // Independent of each other (different tables) — run concurrently instead of
  // waiting for the rules to finish before the links even start.
  await Promise.all([
    seedDefaultRules(project.id, project.defaultConversionValue),
    ensureDefaultTrackingLinks(project.id, project.slug),
  ]);

  return project;
}

/** Duplicate a project's settings (connections structure + rules), not its leads. */
export async function duplicateProject(sourceId: string) {
  const source = await prisma.project.findUniqueOrThrow({
    where: { id: sourceId },
    include: { connections: true, conversionRules: true },
  });

  const created = await createProject({
    agencyId: source.agencyId,
    name: `${source.name} (Copy)`,
    clientName: source.clientName,
    businessType: source.businessType,
    currency: source.currency,
    timezone: source.timezone,
    defaultConversionValue: source.defaultConversionValue,
    mainSalesChannel: source.mainSalesChannel,
  });

  // Copy connector configs (secrets carried over so the copy is usable) and the
  // conversion rule toggles. Every row is independent, so these all go out at once
  // instead of ~9 connections + 7 rules paid as sequential round-trips.
  await Promise.all([
    ...source.connections.map((conn) =>
      prisma.projectConnection.update({
        where: { projectId_type: { projectId: created.id, type: conn.type } },
        data: { configJson: conn.configJson, status: conn.status },
      })
    ),
    ...source.conversionRules.map((rule) =>
      prisma.conversionRule.update({
        where: { projectId_leadStatus: { projectId: created.id, leadStatus: rule.leadStatus } },
        data: {
          enabled: rule.enabled,
          platformsJson: rule.platformsJson,
          defaultValue: rule.defaultValue,
        },
      })
    ),
  ]);

  return created;
}

export function getProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: { connections: true, trackingLinks: true },
  });
}

export function getProjectBySlug(slug: string) {
  return prisma.project.findUnique({ where: { slug } });
}

export function listProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      connections: true,
      _count: { select: { leads: true } },
    },
  });
}

export async function setProjectStatus(projectId: string, status: ProjectStatus) {
  return prisma.project.update({ where: { id: projectId }, data: { status } });
}

/** Setup progress = fraction of the 6 connectors that are CONNECTED. */
export function setupProgress(connections: { type: string; status: string }[]) {
  const total = CONNECTION_TYPES.length;
  const done = connections.filter((c) => c.status === "CONNECTED").length;
  return { done, total, percent: Math.round((done / total) * 100) };
}

export function connectionStatusMap(
  connections: { type: string; status: string }[]
): Record<ConnectionType, string> {
  const map = {} as Record<ConnectionType, string>;
  for (const t of CONNECTION_TYPES) {
    map[t] = connections.find((c) => c.type === t)?.status ?? "NOT_CONNECTED";
  }
  return map;
}

// ---- Dashboard aggregates -------------------------------------------------

export async function getAgencyDashboardStats() {
  const [
    totalProjects,
    activeProjects,
    totalLeads,
    qualifiedLeads,
    purchases,
    conversionSent,
    conversionFailed,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "LIVE" } }),
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "QUALIFIED" } }),
    prisma.lead.count({ where: { status: { in: ["WON", "PAID"] } } }),
    prisma.conversionEvent.count({ where: { status: "SENT" } }),
    prisma.conversionEvent.count({ where: { status: "FAILED" } }),
  ]);

  return {
    totalProjects,
    activeProjects,
    totalLeads,
    qualifiedLeads,
    purchases,
    conversionSent,
    conversionFailed,
  };
}

/** Lead counts grouped by channelGroup, with purchases per channel. */
export async function getChannelBreakdown(projectId: string) {
  const leads = await prisma.lead.findMany({
    where: { projectId },
    select: { channelGroup: true, status: true, value: true },
  });
  const map = new Map<string, { leads: number; purchases: number; revenue: number }>();
  for (const l of leads) {
    const key = l.channelGroup ?? "Direct";
    const row = map.get(key) ?? { leads: 0, purchases: 0, revenue: 0 };
    row.leads += 1;
    if (l.status === "WON" || l.status === "PAID") {
      row.purchases += 1;
      row.revenue += l.value;
    }
    map.set(key, row);
  }
  return Array.from(map.entries())
    .map(([channelGroup, v]) => ({ channelGroup, ...v }))
    .sort((a, b) => b.leads - a.leads);
}

/** LINE lifecycle funnel counts: friends / engaged (messaged) / blocked. */
export async function getLineLifecycle(projectId: string) {
  const [friends, engaged, blocked] = await Promise.all([
    prisma.lineUser.count({ where: { projectId, friendStatus: "FRIEND" } }),
    prisma.lineUser.count({ where: { projectId, lastMessageAt: { not: null } } }),
    prisma.lineUser.count({ where: { projectId, friendStatus: "BLOCKED" } }),
  ]);
  return { friends, engaged, blocked };
}

/** Full funnel broken down by channel: visit → button click → lead → purchase. */
export async function getChannelFunnel(
  projectId: string,
  range?: { from?: Date; to?: Date }
) {
  const inRange =
    range?.from || range?.to
      ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
      : {};

  const reachedByCh = (statuses: string[]) =>
    prisma.lead.groupBy({ by: ["channelGroup"], where: { projectId, status: { in: statuses }, ...inRange }, _count: true });

  const [visits, btnClicks, leads, contacted, qualified, quoted, purchases] = await Promise.all([
    prisma.adClick.groupBy({ by: ["channelGroup"], where: { projectId, ...inRange }, _count: true }),
    prisma.adClick.groupBy({ by: ["channelGroup"], where: { projectId, lineClickedAt: { not: null }, ...inRange }, _count: true }),
    prisma.lead.groupBy({ by: ["channelGroup"], where: { projectId, ...inRange }, _count: true }),
    reachedByCh(["CONTACTED", "QUALIFIED", "QUOTED", "WON", "PAID"]),
    reachedByCh(["QUALIFIED", "QUOTED", "WON", "PAID"]),
    reachedByCh(["QUOTED", "WON", "PAID"]),
    prisma.lead.groupBy({ by: ["channelGroup"], where: { projectId, status: { in: ["WON", "PAID"] }, ...inRange }, _count: true, _sum: { value: true } }),
  ]);

  type Row = { channel: string; visits: number; btnClicks: number; leads: number; contacted: number; qualified: number; quoted: number; purchases: number; revenue: number };
  const map = new Map<string, Row>();
  const row = (ch: string | null) => {
    const key = ch ?? "Direct";
    if (!map.has(key)) map.set(key, { channel: key, visits: 0, btnClicks: 0, leads: 0, contacted: 0, qualified: 0, quoted: 0, purchases: 0, revenue: 0 });
    return map.get(key)!;
  };
  for (const v of visits) row(v.channelGroup).visits += v._count;
  for (const b of btnClicks) row(b.channelGroup).btnClicks += b._count;
  for (const l of leads) row(l.channelGroup).leads += l._count;
  for (const c of contacted) row(c.channelGroup).contacted += c._count;
  for (const q of qualified) row(q.channelGroup).qualified += q._count;
  for (const q of quoted) row(q.channelGroup).quoted += q._count;
  for (const p of purchases) {
    const r = row(p.channelGroup);
    r.purchases += p._count;
    r.revenue += p._sum.value ?? 0;
  }
  // Best performers first: revenue → purchases → visits.
  return Array.from(map.values()).sort(
    (a, b) => b.revenue - a.revenue || b.purchases - a.purchases || b.visits - a.visits
  );
}

/** Lead count grouped by status (for a distribution chart). */
export async function getStatusDistribution(projectId: string) {
  const rows = await prisma.lead.groupBy({
    by: ["status"],
    where: { projectId },
    _count: true,
  });
  const order = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "PAID", "LOST"];
  return rows
    .map((r) => ({ status: r.status, count: r._count }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
}

/** Marketing funnel: Click → Add LINE → Message → Qualified → Quote → Purchase. */
export async function getFunnel(
  projectId: string,
  range?: { from?: Date; to?: Date }
) {
  const inRange =
    range?.from || range?.to
      ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
      : {};
  const reached = (statuses: string[]) =>
    prisma.lead.count({ where: { projectId, status: { in: statuses }, ...inRange } });

  const [clicks, lineClicks, added, contacted, qualified, quoted, purchased, blocked, revenueAgg] =
    await Promise.all([
      prisma.adClick.count({ where: { projectId, ...inRange } }),
      prisma.adClick.count({ where: { projectId, lineClickedAt: { not: null }, ...inRange } }),
      prisma.lead.count({ where: { projectId, ...inRange } }),
      reached(["CONTACTED", "QUALIFIED", "QUOTED", "WON", "PAID"]),
      reached(["QUALIFIED", "QUOTED", "WON", "PAID"]),
      reached(["QUOTED", "WON", "PAID"]),
      reached(["WON", "PAID"]),
      prisma.lineUser.count({ where: { projectId, friendStatus: "BLOCKED", ...inRange } }),
      prisma.lead.aggregate({
        where: { projectId, status: { in: ["WON", "PAID"] }, ...inRange },
        _sum: { value: true },
      }),
    ]);

  return {
    stages: [
      { key: "click", label: "เข้าเว็บ/คลิก", sub: "Visit / click", count: clicks },
      { key: "lineclick", label: "กดปุ่ม LINE", sub: "Clicked Add-LINE", count: lineClicks },
      { key: "add", label: "แอด LINE", sub: "Added friend", count: added },
      { key: "contact", label: "ทักแชต", sub: "Messaged", count: contacted },
      { key: "qualified", label: "คุณภาพผ่าน", sub: "Qualified", count: qualified },
      { key: "quote", label: "เสนอราคา", sub: "Quoted", count: quoted },
      { key: "purchase", label: "ปิดการขาย", sub: "Won / Paid", count: purchased },
    ],
    blocked,
    revenue: revenueAgg._sum.value ?? 0,
  };
}

/** Agency-wide: leads + purchases per project (for a bar chart). */
export async function getAgencyLeadsByProject() {
  // Was an N+1 loop (1 + 2×projects queries, sequential over a remote DB). Now 3 fixed
  // queries: all projects + leads-per-project + purchases-per-project via groupBy, merged
  // in memory. Output is identical — projects with 0 leads are kept (groupBy omits them,
  // so we start from the full project list and default missing counts to 0).
  const [projects, leadsByProject, purchasesByProject] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true } }),
    prisma.lead.groupBy({ by: ["projectId"], _count: true }),
    prisma.lead.groupBy({ by: ["projectId"], where: { status: { in: ["WON", "PAID"] } }, _count: true }),
  ]);
  const leadMap = new Map(leadsByProject.map((r) => [r.projectId, r._count]));
  const purchaseMap = new Map(purchasesByProject.map((r) => [r.projectId, r._count]));
  return projects
    .map((p) => ({ name: p.name, leads: leadMap.get(p.id) ?? 0, purchases: purchaseMap.get(p.id) ?? 0 }))
    .sort((a, b) => b.leads - a.leads);
}

/** Agency-wide lead status distribution (donut). */
export async function getAgencyStatusDistribution() {
  const rows = await prisma.lead.groupBy({ by: ["status"], _count: true });
  const order = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "PAID", "LOST"];
  return rows
    .map((r) => ({ status: r.status, count: r._count }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
}

export async function getProjectStats(projectId: string) {
  const [totalLeads, qualifiedLeads, purchases, sent, failed, pending] = await Promise.all([
    prisma.lead.count({ where: { projectId } }),
    prisma.lead.count({ where: { projectId, status: "QUALIFIED" } }),
    prisma.lead.count({ where: { projectId, status: { in: ["WON", "PAID"] } } }),
    prisma.conversionEvent.count({ where: { projectId, status: "SENT" } }),
    prisma.conversionEvent.count({ where: { projectId, status: "FAILED" } }),
    prisma.conversionEvent.count({ where: { projectId, status: "PENDING" } }),
  ]);
  return { totalLeads, qualifiedLeads, purchases, sent, failed, pending };
}

/**
 * Compare the last N days against the previous N days — so you see at a glance
 * whether things improved or got worse. Metrics: leads, purchases, revenue.
 */
export async function getPeriodComparison(projectId: string, days: number) {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date();
  const curFrom = new Date(now.getTime() - days * DAY);
  const prevFrom = new Date(now.getTime() - 2 * days * DAY);

  const metrics = async (from: Date, to: Date) => {
    const [leads, purchases, rev] = await Promise.all([
      prisma.lead.count({ where: { projectId, createdAt: { gte: from, lt: to } } }),
      prisma.lead.count({ where: { projectId, status: { in: ["WON", "PAID"] }, createdAt: { gte: from, lt: to } } }),
      prisma.lead.aggregate({ _sum: { value: true }, where: { projectId, status: { in: ["WON", "PAID"] }, createdAt: { gte: from, lt: to } } }),
    ]);
    return { leads, purchases, revenue: rev._sum.value ?? 0 };
  };

  // The two windows are independent — run them concurrently (was 2 sequential waves).
  const [current, previous] = await Promise.all([
    metrics(curFrom, now),
    metrics(prevFrom, curFrom),
  ]);
  const pct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

  return {
    days,
    current,
    previous,
    delta: {
      leads: pct(current.leads, previous.leads),
      purchases: pct(current.purchases, previous.purchases),
      revenue: pct(current.revenue, previous.revenue),
    },
  };
}
