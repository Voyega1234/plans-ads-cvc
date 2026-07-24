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

/**
 * These pages are force-dynamic, so every query is a fresh round-trip to a remote
 * Postgres — and a serverless function only holds a handful of connections, so the
 * cost of a page is driven by HOW MANY queries it fires, not how much data it reads.
 * The helpers below collapse repeated counts over the same table into one grouped
 * query and do the (trivial) arithmetic in memory instead. Same numbers, fewer trips.
 */
type StatusRow<S extends string = string> = { status: S; _count: number };

/** Total across every status bucket. */
function sumAll(rows: StatusRow[]): number {
  return rows.reduce((n, r) => n + r._count, 0);
}

/** Total across the given statuses only. */
function sumOf(rows: StatusRow[], statuses: readonly string[]): number {
  return rows.reduce((n, r) => (statuses.includes(r.status) ? n + r._count : n), 0);
}

// Funnel stages are CUMULATIVE — a lead sitting in WON has already passed
// contacted/qualified/quoted, so each stage is the set of statuses at or beyond it.
const PURCHASED: readonly string[] = ["WON", "PAID"];
const REACHED_QUOTED: readonly string[] = ["QUOTED", ...PURCHASED];
const REACHED_QUALIFIED: readonly string[] = ["QUALIFIED", ...REACHED_QUOTED];
const REACHED_CONTACTED: readonly string[] = ["CONTACTED", ...REACHED_QUALIFIED];

export async function getAgencyDashboardStats() {
  // Was 7 separate counts (2 project + 3 lead + 2 conversionEvent). Each table is now
  // asked once, grouped by status, and the buckets are summed here.
  const [projectRows, leadRows, eventRows] = await Promise.all([
    prisma.project.groupBy({ by: ["status"], _count: true }),
    prisma.lead.groupBy({ by: ["status"], _count: true }),
    prisma.conversionEvent.groupBy({ by: ["status"], _count: true }),
  ]);

  return {
    totalProjects: sumAll(projectRows),
    activeProjects: sumOf(projectRows, ["LIVE"]),
    totalLeads: sumAll(leadRows),
    qualifiedLeads: sumOf(leadRows, ["QUALIFIED"]),
    purchases: sumOf(leadRows, PURCHASED),
    conversionSent: sumOf(eventRows, ["SENT"]),
    conversionFailed: sumOf(eventRows, ["FAILED"]),
  };
}

/** Lead counts grouped by channelGroup, with purchases per channel. */
export async function getChannelBreakdown(projectId: string) {
  // Was a findMany of every lead row for the project, aggregated in JS. Postgres can
  // do the same fold itself — one grouped query, a handful of rows back instead of all.
  const rows = await prisma.lead.groupBy({
    by: ["channelGroup", "status"],
    where: { projectId },
    _count: true,
    _sum: { value: true },
  });
  const map = new Map<string, { leads: number; purchases: number; revenue: number }>();
  for (const r of rows) {
    const key = r.channelGroup ?? "Direct";
    const row = map.get(key) ?? { leads: 0, purchases: 0, revenue: 0 };
    row.leads += r._count;
    if (r.status === "WON" || r.status === "PAID") {
      row.purchases += r._count;
      row.revenue += r._sum.value ?? 0;
    }
    map.set(key, row);
  }
  return Array.from(map.entries())
    .map(([channelGroup, v]) => ({ channelGroup, ...v }))
    .sort((a, b) => b.leads - a.leads);
}

/** LINE lifecycle funnel counts: friends / engaged (messaged) / blocked. */
export async function getLineLifecycle(projectId: string) {
  // Was 3 counts over the same table. One grouped read gives all three: `_all` per
  // friendStatus covers friends/blocked, and the non-null `lastMessageAt` count summed
  // across every group is the old unfiltered "has messaged us" count.
  const rows = await prisma.lineUser.groupBy({
    by: ["friendStatus"],
    where: { projectId },
    _count: { _all: true, lastMessageAt: true },
  });
  const totalFor = (s: string) => rows.find((r) => r.friendStatus === s)?._count._all ?? 0;
  return {
    friends: totalFor("FRIEND"),
    engaged: rows.reduce((n, r) => n + r._count.lastMessageAt, 0),
    blocked: totalFor("BLOCKED"),
  };
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

  // Was 7 queries: 2 over adClick and 5 over lead, one per cumulative funnel stage.
  // Both tables are now read once, grouped, and the cumulative stages are derived here
  // — a lead in WON counts toward contacted/qualified/quoted/purchases exactly as before.
  // adClick uses a field-level count: `_all` is every click, `lineClickedAt` counts only
  // the rows where that column is non-null, i.e. the old `{ not: null }` filter.
  const [clickRows, leadRows] = await Promise.all([
    prisma.adClick.groupBy({
      by: ["channelGroup"],
      where: { projectId, ...inRange },
      _count: { _all: true, lineClickedAt: true },
    }),
    prisma.lead.groupBy({
      by: ["channelGroup", "status"],
      where: { projectId, ...inRange },
      _count: true,
      _sum: { value: true },
    }),
  ]);

  type Row = { channel: string; visits: number; btnClicks: number; leads: number; contacted: number; qualified: number; quoted: number; purchases: number; revenue: number };
  const map = new Map<string, Row>();
  const row = (ch: string | null) => {
    const key = ch ?? "Direct";
    if (!map.has(key)) map.set(key, { channel: key, visits: 0, btnClicks: 0, leads: 0, contacted: 0, qualified: 0, quoted: 0, purchases: 0, revenue: 0 });
    return map.get(key)!;
  };
  for (const c of clickRows) {
    const r = row(c.channelGroup);
    r.visits += c._count._all;
    r.btnClicks += c._count.lineClickedAt;
  }
  for (const l of leadRows) {
    const r = row(l.channelGroup);
    r.leads += l._count;
    if (REACHED_CONTACTED.includes(l.status)) r.contacted += l._count;
    if (REACHED_QUALIFIED.includes(l.status)) r.qualified += l._count;
    if (REACHED_QUOTED.includes(l.status)) r.quoted += l._count;
    if (PURCHASED.includes(l.status)) {
      r.purchases += l._count;
      r.revenue += l._sum.value ?? 0;
    }
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
  // Was 9 queries: 2 adClick counts, 5 lead counts (one per cumulative stage), a
  // lineUser count and a revenue aggregate. adClick and lead are each read once now.
  const [clickAgg, leadRows, blocked] = await Promise.all([
    prisma.adClick.aggregate({
      where: { projectId, ...inRange },
      _count: { _all: true, lineClickedAt: true },
    }),
    prisma.lead.groupBy({
      by: ["status"],
      where: { projectId, ...inRange },
      _count: true,
      _sum: { value: true },
    }),
    prisma.lineUser.count({ where: { projectId, friendStatus: "BLOCKED", ...inRange } }),
  ]);

  const clicks = clickAgg._count._all;
  const lineClicks = clickAgg._count.lineClickedAt;
  const added = sumAll(leadRows);
  const contacted = sumOf(leadRows, REACHED_CONTACTED);
  const qualified = sumOf(leadRows, REACHED_QUALIFIED);
  const quoted = sumOf(leadRows, REACHED_QUOTED);
  const purchased = sumOf(leadRows, PURCHASED);
  const revenue = leadRows.reduce(
    (n, r) => (PURCHASED.includes(r.status) ? n + (r._sum.value ?? 0) : n),
    0
  );

  return {
    stages: [
      // Counts AdClick rows, and embed.js records ONE per browser (it reuses the
      // clickId it stashed in localStorage on every later visit that arrives with no
      // utm/gclid). So a visitor who returns direct ten times is still 1 — which is
      // what we want for attribution, but "เข้าเว็บ/คลิก" read as a visit counter and
      // looked broken. Labelled as unique visitors to match what the number is.
      { key: "click", label: "ผู้เข้าเว็บ (unique)", sub: "Unique visitors", count: clicks },
      { key: "lineclick", label: "กดปุ่ม LINE", sub: "Clicked Add-LINE", count: lineClicks },
      { key: "add", label: "แอด LINE", sub: "Added friend", count: added },
      { key: "contact", label: "ทักแชต", sub: "Messaged", count: contacted },
      { key: "qualified", label: "คุณภาพผ่าน", sub: "Qualified", count: qualified },
      { key: "quote", label: "เสนอราคา", sub: "Quoted", count: quoted },
      { key: "purchase", label: "ปิดการขาย", sub: "Won / Paid", count: purchased },
    ],
    blocked,
    revenue,
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
  // Was 6 counts (3 lead + 3 conversionEvent); now one grouped read per table.
  const [leadRows, eventRows] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where: { projectId }, _count: true }),
    prisma.conversionEvent.groupBy({ by: ["status"], where: { projectId }, _count: true }),
  ]);
  return {
    totalLeads: sumAll(leadRows),
    qualifiedLeads: sumOf(leadRows, ["QUALIFIED"]),
    purchases: sumOf(leadRows, PURCHASED),
    sent: sumOf(eventRows, ["SENT"]),
    failed: sumOf(eventRows, ["FAILED"]),
    pending: sumOf(eventRows, ["PENDING"]),
  };
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

  // One grouped read per window (was 3: a count, a filtered count and a sum over the
  // very same rows). Leads/purchases/revenue all fall out of the status buckets.
  const metrics = async (from: Date, to: Date) => {
    const rows = await prisma.lead.groupBy({
      by: ["status"],
      where: { projectId, createdAt: { gte: from, lt: to } },
      _count: true,
      _sum: { value: true },
    });
    return {
      leads: sumAll(rows),
      purchases: sumOf(rows, PURCHASED),
      revenue: rows.reduce((n, r) => (PURCHASED.includes(r.status) ? n + (r._sum.value ?? 0) : n), 0),
    };
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
