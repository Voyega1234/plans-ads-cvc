'use client'

import { useEffect } from 'react'

// App-wide error boundary. Without this file Next.js renders its bare built-in
// screen ("Application error: a server-side exception has occurred… Digest: …"),
// which gives the team no way to act on the failure. This keeps the digest visible
// (it's the key for looking the real stack trace up in the Vercel runtime logs) but
// adds a retry path and plain-language guidance.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surfaces the message in the browser console too — on the server Next.js has
    // already logged the full stack against this same digest.
    console.error('[AppError]', error.digest ?? '(no digest)', error.message, error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card max-w-lg space-y-3">
        <h1 className="text-lg font-bold text-slate-900">⚠️ หน้านี้โหลดไม่สำเร็จ</h1>
        <p className="text-sm text-slate-600">
          เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์ระหว่างเปิดหน้านี้ ระบบส่วนอื่นยังใช้งานได้ตามปกติ
          ลองกดโหลดใหม่อีกครั้ง — ถ้ายังไม่หาย ให้แจ้งทีมพร้อมรหัสด้านล่าง
        </p>

        {error.digest && (
          <div className="rounded-lg bg-slate-900 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Error digest</div>
            <code className="block break-all text-xs text-slate-100">{error.digest}</code>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={reset} className="btn-primary">
            ลองใหม่อีกครั้ง
          </button>
          <a href="/line-tracking" className="btn-ghost text-sm">
            กลับหน้า Line Tracking
          </a>
        </div>

        <p className="text-xs text-slate-400">
          ทีมเทคนิค: เปิด Vercel → Logs แล้วค้นด้วย digest ข้างบน จะเจอ stack trace เต็มของ error นี้
        </p>
      </div>
    </div>
  )
}
