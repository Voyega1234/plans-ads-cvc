/**
 * ONE-TIME: back up and delete ALL Line Tracking projects, to start fresh.
 *
 *   node scripts/lt-purge-projects.mjs              # DRY RUN — shows what would go, deletes nothing
 *   node scripts/lt-purge-projects.mjs --confirm    # writes the backup, then deletes
 *
 * SCOPE — this touches the Line Tracking tables ONLY.
 * It deletes rows from `lt_project`; Postgres cascades that into the 11 lt_* tables
 * that hang off a project (connections, tracking links, ad clicks, LINE users, leads,
 * conversion rules, conversion events, sheet sync logs, webhook logs, short links,
 * client access). Nothing outside Line Tracking is read or written: media plans,
 * campaign blueprints, clients, creatives and every other MercyOS table are untouched,
 * and so is the LtWorkspace/agency row itself (new projects still attach to it).
 *
 * THIS CANNOT BE UNDONE. The backup JSON is your only copy afterwards.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const CONFIRM = process.argv.includes('--confirm');
const prisma = new PrismaClient();

const projects = await prisma.project.findMany({
  orderBy: { createdAt: 'asc' },
  select: {
    id: true, name: true, clientName: true, slug: true, status: true,
    businessType: true, websiteUrl: true, currency: true, timezone: true,
    defaultConversionValue: true, mainSalesChannel: true, createdAt: true,
  },
});

if (projects.length === 0) {
  console.log('No Line Tracking projects found — nothing to do.');
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Line Tracking projects found: ${projects.length}\n`);
let totals = { leads: 0, clicks: 0, lineUsers: 0, events: 0, links: 0, shortLinks: 0 };

for (const p of projects) {
  const [leads, clicks, lineUsers, events, links, shortLinks] = await Promise.all([
    prisma.lead.count({ where: { projectId: p.id } }),
    prisma.adClick.count({ where: { projectId: p.id } }),
    prisma.lineUser.count({ where: { projectId: p.id } }),
    prisma.conversionEvent.count({ where: { projectId: p.id } }),
    prisma.trackingLink.count({ where: { projectId: p.id } }),
    prisma.shortLink.count({ where: { projectId: p.id } }),
  ]);
  totals = {
    leads: totals.leads + leads, clicks: totals.clicks + clicks,
    lineUsers: totals.lineUsers + lineUsers, events: totals.events + events,
    links: totals.links + links, shortLinks: totals.shortLinks + shortLinks,
  };
  p._counts = { leads, clicks, lineUsers, events, links, shortLinks };
  console.log(
    `  ${p.status.padEnd(8)} ${p.slug.padEnd(28)} leads:${String(leads).padStart(5)}  clicks:${String(clicks).padStart(6)}  line:${String(lineUsers).padStart(5)}  (${p.name} / ${p.clientName})`
  );
}

console.log('\nTOTAL to be deleted:');
console.log(`  projects:${projects.length}  leads:${totals.leads}  clicks:${totals.clicks}  lineUsers:${totals.lineUsers}  conversionEvents:${totals.events}  trackingLinks:${totals.links}  shortLinks:${totals.shortLinks}`);

if (!CONFIRM) {
  console.log('\nDRY RUN — nothing was deleted and no backup was written.');
  console.log('Re-run with --confirm to write the backup and delete for real.');
  await prisma.$disconnect();
  process.exit(0);
}

// Full backup BEFORE touching anything. Leads carry personal data, so this file is
// sensitive — keep it somewhere private and delete it once you are sure.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'lt-backup');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `lt-backup-${stamp}.json`);

const backup = { exportedAt: new Date().toISOString(), projects: [] };
for (const p of projects) {
  const [connections, trackingLinks, adClicks, lineUsers, leads, conversionRules, conversionEvents, shortLinks] =
    await Promise.all([
      prisma.projectConnection.findMany({ where: { projectId: p.id } }),
      prisma.trackingLink.findMany({ where: { projectId: p.id } }),
      prisma.adClick.findMany({ where: { projectId: p.id } }),
      prisma.lineUser.findMany({ where: { projectId: p.id } }),
      prisma.lead.findMany({ where: { projectId: p.id } }),
      prisma.conversionRule.findMany({ where: { projectId: p.id } }),
      prisma.conversionEvent.findMany({ where: { projectId: p.id } }),
      prisma.shortLink.findMany({ where: { projectId: p.id } }),
    ]);
  backup.projects.push({
    project: p, connections, trackingLinks, adClicks, lineUsers,
    leads, conversionRules, conversionEvents, shortLinks,
  });
}
fs.writeFileSync(outFile, JSON.stringify(backup, null, 2));
const kb = Math.round(fs.statSync(outFile).size / 1024);
console.log(`\nBackup written: ${outFile} (${kb} KB)`);

if (kb === 0) {
  console.log('Backup looks empty — ABORTING before delete.');
  await prisma.$disconnect();
  process.exit(1);
}

// Delete projects only; the database cascades into the child lt_* tables.
const res = await prisma.project.deleteMany({});
console.log(`Deleted ${res.count} Line Tracking project(s). Cascade removed their child rows.`);

const left = await prisma.project.count();
console.log(`Verification — projects remaining: ${left}`);
await prisma.$disconnect();
