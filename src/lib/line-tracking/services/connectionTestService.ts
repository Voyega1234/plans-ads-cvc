import { prisma } from "@/lib/prisma";
import { isRealMode } from "@/lib/line-tracking/connectors";
import type { ConnectionType } from "@/lib/line-tracking/enums";
import { getEffectiveConfig } from "./connectionStore";
import { testGa4 } from "./ga4Service";
import { getGoogleAccessToken, SHEETS_SCOPE } from "./googleAuth";
import type { SheetConfig, Ga4Config, MetaAdsConfig, LineConfig } from "@/lib/line-tracking/connectors";

export interface TestResult {
  ok: boolean;
  message: string;
  mock: boolean;
}

/**
 * Test a connector. GA4 and Google Sheet run REAL checks when credentials are
 * present. Stub connectors (Google Ads / Meta / TikTok) and LINE validate that
 * required fields are present and report mock-pass.
 */
export async function testConnection(
  projectId: string,
  type: ConnectionType
): Promise<TestResult> {
  const config = await getEffectiveConfig(projectId, type);
  const real = isRealMode(type, config as Record<string, unknown>);
  let result: TestResult;

  switch (type) {
    case "GA4": {
      if (!real) {
        result = { ok: false, mock: true, message: "ยังไม่ได้กรอก Measurement ID / API Secret" };
      } else {
        const r = await testGa4(config as Ga4Config);
        result = { ok: r.ok, mock: false, message: r.message };
      }
      break;
    }
    case "GOOGLE_SHEET": {
      if (!real) {
        result = { ok: false, mock: true, message: "โหมด Mock — ยังไม่ได้ตั้งค่า Service Account / Sheet ID" };
      } else {
        result = await testSheet(config as SheetConfig);
      }
      break;
    }
    case "LINE": {
      const c = config as LineConfig;
      result = c.messagingAccessToken
        ? await testLine(c)
        : { ok: false, mock: false, message: "ยังไม่ได้กรอก Messaging Access Token (จำเป็น) — กรอกแล้วกด Test อีกครั้ง" };
      break;
    }
    case "META_ADS": {
      const c = config as MetaAdsConfig;
      if (c.pixelId && c.accessToken) {
        result = await testMeta(c);
      } else {
        result = { ok: true, mock: true, message: "โหมด Mock — payload พร้อมส่ง แต่ยังไม่ใส่ Pixel ID / Token" };
      }
      break;
    }
    case "TIKTOK_ADS":
    case "LINE_ADS":
    case "MICROSOFT_ADS":
    case "X_ADS":
    case "SNAPCHAT_ADS": {
      // Field-presence check (real API test-event pending). Reports pass only when the
      // required credentials are filled, so the team sees exactly what's still missing.
      result = real
        ? { ok: true, mock: false, message: "ใส่ Credentials ครบ — พร้อมยิง conversion (ยืนยันจริงครั้งแรกที่ส่ง)" }
        : { ok: false, mock: true, message: "ยังใส่ Credentials ไม่ครบ — เช็คช่องที่ต้องกรอกให้ครบ" };
      break;
    }
    default:
      result = { ok: false, mock: true, message: "Unknown connector" };
  }

  await prisma.projectConnection.update({
    where: { projectId_type: { projectId, type } },
    data: {
      lastTestStatus: result.ok ? "PASS" : "FAIL",
      lastTestAt: new Date(),
      lastError: result.ok ? null : result.message,
      // CONNECTED only when real credentials are present; mock/empty = NOT_CONNECTED.
      status: !result.ok ? "ERROR" : real ? "CONNECTED" : "NOT_CONNECTED",
    },
  });

  return result;
}

// REAL LINE test — verifies the Messaging access token against the LINE API
// (GET /v2/bot/info returns the bot profile if the token is valid), then warns about
// any other missing required field. This is the button the team relies on.
async function testLine(config: LineConfig): Promise<TestResult> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${config.messagingAccessToken!.trim()}` },
    });
    const json = (await res.json().catch(() => ({}))) as { basicId?: string; displayName?: string; message?: string };
    if (!res.ok) {
      return { ok: false, mock: false, message: `Access Token ใช้ไม่ได้ (${res.status}) — ${json.message ?? "ตรวจ token ใน LINE Developers → Messaging API"}` };
    }
    const warn: string[] = [];
    if (!config.messagingChannelSecret?.trim()) warn.push("ยังไม่ใส่ Messaging Channel Secret (webhook จะไม่ verify)");
    if (!config.addFriendUrl?.trim()) warn.push("ยังไม่ใส่ Add Friend URL");
    return {
      ok: true, mock: false,
      message: `✓ เชื่อม LINE OA จริงสำเร็จ: ${json.displayName ?? json.basicId ?? "OK"}${warn.length ? " · ⚠️ " + warn.join(" · ") : ""}`,
    };
  } catch (err) {
    return { ok: false, mock: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function testMeta(config: MetaAdsConfig): Promise<TestResult> {
  try {
    // Validate the pixel id + token by reading the pixel node.
    const url = `https://graph.facebook.com/v20.0/${config.pixelId}?access_token=${encodeURIComponent(config.accessToken!)}`;
    const res = await fetch(url);
    const json = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
    if (!res.ok || json.error) {
      return { ok: false, mock: false, message: json.error?.message || `Meta ตอบ ${res.status}` };
    }
    return { ok: true, mock: false, message: `เชื่อม Meta Pixel สำเร็จ: ${json.name ?? config.pixelId}` };
  } catch (err) {
    return { ok: false, mock: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function testSheet(config: SheetConfig): Promise<TestResult> {
  try {
    const token = await getGoogleAccessToken(config.serviceAccountJson!, SHEETS_SCOPE);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}?fields=spreadsheetId,properties.title`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      return { ok: false, mock: false, message: `เข้าถึง Sheet ไม่ได้ (${res.status}) — ตรวจสิทธิ์แชร์ให้ service account` };
    }
    const json = (await res.json()) as { properties?: { title?: string } };
    return { ok: true, mock: false, message: `เชื่อมต่อ Sheet สำเร็จ: ${json.properties?.title ?? config.sheetId}` };
  } catch (err) {
    return { ok: false, mock: false, message: err instanceof Error ? err.message : String(err) };
  }
}
