import { redirect } from 'next/navigation'

// The Tools hub page was retired — every tool is reachable from the sidebar's
// Tools dropdown directly. Old links/bookmarks to /tools land on the dashboard
// instead of a dead page.
export default function ToolsPage() {
  redirect('/dashboard')
}
