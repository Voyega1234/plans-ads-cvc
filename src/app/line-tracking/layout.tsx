import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import ClientShell from '@/components/line-tracking/ClientShell'
import { prisma } from '@/lib/prisma'
import { getAuthSession } from '@/lib/session'
import { getClientSession } from '@/lib/line-tracking/clientAuth'

export const dynamic = 'force-dynamic'

// Line Tracking is a login-gated sub-program inside MercyOS. Projects are shared:
// every logged-in staff user sees all of them (no per-user scoping). On top of that,
// external "client viewers" can reach a single project via a separate cookie-based
// mechanism (src/lib/line-tracking/clientAuth.ts) — see the [projectId] layout for the
// per-project scoping guard. This layout is defense-in-depth on top of the global
// middleware gate, and allows EITHER a next-auth (staff) session OR a valid client
// session through.
export default async function LineTrackingLayout({ children }: { children: React.ReactNode }) {
  // The client-viewer login page lives under this same layout (URL: /line-tracking/
  // client-login) but must render with no session at all — bypass the gate for it,
  // and skip the AppShell chrome since it's a standalone page.
  const hdrs = await headers()
  const pathname = hdrs.get('x-lt-pathname') ?? ''
  if (pathname === '/line-tracking/client-login') {
    return <>{children}</>
  }

  const session = await getAuthSession()
  // Staff (next-auth) → full MercyOS chrome (they're allowed to see everything).
  if (session?.user?.id) {
    return <AppShell>{children}</AppShell>
  }

  // External client viewer → a minimal Line-Tracking-only shell. They must NEVER
  // see the MercyOS sidebar/menu or that other tools/clients exist.
  const clientSession = await getClientSession()
  if (!clientSession) {
    redirect('/line-tracking/client-login')
  }
  const project = await prisma.project.findUnique({
    where: { id: clientSession.projectId },
    select: { name: true },
  })
  return <ClientShell projectName={project?.name}>{children}</ClientShell>
}
