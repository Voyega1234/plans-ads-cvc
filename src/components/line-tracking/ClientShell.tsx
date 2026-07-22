// Minimal chrome for external CLIENT viewers. Deliberately does NOT render the
// MercyOS AppShell/Sidebar — a client must never even see MercyOS's navigation or
// the existence of other tools/clients. Only their own Line Tracking project.
export default function ClientShell({
  children,
  projectName,
}: {
  children: React.ReactNode
  projectName?: string
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div className="text-sm font-semibold text-slate-800">{projectName ?? 'Dashboard'}</div>
          </div>
          <form action="/api/line-tracking/client-logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>
      <main className="w-full">{children}</main>
    </div>
  )
}
