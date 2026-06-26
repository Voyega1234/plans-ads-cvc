import { NextRequest, NextResponse } from 'next/server'
import { recordAdCopyFeedback } from '@/lib/memory/client-memory'
import { z } from 'zod'

const schema = z.object({
  mediaPlanId: z.string(),
  copies: z.array(z.object({
    copyType: z.enum(['headline', 'description', 'long_headline']),
    copyText: z.string().min(1),
    status:   z.enum(['approved', 'rejected']),
    reason:   z.string().optional(),
  })).min(1),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  await recordAdCopyFeedback(params.id, parsed.data.mediaPlanId, parsed.data.copies)
  return NextResponse.json({ ok: true, recorded: parsed.data.copies.length })
}
