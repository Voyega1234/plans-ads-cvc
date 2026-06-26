import AppShell from '@/components/layout/AppShell'

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
