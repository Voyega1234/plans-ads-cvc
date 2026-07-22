import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stringifyJson } from "@/lib/line-tracking/json";
import { upsertLineUser, verifyLineSignature, fetchLineProfile, downloadLineContent } from "@/lib/line-tracking/services/lineService";
import { upsertLeadFromClick, changeLeadStatus } from "@/lib/line-tracking/services/leadService";
import { processQueue, enqueueBlockConversion } from "@/lib/line-tracking/services/conversionQueueService";
import { ocrSlip } from "@/lib/line-tracking/services/ocrService";
import { getConnectionConfig } from "@/lib/line-tracking/services/connectionStore";
import type { LineConfig } from "@/lib/line-tracking/connectors";

/**
 * LINE Messaging webhook endpoint (per project).
 * MVP: stores the raw event, links/creates a LINE user + Lead when a userId is
 * present. TODO(security): verify the X-Line-Signature HMAC with the channel
 * secret before trusting the payload.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Read the RAW body first — required for signature verification.
  const rawBody = await req.text();

  // Verify X-Line-Signature when a Messaging channel secret is configured.
  const lineConfig = await getConnectionConfig<LineConfig>(project.id, "LINE");
  if (lineConfig.messagingChannelSecret) {
    const valid = verifyLineSignature(
      lineConfig.messagingChannelSecret,
      rawBody,
      req.headers.get("x-line-signature")
    );
    if (!valid) {
      await prisma.webhookLog.create({
        data: {
          projectId: project.id,
          source: "LINE",
          payload: stringifyJson({ note: "signature rejected" }),
          status: "REJECTED",
          errorMessage: "Invalid X-Line-Signature",
        },
      });
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }
  // else: no secret set (local/dev) — accept without verification.

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }

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
      if (isMessage && event.message?.type === "image" && event.message.id && lineConfig.messagingAccessToken) {
        const img = await downloadLineContent(lineConfig.messagingAccessToken, event.message.id);
        if (img) {
          const ocr = await ocrSlip(img);
          if (ocr.ok) {
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
            if (Object.keys(data).length) {
              await prisma.lead.update({ where: { id: lead.id }, data });
              await prisma.leadStatusHistory.create({
                data: {
                  leadId: lead.id, newStatus: lead.status, changedBy: "OCR (Vision)",
                  note: `📎 ได้รับสลิป — อ่านให้อัตโนมัติ: ${notes.join(" · ")} (เซลส์ตรวจสอบก่อนกด PAID)`,
                },
              });
            }
          }
        }
      }
      processed++;
    }

    // Flush the queue so generate_lead / contact are sent right away.
    await processQueue({ projectId: project.id });

    await prisma.webhookLog.create({
      data: {
        projectId: project.id,
        source: "LINE",
        payload: stringifyJson(body),
        status: "SUCCESS",
      },
    });

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    await prisma.webhookLog.create({
      data: {
        projectId: project.id,
        source: "LINE",
        payload: stringifyJson(body),
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

interface LineEvent {
  type?: string;
  source?: { userId?: string };
  message?: { type?: string; id?: string; text?: string };
}
