import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// อัปโหลดรูป — จุดนี้คือ "ต้นเหตุ" ของอาการ push แล้วขึ้น Unexpected token 'R'
//
// บน Vercel ระบบไฟล์เขียนไม่ได้ ถ้าไม่มีที่เก็บไฟล์ถาวร route นี้จะคืนรูปกลับไป
// เป็น **base64 data URL ทั้งก้อน** ค่านั้นถูกฝังลงในตัวแผน (blueprint) แล้วเวลา
// กด Push ทั้งก้อนถูกส่งขึ้นไปเป็น JSON เดียว → รูป 3MB กลายเป็น base64 ~4MB →
// เกินเพดาน request body 4.5MB ของ Vercel → แพลตฟอร์มตีกลับเป็นข้อความธรรมดา
// "Request Entity Too Large" ตั้งแต่ก่อนถึงโค้ดเรา
//
// ทางแก้ที่ถูกต้องที่สุดคือ **ต่อที่เก็บไฟล์ถาวร** (Vercel Blob) แล้วรูปจะกลายเป็น
// ลิงก์ https สั้น ๆ ส่งของเดิมเต็มความละเอียด ไม่มีการบีบอัดใด ๆ ทั้งสิ้น
//   → Vercel dashboard → Storage → Create Blob store → Connect to project
//   → ตัวแปร BLOB_READ_WRITE_TOKEN จะถูกใส่ให้เองอัตโนมัติ ไม่ต้องแก้โค้ด
//
// แต่ระบบต้องไม่พังเงียบ ๆ ถ้าใครยังไม่ได้ต่อ — โหมด base64 จึงถูกทำให้
//   1. บอกออกไปทุกครั้งว่าตอนนี้อยู่โหมดไหน (ฟิลด์ `storage` + `warning`)
//   2. ตัดความละเอียด "ส่วนเกิน" ทิ้งเฉพาะรูปที่ใหญ่กว่า SOFT_LIMIT เท่านั้น
//      โดยเหลือด้านยาวสุด 1600px ซึ่ง **ยังใหญ่กว่าทุก spec ที่ Google ใช้จริง**
//      (ใหญ่สุด 1200x1200 และ builder ของเราย่อลง spec อยู่แล้วก่อนส่ง)
//      → ปลายทางได้ภาพเท่าเดิม แต่แผนไม่บวมจนกด Push ไม่ได้
//      รูปที่เล็กกว่า SOFT_LIMIT ผ่านไปแบบไม่แตะแม้แต่ไบต์เดียว
// ─────────────────────────────────────────────────────────────────────────────

const MAX_MB = 10
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// On Vercel: filesystem is read-only — images are stored as base64 data URLs (temp, in-memory)
// For production persistent storage, set BLOB_READ_WRITE_TOKEN (Vercel Blob) or use Cloudinary
const IS_VERCEL = process.env.VERCEL === '1'

/** เล็กกว่านี้ = ไม่แตะเลย (ไบต์ต่อไบต์) */
const INLINE_SOFT_LIMIT = 700 * 1024
/** ด้านยาวสุดที่เก็บไว้ในโหมด base64 — ยังเหนือ spec ใหญ่สุดของ Google (1200) */
const INLINE_MAX_DIM = 1600
/** ถ้ารอบแรกยังใหญ่อยู่ ลดอีกขั้นเดียว (ยังไม่ต่ำกว่า spec) */
const INLINE_HARD_DIM = 1200
const INLINE_HARD_TRIGGER = 1_200 * 1024

const WARNING_TEXT =
  'ระบบยังไม่ได้ต่อที่เก็บไฟล์ถาวร รูปจึงถูกฝังลงในแผนเป็น base64 — ' +
  'ให้ dev เชื่อม Vercel Blob store (Storage → Create Blob store → Connect) ' +
  'แล้วรูปจะถูกเก็บเป็นลิงก์เต็มความละเอียด และแผนจะไม่บวมจนกด Push ไม่ได้'

/**
 * ลดเฉพาะ "ความละเอียดส่วนเกิน" ของรูปที่ใหญ่เกินจำเป็นในโหมด base64
 * ล้มเหลวเมื่อไหร่คืน buffer เดิม — ไม่ทำให้การอัปโหลดพังเพราะเรื่องนี้
 */
async function trimOversizeForInline(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string; trimmed: boolean }> {
  // GIF อาจเป็นภาพเคลื่อนไหว — แตะแล้วเหลือเฟรมเดียว ไม่คุ้ม
  if (contentType === 'image/gif') return { buffer, contentType, trimmed: false }
  if (buffer.length <= INLINE_SOFT_LIMIT) return { buffer, contentType, trimmed: false }

  try {
    const sharp = (await import('sharp')).default
    const base = sharp(buffer).rotate() // เคารพ EXIF orientation ก่อนวัดขนาด
    const meta = await base.metadata()
    // มี alpha = โปร่งใส (โลโก้) → คง PNG ไว้ ไม่งั้นพื้นหลังจะกลายเป็นดำ
    const keepPng = meta.hasAlpha === true

    const render = async (dim: number): Promise<Buffer> => {
      const pipeline = sharp(buffer).rotate().resize({
        width: dim,
        height: dim,
        fit: 'inside',
        withoutEnlargement: true, // ไม่มีการขยายรูปเล็กให้ใหญ่ขึ้น
      })
      return keepPng
        ? pipeline.png({ compressionLevel: 9 }).toBuffer()
        : pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    }

    let out = await render(INLINE_MAX_DIM)
    if (out.length > INLINE_HARD_TRIGGER) {
      const smaller = await render(INLINE_HARD_DIM)
      if (smaller.length < out.length) out = smaller
    }
    // บีบแล้วไม่เล็กลงก็ไม่ต้องเปลี่ยน
    if (out.length >= buffer.length) return { buffer, contentType, trimmed: false }
    return { buffer: out, contentType: keepPng ? 'image/png' : 'image/jpeg', trimmed: true }
  } catch (err) {
    console.error('[upload/image] trim failed, using original:', err)
    return { buffer, contentType, trimmed: false }
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Use JPG, PNG, WebP or GIF.' }, { status: 400 })
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File too large. Max ${MAX_MB}MB.` }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // ── ทางที่ถูกต้อง: Vercel Blob (ตั้ง BLOB_READ_WRITE_TOKEN) ──────────────
    // เก็บถาวร ได้ https URL ที่ push ใช้ได้ตรง ๆ **ส่งไฟล์ต้นฉบับเต็ม ๆ ไม่บีบอัด**
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import('@vercel/blob')
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const blob = await put(`uploads/${randomUUID()}.${ext}`, buffer, {
        access: 'public', contentType: file.type,
      })
      return NextResponse.json({ url: blob.url, storage: 'blob' })
    }

    // ── ทางสำรอง: ไม่มีที่เก็บถาวร → base64 (บอกให้รู้ตัวทุกครั้ง) ───────────
    if (IS_VERCEL) {
      const trimmed = await trimOversizeForInline(buffer, file.type)
      const base64 = trimmed.buffer.toString('base64')
      const url = `data:${trimmed.contentType};base64,${base64}`
      return NextResponse.json({
        url,
        storage: 'base64',
        persisted: false,
        trimmed: trimmed.trimmed,
        originalBytes: buffer.length,
        storedBytes: trimmed.buffer.length,
        warning: WARNING_TEXT,
        note: 'base64 mode — not persisted',
      })
    }

    // ── Local dev: เขียนลง public/uploads ตามเดิม ────────────────────────────
    const { writeFile, mkdir } = await import('fs/promises')
    const { join } = await import('path')
    const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads')
    await mkdir(UPLOAD_DIR, { recursive: true })
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const filename = `${randomUUID()}.${ext}`
    await writeFile(join(UPLOAD_DIR, filename), buffer)
    return NextResponse.json({ url: `/uploads/${filename}`, storage: 'file' })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

/**
 * GET = probe สำหรับตรวจว่าตอนนี้ระบบเก็บรูปด้วยวิธีไหน
 * (ใช้ในหน้า self-test / ให้ dev ยืนยันหลัง deploy ได้ใน 2 วินาที ไม่ต้องเดา)
 */
export async function GET() {
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN
  return NextResponse.json({
    storage: hasBlob ? 'blob' : IS_VERCEL ? 'base64' : 'file',
    persisted: hasBlob || !IS_VERCEL,
    ok: hasBlob || !IS_VERCEL,
    warning: hasBlob || !IS_VERCEL ? null : WARNING_TEXT,
  })
}
