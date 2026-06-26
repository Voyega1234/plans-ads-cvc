import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ChatWidget from '@/components/chat/ChatWidget'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <Topbar />
      <main className="ml-64 pt-14 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
      <ChatWidget />
    </div>
  )
}
