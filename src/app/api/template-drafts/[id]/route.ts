import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/template-drafts/[id] — load a draft
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const draft = await prisma.templateDraft.findUnique({ where: { id: params.id } })
    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ...draft, stateJson: JSON.parse(draft.stateJson) })
  } catch (err) {
    console.error('[template-drafts GET id]', err)
    return NextResponse.json({ error: 'Failed to load draft' }, { status: 500 })
  }
}

// PATCH /api/template-drafts/[id] — update draft state
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { stateJson, phase, mediaPlanId } = body

    const draft = await prisma.templateDraft.update({
      where: { id: params.id },
      data: {
        ...(stateJson !== undefined && { stateJson: JSON.stringify(stateJson) }),
        ...(phase !== undefined && { phase }),
        ...(mediaPlanId !== undefined && { mediaPlanId }),
      },
    })
    return NextResponse.json({ id: draft.id })
  } catch (err) {
    console.error('[template-drafts PATCH]', err)
    return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
  }
}

// DELETE /api/template-drafts/[id] — delete a draft
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.templateDraft.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[template-drafts DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 })
  }
}
