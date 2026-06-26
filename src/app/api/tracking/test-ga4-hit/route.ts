import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { measurementId: string; clientId?: string };
    const { measurementId, clientId } = body;

    if (!measurementId) {
      return NextResponse.json({ success: false, message: "measurementId is required" }, { status: 400 });
    }

    const apiSecret = process.env.GOOGLE_ANALYTICS_API_SECRET;
    if (!apiSecret) {
      return NextResponse.json({
        success: false,
        message: "ต้องตั้งค่า GOOGLE_ANALYTICS_API_SECRET ใน environment variables ก่อน — ดู GA4 Admin → Data Streams → Measurement Protocol API secrets",
      });
    }

    const cid = clientId ?? `test_${Date.now()}.${Math.floor(Math.random() * 1000000)}`;

    const payload = {
      client_id: cid,
      events: [
        {
          name: "page_view",
          params: {
            page_title: "Tracking Setup Test",
            page_location: "https://tracking-setup-test.local",
            engagement_time_msec: 100,
          },
        },
      ],
    };

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok || res.status === 204) {
      return NextResponse.json({
        success: true,
        message: `Test hit ส่งไปที่ ${measurementId} แล้ว — ตรวจสอบใน GA4 DebugView ภายใน 30 วินาที`,
        clientId: cid,
      });
    }

    return NextResponse.json({
      success: false,
      message: `GA4 API ตอบ HTTP ${res.status} — ตรวจสอบ measurementId และ API secret ว่าถูกต้อง`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Test GA4 hit failed" },
      { status: 500 }
    );
  }
}
