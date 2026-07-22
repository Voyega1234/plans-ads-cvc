// Plain-language, click-by-click setup steps per connector — for non-technical users.
// Shown at the top of each ConnectionCard so anyone can follow along.
import type { ConnectionType } from "./enums";

export interface ConnectorGuide {
  intro: string;
  steps: string[];
  link?: { label: string; url: string };
}

export const CONNECTOR_GUIDE: Partial<Record<ConnectionType, ConnectorGuide>> = {
  LINE: {
    intro: "⚠️ ตั้งช่อง “จำเป็น” ให้ครบ ไม่งั้น LINE ไม่ส่ง Lead เข้าระบบ. โหมดโปร่งใส (ลูกค้าไม่เห็นหน้า login) — ใช้แค่ Messaging API channel",
    steps: [
      "เข้า LINE Developers → เลือก Provider ของลูกค้า → เปิด Channel แบบ Messaging API",
      "แท็บ Basic settings → ก็อป “Channel secret” → วางช่อง Messaging Channel Secret (จำเป็น)",
      "แท็บ Messaging API → กด Issue “Channel access token (long-lived)” → วางช่อง Messaging Access Token (จำเป็น) · ก็อป “Bot basic ID” (@xxxx) → วางช่อง LINE OA ID",
      "แท็บ Messaging API → ช่อง Webhook URL → วาง URL ที่ระบบแสดงด้านล่าง แล้วเปิดสวิตช์ “Use webhook” (สำคัญมาก! ถ้าไม่เปิด LINE จะไม่ส่ง Lead เข้าระบบเลย)",
      "ก็อป Add Friend URL (lin.ee/...) จาก LINE OA Manager → วางช่อง Add Friend URL (จำเป็น)",
      "กด Save → Test Connection ให้ขึ้น PASS",
      "(ไม่บังคับ) ถ้าอยาก attribution แม่นระดับคลิก 1:1 ค่อยเพิ่ม LINE Login channel ภายหลัง — โหมดปกติไม่ต้องใช้",
    ],
    link: { label: "เปิด LINE Developers", url: "https://developers.line.biz/console/" },
  },
  GA4: {
    intro: "ส่ง Conversion เข้า GA4 (Google Analytics) — ใช้วัดผลโฆษณา",
    steps: [
      "เข้า Google Analytics → เลือก property ของลูกค้า",
      "กด ⚙️ Admin (มุมซ้ายล่าง) → Data streams → เลือก stream ของเว็บ",
      "ก็อป “Measurement ID” (ขึ้นต้น G-) มาวางช่อง Measurement ID",
      "เลื่อนลงหา “Measurement Protocol API secrets” → กด Create → ก็อป “Secret value” มาวางช่อง API Secret",
      "กด Save → Test Connection",
    ],
    link: { label: "เปิด Google Analytics", url: "https://analytics.google.com/" },
  },
  META_ADS: {
    intro: "ส่ง Conversion กลับเข้า Meta (Facebook/Instagram Ads) ผ่าน Conversions API",
    steps: [
      "เข้า Meta Events Manager → เลือก Pixel/Dataset ของลูกค้า",
      "ก็อป “Pixel ID” (เลขชุดยาว) มาวางช่อง Pixel ID",
      "ไปที่ Settings → Conversions API → “Generate access token” → ก็อปมาวางช่อง Access Token",
      "กด Save → Test Connection",
    ],
    link: { label: "เปิด Meta Events Manager", url: "https://business.facebook.com/events_manager2/" },
  },
  TIKTOK_ADS: {
    intro: "ส่ง Conversion กลับเข้า TikTok Ads ผ่าน Events API",
    steps: [
      "เข้า TikTok Ads Manager → Assets → Events → Web Events → เลือก Pixel ของลูกค้า",
      "ก็อป “Pixel ID / Event Set ID” มาวางช่อง Pixel ID",
      "ไปที่ Settings → Events API → “Generate Access Token” → ก็อปมาวางช่อง Access Token",
      "กด Save → Test Connection",
    ],
    link: { label: "เปิด TikTok Ads Manager", url: "https://ads.tiktok.com/" },
  },
  GOOGLE_SHEET: {
    intro: "ซิงก์ Lead ไป-กลับกับ Google Sheet ให้ทีมเซลส์อัปเดตสถานะได้",
    steps: [
      "วาง Service Account JSON (ทีมงานสร้างให้) ในช่องด้านล่าง",
      "ระบบจะแสดงอีเมล Service Account → เปิด Google Sheet → Share → วางอีเมลนั้น (สิทธิ์ Editor)",
      "ก็อป Sheet ID จาก URL (ส่วนระหว่าง /d/ กับ /edit) มาวางช่อง Sheet ID",
      "กด Save → Test Connection",
    ],
  },
};
