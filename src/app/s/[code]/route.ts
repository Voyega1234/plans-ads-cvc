import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Short link resolver: /s/{code} → redirect to the full tracking URL.
 * Increments the click counter. Any extra query params are forwarded/merged.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shortLink.findUnique({ where: { code } });
  if (!link) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Merge any query params on the short link into the target (rare, optional).
  const incoming = new URL(req.url).searchParams;
  let target = link.targetUrl;
  if (Array.from(incoming.keys()).length > 0) {
    const t = new URL(link.targetUrl);
    incoming.forEach((v, k) => t.searchParams.set(k, v));
    target = t.toString();
  }

  // Count the click (best-effort).
  prisma.shortLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }).catch(() => {});

  return NextResponse.redirect(target);
}
