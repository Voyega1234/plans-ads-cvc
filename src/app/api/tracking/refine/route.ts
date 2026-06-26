import { NextRequest, NextResponse } from "next/server";
import { safeCallAI } from "@/lib/ai/provider";
import type { TrackingEvent, TrackingPlan } from "@/lib/tracking-types";
import { EXECUTIVE_GROWTH_SKILL, TRACKING_CONTEXT } from "@/lib/ai/prompts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      clientName: string;
      trackingPlan: TrackingPlan;
      instruction: string;
      imageBase64?: string;
      imageType?: string;
    };
    const { clientName, trackingPlan, instruction, imageBase64, imageType } = body;
    if (!trackingPlan || !instruction) {
      return NextResponse.json({ success: false, error: "trackingPlan and instruction are required" }, { status: 400 });
    }

    const existingEvents = trackingPlan.events.map((e) => e.eventName).join(", ");
    const prompt = `Client: ${clientName}
Website: ${trackingPlan.urlScanned ?? ""}
Tracking Type: ${trackingPlan.trackingType}
Existing events: ${existingEvents}

คำขอเพิ่มเติม: ${instruction}
${imageBase64 ? `[มีรูป screenshot ให้วิเคราะห์ด้วย — type: ${imageType}]` : ""}

กฎการสร้าง event:
- eventName: ใช้ lowercase_underscore เท่านั้น เช่น submit_form, click_cta (GA4 naming convention)
- triggerType: ใช้ได้เฉพาะ "click" | "page_view" | "form_submit" | "custom_event" | "timer"
- destination: ใช้ได้เฉพาะ "GA4" | "GOOGLE_ADS" | "BOTH"
- priority: ใช้ได้เฉพาะ "PRIMARY" | "SECONDARY"
- isKeyEvent: true เฉพาะ event ที่เป็น Conversion หลัก (purchase, lead, sign_up)
- ห้ามตั้งชื่อ event ซ้ำกับที่มีอยู่แล้ว: ${existingEvents}

ตอบเป็น JSON array ของ events ใหม่เท่านั้น:
[{ "eventName": string, "triggerType": string, "triggerRule": string, "destination": string, "priority": string, "ga4Parameters": object, "isKeyEvent": boolean, "notes": string }]
notes format: "selector: X | element: Y | why: Z | test: W"
ตอบเฉพาะ JSON array เท่านั้น`;

    const mockFn = (): TrackingEvent[] => {
      const now = new Date().toISOString();
      const clientId = trackingPlan.clientId;
      return [
        {
          id: `evt_refined_${Date.now()}`,
          clientId,
          eventName: "custom_event",
          triggerType: "click",
          triggerRule: instruction.slice(0, 100),
          destination: "GA4",
          priority: "SECONDARY",
          ga4Parameters: {},
          isKeyEvent: false,
          status: "AI_READY",
          riskLevel: "LOW",
          createdAt: now,
          notes: `selector: ${instruction.slice(0, 30)} | element: Custom element | why: ตามคำขอ | test: ทดสอบเอง`,
        },
      ];
    }

    const VALID_TRIGGER_TYPES: TrackingEvent["triggerType"][] = ["click", "page_view", "form_submit", "custom_event", "timer"]
    const VALID_DESTINATIONS: TrackingEvent["destination"][] = ["GA4", "GOOGLE_ADS", "BOTH"]
    const VALID_PRIORITIES: TrackingEvent["priority"][] = ["PRIMARY", "SECONDARY"]
    const existingEventNames = new Set(trackingPlan.events.map(e => e.eventName.toLowerCase()))

    const validator = (raw: unknown): TrackingEvent[] | null => {
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const now = new Date().toISOString();
      const clientId = trackingPlan.clientId;
      const seenNames = new Set<string>();
      try {
        const results = raw.map((e: Record<string, unknown>, i: number) => {
          const eventName = String(e.eventName ?? "").trim();
          if (!eventName) return null;
          // GA4 requires lowercase_underscore — reject non-conforming names
          if (!/^[a-z][a-z0-9_]*$/.test(eventName)) return null;
          // Reject duplicates within this batch
          if (seenNames.has(eventName.toLowerCase())) return null;
          seenNames.add(eventName.toLowerCase());

          const triggerType = VALID_TRIGGER_TYPES.includes(e.triggerType as TrackingEvent["triggerType"])
            ? (e.triggerType as TrackingEvent["triggerType"])
            : "custom_event";
          const destination = VALID_DESTINATIONS.includes(e.destination as TrackingEvent["destination"])
            ? (e.destination as TrackingEvent["destination"])
            : "GA4";
          const priority = VALID_PRIORITIES.includes(e.priority as TrackingEvent["priority"])
            ? (e.priority as TrackingEvent["priority"])
            : "SECONDARY";

          const notes = String(e.notes ?? "");
          const hasSelector = notes.includes("selector:") || notes.includes("element:");
          const notesOut = hasSelector ? notes : `selector: ตรวจสอบด้วยตนเอง | element: Custom | why: ตามคำขอ | test: ทดสอบใน Tag Assistant | ${notes}`.trim();
          // Flag potential double-count risk if event already exists in plan
          const isDuplicate = existingEventNames.has(eventName.toLowerCase());

          return {
            id: `evt_refined_${Date.now()}_${i}`,
            clientId,
            eventName,
            triggerType,
            triggerRule: String(e.triggerRule ?? "").trim() || "ตรวจสอบ trigger ใน GTM",
            destination,
            priority,
            ga4Parameters: (e.ga4Parameters as Record<string, string>) ?? {},
            isKeyEvent: Boolean(e.isKeyEvent),
            status: "AI_READY" as const,
            riskLevel: isDuplicate ? ("MEDIUM" as const) : ("LOW" as const),
            notes: notesOut,
            createdAt: now,
          };
        }).filter((e): e is NonNullable<typeof e> => e !== null);

        if (results.length === 0) return null;
        return results;
      } catch {
        return null;
      }
    }

    const data = await safeCallAI(
      prompt,
      validator,
      mockFn,
      {
        systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${TRACKING_CONTEXT}`,
        maxTokens: 65536,
      }
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Refine failed" }, { status: 500 });
  }
}
