// Slip OCR — reads the transfer amount from a payment-slip image so sales don't
// type it. Gemini also gives a soft "looks edited?" signal (suspicious/suspiciousReason)
// but this is NOT a real authenticity check — a human still confirms PAID (OCR can
// misread / a well-made fake can still pass the suspicious check).
//
// Provider order:
//  1) Gemini (Vertex AI, same GCP OIDC as the rest of the app) — reads the slip image
//     directly and returns amount/phone/name in one call. More robust than plain OCR +
//     regex across different bank slip layouts, since it understands context (transfer
//     amount vs account number vs reference code) instead of pattern-matching.
//  2) Google Cloud Vision (TEXT_DETECTION) via the same OIDC — fallback if Gemini fails.
//     Requires the Cloud Vision API enabled on the SA's project.
//  3) OCR.space (OCR_SPACE_API_KEY) — fallback when OIDC isn't available (e.g. local).
import { isVertexConfigured, getVertexAccessToken, VERTEX_LOCATION, VERTEX_PROJECT } from "@/lib/ai/vertex-auth";

export interface OcrResult {
  ok: boolean;
  text: string;
  amount: number | null;
  phone?: string | null;   // เบอร์ที่ OCR เดาได้จากสลิป (เซลส์ยืนยัน)
  name?: string | null;    // ชื่อที่ OCR เดาได้ (มีคำนำหน้า) — เซลส์ยืนยัน
  // Soft signal only (Gemini path only — Vision/OCR.space can't judge this from
  // plain text) — a sophisticated fake can still slip through. NOT a substitute
  // for the human PAID confirmation, just an extra flag for sales to look twice.
  suspicious?: boolean | null;
  suspiciousReason?: string | null;
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

// Gemini (Vertex AI, same OIDC as ocrVision) — sends the slip image straight to the
// model and asks for structured JSON, skipping the separate regex-parsing pass that
// ocrVision needs. Tried first: usually more accurate across different bank slip
// layouts since the model understands context, not just number patterns.
async function ocrGemini(image: Buffer): Promise<OcrResult> {
  try {
    const token = await getVertexAccessToken();
    // Match the proven-working Vertex/Gemini image call (analyze-image route):
    // same env var (AI_MODEL_QUALITY, not STANDARD) and same generous token cap —
    // 1024 was likely truncating the response to empty before any visible text,
    // which reads identically to "no JSON" in the old error message.
    const model = process.env.AI_MODEL_QUALITY ?? "gemini-3.5-flash";
    const vLoc = VERTEX_LOCATION();
    const vHost = vLoc === "global" ? "aiplatform.googleapis.com" : `${vLoc}-aiplatform.googleapis.com`;
    const prompt = `นี่คือรูปสลิปโอนเงิน อ่านแล้วดึงข้อมูลออกมา ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{"amount": ตัวเลขยอดโอนจริง (number ไม่มี comma) หรือ null ถ้าไม่เจอ,
 "phone": เบอร์มือถือไทย 10 หลัก (string) หรือ null ถ้าไม่เจอ,
 "name": ชื่อผู้โอนหรือผู้รับ พร้อมคำนำหน้า (string) หรือ null ถ้าไม่เจอ,
 "suspicious": true ถ้าเห็นสัญญาณว่าอาจเป็นภาพตัดต่อ/แก้ไข เช่น ฟอนต์ของตัวเลขยอดเงินไม่ตรงกับฟอนต์ส่วนอื่นของสลิป, ตัวหนังสือ/ตัวเลขเบี้ยว-เยื้อง-ซ้อนทับผิดตำแหน่ง, พื้นหลังเบลอหรือมีรอยต่อเฉพาะบริเวณตัวเลข, สีพื้นหลังไม่สม่ำเสมอเฉพาะจุด — ให้เป็น false ถ้าดูเป็นสลิปปกติทั่วไป (ไม่ใช่ null ให้เดาไปทางใดทางหนึ่ง),
 "suspiciousReason": ถ้า suspicious=true อธิบายสั้นๆ ว่าสงสัยตรงจุดไหน (string) ไม่งั้นเป็น null}
amount คือยอดเงินที่โอนจริงเท่านั้น ห้ามเอาเลขบัญชีหรือเลขอ้างอิงธุรกรรมมาใส่
หมายเหตุ: suspicious เป็นแค่การสังเกตเบื้องต้น ไม่ใช่การยืนยันแน่นอนว่าสลิปปลอมหรือของจริง ถ้าไม่แน่ใจให้ตอบ false`;

    const res = await fetch(
      `https://${vHost}/v1/projects/${VERTEX_PROJECT()}/locations/${vLoc}/publishers/google/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: image.toString("base64") } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 65536, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) {
      return { ok: false, text: "", amount: null, error: `Gemini ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      // Surface exactly what Gemini said (or why it said nothing) instead of a
      // bare "no JSON found" — otherwise every distinct failure mode (safety
      // block, empty response, plain-text refusal) looks identical in the log.
      const blockReason = json.promptFeedback?.blockReason;
      const finishReason = json.candidates?.[0]?.finishReason;
      const detail = blockReason
        ? `blocked: ${blockReason}`
        : finishReason && finishReason !== "STOP"
          ? `finishReason: ${finishReason}`
          : `response: ${text.slice(0, 300) || "(ว่างเปล่า)"}`;
      return { ok: false, text, amount: null, error: `Gemini: ไม่พบ JSON ในคำตอบ (${detail})` };
    }
    const parsed = JSON.parse(match[0]) as {
      amount?: number | null; phone?: string | null; name?: string | null;
      suspicious?: boolean | null; suspiciousReason?: string | null;
    };
    return {
      ok: true,
      text,
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      phone: parsed.phone || null,
      name: parsed.name || null,
      suspicious: parsed.suspicious === true,
      suspiciousReason: parsed.suspicious === true ? (parsed.suspiciousReason || null) : null,
    };
  } catch (err) {
    return { ok: false, text: "", amount: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function ocrSlip(image: Buffer, filename = "slip.jpg"): Promise<OcrResult> {
  // Prefer Gemini, then Google Vision — both via OIDC (no key). Fall back to OCR.space
  // if OIDC not configured, or both Vertex-side attempts fail but an OCR.space key exists.
  if (isVertexConfigured()) {
    const g = await ocrGemini(image);
    if (g.ok) return g;
    const v = await ocrVision(image);
    if (v.ok) return v;
    if (!process.env.OCR_SPACE_API_KEY?.trim()) {
      // No further fallback — surface both errors so the log actually shows why.
      return { ...v, error: `Gemini: ${g.error} | Vision: ${v.error}` };
    }
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
