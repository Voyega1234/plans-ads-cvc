// Platform registry — single source of truth for every conversion destination.
// Add a new ad platform here (id + connectionType + sender + default events) and
// it flows through rules, queue, UI and seed automatically — no schema change.

import type { ConnectionType, LeadStatus } from "./enums";
import type { SendContext, SendResult } from "./services/senderTypes";
import { sendGa4 } from "./services/ga4Service";
import { sendMeta } from "./services/metaAdsService";
import { sendTiktok } from "./services/tiktokAdsService";
import { sendLineAds } from "./services/lineAdsService";
import { sendMicrosoft } from "./services/microsoftAdsService";
import { sendX } from "./services/xAdsService";
import { sendSnapchat } from "./services/snapchatAdsService";

export type PlatformId =
  | "ga4"
  | "meta"
  | "tiktok"
  | "line_ads"
  | "microsoft"
  | "x"
  | "snapchat";

export interface PlatformDef {
  id: PlatformId;
  label: string;
  connectionType: ConnectionType; // which ProjectConnection supplies its creds
  realImplemented: boolean;
  send: (config: Record<string, unknown>, ctx: SendContext) => Promise<SendResult>;
  /** GA4-style event name for each lead status. */
  events: Partial<Record<LeadStatus, string>>;
  /** Statuses where this platform is toggled ON by default when seeding. */
  defaultOn: LeadStatus[];
  /** Event name sent when a user BLOCKS the LINE OA (unfollow) — lets you measure
   *  which campaign/channel drives blocks. Omit for platforms where it doesn't apply. */
  blockEvent?: string;
}

const ADS_DEFAULT_ON: LeadStatus[] = ["QUALIFIED", "WON", "PAID"];
const GA4_DEFAULT_ON: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "PAID"];

// Cast helpers: senders take their own config types; registry stores generic.
type AnySend = (config: never, ctx: SendContext) => Promise<SendResult>;
const s = (fn: AnySend) => fn as unknown as PlatformDef["send"];

export const PLATFORMS: PlatformDef[] = [
  {
    id: "ga4",
    label: "GA4",
    connectionType: "GA4",
    realImplemented: true,
    send: s(sendGa4 as AnySend),
    events: { NEW: "generate_lead", CONTACTED: "contact", QUALIFIED: "qualified_lead", QUOTED: "quote_sent", WON: "deal_won", PAID: "purchase" },
    blockEvent: "line_block",
    defaultOn: GA4_DEFAULT_ON,
  },
  {
    id: "meta",
    label: "Meta Ads",
    connectionType: "META_ADS",
    realImplemented: true,
    send: s(sendMeta as AnySend),
    events: { NEW: "Lead", CONTACTED: "Contact", QUALIFIED: "Lead", QUOTED: "SubmitApplication", WON: "Purchase", PAID: "Purchase" },
    blockEvent: "line_block",
    defaultOn: ADS_DEFAULT_ON,
  },
  {
    id: "tiktok",
    label: "TikTok Ads",
    connectionType: "TIKTOK_ADS",
    realImplemented: true,
    send: s(sendTiktok as AnySend),
    events: { NEW: "SubmitForm", CONTACTED: "Contact", QUALIFIED: "CompleteRegistration", QUOTED: "Consult", WON: "CompletePayment", PAID: "CompletePayment" },
    blockEvent: "line_block",
    defaultOn: ADS_DEFAULT_ON,
  },
  {
    id: "line_ads",
    label: "LINE Ads",
    connectionType: "LINE_ADS",
    realImplemented: true,
    send: s(sendLineAds as AnySend),
    events: { NEW: "add_friend", CONTACTED: "message", QUALIFIED: "qualified", QUOTED: "quote", WON: "conversion", PAID: "conversion" },
    blockEvent: "line_block",
    defaultOn: ADS_DEFAULT_ON,
  },
  {
    id: "microsoft",
    label: "Microsoft Ads",
    connectionType: "MICROSOFT_ADS",
    realImplemented: true,
    send: s(sendMicrosoft as AnySend),
    events: { NEW: "Lead", CONTACTED: "Contact", QUALIFIED: "QualifiedLead", QUOTED: "QuoteSent", WON: "Purchase", PAID: "Purchase" },
    blockEvent: "line_block",
    defaultOn: ADS_DEFAULT_ON,
  },
  {
    id: "x",
    label: "X Ads",
    connectionType: "X_ADS",
    realImplemented: true,
    send: s(sendX as AnySend),
    events: { NEW: "Lead", CONTACTED: "Contact", QUALIFIED: "QualifiedLead", QUOTED: "Quote", WON: "Purchase", PAID: "Purchase" },
    blockEvent: "line_block",
    defaultOn: ADS_DEFAULT_ON,
  },
  {
    id: "snapchat",
    label: "Snapchat Ads",
    connectionType: "SNAPCHAT_ADS",
    realImplemented: true,
    send: s(sendSnapchat as AnySend),
    events: { NEW: "SIGN_UP", CONTACTED: "CONTACT", QUALIFIED: "SIGN_UP", QUOTED: "SUBMIT_APPLICATION", WON: "PURCHASE", PAID: "PURCHASE" },
    blockEvent: "line_block",
    defaultOn: ADS_DEFAULT_ON,
  },
];

/**
 * Standard events per platform — options for the Conversion Mapping event
 * selector. GA4/Meta/TikTok/Snapchat lists follow each platform's official
 * standard-event names; LINE Ads / Microsoft / X conversions are account-defined
 * so these are sensible defaults. Custom names are always allowed via the
 * free-text override next to the selector.
 */
export const PLATFORM_STANDARD_EVENTS: Record<PlatformId, string[]> = {
  ga4: ["generate_lead", "contact", "qualified_lead", "working_lead", "quote_sent", "close_convert_lead", "purchase", "sign_up", "begin_checkout", "add_to_cart", "add_payment_info", "refund", "line_block"],
  meta: ["Lead", "Contact", "Purchase", "CompleteRegistration", "SubmitApplication", "Schedule", "StartTrial", "Subscribe", "InitiateCheckout", "AddToCart", "AddPaymentInfo", "ViewContent", "Search", "line_block"],
  tiktok: ["SubmitForm", "Contact", "CompleteRegistration", "CompletePayment", "PlaceAnOrder", "InitiateCheckout", "AddToCart", "AddPaymentInfo", "ViewContent", "ClickButton", "Subscribe", "Download", "Search", "line_block"],
  line_ads: ["add_friend", "message", "qualified", "quote", "conversion", "purchase", "line_block"],
  microsoft: ["Lead", "Contact", "QualifiedLead", "QuoteSent", "Purchase", "SignUp", "line_block"],
  x: ["Lead", "Contact", "QualifiedLead", "Quote", "Purchase", "SignUp", "line_block"],
  snapchat: ["SIGN_UP", "CONTACT", "SUBMIT_APPLICATION", "PURCHASE", "START_CHECKOUT", "ADD_CART", "VIEW_CONTENT", "SUBSCRIBE", "LOGIN", "SEARCH", "START_TRIAL", "line_block"],
};

export const PLATFORM_BY_ID: Record<string, PlatformDef> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p])
);

export function getPlatform(id: string): PlatformDef | undefined {
  return PLATFORM_BY_ID[id];
}

export function platformLabel(id: string): string {
  return PLATFORM_BY_ID[id]?.label ?? id;
}

/**
 * What data each platform's payload actually contains — shown in the setup
 * wizard so users know exactly what's sent. NO personal data (name/phone/email)
 * is ever sent; only click ids, hashed pseudonymous ids, and conversion values.
 */
export const PLATFORM_DATA_SENT: Record<PlatformId, string[]> = {
  ga4: ["client_id (GA client id / lead id)", "user_id (LINE id)", "value + currency", "transaction_id (ตอน purchase/paid)", "source, campaign, keyword", "project_id, lead_id"],
  meta: ["fbc (จาก fbclid)", "external_id (LINE id เข้ารหัส SHA-256)", "value + currency", "order_id"],
  tiktok: ["ttclid", "external_id (เข้ารหัส SHA-256)", "value + currency", "order_id"],
  line_ads: ["line_user_id", "value + currency", "order_id"],
  microsoft: ["msclkid", "conversion value + currency", "conversion time"],
  x: ["twclid", "external_id (เข้ารหัส SHA-256)", "value + currency", "conversion id"],
  snapchat: ["sc_click_id (scclid)", "external_id (เข้ารหัส SHA-256)", "value + currency", "order_id"],
};

// ---- Rule shape (stored as JSON on ConversionRule.platformsJson) -----------

export interface PlatformRule {
  enabled: boolean;
  eventName: string;
}
export type PlatformsConfig = Record<string, PlatformRule>;

/** Master on/off default per status (whole rule). */
export const STATUS_ENABLED_DEFAULT: Record<LeadStatus, boolean> = {
  NEW: true,
  CONTACTED: true,
  QUALIFIED: true,
  QUOTED: false,
  WON: true,
  PAID: true,
  LOST: false,
};

/** Build the default per-platform config for a given lead status. */
export function defaultPlatformsForStatus(status: LeadStatus): PlatformsConfig {
  const cfg: PlatformsConfig = {};
  for (const p of PLATFORMS) {
    const eventName = p.events[status];
    if (!eventName) continue; // LOST has no events
    cfg[p.id] = { enabled: p.defaultOn.includes(status), eventName };
  }
  return cfg;
}
