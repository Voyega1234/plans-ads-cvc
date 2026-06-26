import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { briefSchema } from '@/lib/validation/brief'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'

export async function GET() {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await (auth() as Promise<Session | null>)
    const userId = skipAuth ? '' : getUserId(session)

    const briefs = await prisma.brief.findMany({
      where: skipAuth ? {} : { userId },
      orderBy: { createdAt: 'desc' },
      include: { client: true },
    })
    return NextResponse.json(briefs)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const skipAuth = process.env.SKIP_AUTH === 'true'
    const session = skipAuth ? null : await (auth() as Promise<Session | null>)
    const userId = skipAuth ? null : getUserId(session)

    const body = await req.json()
    const data = briefSchema.parse(body)

    const brief = await prisma.brief.create({
      data: {
        ...(userId ? { userId } : {}),
        ...data,
        status: 'completed',
      },
    })

    return NextResponse.json(brief, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create brief' }, { status: 500 })
  }
}
