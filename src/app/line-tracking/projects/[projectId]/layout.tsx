import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthSession } from '@/lib/session'
import { getClientSession } from '@/lib/line-tracking/clientAuth'
import ProjectSidebar from '@/components/line-tracking/ProjectSidebar'

export const dynamic = 'force-dynamic'

// Per-project layout with a left sidebar scoped to this project. Staff see all pages
// (incl. Settings sub-pages); a client viewer is (1) locked to their own project and
// (2) restricted to Overview / Leads / Funnel — Settings pages (which hold platform
// credentials) are blocked for clients.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const session = await getAuthSession()
  const isStaff = !!session?.user?.id

  if (!isStaff) {
    const clientSession = await getClientSession()
    if (!clientSession) redirect('/line-tracking/client-login')
    if (clientSession.projectId !== projectId) {
      redirect(`/line-tracking/projects/${clientSession.projectId}`)
    }
    // Clients may only view Overview / Leads / Funnel of their own project.
    const base = `/line-tracking/projects/${projectId}`
    const pathname = (await headers()).get('x-lt-pathname') ?? ''
    const allowed = pathname === base || pathname === `${base}/leads` || pathname === `${base}/funnel`
    if (!allowed) redirect(base)
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, status: true },
  })
  if (!project) notFound()

  // Paused project cuts off client viewers immediately (even with a valid cookie).
  // Staff keep access so they can manage/re-enable it.
  if (!isStaff && project.status === 'PAUSED') {
    redirect('/line-tracking/client-login?suspended=1')
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] gap-0">
      <ProjectSidebar projectId={projectId} projectName={project.name} isClient={!isStaff} />
      <div className="min-w-0 flex-1 p-6">{children}</div>
    </div>
  )
}
