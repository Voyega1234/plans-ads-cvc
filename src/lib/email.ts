/**
 * Email sender สำหรับ Automation notifications
 *
 * ใช้ Resend REST API ตรงๆ (ไม่ต้องติดตั้ง dependency เพิ่ม)
 * ต้องตั้ง env:
 *   RESEND_API_KEY        — API key จาก resend.com
 *   AUTOMATION_EMAIL_FROM — เช่น "Ads Automation <alerts@yourdomain.com>" (ต้อง verify domain กับ Resend)
 *
 * ถ้ายังไม่ได้ตั้งค่า จะไม่ throw — คืน { sent: false, detail } เพื่อให้ rule ทำงานต่อได้
 * และ log ไว้ให้เห็นใน run message
 */

export interface SendEmailResult {
  sent: boolean
  detail: string
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0 && isValidEmail(e))
}

export async function sendAutomationEmail(
  to: string[],
  subject: string,
  html: string
): Promise<SendEmailResult> {
  const recipients = to.filter(isValidEmail)
  if (!recipients.length) {
    return { sent: false, detail: 'ไม่มีอีเมลผู้รับ' }
  }

  const apiKey = process.env.RESEND_API_KEY ?? ''
  const from = process.env.AUTOMATION_EMAIL_FROM ?? 'Ads Automation <onboarding@resend.dev>'

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — email not sent:', subject, '→', recipients.join(', '))
    return { sent: false, detail: 'ยังไม่ได้ตั้งค่า RESEND_API_KEY — อีเมลไม่ถูกส่ง' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[email] send failed', res.status, txt.slice(0, 300))
      return { sent: false, detail: `ส่งอีเมลไม่สำเร็จ (${res.status})` }
    }

    return { sent: true, detail: `ส่งอีเมลแจ้งเตือนไปที่ ${recipients.join(', ')} แล้ว` }
  } catch (err) {
    console.error('[email] send error', err)
    return { sent: false, detail: 'ส่งอีเมลไม่สำเร็จ (network error)' }
  }
}

/** สร้าง HTML อีเมลแบบเรียบง่าย อ่านง่ายทั้ง desktop/mobile */
export function automationEmailHtml(opts: {
  heading: string
  lines: Array<{ label: string; value: string }>
  footer?: string
}): string {
  const rows = opts.lines
    .map(l => `<tr>
      <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${l.label}</td>
      <td style="padding:6px 12px;color:#111827;font-size:13px">${l.value}</td>
    </tr>`)
    .join('')

  return `<div style="font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <h2 style="font-size:16px;color:#111827;margin:0 0 16px">${opts.heading}</h2>
    <table style="border-collapse:collapse;background:#f9fafb;border-radius:8px;width:100%">${rows}</table>
    ${opts.footer ? `<p style="color:#9ca3af;font-size:12px;margin-top:16px">${opts.footer}</p>` : ''}
  </div>`
}
