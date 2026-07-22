import { prisma } from "@/lib/prisma";
import { CONNECTOR_META } from "@/lib/line-tracking/connectors";
import { getEffectiveConfig } from "./connectionStore";
import { CONNECTION_TYPES, CONNECTION_LABEL } from "@/lib/line-tracking/enums";
import type { ConnectionType } from "@/lib/line-tracking/enums";

// Which per-lead click id each ad platform needs to attribute a conversion.
const CLICK_ID_FIELD: Partial<Record<ConnectionType, keyof PrismaLeadClickIds>> = {
  MICROSOFT_ADS: "msclkid",
  META_ADS: "fbclid",
  TIKTOK_ADS: "ttclid",
  X_ADS: "twclid",
  SNAPCHAT_ADS: "scclid",
};
type PrismaLeadClickIds = { gclid: string; msclkid: string; fbclid: string; ttclid: string; twclid: string; scclid: string };

// Platforms that HARD-FAIL to send a conversion without the click id (others degrade gracefully).
const HARD_CLICK_ID: ConnectionType[] = ["MICROSOFT_ADS"];

export interface ConnectorReadiness {
  type: ConnectionType;
  label: string;
  ready: boolean;              // all required credentials present
  missingCredentials: string[]; // realKeys not yet filled
  clickIdField: string | null; // which lead click id it uses (null = not click-id based)
  clickIdRequired: boolean;     // true = will hard-fail without it
  leadsWithClickId: number | null; // recent leads that carry the needed click id
  recentLeads: number;          // recent leads total (denominator)
}

/**
 * Per-project readiness report: for every connector, what credentials are still
 * missing, and whether recent leads carry the click id each ad platform needs.
 * Drives the "แจ้งว่าขาดข้อมูลอะไร" panel on the setup page.
 */
export async function getProjectReadiness(projectId: string): Promise<ConnectorReadiness[]> {
  // recent leads (last 90 days) with their click ids — one query, reused per platform
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recent = await prisma.lead.findMany({
    where: { projectId, createdAt: { gte: since } },
    select: { gclid: true, msclkid: true, fbclid: true, ttclid: true, twclid: true, scclid: true },
  });
  const recentLeads = recent.length;

  const out: ConnectorReadiness[] = [];
  for (const type of CONNECTION_TYPES) {
    const meta = CONNECTOR_META[type];
    const config = (await getEffectiveConfig<Record<string, unknown>>(projectId, type)) ?? {};
    const missingCredentials = meta.realKeys.filter((k) => {
      const v = config[k];
      return v === undefined || v === null || v === "";
    });
    const clickIdField = CLICK_ID_FIELD[type] ?? null;
    const leadsWithClickId = clickIdField
      ? recent.filter((l) => !!l[clickIdField]).length
      : null;

    out.push({
      type,
      label: CONNECTION_LABEL[type],
      ready: missingCredentials.length === 0,
      missingCredentials,
      clickIdField: clickIdField as string | null,
      clickIdRequired: HARD_CLICK_ID.includes(type),
      leadsWithClickId,
      recentLeads,
    });
  }
  return out;
}
