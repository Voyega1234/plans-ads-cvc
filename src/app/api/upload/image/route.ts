import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

const MAX_MB = 10
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// On Vercel: filesystem is read-only — images are stored as base64 data URLs (temp, in-memory)
// For production persistent storage, set BLOB_READ_WRITE_TOKEN (Vercel Blob) or use Cloudinary
const IS_VERCEL = process.env.VERCEL === '1'

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

    // Vercel: return base64 data URL (works for previews, not persisted)
    if (IS_VERCEL) {
      const base64 = buffer.toString('base64')
      const url = `data:${file.type};base64,${base64}`
      return NextResponse.json({ url, note: 'base64 mode — not persisted' })
    }

    // Local dev: write to public/uploads
    const { writeFile, mkdir } = await import('fs/promises')
    const { join } = await import('path')
    const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads')
    await mkdir(UPLOAD_DIR, { recursive: true })
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const filename = `${randomUUID()}.${ext}`
    await writeFile(join(UPLOAD_DIR, filename), buffer)
    return NextResponse.json({ url: `/uploads/${filename}` })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
