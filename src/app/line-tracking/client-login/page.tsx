'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Standalone login page for Line Tracking client viewers (a client's own single
// project). Renders with no MercyOS session and no AppShell — see the special-case
// in src/app/line-tracking/layout.tsx and the public-path exemption in
// src/middleware.ts. Separate mechanism from MercyOS staff Google login.
export default function ClientLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Show a suspension notice when redirected here from a paused project.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('suspended')) {
      setError('บัญชีนี้ถูกระงับการเข้าถึงชั่วคราว กรุณาติดต่อผู้ดูแล')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/line-tracking/client-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      router.push(`/line-tracking/projects/${data.projectId}`)
      router.refresh()
    } catch {
      setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm card">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-slate-900">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-slate-400">Line CRM</p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="username">ชื่อผู้ใช้</label>
            <input
              id="username"
              name="username"
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">รหัสผ่าน</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}
