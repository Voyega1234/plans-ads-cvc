import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/comments?blueprintId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const blueprintId = searchParams.get('blueprintId')
  if (!blueprintId) return NextResponse.json({ error: 'blueprintId required' }, { status: 400 })

  const comments = await prisma.campaignComment.findMany({
    where: { blueprintId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ comments })
}

// POST /api/comments
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      blueprintId: string
      campaignName: string
      authorName: string
      authorEmail?: string
      comment: string
    }
    const { blueprintId, campaignName, authorName, comment } = body
    if (!blueprintId || !campaignName || !authorName || !comment?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const created = await prisma.campaignComment.create({
      data: {
        blueprintId,
        campaignName,
        authorName: authorName.trim().slice(0, 100),
        authorEmail: body.authorEmail?.trim().slice(0, 200) || null,
        comment: comment.trim().slice(0, 2000),
      },
    })
    return NextResponse.json({ comment: created })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// PATCH /api/comments?id=xxx  — resolve/reopen
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { status } = await req.json() as { status: string }
  const updated = await prisma.campaignComment.update({
    where: { id },
    data: { status, updatedAt: new Date() },
  })
  return NextResponse.json({ comment: updated })
}
