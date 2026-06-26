import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

// GET — load chat history for current user (optionally filtered by customerId)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    const userId  = getUserId(session)
    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId') ?? undefined

    // Find the most recent session for this user+account combo
    const chatSession = await prisma.chatSession.findFirst({
      where:   { userId, customerId: customerId ?? null },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!chatSession) return NextResponse.json({ sessionId: null, messages: [] })

    return NextResponse.json({
      sessionId: chatSession.id,
      messages:  chatSession.messages.map((m) => ({
        role:     m.role,
        content:  m.content,
        model:    m.model ?? undefined,
        filesJson: m.filesJson ?? undefined,
      })),
    })
  } catch (err) {
    console.error('[chat/history GET]', err)
    return NextResponse.json({ sessionId: null, messages: [] })
  }
}

// POST — save a batch of messages (upsert session)
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userId  = getUserId(session)

    const body = await req.json() as {
      sessionId?:  string
      customerId?: string
      accountName?: string
      messages: Array<{ role: string; content: string; model?: string; filesJson?: string }>
    }

    let chatSession = body.sessionId
      ? await prisma.chatSession.findFirst({ where: { id: body.sessionId, userId } })
      : null

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: {
          userId,
          customerId:  body.customerId ?? null,
          accountName: body.accountName ?? null,
        },
      })
    } else {
      // Update account info in case user switched
      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data:  { accountName: body.accountName ?? null, updatedAt: new Date() },
      })
      // Delete old messages — we'll rewrite from the full array
      await prisma.chatMessage.deleteMany({ where: { sessionId: chatSession.id } })
    }

    if (body.messages.length > 0) {
      await prisma.chatMessage.createMany({
        data: body.messages.map((m) => ({
          sessionId: chatSession!.id,
          role:      m.role,
          content:   m.content,
          model:     m.model ?? null,
          filesJson: m.filesJson ?? null,
        })),
      })
    }

    return NextResponse.json({ sessionId: chatSession.id })
  } catch (err) {
    console.error('[chat/history POST]', err)
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 })
  }
}

// DELETE — clear chat history for current user (optionally by sessionId)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    const userId  = getUserId(session)
    const { searchParams } = new URL(req.url)
    const sessionId  = searchParams.get('sessionId') ?? undefined
    const customerId = searchParams.get('customerId') ?? undefined

    if (sessionId) {
      await prisma.chatSession.deleteMany({ where: { id: sessionId, userId } })
    } else {
      // Delete all sessions for this user+account
      await prisma.chatSession.deleteMany({ where: { userId, customerId: customerId ?? null } })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[chat/history DELETE]', err)
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 })
  }
}
