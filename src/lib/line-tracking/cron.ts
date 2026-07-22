import { NextRequest } from "next/server";

/**
 * When CRON_SECRET is set, require it via ?secret=... or the x-cron-secret
 * header. When it's empty (local MVP), allow all — nothing to protect.
 */
export function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  // Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`.
  const authHeader = req.headers.get("authorization");
  const provided =
    url.searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
  return provided === secret;
}
