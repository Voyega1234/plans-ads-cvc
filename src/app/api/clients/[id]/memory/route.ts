import { NextRequest, NextResponse } from 'next/server'
import { getClientMemory, updateClientMemoryNotes } from '@/lib/memory/client-memory'
import { z } from 'zod'

const patchSchema = z.object({
  industry:             z.string().optional(),
  notes:                z.string().optional(),
  industryBenchmarkCPC: z.number().optional(),
  avgCPC:               z.number().optional(),
  avgCPA:               z.number().optional(),
  avgConversionRate:    z.number().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const data = await getClientMemory(params.id)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  await updateClientMemoryNotes(params.id, parsed.data)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { prisma } = await import('@/lib/prisma')
  await prisma.clientMemory.deleteMany({ where: { clientId: params.id } })
  await prisma.adCopyFeedback.deleteMany({ where: { clientId: params.id } })
  return NextResponse.json({ ok: true })
}
