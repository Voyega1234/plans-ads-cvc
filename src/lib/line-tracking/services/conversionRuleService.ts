import { prisma } from "@/lib/prisma";
import { LEAD_STATUS } from "@/lib/line-tracking/enums";
import type { LeadStatus } from "@/lib/line-tracking/enums";
import {
  STATUS_ENABLED_DEFAULT,
  defaultPlatformsForStatus,
} from "@/lib/line-tracking/platforms";
import { stringifyJson } from "@/lib/line-tracking/json";

/**
 * Seed default conversion rules for a project. Rules are driven entirely by the
 * platform registry (src/lib/platforms.ts), so every platform is covered.
 * Existing rules are left untouched (upsert update: {}).
 */
export async function seedDefaultRules(projectId: string, defaultValue = 0) {
  for (const status of LEAD_STATUS) {
    await prisma.conversionRule.upsert({
      where: { projectId_leadStatus: { projectId, leadStatus: status } },
      create: {
        projectId,
        leadStatus: status,
        enabled: STATUS_ENABLED_DEFAULT[status],
        platformsJson: stringifyJson(defaultPlatformsForStatus(status)),
        defaultValue,
      },
      update: {},
    });
  }
}

/**
 * Ensure every rule's platformsJson includes any newly-added platforms (fills
 * gaps with registry defaults) without overriding the user's existing toggles.
 */
export async function syncRulePlatforms(projectId: string) {
  const rules = await prisma.conversionRule.findMany({ where: { projectId } });
  for (const rule of rules) {
    const current = JSON.parse(rule.platformsJson || "{}") as Record<
      string,
      { enabled: boolean; eventName: string }
    >;
    const defaults = defaultPlatformsForStatus(rule.leadStatus as LeadStatus);
    let changed = false;
    for (const [pid, def] of Object.entries(defaults)) {
      if (!current[pid]) {
        current[pid] = def;
        changed = true;
      }
    }
    if (changed) {
      await prisma.conversionRule.update({
        where: { id: rule.id },
        data: { platformsJson: stringifyJson(current) },
      });
    }
  }
}

export function getRuleForStatus(projectId: string, leadStatus: LeadStatus) {
  return prisma.conversionRule.findUnique({
    where: { projectId_leadStatus: { projectId, leadStatus } },
  });
}

export function listRules(projectId: string) {
  return prisma.conversionRule.findMany({
    where: { projectId },
    orderBy: { leadStatus: "asc" },
  });
}
