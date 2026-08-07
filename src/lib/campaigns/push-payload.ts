/**
 * เตรียม payload ก่อน push เข้า Google Ads + อ่าน response แบบไม่ระเบิด
 *
 * ── ปัญหาที่ไฟล์นี้แก้ ────────────────────────────────────────────────────────
 * บน Vercel ถ้าไม่ได้ตั้ง BLOB_READ_WRITE_TOKEN ตัว /api/upload/image จะคืนรูป
 * กลับมาเป็น **base64 data URL ทั้งก้อน** (ดูคอมเมนต์ในไฟล์นั้น: "filesystem is
 * read-only — images are stored as base64 data URLs") ค่านั้นถูกเก็บลง blueprint
 * ตรง ๆ ในชื่อ imageUrl แล้วเวลากด Push ทั้งก้อนถูก JSON.stringify ส่งขึ้นไป
 *
 * รูป 1 ใบ 3MB → base64 ~4MB → เกินเพดาน request body ของ Vercel (4.5MB)
 * แพลตฟอร์มตีกลับ **ก่อน** ที่โค้ดฝั่ง server จะได้รัน ด้วย body ที่เป็น plain text
 * ว่า `Request Entity Too Large` ฝั่งหน้าเว็บเรียก res.json() ทันทีเลยพังเป็น
 *
 *     Unexpected token 'R', "Request En"... is not valid JSON
 *
 * ซึ่งไม่ได้บอกอะไรผู้ใช้เลย และ PMax เป็นชนิดเดียวที่ "บังคับ" ต้องมีรูป
 * (logo + marketing image) จึงเจอเฉพาะ PMax ส่วน Search ที่ไม่มีรูปผ่านฉลุย
 *
 * ── วิธีแก้ ──────────────────────────────────────────────────────────────────
 * 1) ย่อรูปที่ฝังเป็น data URL ให้เหลือขนาดที่ Google ใช้จริงก่อนส่ง
 *    spec ใหญ่สุดที่ builder ใช้คือ 1200x1200 (ดู IMAGE_SPECS) — ส่งไป 8MB ไม่มี
 *    ประโยชน์ เพราะ forceCropToSpec ย่อทิ้งอยู่ดี ย่อฝั่ง browser จึงไม่เสียคุณภาพ
 *    ที่ปลายทางเลย แถม push เร็วขึ้นมาก
 * 2) ถ้าย่อแล้วยังเกิน ให้ throw ข้อความภาษาคนบอกว่าใหญ่เท่าไหร่/ต้องทำอะไร
 *    แทนที่จะปล่อยไปโดน 413 แล้วได้ error JSON งง ๆ
 * 3) อ่าน response แบบ text-first เสมอ — response ที่ไม่ใช่ JSON (413/502/หน้า
 *    error ของแพลตฟอร์ม) ต้องกลายเป็นข้อความที่อ่านรู้เรื่อง ไม่ใช่ SyntaxError
 */

/** เพดาน request body ของ Vercel serverless = 4.5MB — กันชนไว้ที่ 4MB */
const MAX_BODY_BYTES = 4 * 1024 * 1024

/** ด้านยาวสุดที่ยังพอสำหรับทุก spec ของ Google (ใหญ่สุด 1200x1200) + เผื่อ crop */
const MAX_DIM_IMAGE = 1400
const MAX_DIM_LOGO = 1200
const JPEG_QUALITY = 0.82

function byteLength(s: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

/**
 * ย่อ data URL ใบเดียว คืนค่าเดิมถ้าย่อไม่ได้/ย่อแล้วไม่เล็กลง
 * โลโก้คง PNG ไว้ (โปร่งใส) รูปทั่วไปแปลงเป็น JPEG ซึ่งเล็กกว่ามาก
 */
async function shrinkDataUrl(dataUrl: string, isLogo: boolean): Promise<string> {
  // GIF อาจเป็นภาพเคลื่อนไหว — canvas จะเหลือเฟรมเดียว ไม่แตะดีกว่า
  if (!dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:image/gif')) return dataUrl
  if (typeof document === 'undefined') return dataUrl
  try {
    const img = await loadImage(dataUrl)
    const maxDim = isLogo ? MAX_DIM_LOGO : MAX_DIM_IMAGE
    const longest = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)
    if (!longest) return dataUrl
    const scale = Math.min(1, maxDim / longest)
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale))
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    const out = isLogo ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    return out.length > 0 && out.length < dataUrl.length ? out : dataUrl
  } catch {
    // ย่อไม่สำเร็จก็ส่งของเดิมไป — ถ้ายังใหญ่เกิน จะไปโดนด่านเช็คขนาดข้างล่างที่บอกเหตุผลชัดเจน
    return dataUrl
  }
}

/**
 * เดินทั้งก้อน blueprint หา { assetType, imageUrl } ที่ imageUrl เป็น data URL แล้วย่อ
 * cache ด้วยตัวสตริงต้นฉบับ — รูปเดียวกันที่ถูก withPooledImages ก๊อปไปหลายที่ ย่อครั้งเดียว
 */
async function shrinkImagesDeep<T>(node: T, cache: Map<string, string>): Promise<T> {
  if (Array.isArray(node)) {
    const out = []
    for (const item of node) out.push(await shrinkImagesDeep(item, cache))
    return out as unknown as T
  }
  if (node && typeof node === 'object') {
    const src = node as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(src)) {
      const val = src[key]
      if (key === 'imageUrl' && typeof val === 'string' && val.startsWith('data:image/')) {
        const cached = cache.get(val)
        if (cached !== undefined) {
          out[key] = cached
        } else {
          const isLogo = typeof src.assetType === 'string' && src.assetType.indexOf('LOGO') !== -1
          const shrunk = await shrinkDataUrl(val, isLogo)
          cache.set(val, shrunk)
          out[key] = shrunk
        }
      } else {
        out[key] = await shrinkImagesDeep(val, cache)
      }
    }
    return out as unknown as T
  }
  return node
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/**
 * คืนสตริง JSON ที่พร้อมยัดใส่ fetch body — ย่อรูปให้แล้ว และการันตีว่าไม่เกินเพดาน
 * (ถ้าเกินจะ throw ข้อความที่บอกสาเหตุจริง ไม่ปล่อยไปเจอ 413)
 */
export async function preparePushPayload(payload: unknown): Promise<string> {
  const before = byteLength(JSON.stringify(payload))
  if (before <= MAX_BODY_BYTES) return JSON.stringify(payload)

  const shrunk = await shrinkImagesDeep(payload, new Map<string, string>())
  const body = JSON.stringify(shrunk)
  const after = byteLength(body)
  if (after <= MAX_BODY_BYTES) return body

  throw new Error(
    `ข้อมูลแคมเปญใหญ่เกินที่เซิร์ฟเวอร์รับได้ (${mb(after)}MB / จำกัด 4.5MB) — ` +
      `รูปในแคมเปญนี้ถูกฝังมาเป็น base64 เพราะระบบยังไม่ได้ต่อที่เก็บไฟล์ถาวร ` +
      `วิธีแก้: ลดจำนวน/ขนาดรูปในแคมเปญนี้ลง หรือให้ dev ตั้งค่า BLOB_READ_WRITE_TOKEN ` +
      `(Vercel Blob) แล้วอัปโหลดรูปใหม่ — รูปจะกลายเป็นลิงก์แทนที่จะเป็นไฟล์ทั้งก้อน`
  )
}

/**
 * อ่าน response ของ push — ไม่เรียก res.json() ตรง ๆ เพราะ 413/502/หน้า error ของ
 * แพลตฟอร์มไม่ใช่ JSON แล้วจะได้ SyntaxError ที่ผู้ใช้ตีความไม่ได้
 */
// คืน any เหมือนที่ res.json() เคยคืน — ตัวเรียกอ่าน data.result?.campaigns ต่อได้เหมือนเดิม
// เปลี่ยนแค่ "ทางที่พัง" ไม่เปลี่ยนสัญญาของฟังก์ชันเดิม
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readPushResponse(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    if (res.status === 413 || /entity too large|payload too large/i.test(text)) {
      throw new Error(
        'ข้อมูลที่ส่งใหญ่เกินขีดจำกัดของเซิร์ฟเวอร์ (4.5MB) — มักเกิดจากรูปที่ฝังเป็น base64 ' +
          'ลองลดจำนวน/ขนาดรูป หรือให้ dev ตั้ง BLOB_READ_WRITE_TOKEN เพื่อเก็บรูปเป็นลิงก์'
      )
    }
    if (res.status === 504 || /timeout/i.test(text)) {
      throw new Error('เซิร์ฟเวอร์ใช้เวลานานเกินกำหนด (timeout) — ลอง push ทีละแคมเปญ หรือลดจำนวนรูป')
    }
    const head = text.slice(0, 160).replace(/\s+/g, ' ').trim()
    throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${res.status})${head ? `: ${head}` : ''}`)
  }
}
