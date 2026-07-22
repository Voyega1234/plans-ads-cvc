'use client'

// Staff-only (allowlisted email) panel to create/revoke CLIENT logins for one project.
// Rendered by the setup page only when the current staff email is allowed.
import { useEffect, useState } from 'react'

interface ClientRow { id: string; username: string; label: string | null; createdAt: string }

export default function ClientAccessManager({ projectId }: { projectId: string }) {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch(`/api/line-tracking/client-access?projectId=${projectId}`)
    if (res.ok) setClients((await res.json()).clients ?? [])
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setMsg('')
    const res = await fetch('/api/line-tracking/client-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, projectId, label }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(data.error ?? 'สร้างไม่สำเร็จ'); return }
    setMsg(`สร้าง client login "${username}" แล้ว — ลูกค้าเข้าที่ /line-tracking/client-login`)
    setUsername(''); setPassword(''); setLabel('')
    void load()
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`ยกเลิกสิทธิ์ของ "${name}"?`)) return
    await fetch(`/api/line-tracking/client-access?id=${id}`, { method: 'DELETE' })
    void load()
  }

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-slate-800">Client Login (ให้ลูกค้าเข้าดูเฉพาะโปรเจกต์นี้)</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        สร้าง user/password ให้ลูกค้าเข้ามาดูได้ <b>เฉพาะโปรเจกต์นี้เท่านั้น</b> เห็นระบบอื่นหรือลูกค้าคนอื่นไม่ได้เลย
      </p>

      <form onSubmit={create} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input className="input" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input className="input" placeholder="password (≥6)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className="input" placeholder="ชื่อลูกค้า (label)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" disabled={busy} className="btn-primary">{busy ? 'กำลังสร้าง...' : '+ สร้าง Client Login'}</button>
      </form>
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      {msg && <p className="mt-2 text-xs text-emerald-700">{msg}</p>}

      {clients.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b border-slate-100"><th className="th">Username</th><th className="th">ชื่อ</th><th className="th">สร้างเมื่อ</th><th className="th"></th></tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="td font-mono">{c.username}</td>
                <td className="td">{c.label ?? '—'}</td>
                <td className="td text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString('th-TH')}</td>
                <td className="td text-right"><button onClick={() => revoke(c.id, c.username)} className="text-xs text-rose-600 hover:underline">ยกเลิก</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
