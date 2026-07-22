// Slip OCR — reads the transfer amount from a payment-slip image so sales don't
// type it. NOT an authenticity check — a human still confirms PAID (OCR can misread /
// slips can be edited).
//
// Provider order:
//  1) Google Cloud Vision via the existing GCP OIDC (no extra key) — used when the
//     Vertex/OIDC env is configured (isVertexConfigured). Requires the Cloud Vision API
//     enabled on the SA's project.
//  2) OCR.space (OCR_SPACE_API_KEY) — fallback when OIDC isn't available (e.g. local).
import { isVertexConfigured, getVertexAccessToken } from "@/lib/ai/vertex-auth";

export interface OcrResult {
  ok: boolean;
  text: string;
  amount: number | null;
  phone?: string | null;   // เบอร์ที่ OCR เดาได้จากสลิป (เซลส์ยืนยัน)
  name?: string | null;    // ชื่อที่ OCR เดาได้ (มีคำนำหน้า) — เซลส์ยืนยัน
  error?: string;
}

/** Thai mobile number from slip text (เซลส์ยืนยันอีกที). */
export function parsePhone(text: string): string | null {
  const m = text.match(/0[689][\d\s-]{8,12}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

/** Conservative Thai-name guess — only when a title prefix is present (avoids bank labels). */
export function parseName(text: string): string | null {
  const m = text.match(/(นางสาว|น\.ส\.|นาย|นาง|คุณ)\s?([ก-๙]{2,}(?:\s[ก-๙]{2,})?)/);
  return m ? `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim() : null;
}

function extractSlip(text: string) {
  return { amount: parseAmount(text), phone: parsePhone(text), name: parseName(text) };
}

/** Pull the most likely transfer amount out of OCR text. */
export function parseAmount(text: string): number | null {
  // Amounts look like 1,234.00 / 1234.00 / 12,000 — numbers with a thousands
  // comma or a 2-decimal. Account numbers (long plain digit runs) are ignored.
  const re = /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})/g;
  const found: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (n > 0 && n < 100_000_000) found.push(n);
  }
  if (!found.length) return null;
  // The transfer amount is typically the largest such number on the slip.
  return Math.max(...found);
}

// Google Cloud Vision (TEXT_DETECTION) via the existing GCP OIDC token — no extra key.
async function ocrVision(image: Buffer): Promise<OcrResult> {
  try {
    const token = await getVertexAccessToken();
    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: image.toString("base64") },
          features: [{ type: "TEXT_DETECTION" }],
          imageContext: { languageHints: ["th", "en"] },
        }],
      }),
    });
    if (!res.ok) {
      return { ok: false, text: "", amount: null, error: `Vision ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      responses?: { fullTextAnnotation?: { text?: string }; textAnnotations?: { description?: string }[]; error?: { message?: string } }[];
    };
    const r = json.responses?.[0];
    if (r?.error?.message) return { ok: false, text: "", amount: null, error: r.error.message };
    const text = r?.fullTextAnnotation?.text ?? r?.textAnnotations?.[0]?.description ?? "";
    return { ok: true, text, ...extractSlip(text) };
  } catch (err) {
    return { ok: false, text: "", amount: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function ocrSlip(image: Buffer, filename = "slip.jpg"): Promise<OcrResult> {
  // Prefer Google Vision via OIDC (no key). Fall back to OCR.space if OIDC not configured
  // or Vision fails but an OCR.space key exists.
  if (isVertexConfigured()) {
    const v = await ocrVision(image);
    if (v.ok) return v;
    if (!process.env.OCR_SPACE_API_KEY?.trim()) return v; // no fallback available — return Vision error
  }
  const apikey = process.env.OCR_SPACE_API_KEY?.trim();
  if (!apikey) {
    return { ok: false, text: "", amount: null, error: "OCR ยังไม่พร้อม: ตั้ง GCP OIDC (Vision) หรือ OCR_SPACE_API_KEY" };
  }
  try {
    const form = new FormData();
    form.append("apikey", apikey);
    form.append("language", "eng");
    form.append("OCREngine", "2");
    form.append("scale", "true");
    form.append("isTable", "true");
    form.append("file", new Blob([new Uint8Array(image)]), filename);

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as {
      ParsedResults?: { ParsedText?: string }[];
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
    };
    if (json.IsErroredOnProcessing) {
      const err = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : json.ErrorMessage;
      return { ok: false, text: "", amount: null, error: err || "OCR failed" };
    }
    const text = json.ParsedResults?.[0]?.ParsedText ?? "";
    return { ok: true, text, ...extractSlip(text) };
  } catch (err) {
    return { ok: false, text: "", amount: null, error: err instanceof Error ? err.message : String(err) };
  }
}
