'use client'

// ── ของกลางสำหรับงาน Text Ads ────────────────────────────────────────────────
// ใช้ร่วมกัน 2 ที่: หน้า Tools → Text Ads Generator และฟอร์มสร้าง Text Ad ใน
// Campaign Adjustment — preview หน้าตาเดียวกับผลค้นหา Google + export HTML/CSV
// ที่ทีมส่งให้ลูกค้าตรวจได้เลยโดยไม่ต้องนั่ง copy มือ

import React from 'react'

export interface TextAdDraft {
  headlines: string[]
  descriptions: string[]
  finalUrl: string
  path1?: string
  path2?: string
}

export const RSA_LIMITS = {
  HEADLINE_MAX: 30,
  DESC_MAX: 90,
  HEADLINE_MIN: 3,
  HEADLINE_COUNT_MAX: 15,
  DESC_MIN: 2,
  DESC_COUNT_MAX: 4,
  PATH_MAX: 15,
}

/** โดเมน + path สวย ๆ แบบบรรทัดเขียวของ Google */
export function displayUrl(finalUrl: string, path1?: string, path2?: string): string {
  let host = finalUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  if (!host) host = 'example.com'
  const parts = [host, path1?.trim(), path2?.trim()].filter(Boolean)
  return parts.join('/')
}

/**
 * Preview หน้าตาเหมือนผลค้นหา Google — Google สุ่มหมุน headline ทีละ ~3 อัน
 * เราแสดง 3 อันแรกที่ไม่ว่าง (เหมือน preview ใน Ad Copy Builder เดิม)
 */
export function GoogleSearchPreview({ ad, brandName }: { ad: TextAdDraft; brandName?: string }) {
  const hs = ad.headlines.map(h => h.trim()).filter(Boolean).slice(0, 3)
  const ds = ad.descriptions.map(d => d.trim()).filter(Boolean).slice(0, 2)
  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Preview — Google Search</p>
      <div className="border border-gray-100 rounded-lg p-4 relative">
        <span className="absolute top-3 right-3 text-[10px] border border-gray-300 text-gray-500 rounded px-1">Ad</span>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
            {(brandName ?? 'G').trim().charAt(0).toUpperCase() || 'G'}
          </span>
          <div className="leading-tight min-w-0">
            <p className="text-xs text-gray-800 truncate">{brandName ?? displayUrl(ad.finalUrl)}</p>
            <p className="text-[11px] text-gray-500 truncate">{displayUrl(ad.finalUrl, ad.path1, ad.path2)}</p>
          </div>
        </div>
        <p className="text-lg text-blue-700 leading-snug font-medium">
          {hs.length > 0 ? hs.join(' | ') : 'Headline 1 | Headline 2 | Headline 3'}
        </p>
        <div className="mt-1 space-y-0.5">
          {(ds.length > 0 ? ds : ['Description จะแสดงตรงนี้']).map((d, i) => (
            <p key={i} className="text-sm text-gray-700 leading-snug">{d}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function download(filename: string, mime: string, content: string) {
  // BOM เพื่อให้ Excel เปิดไฟล์ภาษาไทยไม่เพี้ยน
  const blob = new Blob(['﻿' + content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

const safeName = (s: string) => (s.trim() || 'text-ads').replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_').slice(0, 60)
const today = () => new Date().toISOString().slice(0, 10)

/** CSV: 1 แถวต่อ 1 ช่องข้อความ — ลูกค้า comment ทีละช่องได้ */
export function exportTextAdsCsv(title: string, ads: TextAdDraft[]) {
  const rows = [
    ['Ad #', 'ประเภท', 'ลำดับ', 'ข้อความ', 'จำนวนตัวอักษร', 'ลิมิต'].map(csvCell).join(','),
  ]
  ads.forEach((ad, ai) => {
    ad.headlines.map(h => h.trim()).filter(Boolean).forEach((h, i) =>
      rows.push([`${ai + 1}`, 'Headline', `${i + 1}`, h, `${h.length}`, `${RSA_LIMITS.HEADLINE_MAX}`].map(csvCell).join(',')))
    ad.descriptions.map(d => d.trim()).filter(Boolean).forEach((d, i) =>
      rows.push([`${ai + 1}`, 'Description', `${i + 1}`, d, `${d.length}`, `${RSA_LIMITS.DESC_MAX}`].map(csvCell).join(',')))
    rows.push([`${ai + 1}`, 'Final URL', '', ad.finalUrl, '', ''].map(csvCell).join(','))
    if (ad.path1) rows.push([`${ai + 1}`, 'Path', '1', ad.path1, `${ad.path1.length}`, `${RSA_LIMITS.PATH_MAX}`].map(csvCell).join(','))
    if (ad.path2) rows.push([`${ai + 1}`, 'Path', '2', ad.path2, `${ad.path2.length}`, `${RSA_LIMITS.PATH_MAX}`].map(csvCell).join(','))
  })
  download(`${safeName(title)}_text-ads_${today()}.csv`, 'text/csv', rows.join('\n'))
}

/** HTML: เอกสารสวย ๆ มี preview แบบ Google + ตารางข้อความครบ ส่งให้ลูกค้าตรวจได้เลย */
export function exportTextAdsHtml(title: string, ads: TextAdDraft[], brandName?: string) {
  const previewBlock = (ad: TextAdDraft) => {
    const hs = ad.headlines.map(h => h.trim()).filter(Boolean)
    const ds = ad.descriptions.map(d => d.trim()).filter(Boolean)
    return `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;position:relative;background:#fff;max-width:600px">
      <span style="position:absolute;top:12px;right:12px;font-size:10px;border:1px solid #d1d5db;color:#6b7280;border-radius:3px;padding:0 4px">Ad</span>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="width:24px;height:24px;border-radius:50%;background:#2563eb;color:#fff;font-size:11px;font-weight:bold;display:inline-flex;align-items:center;justify-content:center">${esc((brandName ?? 'G').trim().charAt(0).toUpperCase() || 'G')}</span>
        <div style="line-height:1.2">
          <div style="font-size:12px;color:#1f2937">${esc(brandName ?? displayUrl(ad.finalUrl))}</div>
          <div style="font-size:11px;color:#6b7280">${esc(displayUrl(ad.finalUrl, ad.path1, ad.path2))}</div>
        </div>
      </div>
      <div style="font-size:18px;color:#1d4ed8;font-weight:500;line-height:1.35">${esc(hs.slice(0, 3).join(' | '))}</div>
      ${ds.slice(0, 2).map(d => `<div style="font-size:14px;color:#374151;line-height:1.4;margin-top:4px">${esc(d)}</div>`).join('')}
    </div>`
  }

  const tableBlock = (ad: TextAdDraft) => {
    const row = (type: string, i: number | '', text: string, limit: number | '') => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap">${type}${i !== '' ? ` ${i}` : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827">${esc(text)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:${limit !== '' && text.length > (limit as number) ? '#dc2626' : '#9ca3af'};text-align:right;white-space:nowrap">${limit !== '' ? `${text.length}/${limit}` : ''}</td>
      </tr>`
    return `
    <table style="border-collapse:collapse;width:100%;max-width:680px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <thead><tr style="background:#f9fafb">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">ประเภท</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">ข้อความ</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase">ตัวอักษร</th>
      </tr></thead>
      <tbody>
        ${ad.headlines.map(h => h.trim()).filter(Boolean).map((h, i) => row('Headline', i + 1, h, RSA_LIMITS.HEADLINE_MAX)).join('')}
        ${ad.descriptions.map(d => d.trim()).filter(Boolean).map((d, i) => row('Description', i + 1, d, RSA_LIMITS.DESC_MAX)).join('')}
        ${row('Final URL', '', ad.finalUrl, '')}
        ${ad.path1 ? row('Path', 1, ad.path1, RSA_LIMITS.PATH_MAX) : ''}
        ${ad.path2 ? row('Path', 2, ad.path2, RSA_LIMITS.PATH_MAX) : ''}
      </tbody>
    </table>`
  }

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8">
<title>${esc(title)} — Text Ads</title>
<style>body{font-family:'Noto Sans Thai','Segoe UI',Tahoma,sans-serif;background:#f3f4f6;margin:0;padding:32px;color:#111827}</style>
</head><body>
  <h1 style="font-size:22px;margin:0 0 4px">${esc(title)} — Text Ads สำหรับตรวจ</h1>
  <p style="font-size:13px;color:#6b7280;margin:0 0 24px">สร้างเมื่อ ${new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })} · Google จะสลับ Headline/Description อัตโนมัติ ตัวอย่างด้านล่างคือหนึ่งในรูปแบบที่เป็นไปได้</p>
  ${ads.map((ad, i) => `
    <h2 style="font-size:15px;margin:28px 0 10px">Ad ${i + 1}</h2>
    ${previewBlock(ad)}
    <div style="height:12px"></div>
    ${tableBlock(ad)}
  `).join('')}
</body></html>`
  download(`${safeName(title)}_text-ads_${today()}.html`, 'text/html', html)
}
