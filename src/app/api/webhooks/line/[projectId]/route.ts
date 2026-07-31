import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { stringifyJson } from "@/lib/line-tracking/json";
import { upsertLineUser, verifyLineSignature, fetchLineProfile, downloadLineContent } from "@/lib/line-tracking/services/lineService";
import { upsertLeadFromClick, changeLeadStatus } from "@/lib/line-tracking/services/leadService";
import { processQueue, enqueueBlockConversion } from "@/lib/line-tracking/services/conversionQueueService";
import { ocrSlip } from "@/lib/line-tracking/services/ocrService";
import { getConnectionConfig } from "@/lib/line-tracking/services/connectionStore";
import type { LineConfig } from "@/lib/line-tracking/connectors";
import type { Project } from "@prisma/client";

/**
 * LINE Messaging webhook endpoint (per project).
 * Stores the raw event, links/creates a LINE user + Lead when a userId is present.
 *
 * TIMING: LINE drops the connection if the webhook does not answer within ~1s
 * ("A timeout occurred when sending a webhook event object" on Verify, and
 * silently dropped events in production). So this handler does the bare minimum
 * on the critical path — verify the signature, then ACK 200 immediately — and
 * hands every slow step (profile lookup, lead upsert, OCR, conversion dispatch)
 * to waitUntil(), which keeps the serverless function alive after the response.
 */
/**
 * Version probe. LINE only ever POSTs here, so GET was previously a 405 and there
 * was no way — short of Vercel dashboard access — to tell whether a deployment
 * actually carries the ACK-first handler or the old one that ran everything before
 * responding. Opening this URL in a browser answers that in one second.
 *
 * Deliberately touches nothing: no DB, no config, no projectId lookup — so it
 * leaks nothing and stays fast even if the database is down.
 */
export function GET() {
  return NextResponse.json({
    handler: "line-webhook",
    ack: "immediate + waitUntil",
    version: 2,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // Read the RAW body first — required for signature verification.
  const rawBody = await req.text();

  // Both lookups are keyed by projectId, so they run in parallel — one DB
  // round-trip of latency instead of two before we can answer LINE.
  const [project, lineConfig] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    getConnectionConfig<LineConfig>(projectId, "LINE"),
  ]);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Verify X-Line-Signature. This endpoint is public and creates LINE users and
  // leads, so an unverified payload is an open door for forged leads — refuse
  // rather than accept when there is no secret to check against. A LINE channel
  // cannot be connected without the secret anyway (it is one of the two
  // realKeys), so a project that legitimately receives webhooks always has one.
  if (!lineConfig.messagingChannelSecret) {
    // Log off the critical path — the rejection itself must not wait on a DB write.
    waitUntil(
      logWebhook(project.id, { note: "no channel secret configured" }, "REJECTED",
        "Messaging Channel Secret ยังไม่ได้ตั้งค่า — ไม่สามารถยืนยันว่า webhook มาจาก LINE จริง")
    );
    return NextResponse.json({ error: "webhook not configured" }, { status: 401 });
  }
  const validSignature = verifyLineSignature(
    lineConfig.messagingChannelSecret,
    rawBody,
    req.headers.get("x-line-signature")
  );
  if (!validSignature) {
    waitUntil(
      logWebhook(project.id, { note: "signature rejected" }, "REJECTED", "Invalid X-Line-Signature")
    );
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }

  // Option 2 (relay): the customer already ran a bot on this channel before we
  // took over the (single) webhook slot — pass every verified event through to
  // the bot's original URL so it keeps working. Off the critical path: LINE has
  // its ~1s timeout, the customer's bot can be arbitrarily slow.
  if (lineConfig.webhookMode === "relay" && lineConfig.forwardUrl) {
    waitUntil(
      forwardToClientBot(project.id, lineConfig.forwardUrl, rawBody, {
        signature: req.headers.get("x-line-signature"),
        retryKey: req.headers.get("x-line-retry-key"),
      })
    );
  }

  // ACK now, work later. Everything below this line used to run before the
  // response and is what pushed the handler past LINE's timeout.
  waitUntil(handleEvents(project, lineConfig, body));
  return NextResponse.json({ ok: true });
}

/**
 * Relay the raw event to the customer's original bot (webhookMode "relay").
 * MUST send rawBody byte-for-byte — X-Line-Signature is HMAC-SHA256 over the raw
 * bytes with the channel secret, and the destination bot verifies with that same
 * secret (same channel). Re-serializing the JSON would change the bytes and break
 * verification. We have already ACKed LINE with 200, so LINE will NOT retry on a
 * forward failure — retry here, then surface the failure in WebhookLog so it
 * shows up in the setup page's webhook panel instead of only in Vercel logs.
 */
async function forwardToClientBot(
  projectId: string,
  forwardUrl: string,
  rawBody: string,
  headers: { signature: string | null; retryKey: string | null }
) {
  let target: URL;
  try {
    target = new URL(forwardUrl);
  } catch {
    await logWebhook(projectId, { note: `forward: URL ไม่ถูกต้อง` }, "FAILED",
      `Forward ไม่สำเร็จ — Webhook URL เดิมของลูกค้าไม่ใช่ URL ที่ถูกต้อง (${forwardUrl})`);
    return;
  }
  // Guard 1: https only. Guard 2: never forward into a LINE-hub webhook endpoint
  // (ours or any deployment of this app) — that would loop events back into us.
  if (target.protocol !== "https:" || target.pathname.includes("/api/webhooks/line")) {
    await logWebhook(projectId, { note: "forward: URL ไม่ผ่านเงื่อนไข" }, "FAILED",
      "Forward ไม่สำเร็จ — Webhook เดิมของลูกค้าต้องเป็น https และห้ามชี้กลับมาที่ระบบนี้เอง");
    return;
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(headers.signature ? { "x-line-signature": headers.signature } : {}),
          ...(headers.retryKey ? { "x-line-retry-key": headers.retryKey } : {}),
        },
        body: rawBody,
        redirect: "manual", // a redirect would drop the POST body/signature — treat as failure
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  await logWebhook(projectId, { note: `forward → ${target.origin} ล้มเหลว` }, "FAILED",
    `Forward ไป webhook เดิมของลูกค้าไม่สำเร็จ (${lastError}) — บอทลูกค้าไม่ได้รับ event รอบนี้ (ฝั่ง tracking ของเราได้รับปกติ)`);
}

/** Best-effort webhook audit row — never throws into the request path. */
async function logWebhook(
  projectId: string,
  payload: unknown,
  status: "SUCCESS" | "FAILED" | "REJECTED",
  errorMessage?: string
) {
  try {
    await prisma.webhookLog.create({
      data: {
        projectId,
        source: "LINE",
        payload: stringifyJson(payload),
        status,
        ...(errorMessage ? { errorMessage } : {}),
      },
    });
  } catch {
    // Logging must never break webhook handling.
  }
}

/**
 * Everything that used to run inline before the 200. Runs after the response
 * via waitUntil, so its duration no longer counts against LINE's timeout.
 */
async function handleEvents(project: Project, lineConfig: LineConfig, body: unknown) {
  const events = (body as { events?: LineEvent[] })?.events ?? [];
  let processed = 0;

  try {
    for (const event of events) {
      const lineUserId = event?.source?.userId;
      if (!lineUserId) continue;

      // unfollow / block → mark blocked, keep the lead + history for reporting.
      if (event.type === "unfollow") {
        const lu = await prisma.lineUser.findFirst({
          where: { projectId: project.id, lineUserId },
          include: { leads: { orderBy: { createdAt: "desc" }, take: 1 } },
        });
        await prisma.lineUser.updateMany({
          where: { projectId: project.id, lineUserId },
          data: { friendStatus: "BLOCKED", blockedAt: new Date() },
        });
        // Fire a `line_block` event to GA4 so the full funnel (add→…→block) is
        // visible. Block is a churn signal — GA4 only, not ad platforms.
        const lead = lu?.leads[0];
        if (lead) {
          await prisma.leadStatusHistory.create({
            data: { leadId: lead.id, newStatus: lead.status, changedBy: "LINE", note: "🚫 ลูกค้าบล็อก OA" },
          });
          // Fire a `line_block` conversion to EVERY connected platform that defines a
          // blockEvent (GA4 + Meta/TikTok/LINE Ads/Snapchat) — so you can measure which
          // campaign/channel drives OA blocks, not just see it in GA4.
          await enqueueBlockConversion(lead);
        }
        processed++;
        continue;
      }

      // Enrich with the LINE display name + picture (follow events omit them).
      const profile = lineConfig.messagingAccessToken
        ? await fetchLineProfile(lineConfig.messagingAccessToken, lineUserId)
        : null;

      // follow / message → ensure friend + lead exists.
      const lineUser = await upsertLineUser({
        projectId: project.id,
        lineUserId,
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
      });

      // message = "engaged" layer (customer actually talked to us).
      const isMessage = event.type === "message";
      if (isMessage) {
        await prisma.lineUser.update({
          where: { id: lineUser.id },
          data: { lastMessageAt: new Date() },
        });
      }

      const { lead } = await upsertLeadFromClick({
        projectId: project.id,
        lineUserId: lineUser.id,
        clickId: null,
        displayName: profile?.displayName ?? null,
        defaultValue: project.defaultConversionValue,
        currency: project.currency,
      });

      // First inbound message → bump NEW → CONTACTED, which fires GA4 `contact`.
      if (isMessage && lead.status === "NEW") {
        await changeLeadStatus(lead.id, "CONTACTED", {
          changedBy: "LINE (first message)",
          note: "ลูกค้าทักครั้งแรก",
        });
      }

      // Image message = likely a payment slip → OCR the amount (sales confirms).
      // Split the "is this an image message" check from the "can we actually OCR
      // it" check so every image message logs SOMETHING — previously a missing
      // messageId or access token silently skipped the whole block with zero log
      // output, indistinguishable from OCR never being invoked at all.
      if (isMessage && event.message?.type === "image") {
        if (!event.message.id) {
          console.error("[line-webhook] slip OCR: image message missing message.id", { projectId: project.id });
        } else if (!lineConfig.messagingAccessToken) {
          console.error("[line-webhook] slip OCR: no messagingAccessToken configured for project", { projectId: project.id, messageId: event.message.id });
        } else {
          const img = await downloadLineContent(lineConfig.messagingAccessToken, event.message.id);
          if (!img) {
            console.error("[line-webhook] slip OCR: image download failed", { projectId: project.id, messageId: event.message.id });
          } else {
            const ocr = await ocrSlip(img);
            if (!ocr.ok) {
              console.error("[line-webhook] slip OCR failed:", ocr.error, { projectId: project.id, messageId: event.message.id });
            } else {
              // Auto-fill from the slip — amount + (best-effort) name/phone. Only fill
              // empty fields; sales still confirms everything before marking PAID.
              const data: Record<string, unknown> = {};
              const notes: string[] = [];
              if (ocr.amount) {
                data.slipAmount = ocr.amount; data.slipCheckedAt = new Date(); data.value = ocr.amount;
                notes.push(`ยอด ${ocr.amount.toLocaleString()} ${lead.currency}`);
              }
              if (ocr.phone && !lead.phone) { data.phone = ocr.phone; notes.push(`เบอร์ ${ocr.phone}`); }
              if (ocr.name && !lead.fullName) { data.fullName = ocr.name; notes.push(`ชื่อ ${ocr.name}`); }
              // Soft signal from Gemini only — not a real authenticity check, just
              // an extra flag so sales looks twice before confirming PAID.
              if (ocr.suspicious) {
                notes.push(`⚠️ ต้องตรวจสอบ: ${ocr.suspiciousReason || "ระบบสงสัยว่าอาจเป็นสลิปที่ถูกตัดต่อ/แก้ไข"}`);
                console.error("[line-webhook] slip OCR: suspicious slip flagged", { projectId: project.id, messageId: event.message.id, reason: ocr.suspiciousReason });
              }
              if (Object.keys(data).length) {
                await prisma.lead.update({ where: { id: lead.id }, data });
              }
              if (notes.length) {
                await prisma.leadStatusHistory.create({
                  data: {
                    leadId: lead.id, newStatus: lead.status, changedBy: "OCR (Gemini)",
                    note: `📎 ได้รับสลิป — อ่านให้อัตโนมัติ: ${notes.join(" · ")} (เซลส์ตรวจสอบก่อนกด PAID)`,
                  },
                });
              } else {
                console.error("[line-webhook] slip OCR ok but extracted nothing usable", { projectId: project.id, messageId: event.message.id, text: ocr.text?.slice(0, 300) });
              }
            }
          }
        }
      }
      processed++;
    }

    // Flush the queue so generate_lead / contact are sent right away.
    await processQueue({ projectId: project.id });

    await logWebhook(project.id, body, "SUCCESS");
    return processed;
  } catch (err) {
    await logWebhook(
      project.id,
      body,
      "FAILED",
      err instanceof Error ? err.message : String(err)
    );
    // Already ACKed to LINE — surface in logs + WebhookLog, nothing to return to.
    console.error("[line-webhook] background processing failed:", err);
    return 0;
  }
}

interface LineEvent {
  type?: string;
  source?: { userId?: string };
  message?: { type?: string; id?: string; text?: string };
}
