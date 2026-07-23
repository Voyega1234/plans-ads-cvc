import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import type { LineConfig } from "@/lib/line-tracking/connectors";
import type { LineUser } from "@prisma/client";

export interface LineState {
  projectSlug: string;
  clickId: string | null;
}

/** Decode the base64url state param produced by buildLineLoginUrl. */
export function decodeLineState(state: string | null): LineState | null {
  if (!state) return null;
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as LineState;
  } catch {
    return null;
  }
}

export interface LineProfile {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
}

/**
 * Exchange a LINE Login authorization code for the user's profile.
 * Real call to LINE OAuth token + verify endpoints. Throws on failure.
 */
export async function exchangeCodeForProfile(
  config: LineConfig,
  params: { code: string; redirectUri: string }
): Promise<LineProfile> {
  if (!config.loginChannelId || !config.loginChannelSecret) {
    throw new Error("LINE Login channel ยังไม่ได้ตั้งค่า (ต้องมี Channel ID + Secret)");
  }

  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: config.loginChannelId,
      client_secret: config.loginChannelSecret,
    }),
  });
  if (!tokenRes.ok) throw new Error(`LINE token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("No access_token from LINE");

  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) throw new Error(`LINE profile fetch failed (${profileRes.status})`);
  const profile = (await profileRes.json()) as {
    userId: string;
    displayName?: string;
    pictureUrl?: string;
  };
  return profile;
}

/**
 * Fetch a LINE user's profile (displayName + picture) via the Messaging API.
 * Used to enrich webhook-created leads (the follow event only carries userId).
 * Returns null on any failure — never blocks lead creation.
 */
export async function fetchLineProfile(
  accessToken: string,
  userId: string
): Promise<{ displayName?: string; pictureUrl?: string } | null> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { displayName?: string; pictureUrl?: string };
    return { displayName: j.displayName, pictureUrl: j.pictureUrl };
  } catch {
    return null;
  }
}

/**
 * Download the binary content of a LINE message (e.g. an image/slip) via the
 * Messaging API. Returns null on failure.
 */
export async function downloadLineContent(
  accessToken: string,
  messageId: string
): Promise<Buffer | null> {
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Verify a LINE Messaging webhook signature (X-Line-Signature) against the
 * channel secret. Pass the RAW request body (string) exactly as received.
 */
export function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Build a real LINE Login authorize URL when Login channel is configured.
 * `state` carries projectSlug + click_id so the callback can rebuild context.
 * Returns null when not configured (caller falls back to the simulated flow).
 */
export function buildLineLoginUrl(
  config: LineConfig,
  params: { projectSlug: string; clickId?: string; redirectUri: string }
): string | null {
  if (!config.loginChannelId) return null;
  const state = Buffer.from(
    JSON.stringify({ projectSlug: params.projectSlug, clickId: params.clickId ?? null })
  ).toString("base64url");
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.loginChannelId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid");
  // Prompt to add the linked OA as a friend right after login, so sales can chat
  // AND we capture attribution in one step. Ignored if the Login channel isn't
  // linked to the Messaging OA (harmless).
  url.searchParams.set("bot_prompt", "aggressive");
  return url.toString();
}

/**
 * Create or update a LINE user for a project and link it to an ad click.
 */
export async function upsertLineUser(params: {
  projectId: string;
  lineUserId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  clickId?: string | null;
}): Promise<LineUser> {
  const existing = await prisma.lineUser.findUnique({
    where: {
      projectId_lineUserId: {
        projectId: params.projectId,
        lineUserId: params.lineUserId,
      },
    },
  });

  if (existing) {
    return prisma.lineUser.update({
      where: { id: existing.id },
      data: {
        displayName: params.displayName ?? existing.displayName,
        pictureUrl: params.pictureUrl ?? existing.pictureUrl,
        latestClickId: params.clickId ?? existing.latestClickId,
        friendStatus: "FRIEND",
        blockedAt: null, // re-followed → no longer blocked
      },
    });
  }

  return prisma.lineUser.create({
    data: {
      projectId: params.projectId,
      lineUserId: params.lineUserId,
      displayName: params.displayName ?? undefined,
      pictureUrl: params.pictureUrl ?? undefined,
      firstClickId: params.clickId ?? undefined,
      latestClickId: params.clickId ?? undefined,
      friendStatus: "FRIEND",
    },
  });
}

/**
 * Is the fake "Simulate LINE Add" flow allowed to run?
 *
 * OFF unless someone explicitly sets ALLOW_MOCK_LINE=true — so production, where
 * nobody sets it, can never produce fake data. This matters more than a normal
 * feature flag because one click of that flow writes a Lead into the real
 * database, fires real conversion events to GA4/Ads, and pushes a row into the
 * client's Google Sheet. Treat turning this on as a dev-machine-only action.
 */
export function isMockLineEnabled(): boolean {
  return process.env.ALLOW_MOCK_LINE === "true";
}

/** Generate a fake LINE userId for the MVP mock Add-friend flow. */
export function generateMockLineUserId(): string {
  return `Umock${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

const MOCK_NAMES = [
  "คุณสมชาย",
  "คุณมนัสนันท์",
  "คุณพิมพ์ชนก",
  "Khun Alex",
  "คุณธนกร",
  "คุณศิริพร",
];

export function randomMockDisplayName(): string {
  return MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
}
