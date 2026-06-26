import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { CampaignBlueprintJson, RsaAdCopy, PMaxAssetGroup, DisplayAdCopy } from '@/types'

function esc(s: string | undefined | null): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function charStatus(s: string, max: number): { cls: string; ok: boolean } {
  const ok = s.length <= max
  return { cls: ok ? 'ok' : 'warn', ok }
}

// ── Ad builders ───────────────────────────────────────────────────────────────

function buildRsaPreview(rsa: RsaAdCopy, idx: number): string {
  const h = rsa.headlines ?? []
  const d = rsa.descriptions ?? []
  const url = rsa.finalUrl ?? ''
  const domain = url ? new URL(url.startsWith('http') ? url : 'https://' + url).hostname : 'example.com'
  const path1 = esc(rsa.displayPath1 ?? '')
  const path2 = esc(rsa.displayPath2 ?? '')
  const displayUrl = [domain, path1, path2].filter(Boolean).join('/')

  const h1 = esc(truncate(h[0] ?? 'Headline 1', 30))
  const h2 = esc(truncate(h[1] ?? 'Headline 2', 30))
  const h3 = esc(truncate(h[2] ?? 'Headline 3', 30))
  const d1 = esc(truncate(d[0] ?? '', 90))
  const d2 = esc(truncate(d[1] ?? '', 90))

  const headlineRows = h.map((txt, i) => {
    const st = charStatus(txt, 30)
    return `<tr><td class="asset-label">H${i + 1}</td><td class="asset-text ${st.cls}">${esc(txt)}</td><td class="char-count ${st.cls}">${txt.length}/30</td></tr>`
  }).join('')

  const descRows = d.map((txt, i) => {
    const st = charStatus(txt, 90)
    return `<tr><td class="asset-label">D${i + 1}</td><td class="asset-text ${st.cls}">${esc(txt)}</td><td class="char-count ${st.cls}">${txt.length}/90</td></tr>`
  }).join('')

  return `
<div class="ad-card search-card">
  <div class="ad-card-header">
    <span class="ad-type-badge search-badge">Search RSA</span>
    <span class="ad-index">#${idx + 1}</span>
  </div>
  <div class="serp-preview">
    <div class="serp-label-row">
      <span class="serp-ad-label">Ad</span>
      <span class="serp-url">${esc(displayUrl)}</span>
    </div>
    <div class="serp-headline">${h1} | ${h2} | ${h3}</div>
    <div class="serp-description">${d1}${d2 ? ' ' + d2 : ''}</div>
  </div>
  <div class="asset-section">
    <div class="asset-section-title">Headlines <span class="count-badge ${h.length >= 10 ? 'ok-badge' : 'warn-badge'}">${h.length}/15</span></div>
    <table class="asset-table">${headlineRows}</table>
  </div>
  <div class="asset-section">
    <div class="asset-section-title">Descriptions <span class="count-badge ${d.length >= 2 ? 'ok-badge' : 'warn-badge'}">${d.length}/4</span></div>
    <table class="asset-table">${descRows}</table>
  </div>
  ${rsa.finalUrl ? `<div class="final-url"><span class="final-url-label">Final URL</span> <a href="${esc(rsa.finalUrl)}" target="_blank">${esc(rsa.finalUrl)}</a></div>` : ''}
</div>`
}

function buildPMaxPreview(ag: PMaxAssetGroup, idx: number): string {
  const h  = ag.headlines ?? []
  const lh = ag.longHeadlines ?? []
  const d  = ag.descriptions ?? []
  const imgs = ag.imageAssets ?? []

  const headlineRows = h.map((txt, i) => {
    const st = charStatus(txt, 30)
    return `<tr><td class="asset-label">H${i + 1}</td><td class="asset-text ${st.cls}">${esc(txt)}</td><td class="char-count ${st.cls}">${txt.length}/30</td></tr>`
  }).join('')
  const lhRows = lh.map((txt, i) => {
    const st = charStatus(txt, 90)
    return `<tr><td class="asset-label">LH${i + 1}</td><td class="asset-text ${st.cls}">${esc(txt)}</td><td class="char-count ${st.cls}">${txt.length}/90</td></tr>`
  }).join('')
  const descRows = d.map((txt, i) => {
    const st = charStatus(txt, 90)
    return `<tr><td class="asset-label">D${i + 1}</td><td class="asset-text ${st.cls}">${esc(txt)}</td><td class="char-count ${st.cls}">${txt.length}/90</td></tr>`
  }).join('')

  const imageSlots = [
    { type: 'MARKETING_IMAGE',          label: 'Landscape 1200×628',  required: true },
    { type: 'SQUARE_MARKETING_IMAGE',   label: 'Square 1200×1200',    required: true },
    { type: 'LOGO',                     label: 'Logo 1200×1200',      required: true },
    { type: 'PORTRAIT_MARKETING_IMAGE', label: 'Portrait 960×1200',   required: false },
  ]
  const imageHtml = imageSlots.map(slot => {
    const img = imgs.find(im => im.assetType === slot.type) as { assetType: string; description: string; imageUrl?: string } | undefined
    if (img?.imageUrl) {
      return `<div class="img-slot filled"><img src="${esc(img.imageUrl)}" alt="${esc(slot.label)}" /><div class="img-label">${esc(slot.label)}</div></div>`
    }
    return `<div class="img-slot ${slot.required ? 'missing' : 'optional'}"><div class="img-placeholder">${slot.required ? '⚠' : '+'}</div><div class="img-label">${esc(slot.label)}${slot.required ? ' (ต้องอัปโหลด)' : ''}</div></div>`
  }).join('')

  const signals = ag.audienceSignals?.customIntent ?? []

  return `
<div class="ad-card pmax-card">
  <div class="ad-card-header">
    <span class="ad-type-badge pmax-badge">Performance Max</span>
    <span class="ad-index">Asset Group ${idx + 1}${ag.assetGroupName ? ': ' + esc(ag.assetGroupName) : ''}</span>
  </div>
  <div class="pmax-preview">
    <div class="pmax-preview-label">Ad Preview (Responsive)</div>
    <div class="pmax-display-card">
      <div class="pmax-img-placeholder"><div class="pmax-img-icon">🖼</div></div>
      <div class="pmax-display-text">
        <div class="pmax-headline-preview">${esc(truncate(h[0] ?? 'Headline', 30))}</div>
        <div class="pmax-longheadline-preview">${esc(truncate(lh[0] ?? 'Long Headline', 90))}</div>
        <div class="pmax-desc-preview">${esc(truncate(d[0] ?? 'Description', 90))}</div>
        ${ag.businessName ? `<div class="pmax-biz">${esc(ag.businessName)}</div>` : ''}
      </div>
    </div>
  </div>
  <div class="asset-section">
    <div class="asset-section-title">Headlines <span class="count-badge ${h.length >= 15 ? 'ok-badge' : 'warn-badge'}">${h.length}/15</span></div>
    <table class="asset-table">${headlineRows}</table>
  </div>
  <div class="asset-section">
    <div class="asset-section-title">Long Headlines <span class="count-badge ${lh.length >= 5 ? 'ok-badge' : 'warn-badge'}">${lh.length}/5</span></div>
    <table class="asset-table">${lhRows}</table>
  </div>
  <div class="asset-section">
    <div class="asset-section-title">Descriptions <span class="count-badge ${d.length >= 4 ? 'ok-badge' : 'warn-badge'}">${d.length}/4</span></div>
    <table class="asset-table">${descRows}</table>
  </div>
  <div class="asset-section">
    <div class="asset-section-title">Images</div>
    <div class="img-grid">${imageHtml}</div>
  </div>
  ${signals.length > 0 ? `<div class="asset-section"><div class="asset-section-title">Audience Signals</div><div class="tag-list">${signals.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div></div>` : ''}
  ${ag.finalUrl ? `<div class="final-url"><span class="final-url-label">Final URL</span> <a href="${esc(ag.finalUrl)}" target="_blank">${esc(ag.finalUrl)}</a></div>` : ''}
</div>`
}

function buildDisplayPreview(display: DisplayAdCopy, agName: string, idx: number): string {
  const h  = display.headlines ?? []
  const lh = display.longHeadlines ?? ['']
  const d  = display.descriptions ?? []

  const h1 = esc(truncate(h[0] ?? '', 30))
  const d1 = esc(truncate(d[0] ?? '', 90))

  return `
<div class="ad-card display-card">
  <div class="ad-card-header">
    <span class="ad-type-badge display-badge">Display / GDN</span>
    <span class="ad-index">#${idx + 1} — ${esc(agName)}</span>
  </div>
  <div class="display-preview">
    <div class="display-banner">
      <div class="display-banner-img">🖼</div>
      <div class="display-banner-text">
        <div class="display-headline">${h1 || 'Headline'}</div>
        <div class="display-desc">${d1 || 'Description'}</div>
        <div class="display-cta">เรียนรู้เพิ่มเติม ›</div>
      </div>
    </div>
  </div>
  ${h.length > 0 ? `<div class="asset-section"><div class="asset-section-title">Headlines</div><table class="asset-table">${h.map((txt, i) => { const st = charStatus(txt, 30); return `<tr><td class="asset-label">H${i + 1}</td><td class="asset-text ${st.cls}">${esc(txt)}</td><td class="char-count ${st.cls}">${txt.length}/30</td></tr>` }).join('')}</table></div>` : ''}
  ${lh[0] ? `<div class="asset-section"><div class="asset-section-title">Long Headline</div><table class="asset-table"><tr><td class="asset-label">LH</td><td class="asset-text">${esc(lh[0])}</td><td class="char-count">${lh[0].length}/90</td></tr></table></div>` : ''}
  ${d.length > 0 ? `<div class="asset-section"><div class="asset-section-title">Descriptions</div><table class="asset-table">${d.map((txt, i) => { const st = charStatus(txt, 90); return `<tr><td class="asset-label">D${i + 1}</td><td class="asset-text ${st.cls}">${esc(txt)}</td><td class="char-count ${st.cls}">${txt.length}/90</td></tr>` }).join('')}</table></div>` : ''}
  ${display.finalUrl ? `<div class="final-url"><span class="final-url-label">Final URL</span> <a href="${esc(display.finalUrl)}" target="_blank">${esc(display.finalUrl)}</a></div>` : ''}
</div>`
}

function buildKeywordSection(keywords: { keyword: string; matchType: string; adGroup: string }[]): string {
  if (keywords.length === 0) return ''

  const byAdGroup: Record<string, typeof keywords> = {}
  for (const kw of keywords) {
    if (!byAdGroup[kw.adGroup]) byAdGroup[kw.adGroup] = []
    byAdGroup[kw.adGroup].push(kw)
  }

  const groups = Object.entries(byAdGroup).map(([ag, kws]) => {
    const tags = kws.map(kw => {
      const cls   = kw.matchType === 'EXACT' ? 'kw-exact' : kw.matchType === 'PHRASE' ? 'kw-phrase' : 'kw-broad'
      const label = kw.matchType === 'EXACT' ? `[${kw.keyword}]` : kw.matchType === 'PHRASE' ? `"${kw.keyword}"` : kw.keyword
      return `<span class="kw-tag ${cls}">${esc(label)}</span>`
    }).join('')
    return `<div class="kw-group"><div class="kw-group-name">${esc(ag)} <span class="kw-count">(${kws.length} keywords)</span></div><div class="kw-tags">${tags}</div></div>`
  }).join('')

  return `<div class="kw-section">${groups}</div>`
}

// Comment section — interactive, calls /api/comments at runtime
function buildCommentSection(blueprintId: string, campaignName: string, campIdx: number): string {
  const safeId   = `camp_${campIdx}`
  const safeCamp = esc(campaignName)

  return `
<div class="comment-section" id="comments-${safeId}">
  <div class="comment-section-header" onclick="toggleComments('${safeId}')">
    <span class="comment-icon">💬</span>
    <span class="comment-title">Comments / ข้อเสนอแนะ</span>
    <span class="comment-count" id="count-${safeId}">0</span>
    <span class="comment-toggle-arrow" id="arrow-${safeId}">▶</span>
  </div>
  <div class="comment-body" id="body-${safeId}" style="display:none">
    <div class="comment-list" id="list-${safeId}">
      <div class="comment-loading">กำลังโหลด...</div>
    </div>
    <div class="comment-form">
      <div class="comment-form-row">
        <input type="text"   id="name-${safeId}"  placeholder="ชื่อของคุณ *"        class="comment-input" />
        <input type="email"  id="email-${safeId}" placeholder="อีเมล (ไม่บังคับ)"   class="comment-input" />
      </div>
      <div class="comment-form-row">
        <textarea id="text-${safeId}" placeholder="เขียน comment หรือข้อเสนอแนะ..." class="comment-textarea" rows="3"></textarea>
        <button onclick="submitComment('${safeId}','${blueprintId}','${safeCamp}')" class="comment-submit-btn">ส่ง</button>
      </div>
    </div>
  </div>
</div>`
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  SEARCH: 'Search', PERFORMANCE_MAX: 'Performance Max', DISPLAY: 'Display / GDN',
  VIDEO: 'Video', YOUTUBE: 'YouTube', SHOPPING: 'Shopping',
  DEMAND_GEN: 'Demand Gen', APP_CAMPAIGN: 'App Campaign',
}

const CAMPAIGN_COLORS: Record<string, string> = {
  SEARCH: '#1a73e8', PERFORMANCE_MAX: '#fa7b17', DISPLAY: '#7c3aed',
  VIDEO: '#ea4335', YOUTUBE: '#ea4335', SHOPPING: '#34a853',
  DEMAND_GEN: '#00897b', APP_CAMPAIGN: '#5c6bc0',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const blueprintId = searchParams.get('blueprintId')
  const mediaPlanId = searchParams.get('mediaPlanId')

  if (searchParams.get('format') !== 'html') {
    return NextResponse.json({ error: 'Use ?format=html' }, { status: 400 })
  }

  try {
    let bp
    if (blueprintId) {
      bp = await prisma.campaignBlueprint.findFirst({
        where: { id: blueprintId },
        include: { mediaPlan: { include: { brief: true } } },
      })
    } else if (mediaPlanId) {
      bp = await prisma.campaignBlueprint.findFirst({
        where: { mediaPlanId },
        include: { mediaPlan: { include: { brief: true } } },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!bp) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })

    const bpJson: CampaignBlueprintJson = JSON.parse(bp.blueprintJson as string)
    const businessName = bp.mediaPlan?.brief?.businessName ?? 'Campaign'
    const planId = bp.mediaPlanId
    const resolvedBlueprintId = bp.id
    const date = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

    // ── Determine base URL for comment API (from request origin) ──
    const origin = req.headers.get('x-forwarded-proto')
      ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
      : `http://${req.headers.get('host') ?? 'localhost:3010'}`

    // Load keywords from DB
    const keywordIdeas = planId
      ? await prisma.keywordIdea.findMany({
          where: { mediaPlanId: planId },
          orderBy: [{ campaignName: 'asc' }, { adGroupName: 'asc' }],
        })
      : []

    const campaigns = bpJson.campaigns ?? []
    const totalCampaigns = campaigns.length
    // Budget: sum per-day × 30 = monthly
    const totalBudgetPerDay   = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0)
    const totalBudgetPerMonth = totalBudgetPerDay * 30

    // Build campaign sections
    const campaignSections = campaigns.map((camp, ci) => {
      const color     = CAMPAIGN_COLORS[camp.campaignType] ?? '#5f6368'
      const typeLabel = CAMPAIGN_TYPE_LABELS[camp.campaignType] ?? camp.campaignType

      // Keywords for this campaign (from DB keyword research)
      const campKws = keywordIdeas
        .filter(k => k.campaignName === camp.campaignName)
        .map(k => ({ keyword: k.keyword, matchType: k.matchType ?? 'PHRASE', adGroup: k.adGroupName }))

      // Also pull keywords from blueprint adGroups (if present)
      const blueprintKws: { keyword: string; matchType: string; adGroup: string }[] = []
      for (const ag of camp.adGroups ?? []) {
        for (const kw of ag.keywords ?? []) {
          blueprintKws.push({
            keyword:   typeof kw === 'string' ? kw : (kw as { keyword?: string }).keyword ?? String(kw),
            matchType: typeof kw === 'string' ? 'BROAD' : (kw as { matchType?: string }).matchType ?? 'BROAD',
            adGroup:   ag.adGroupName,
          })
        }
      }

      // Prefer DB keywords; fall back to blueprint keywords
      const finalKws = campKws.length > 0 ? campKws : blueprintKws
      const kwHtml   = finalKws.length > 0 ? buildKeywordSection(finalKws) : ''

      // Build per-day + per-month budget
      const budgetPerDay   = camp.budget ?? 0
      const budgetPerMonth = budgetPerDay * 30

      let adHtml = ''
      if (camp.campaignType === 'SEARCH') {
        for (const ag of camp.adGroups ?? []) {
          for (let i = 0; i < (ag.ads ?? []).length; i++) {
            const ad = ag.ads![i]
            if (ad.rsa) adHtml += buildRsaPreview(ad.rsa, i)
          }
        }
      }
      if (camp.campaignType === 'PERFORMANCE_MAX') {
        for (let i = 0; i < (camp.assetGroups ?? []).length; i++) {
          adHtml += buildPMaxPreview(camp.assetGroups![i], i)
        }
        for (const ag of camp.adGroups ?? []) {
          for (let i = 0; i < (ag.ads ?? []).length; i++) {
            const ad = ag.ads![i]
            if (ad.pmax) adHtml += buildPMaxPreview(ad.pmax, i)
          }
        }
      }
      if (camp.campaignType === 'DISPLAY') {
        for (const ag of camp.adGroups ?? []) {
          for (let i = 0; i < (ag.ads ?? []).length; i++) {
            const ad = ag.ads![i]
            if (ad.display) adHtml += buildDisplayPreview(ad.display, ag.adGroupName, i)
          }
        }
      }

      const commentHtml = buildCommentSection(resolvedBlueprintId, camp.campaignName, ci)

      return `
<section class="campaign-section" id="camp-${ci}">
  <div class="campaign-header" style="border-left-color:${color}">
    <div class="campaign-header-left">
      <span class="campaign-type-chip" style="background:${color}20;color:${color};border-color:${color}40">${esc(typeLabel)}</span>
      <h2 class="campaign-name">${esc(camp.campaignName)}</h2>
    </div>
    <div class="campaign-meta">
      <span class="meta-item"><span class="meta-label">งบ/วัน</span> ฿${budgetPerDay.toLocaleString()}</span>
      <span class="meta-item meta-month"><span class="meta-label">งบ/เดือน</span> ฿${budgetPerMonth.toLocaleString()}</span>
      <span class="meta-item">${esc(camp.bidStrategy ?? '')}</span>
      ${(camp.locationTargets ?? []).length > 0 ? `<span class="meta-item">📍 ${esc((camp.locationTargets ?? []).join(', '))}</span>` : ''}
    </div>
  </div>

  ${finalKws.length > 0 ? `<div class="section-sub-title">Keywords (${finalKws.length})</div>${kwHtml}` : ''}
  ${adHtml ? `<div class="section-sub-title">Ad Copy</div><div class="ads-grid">${adHtml}</div>` : ''}
  ${!adHtml && finalKws.length === 0 ? '<div class="empty-state">ยังไม่มี Ad Copy — กลับไปขั้นตอน Ad Copy Builder</div>' : ''}

  ${commentHtml}
</section>`
    }).join('')

    // Sidebar TOC
    const tocItems = campaigns.map((c, i) => {
      const color = CAMPAIGN_COLORS[c.campaignType] ?? '#5f6368'
      return `<a href="#camp-${i}" class="toc-item"><span class="toc-dot" style="background:${color}"></span>${esc(c.campaignName.replace(/^Mercy\s*-\s*/i, ''))}</a>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(businessName)} — Ad Preview | Convert Cake</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
  :root {
    --blue: #1a73e8;
    --green: #34a853;
    --red: #ea4335;
    --gray-50: #f8f9fa;
    --gray-100: #f1f3f4;
    --gray-200: #e8eaed;
    --gray-500: #9aa0a6;
    --gray-700: #5f6368;
    --gray-900: #202124;
    --font: 'Google Sans','Roboto',-apple-system,sans-serif;
  }
  body { font-family:var(--font); background:#f8f9fa; color:var(--gray-900); display:flex; min-height:100vh }

  /* Sidebar */
  .sidebar { width:240px; min-height:100vh; background:white; border-right:1px solid var(--gray-200); flex-shrink:0; position:sticky; top:0; height:100vh; overflow-y:auto }
  .sidebar-logo { display:flex; align-items:center; gap:8px; padding:20px 16px 16px; border-bottom:1px solid var(--gray-200) }
  .sidebar-logo-icon { width:28px; height:28px; background:var(--blue); border-radius:6px; display:flex; align-items:center; justify-content:center; color:white; font-size:14px; font-weight:700 }
  .sidebar-logo-text { font-size:13px; font-weight:600; color:var(--gray-900) }
  .sidebar-section { padding:12px 8px }
  .sidebar-label { font-size:10px; font-weight:700; color:var(--gray-500); text-transform:uppercase; letter-spacing:.08em; padding:0 8px 6px }
  .toc-item { display:flex; align-items:flex-start; gap:8px; padding:6px 8px; border-radius:6px; text-decoration:none; color:var(--gray-700); font-size:12px; line-height:1.4; transition:background .1s }
  .toc-item:hover { background:var(--gray-100) }
  .toc-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:3px }

  /* Main */
  .main { flex:1; min-width:0; padding:24px 32px }
  .page-header { margin-bottom:28px }
  .page-title { font-size:22px; font-weight:400; color:var(--gray-900); margin-bottom:4px }
  .page-subtitle { font-size:13px; color:var(--gray-500) }
  .summary-pills { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px }
  .pill { display:inline-flex; align-items:center; gap:4px; background:white; border:1px solid var(--gray-200); border-radius:100px; padding:4px 12px; font-size:12px; color:var(--gray-700) }
  .pill strong { color:var(--gray-900) }
  .pill.month-pill { background:#e8f0fe; border-color:#c5d9f7; color:#174ea6 }
  .pill.month-pill strong { color:#174ea6 }

  /* Campaign section */
  .campaign-section { background:white; border-radius:12px; border:1px solid var(--gray-200); margin-bottom:20px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.06) }
  .campaign-header { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:16px 20px; border-bottom:1px solid var(--gray-100); border-left:4px solid transparent }
  .campaign-header-left { display:flex; align-items:center; gap:10px; flex-wrap:wrap }
  .campaign-type-chip { font-size:11px; font-weight:600; padding:3px 8px; border-radius:100px; border:1px solid; flex-shrink:0 }
  .campaign-name { font-size:14px; font-weight:500 }
  .campaign-meta { display:flex; gap:12px; flex-wrap:wrap; align-items:center }
  .meta-item { font-size:12px; color:var(--gray-700) }
  .meta-label { font-size:10px; color:var(--gray-500); margin-right:3px }
  .meta-month { background:#e8f0fe; color:#174ea6; padding:2px 8px; border-radius:100px; font-weight:600 }
  .section-sub-title { font-size:11px; font-weight:700; color:var(--gray-500); text-transform:uppercase; letter-spacing:.06em; padding:12px 20px 4px }

  /* Ads grid */
  .ads-grid { padding:8px 16px 16px; display:grid; grid-template-columns:repeat(auto-fill,minmax(440px,1fr)); gap:16px }
  .empty-state { padding:16px 20px; font-size:13px; color:var(--gray-500) }

  /* Ad Card */
  .ad-card { border:1px solid var(--gray-200); border-radius:10px; overflow:hidden; background:white }
  .ad-card-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--gray-50); border-bottom:1px solid var(--gray-200) }
  .ad-type-badge { font-size:10px; font-weight:700; padding:2px 7px; border-radius:100px }
  .search-badge { background:#e8f0fe; color:var(--blue) }
  .pmax-badge { background:#fde8d0; color:#fa7b17 }
  .display-badge { background:#ede7f6; color:#7c3aed }
  .ad-index { font-size:11px; color:var(--gray-500) }

  /* SERP */
  .serp-preview { padding:12px 16px; border-bottom:1px solid var(--gray-100) }
  .serp-label-row { display:flex; align-items:center; gap:6px; margin-bottom:4px }
  .serp-ad-label { font-size:10px; font-weight:700; color:white; background:#006621; padding:1px 4px; border-radius:3px }
  .serp-url { font-size:13px; color:#006621 }
  .serp-headline { font-size:18px; color:var(--blue); font-weight:400; line-height:1.3; margin-bottom:3px }
  .serp-description { font-size:13px; color:var(--gray-700); line-height:1.5 }

  /* PMax preview */
  .pmax-preview { padding:12px 16px; border-bottom:1px solid var(--gray-100) }
  .pmax-preview-label { font-size:10px; color:var(--gray-500); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:.06em }
  .pmax-display-card { display:flex; gap:12px; border:1px solid var(--gray-200); border-radius:8px; overflow:hidden }
  .pmax-img-placeholder { width:120px; height:90px; background:linear-gradient(135deg,#e8f0fe,#fde8d0); display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0 }
  .pmax-display-text { padding:10px 12px; flex:1; min-width:0 }
  .pmax-headline-preview { font-size:14px; font-weight:500; color:var(--blue); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
  .pmax-longheadline-preview { font-size:13px; color:var(--gray-900); margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical }
  .pmax-desc-preview { font-size:12px; color:var(--gray-700); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .pmax-biz { font-size:10px; color:var(--gray-500); margin-top:4px }

  /* Display preview */
  .display-preview { padding:12px 16px; border-bottom:1px solid var(--gray-100) }
  .display-banner { display:flex; gap:10px; border:1px solid var(--gray-200); border-radius:8px; overflow:hidden; max-width:380px }
  .display-banner-img { width:100px; height:80px; background:linear-gradient(135deg,#ede7f6,#e8eaf6); display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0 }
  .display-banner-text { padding:10px; flex:1 }
  .display-headline { font-size:14px; font-weight:500; margin-bottom:4px }
  .display-desc { font-size:12px; color:var(--gray-700); margin-bottom:6px }
  .display-cta { font-size:12px; color:var(--blue); font-weight:500 }

  /* Asset tables */
  .asset-section { padding:10px 14px }
  .asset-section-title { font-size:11px; font-weight:600; color:var(--gray-700); margin-bottom:6px; display:flex; align-items:center; gap:6px }
  .count-badge { font-size:10px; padding:1px 6px; border-radius:100px; font-weight:600 }
  .ok-badge { background:#e6f4ea; color:#137333 }
  .warn-badge { background:#fce8e6; color:#c5221f }
  .asset-table { width:100%; border-collapse:collapse; font-size:12px }
  .asset-table tr:not(:last-child) td { border-bottom:1px solid var(--gray-100) }
  .asset-label { width:32px; color:var(--gray-500); font-weight:600; padding:4px 6px 4px 0; white-space:nowrap; vertical-align:top; padding-top:5px }
  .asset-text { color:var(--gray-900); padding:4px 8px 4px 0; line-height:1.4 }
  .asset-text.warn { color:#c5221f }
  .char-count { white-space:nowrap; text-align:right; font-size:10px; color:var(--gray-500); padding:4px 0; vertical-align:top; padding-top:6px }
  .char-count.ok { color:#137333 }
  .char-count.warn { color:#c5221f; font-weight:600 }

  /* Image grid */
  .img-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:0 0 4px }
  .img-slot { border:1px dashed var(--gray-200); border-radius:8px; aspect-ratio:1; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:11px; color:var(--gray-500); overflow:hidden }
  .img-slot.filled { border-style:solid; border-color:var(--green) }
  .img-slot.missing { border-color:var(--red); background:#fce8e6 }
  .img-slot img { width:100%; height:100%; object-fit:cover }
  .img-placeholder { font-size:20px; margin-bottom:4px }
  .img-label { font-size:10px; text-align:center; padding:4px; color:var(--gray-700) }
  .img-slot.missing .img-label { color:var(--red) }

  /* Keywords */
  .kw-section { padding:0 16px 12px }
  .kw-group { margin-bottom:10px }
  .kw-group-name { font-size:12px; font-weight:600; color:var(--gray-700); margin-bottom:6px }
  .kw-count { font-size:11px; font-weight:400; color:var(--gray-500) }
  .kw-tags { display:flex; flex-wrap:wrap; gap:4px }
  .kw-tag { font-size:11px; padding:2px 8px; border-radius:100px; border:1px solid }
  .kw-exact { background:#e6f4ea; color:#137333; border-color:#ceead6 }
  .kw-phrase { background:#e8f0fe; color:var(--blue); border-color:#c5d9f7 }
  .kw-broad { background:#fef9e7; color:#b5770d; border-color:#fde68a }

  /* Tag list */
  .tag-list { display:flex; flex-wrap:wrap; gap:4px; padding-top:4px }
  .tag { background:var(--gray-100); color:var(--gray-700); font-size:11px; padding:2px 8px; border-radius:100px }

  /* Final URL */
  .final-url { padding:6px 14px 10px; font-size:11px; color:var(--gray-500) }
  .final-url a { color:var(--blue); text-decoration:none }
  .final-url a:hover { text-decoration:underline }
  .final-url-label { font-weight:600; color:var(--gray-700); margin-right:4px }

  /* Comment section */
  .comment-section { border-top:1px solid var(--gray-100) }
  .comment-section-header { display:flex; align-items:center; gap:8px; padding:12px 20px; cursor:pointer; user-select:none; transition:background .1s }
  .comment-section-header:hover { background:var(--gray-50) }
  .comment-icon { font-size:14px }
  .comment-title { font-size:13px; font-weight:500; color:var(--gray-700); flex:1 }
  .comment-count { font-size:11px; background:#e8f0fe; color:var(--blue); font-weight:700; padding:1px 7px; border-radius:100px }
  .comment-toggle-arrow { font-size:10px; color:var(--gray-500); transition:transform .2s }
  .comment-body { padding:0 20px 16px }
  .comment-list { margin-bottom:12px }
  .comment-loading { font-size:12px; color:var(--gray-500); padding:8px 0 }
  .comment-item { display:flex; gap:10px; margin-bottom:10px }
  .comment-avatar { width:28px; height:28px; border-radius:50%; background:var(--blue); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0 }
  .comment-bubble { flex:1; background:var(--gray-50); border-radius:10px; padding:8px 12px }
  .comment-meta { display:flex; align-items:center; gap:8px; margin-bottom:4px }
  .comment-author { font-size:12px; font-weight:600; color:var(--gray-900) }
  .comment-email { font-size:10px; color:var(--gray-500) }
  .comment-resolved { font-size:10px; background:#e6f4ea; color:#137333; padding:1px 6px; border-radius:100px }
  .comment-text { font-size:13px; color:var(--gray-700); line-height:1.5 }
  .comment-time { font-size:10px; color:var(--gray-500); margin-top:3px }
  .comment-empty { font-size:12px; color:var(--gray-500); padding:8px 0 }
  .comment-form { background:var(--gray-50); border-radius:10px; padding:12px }
  .comment-form-row { display:flex; gap:8px; margin-bottom:8px }
  .comment-form-row:last-child { margin-bottom:0 }
  .comment-input { flex:1; border:1px solid var(--gray-200); border-radius:8px; padding:8px 10px; font-size:13px; font-family:var(--font); outline:none; transition:border .15s }
  .comment-input:focus { border-color:var(--blue) }
  .comment-textarea { flex:1; border:1px solid var(--gray-200); border-radius:8px; padding:8px 10px; font-size:13px; font-family:var(--font); outline:none; resize:vertical; transition:border .15s }
  .comment-textarea:focus { border-color:var(--blue) }
  .comment-submit-btn { background:var(--blue); color:white; border:none; border-radius:8px; padding:8px 20px; font-size:13px; font-weight:600; cursor:pointer; font-family:var(--font); align-self:flex-end; transition:background .15s; white-space:nowrap }
  .comment-submit-btn:hover { background:#1557b0 }
  .comment-submit-btn:disabled { opacity:.5; cursor:not-allowed }

  /* Footer */
  .page-footer { margin-top:32px; padding:16px 0; border-top:1px solid var(--gray-200); font-size:11px; color:var(--gray-500); display:flex; justify-content:space-between }

  @media print {
    .sidebar, .comment-section { display:none }
    .main { padding:0 }
    .campaign-section { break-inside:avoid }
  }
  @media (max-width:768px) {
    body { flex-direction:column }
    .sidebar { width:100%; min-height:auto; height:auto; position:static }
    .ads-grid { grid-template-columns:1fr }
    .comment-form-row { flex-direction:column }
  }
</style>
</head>
<body>

<nav class="sidebar">
  <div class="sidebar-logo">
    <div class="sidebar-logo-icon">C</div>
    <div class="sidebar-logo-text">Convert Cake</div>
  </div>
  <div class="sidebar-section">
    <div class="sidebar-label">Campaigns (${totalCampaigns})</div>
    ${tocItems}
  </div>
</nav>

<main class="main">
  <div class="page-header">
    <div class="page-title">${esc(businessName)} — Ad Preview</div>
    <div class="page-subtitle">สร้างโดย Convert Cake · เอกสารนี้สำหรับตรวจ ad copy ก่อน publish</div>
    <div class="summary-pills">
      <span class="pill"><strong>${totalCampaigns}</strong> Campaigns</span>
      <span class="pill month-pill">Budget <strong>฿${totalBudgetPerMonth.toLocaleString()}</strong>/เดือน</span>
      <span class="pill">฿${totalBudgetPerDay.toLocaleString()}/วัน</span>
      <span class="pill">${esc(date)}</span>
      ${keywordIdeas.length > 0 ? `<span class="pill"><strong>${keywordIdeas.length}</strong> Keywords</span>` : ''}
    </div>
  </div>

  ${campaignSections}

  <div class="page-footer">
    <span>Convert Cake — Confidential · สำหรับ internal review เท่านั้น</span>
    <span>สร้าง ${esc(date)}</span>
  </div>
</main>

<script>
// ── Comment system ────────────────────────────────────────────────────────────
const API_BASE = '${origin}'
const BLUEPRINT_ID = '${resolvedBlueprintId}'

// Load comments for all sections on page load
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('[id^="comments-camp_"]').forEach(function(el) {
    const idx = el.id.replace('comments-camp_', '')
    const btn = el.querySelector('.comment-section-header')
    if (btn) {
      const camp = btn.getAttribute('data-camp') || ''
      loadComments('camp_' + idx, camp)
    }
  })
  // Set data-camp on each header
  document.querySelectorAll('.comment-section-header').forEach(function(el) {
    // camp name is embedded via onclick attr
  })
  // Pre-load all comment counts
  fetch(API_BASE + '/api/comments?blueprintId=' + BLUEPRINT_ID)
    .then(function(r){ return r.json() })
    .then(function(data){
      var comments = data.comments || []
      // Group by campaign and update counts
      var countByCamp = {}
      comments.forEach(function(c){ countByCamp[c.campaignName] = (countByCamp[c.campaignName]||0)+1 })
      // Update all count badges - we match by stored campaign name in the onclick
    })
    .catch(function(){})
})

function toggleComments(id) {
  var body  = document.getElementById('body-' + id)
  var arrow = document.getElementById('arrow-' + id)
  if (!body) return
  var isOpen = body.style.display !== 'none'
  body.style.display = isOpen ? 'none' : 'block'
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)'
}

function loadComments(id, campaignName) {
  var list = document.getElementById('list-' + id)
  var countEl = document.getElementById('count-' + id)
  if (!list) return
  fetch(API_BASE + '/api/comments?blueprintId=' + BLUEPRINT_ID)
    .then(function(r){ return r.json() })
    .then(function(data){
      var all = (data.comments || []).filter(function(c){ return c.campaignName === campaignName })
      if (countEl) countEl.textContent = all.length
      if (all.length === 0) {
        list.innerHTML = '<div class="comment-empty">ยังไม่มี comment — เป็นคนแรกที่แสดงความคิดเห็น!</div>'
        return
      }
      list.innerHTML = all.map(function(c){
        var initial = (c.authorName||'?')[0].toUpperCase()
        var timeStr = new Date(c.createdAt).toLocaleString('th-TH', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
        return '<div class="comment-item">'
          + '<div class="comment-avatar">' + initial + '</div>'
          + '<div class="comment-bubble">'
          + '<div class="comment-meta">'
          + '<span class="comment-author">' + escHtml(c.authorName) + '</span>'
          + (c.authorEmail ? '<span class="comment-email">' + escHtml(c.authorEmail) + '</span>' : '')
          + (c.status === 'resolved' ? '<span class="comment-resolved">✓ resolved</span>' : '')
          + '</div>'
          + '<div class="comment-text">' + escHtml(c.comment) + '</div>'
          + '<div class="comment-time">' + timeStr + '</div>'
          + '</div></div>'
      }).join('')
    })
    .catch(function(){ list.innerHTML = '<div class="comment-empty">โหลดไม่ได้ — กรุณา refresh</div>' })
}

function submitComment(id, blueprintId, campaignName) {
  var nameEl  = document.getElementById('name-'  + id)
  var emailEl = document.getElementById('email-' + id)
  var textEl  = document.getElementById('text-'  + id)
  var btn     = document.querySelector('#comments-' + id + ' .comment-submit-btn')

  if (!nameEl || !textEl) return
  var name  = nameEl.value.trim()
  var email = emailEl ? emailEl.value.trim() : ''
  var text  = textEl.value.trim()

  if (!name || !text) { alert('กรุณากรอกชื่อและ comment'); return }

  if (btn) btn.disabled = true
  fetch(API_BASE + '/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blueprintId: blueprintId, campaignName: campaignName, authorName: name, authorEmail: email || undefined, comment: text })
  })
  .then(function(r){ return r.json() })
  .then(function(){
    if (textEl) textEl.value = ''
    loadComments(id, campaignName)
  })
  .catch(function(){ alert('เกิดข้อผิดพลาด — กรุณาลองใหม่') })
  .finally(function(){ if (btn) btn.disabled = false })
}

function escHtml(s) {
  if (!s) return ''
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
</script>
</body>
</html>`

    const filename = `${businessName.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}_ad_preview.html`

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
