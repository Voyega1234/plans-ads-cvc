import { NextRequest, NextResponse } from "next/server";
import { generateGtmWorkspace } from "@/lib/ai/tracking-service";
import type { TrackingPlan } from "@/lib/tracking-types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      clientName: string;
      trackingPlan: TrackingPlan;
      existingGtmId?: string;
    };
    const { clientName, trackingPlan, existingGtmId } = body;
    if (!clientName || !trackingPlan) {
      return NextResponse.json({ success: false, error: "clientName and trackingPlan are required" }, { status: 400 });
    }
    const data = await generateGtmWorkspace({ clientName, trackingPlan, existingGtmId });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Generate GTM workspace failed" }, { status: 500 });
  }
}
