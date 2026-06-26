import { NextRequest, NextResponse } from "next/server";
import { scanUrl } from "@/lib/url-scanner";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url: string };
    if (!url) return NextResponse.json({ success: false, error: "url is required" }, { status: 400 });
    const data = await scanUrl(url);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Scan failed" }, { status: 500 });
  }
}
