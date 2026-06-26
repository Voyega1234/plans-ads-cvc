import { NextRequest, NextResponse } from "next/server";
import { generateTrackingPlan } from "@/lib/ai/tracking-service";
import type { UrlScanResult } from "@/lib/tracking-types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      clientName: string;
      url: string;
      trackingType: string;
      goal: string;
      urlScanResult: UrlScanResult;
    };
    const { clientName, url, trackingType, goal, urlScanResult } = body;
    if (!clientName || !urlScanResult) {
      return NextResponse.json({ success: false, error: "clientName and urlScanResult are required" }, { status: 400 });
    }
    const data = await generateTrackingPlan({ clientName, url: url ?? urlScanResult.url, trackingType: trackingType ?? "WEB_LEAD", goal: goal ?? "เพิ่ม leads และ conversions", urlScanResult });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Generate plan failed" }, { status: 500 });
  }
}
