import { createHash } from "crypto";
import type { MetaAdsConfig } from "@/lib/line-tracking/connectors";
import type { SendContext, SendResult } from "./senderTypes";

/**
 * Build a Meta Conversions API (CAPI) payload. Uses fbclid → fbc format.
 * No raw PII: we only pass hashed external_id (the pseudonymous LINE user id).
 */
export function buildMetaPayload(config: MetaAdsConfig, ctx: SendContext) {
  const { lead, eventName, value, currency } = ctx;
  const eventTime = Math.floor(Date.now() / 1000);
  const fbc = lead.fbclid ? `fb.1.${eventTime}.${lead.fbclid}` : undefined;
  const externalId = lead.lineUserId
    ? createHash("sha256").update(lead.lineUserId).digest("hex")
    : undefined;

  return {
    pixelId: config.pixelId ?? "MOCK_PIXEL",
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        action_source: "chat",
        event_id: `lead.${lead.id}.${eventName}`,
        user_data: {
          fbc,
          external_id: externalId ? [externalId] : undefined,
        },
        custom_data: {
          currency,
          value,
          order_id: lead.purchaseId || lead.id,
        },
      },
    ],
  };
}

const META_API_VERSION = "v20.0";

/**
 * Send to Meta Conversions API. REAL send when pixelId + accessToken present;
 * otherwise mock. The `data` array is posted; access_token goes as a form field.
 */
export async function sendMeta(
  config: MetaAdsConfig,
  ctx: SendContext
): Promise<SendResult> {
  const request = buildMetaPayload(config, ctx);
  const real = !!(config.pixelId && config.accessToken);

  if (!real) {
    return {
      ok: true,
      mock: true,
      request,
      response: { note: "Meta CAPI mock mode — no credentials", events_received: 1 },
    };
  }

  const url = `https://graph.facebook.com/${META_API_VERSION}/${config.pixelId}/events`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: (request as { data: unknown[] }).data,
        access_token: config.accessToken,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      error?: { message?: string };
    };
    const ok = res.ok && !json.error;
    return {
      ok,
      mock: false,
      request,
      response: { status: res.status, ...json },
      error: ok ? undefined : json.error?.message || `Meta responded ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      mock: false,
      request,
      response: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
