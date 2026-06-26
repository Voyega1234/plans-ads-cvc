'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SignInContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  function handleSignIn() {
    signIn('google', { callbackUrl: '/dashboard' })
  }

  function handleSwitchAccount() {
    // Force Google account chooser by logging out of Google first
    window.location.href = 'https://accounts.google.com/AccountChooser?continue=' +
      encodeURIComponent(window.location.origin + '/api/auth/signin/google?callbackUrl=/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm">

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Mercy</h1>
          <p className="text-sm text-gray-500 mb-8">
            Google Ads Campaign Automation
          </p>

          {/* Error */}
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm text-left">
              {error === 'AccessDenied' ? (
                <>
                  <p className="font-semibold mb-1">ไม่มีสิทธิ์เข้าใช้งาน</p>
                  <p className="text-red-500">ระบบรองรับเฉพาะ @convertcake.com เท่านั้น</p>
                </>
              ) : (
                'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
              )}
            </div>
          )}

          {/* Primary sign-in button */}
          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-50 active:bg-gray-100 text-gray-800 font-semibold text-sm transition-colors duration-150 mb-3"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span>เข้าสู่ระบบด้วย Google</span>
          </button>

          {/* Switch account button */}
          <button
            onClick={handleSwitchAccount}
            className="w-full px-6 py-3 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors font-medium"
          >
            เปลี่ยน account Google
          </button>

          <p className="mt-6 text-xs text-gray-400 leading-relaxed">
            เฉพาะ @convertcake.com เท่านั้น
          </p>
        </div>

        {/* Hint box */}
        <div className="mt-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700 text-center">
          <span className="font-semibold">กด Allow ทั้งหมด</span> — ระบบจะขอสิทธิ์ Google Ads, GA4 และ GTM
        </div>

      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}
