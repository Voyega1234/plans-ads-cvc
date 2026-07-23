'use client'

import { useEffect } from 'react'

// Last-resort boundary: catches errors thrown by the ROOT layout itself, which
// app/error.tsx cannot catch. It replaces the whole document, so it must render its
// own <html>/<body> and cannot rely on the app stylesheet — styles are inline here.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error.digest ?? '(no digest)', error.message, error)
  }, [error])

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          color: '#0f172a',
        }}
      >
        <div
          style={{
            maxWidth: 520,
            padding: 24,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
          }}
        >
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>⚠️ ระบบขัดข้องชั่วคราว</h1>
          <p style={{ fontSize: 14, color: '#475569', margin: '0 0 12px' }}>
            เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์ ลองโหลดใหม่อีกครั้ง — ถ้ายังไม่หาย
            ให้แจ้งทีมพร้อมรหัสด้านล่าง
          </p>
          {error.digest && (
            <code
              style={{
                display: 'block',
                wordBreak: 'break-all',
                background: '#0f172a',
                color: '#f1f5f9',
                padding: 12,
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              Digest: {error.digest}
            </code>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#4f46e5',
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </body>
    </html>
  )
}
