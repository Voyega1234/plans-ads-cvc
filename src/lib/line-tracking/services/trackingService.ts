import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { TrackingPlatform } from "@/lib/line-tracking/enums";
import type { AdClick } from "@prisma/client";
import { classifyChannel } from "./channelService";

export function getTrackingBaseUrl(): string {
  // Tracking links / embed must point at the PUBLIC production domain (where the embed
  // runs), never localhost. Priority: explicit env → Vercel deployment URL → localhost.
  const explicit = process.env.TRACKING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "http://localhost:3010";
}

/** Build the three default platform tracking links + allow custom. */
export function buildTrackingUrl(platform: TrackingPlatform, slug: string): string {
  const base = `${getTrackingBaseUrl()}/t/${slug}`;
  switch (platform) {
    case "GOOGLE":
      return `${base}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}&gclid={gclid}`;
    case "META":
      return `${base}?utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&fbclid={{fbclid}}`;
    case "TIKTOK":
      return `${base}?utm_source=tiktok&utm_medium=paid_social&utm_campaign=__CAMPAIGN_NAME__&utm_content=__CID_NAME__&ttclid=__CLICKID__`;
    default:
      return base;
  }
}

/** Tracking-link templates for EVERY channel (paid + organic + manual). */
export function allChannelTemplates(slug: string): { key: string; label: string; url: string }[] {
  const base = `${getTrackingBaseUrl()}/t/${slug}`;
  return [
    { key: "GOOGLE", label: "Google Ads", url: buildTrackingUrl("GOOGLE", slug) },
    { key: "META", label: "Meta (FB/IG)", url: buildTrackingUrl("META", slug) },
    { key: "TIKTOK", label: "TikTok Ads", url: buildTrackingUrl("TIKTOK", slug) },
    { key: "LINE_ADS", label: "LINE Ads", url: `${base}?utm_source=line&utm_medium=paid_social&utm_campaign={campaign}&ldtag_cl={ldtag_cl}` },
    { key: "MICROSOFT", label: "Microsoft / Bing", url: `${base}?utm_source=bing&utm_medium=cpc&utm_campaign={CampaignId}&utm_term={keyword}&msclkid={msclkid}` },
    { key: "X", label: "X (Twitter) Ads", url: `${base}?utm_source=twitter&utm_medium=paid_social&utm_campaign={campaign}&twclid={twclid}` },
    { key: "SNAPCHAT", label: "Snapchat Ads", url: `${base}?utm_source=snapchat&utm_medium=paid_social&utm_campaign={campaign}&ScCid={ScCid}` },
    { key: "YOUTUBE", label: "YouTube", url: `${base}?utm_source=youtube&utm_medium=video&utm_campaign={campaign}&gclid={gclid}` },
    { key: "EMAIL", label: "อีเมล / Newsletter", url: `${base}?utm_source=email&utm_medium=email&utm_campaign={campaign}` },
    { key: "ORGANIC", label: "Organic / โพสต์ทั่วไป", url: `${base}?utm_source=organic&utm_medium=social&utm_campaign={campaign}` },
  ];
}

/**
 * Direct "capture + redirect to LINE" link (no landing page). Same params as the
 * landing link but via /go/ — for Facebook posts, bio links, one-tap Add LINE.
 */
export function buildDirectUrl(platform: TrackingPlatform, slug: string): string {
  return buildTrackingUrl(platform, slug).replace(`/t/${slug}`, `/go/${slug}`);
}

/** A simple direct link for organic Facebook posts (source=facebook / social). */
export function buildFacebookPostUrl(slug: string): string {
  return `${getTrackingBaseUrl()}/go/${slug}?utm_source=facebook&utm_medium=social&utm_campaign=post`;
}

/** Ensure the three default platform tracking links exist for a project. */
export async function ensureDefaultTrackingLinks(projectId: string, slug: string) {
  const defaults: { platform: TrackingPlatform; name: string }[] = [
    { platform: "GOOGLE", name: "Google Ads (default)" },
    { platform: "META", name: "Meta Ads (default)" },
    { platform: "TIKTOK", name: "TikTok Ads (default)" },
  ];
  for (const d of defaults) {
    const exists = await prisma.trackingLink.findFirst({
      where: { projectId, platform: d.platform, name: d.name },
    });
    if (!exists) {
      await prisma.trackingLink.create({
        data: {
          projectId,
          platform: d.platform,
          name: d.name,
          url: buildTrackingUrl(d.platform, slug),
        },
      });
    }
  }
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export interface CapturedParams {
  source?: string;
  medium?: string;
  campaign?: string;
  adset?: string;
  content?: string;
  keyword?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  twclid?: string;
  scclid?: string;
  gaClientId?: string;
  landingUrl?: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Record an ad click for a project. Generates a unique clickId and stores all
 * captured UTM + click identifiers. IP is hashed (never stored raw).
 */
export async function recordAdClick(
  projectId: string,
  params: CapturedParams
): Promise<AdClick> {
  const clickId = `clk_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const { channel, channelGroup } = classifyChannel({
    source: params.source,
    medium: params.medium,
    gclid: params.gclid,
    fbclid: params.fbclid,
    ttclid: params.ttclid,
    msclkid: params.msclkid,
    twclid: params.twclid,
    scclid: params.scclid,
    referrer: params.referrer,
  });
  return prisma.adClick.create({
    data: {
      projectId,
      clickId,
      source: params.source,
      medium: params.medium,
      campaign: params.campaign,
      adset: params.adset,
      content: params.content,
      keyword: params.keyword,
      gclid: params.gclid,
      fbclid: params.fbclid,
      ttclid: params.ttclid,
      msclkid: params.msclkid,
      twclid: params.twclid,
      scclid: params.scclid,
      gaClientId: params.gaClientId,
      channel,
      channelGroup,
      landingUrl: params.landingUrl,
      referrer: params.referrer,
      userAgent: params.userAgent,
      ipHash: hashIp(params.ip ?? null),
    },
  });
}

/** Extract captured params from a URLSearchParams (tracking page query). */
export function extractParams(sp: URLSearchParams): CapturedParams {
  const g = (k: string) => sp.get(k) ?? undefined;
  return {
    source: g("utm_source"),
    medium: g("utm_medium"),
    campaign: g("utm_campaign"),
    adset: g("utm_adset"),
    content: g("utm_content"),
    keyword: g("utm_term") ?? g("keyword"),
    gclid: g("gclid"),
    fbclid: g("fbclid"),
    ttclid: g("ttclid"),
    msclkid: g("msclkid"),
    twclid: g("twclid"),
    scclid: g("scclid") ?? g("sc_click_id"),
    gaClientId: g("ga_client_id") ?? g("_ga"),
  };
}
