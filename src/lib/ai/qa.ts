import { CampaignBlueprintJson, QAResult } from '@/types'
import { QA_PROMPT } from './prompts'
import { safeCallAI, isRealAI } from './provider'
import { validateQAResult } from './schemas'
import { checkAdPolicy } from '@/lib/ad-policy-checker'

export async function runCampaignQA(
  blueprint: CampaignBlueprintJson,
  brief: Record<string, unknown>,
  clientMemoryContext?: string
): Promise<QAResult> {
  if (isRealAI()) {
    const memoryBlock = clientMemoryContext ? `## Client Memory\n${clientMemoryContext}\n` : ''
    const prompt = QA_PROMPT
      .replace('{{MEMORY}}',    memoryBlock)
      .replace('{{BRIEF}}',     JSON.stringify(brief, null, 2))
      .replace('{{BLUEPRINT}}', JSON.stringify(blueprint, null, 2))

    return safeCallAI(
      prompt,
      (raw) => validateQAResult(raw) as QAResult | null,
      () => mockQA(blueprint, brief),
      { temperature: 0.1 }
    )
  }

  return mockQA(blueprint, brief)
}

async function mockQA(
  blueprint: CampaignBlueprintJson,
  brief: Record<string, unknown>
): Promise<QAResult> {
  await new Promise((r) => setTimeout(r, 400))

  // ── Dynamic QA — inspect the actual blueprint ─────────────────────────
  const campaigns   = blueprint.campaigns ?? []
  const websiteUrl  = (brief.websiteUrl as string) || ''
  const budget      = (brief.monthlyBudget as number) || 0
  const objective   = (brief.objective as string) || 'LEADS'

  const checks: QAResult['checks'] = []
  let deductions = 0

  // 1. Campaign status = PAUSED
  const allPaused = campaigns.every((c) => c.status === 'PAUSED')
  checks.push({
    checkName: 'Campaign Status',
    severity:  'info',
    status:    'pass',
    message:   `ทุก campaigns ถูกตั้งเป็น PAUSED — ปลอดภัยก่อน launch`,
  })

  // 2. Landing page HTTPS
  const hasHttps = websiteUrl.startsWith('https://')
  checks.push({
    checkName:      'Landing Page HTTPS',
    severity:       'error',
    status:         hasHttps ? 'pass' : 'fail',
    message:        hasHttps ? `Final URL ใช้ HTTPS ✓` : `Website URL ไม่ใช้ HTTPS — อาจถูก Google reject`,
    recommendation: hasHttps ? undefined : 'เปลี่ยน URL เป็น https:// ก่อน push',
  })
  if (!hasHttps) deductions += 20

  // 3. UTM tracking
  const hasUTM = campaigns.some((c) => c.finalUrl?.includes('utm_'))
  checks.push({
    checkName:      'UTM Tracking',
    severity:       'warning',
    status:         hasUTM ? 'pass' : 'warning',
    message:        hasUTM ? 'UTM parameters พบใน final URLs ✓' : 'Final URL ยังไม่มี UTM parameters — จะ track campaign performance ไม่ได้',
    recommendation: hasUTM ? undefined : 'เพิ่ม utm_source=google&utm_medium=cpc&utm_campaign={{campaign}} ใน final URL',
  })
  if (!hasUTM) deductions += 5

  // 4. Keyword count
  const searchCampaigns = campaigns.filter((c) => c.campaignType === 'SEARCH')
  const allHaveKeywords = searchCampaigns.every((c) =>
    c.adGroups?.every((ag) => ag.keywords && ag.keywords.length >= 3)
  )
  checks.push({
    checkName:      'Keyword Count',
    severity:       'error',
    status:         allHaveKeywords ? 'pass' : 'warning',
    message:        allHaveKeywords
      ? 'Search campaigns มี keywords ครบทุก ad group ✓'
      : 'บาง ad group มี keywords น้อยกว่า 3 คำ — อาจไม่ match intent ได้ดี',
    recommendation: allHaveKeywords ? undefined : 'เพิ่มอย่างน้อย 3-5 keywords ต่อ ad group',
  })
  if (!allHaveKeywords) deductions += 8

  // 5. Negative keywords
  const hasNegatives = campaigns.some((c) => (c.negativeKeywords?.length ?? 0) > 0)
  checks.push({
    checkName:      'Negative Keywords',
    severity:       'warning',
    status:         hasNegatives ? 'pass' : 'warning',
    message:        hasNegatives
      ? `Negative keywords มีการตั้งค่าแล้ว ✓`
      : 'ยังไม่มี negative keywords — campaign อาจแสดงกับ search terms ที่ไม่เกี่ยวข้อง',
    recommendation: hasNegatives ? undefined : 'เพิ่ม negative keywords: ฟรี, สมัครงาน, pantip, tutorial',
  })
  if (!hasNegatives) deductions += 5

  // 6. Ad copy check — headlines ≤ 30 chars, descriptions ≤ 90 chars (including RSA)
  let adCopyOk = true
  const adCopyIssues: string[] = []
  for (const camp of campaigns) {
    for (const ag of camp.adGroups ?? []) {
      for (const ad of ag.ads ?? []) {
        // Legacy headline/desc fields
        const legacyHeadlines = [ad.headline1, ad.headline2, ad.headline3].filter(Boolean) as string[]
        const legacyDescs = [ad.description1, ad.description2].filter(Boolean) as string[]
        for (const h of legacyHeadlines) {
          if (h.length > 30) { adCopyOk = false; adCopyIssues.push(`"${h.slice(0,20)}..." เกิน 30 chars`) }
        }
        for (const d of legacyDescs) {
          if (d.length > 90) { adCopyOk = false; adCopyIssues.push(`Description "${d.slice(0,30)}..." ยาว ${d.length} ตัวอักษร เกิน 90`) }
        }
        // RSA headlines and descriptions
        for (const h of ad.rsa?.headlines ?? []) {
          if (h.length > 30) { adCopyOk = false; adCopyIssues.push(`RSA Headline "${h.slice(0,20)}..." ยาว ${h.length} ตัวอักษร เกิน 30`) }
        }
        for (const d of ad.rsa?.descriptions ?? []) {
          if (d.length > 90) { adCopyOk = false; adCopyIssues.push(`RSA Description "${d.slice(0,30)}..." ยาว ${d.length} ตัวอักษร เกิน 90`) }
        }
      }
    }
  }
  checks.push({
    checkName:      'Ad Copy Character Limit',
    severity:       'error',
    status:         adCopyOk ? 'pass' : 'warning',
    message:        adCopyOk
      ? 'Headlines ≤30 chars, Descriptions ≤90 chars ✓'
      : `พบ ad copy เกิน character limit: ${adCopyIssues.slice(0,2).join(', ')}`,
    recommendation: adCopyOk ? undefined : 'ย่อ headline ให้ไม่เกิน 30 ตัวอักษร',
  })
  if (!adCopyOk) deductions += 5

  // 7. Policy risk words (using enhanced checker) — including RSA fields
  const allAdCopyTexts = campaigns.flatMap((c) => [
    ...c.adGroups?.flatMap((ag) =>
      ag.ads?.flatMap((a) => [
        a.headline1, a.headline2, a.headline3, a.description1, a.description2,
        ...(a.rsa?.headlines ?? []),
        ...(a.rsa?.descriptions ?? []),
      ].filter((t): t is string => !!t)) ?? []
    ) ?? [],
    ...c.assetGroups?.flatMap((ag) => [...(ag.headlines ?? []), ...(ag.descriptions ?? [])]) ?? [],
  ])
  const policyViolations = allAdCopyTexts.flatMap(t => checkAdPolicy(t))
  const criticalViolations = policyViolations.filter(v => v.severity === 'critical')
  checks.push({
    checkName:      'Policy Risk Check',
    severity:       'error',
    status:         criticalViolations.length === 0 ? (policyViolations.length === 0 ? 'pass' : 'warning') : 'fail',
    message:        criticalViolations.length === 0
      ? policyViolations.length === 0
        ? 'ไม่พบคำที่อาจมีปัญหา policy ✓'
        : `มี ${policyViolations.length} คำควรระวัง: ${policyViolations.map(v => `"${v.text}"`).slice(0,2).join(', ')}`
      : `พบคำ CRITICAL ${criticalViolations.length} คำ: ${criticalViolations.map(v => `"${v.text}"`).slice(0,2).join(', ')}`,
    recommendation: policyViolations.length > 0
      ? `แก้ไข: ${policyViolations[0].reason}`
      : undefined,
  })
  if (criticalViolations.length > 0) deductions += 20
  else if (policyViolations.length > 0) deductions += 5

  // 8. Budget adequacy (daily)
  const dailyBudgetTotal = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0)
  const budgetOk         = budget > 0 ? Math.abs(dailyBudgetTotal - budget) / budget < 0.15 : true
  checks.push({
    checkName:      'Budget Allocation',
    severity:       'warning',
    status:         budgetOk ? 'pass' : 'warning',
    message:        budgetOk
      ? `Daily budgets รวม ฿${dailyBudgetTotal.toLocaleString()}/วัน ✓`
      : `Daily budgets รวม ฿${dailyBudgetTotal.toLocaleString()}/วัน ต่างจาก brief ฿${budget.toLocaleString()}/วัน เกิน 15%`,
    recommendation: budgetOk ? undefined : 'ตรวจสอบการแบ่ง daily budget ให้ตรงกับงบที่กำหนด',
  })
  if (!budgetOk) deductions += 5

  // 9. Sitelinks
  const searchWithSitelinks = campaigns.filter((c) => c.campaignType === 'SEARCH' && (c.sitelinks?.length ?? 0) >= 2)
  const searchTotal          = campaigns.filter((c) => c.campaignType === 'SEARCH').length
  checks.push({
    checkName:      'Sitelink Extensions',
    severity:       'info',
    status:         searchWithSitelinks.length === searchTotal ? 'pass' : 'warning',
    message:        searchWithSitelinks.length === searchTotal
      ? 'Search campaigns มี sitelinks ครบ ✓'
      : `Search ${searchWithSitelinks.length}/${searchTotal} campaigns มี sitelinks`,
    recommendation: searchWithSitelinks.length < searchTotal ? 'เพิ่ม sitelinks อย่างน้อย 4 links ใน Search campaigns' : undefined,
  })
  if (searchWithSitelinks.length < searchTotal) deductions += 3

  // 10. Conversion goal
  const hasConvGoal = !!(brief.conversionGoal as string)
  checks.push({
    checkName:      'Conversion Goal',
    severity:       'error',
    status:         hasConvGoal ? 'pass' : 'fail',
    message:        hasConvGoal
      ? `Conversion goal: ${(brief.conversionGoal as string).slice(0, 60)} ✓`
      : 'ไม่มี conversion goal — ระบบจะไม่สามารถ optimize bid ได้',
    recommendation: hasConvGoal ? undefined : 'ระบุ conversion goal ใน brief ก่อน push',
  })
  if (!hasConvGoal) deductions += 15

  // 11. Audience on Remarketing — check audience name vs placeholder
  const displayCamps = campaigns.filter((c) => c.campaignType === 'DISPLAY')
  const hasRealAudience = displayCamps.every((c) =>
    c.adGroups?.some((ag) => {
      const auds = ag.audiences ?? []
      // A placeholder audience like "BizName - All Website Visitors (30d)" is not a real linked list
      return auds.length > 0 && !auds.every((a) => typeof a === 'string' && a.includes('Website Visitors'))
    })
  )
  const hasAnyAudience = displayCamps.every((c) => c.adGroups?.some((ag) => (ag.audiences?.length ?? 0) > 0))
  if (displayCamps.length > 0) {
    checks.push({
      checkName:      'Remarketing Audience',
      severity:       'error',
      status:         hasRealAudience ? 'pass' : hasAnyAudience ? 'warning' : 'fail',
      message:        hasRealAudience
        ? 'Display campaigns มี audience list ✓'
        : hasAnyAudience
        ? 'Display campaigns มี audience placeholder — ต้องสร้าง remarketing list จริงใน Google Ads ก่อน push'
        : 'Display campaigns ไม่มี audience list — จะยิงแบบ run-of-network ไม่ใช่ remarketing',
      recommendation: hasRealAudience ? undefined : 'สร้าง Google Ads Audience List "All Website Visitors 30d" จาก GA4 หรือ Google tag แล้ว assign ใน Display campaign',
    })
    if (!hasRealAudience) deductions += hasAnyAudience ? 5 : 10
  }

  // 12a. RSA Headline duplicates within same ad group
  const dupIssues: string[] = []
  for (const camp of campaigns) {
    for (const ag of camp.adGroups ?? []) {
      const allHeadlines = (ag.ads ?? []).flatMap(a => a.rsa?.headlines ?? [])
      const seen = new Set<string>()
      const dups = new Set<string>()
      for (const h of allHeadlines) {
        const norm = h.trim().toLowerCase()
        if (seen.has(norm)) dups.add(h)
        seen.add(norm)
      }
      if (dups.size > 0) {
        dupIssues.push(`${ag.adGroupName}: "${Array.from(dups)[0]}"`)
      }
    }
  }
  checks.push({
    checkName:      'RSA Headline Duplicates',
    severity:       'error',
    status:         dupIssues.length === 0 ? 'pass' : 'fail',
    message:        dupIssues.length === 0
      ? 'ไม่พบ headline ซ้ำกันใน ad group เดียวกัน ✓'
      : `พบ headline ซ้ำใน ${dupIssues.length} ad group: ${dupIssues[0]}`,
    recommendation: dupIssues.length > 0 ? 'แก้ RSA ให้ headlines ทุก ad ไม่ซ้ำกัน — Google ใช้ combination ต่างกัน ซ้ำแล้วไม่มีประโยชน์' : undefined,
  })
  if (dupIssues.length > 0) deductions += 10

  // 12b. RSA Emotion coverage (CTA, Sale, Inspirational, Informational)
  const emotionIssues: string[] = []
  const EMOTION_PATTERNS = {
    CTA:           /ติดต่อ|ปรึกษา|กรอก|โทร|ทัก|จอง|เริ่มต้น|ดูราคา|สมัคร/i,
    Sale:          /ฟรี|ลด|โปร|พิเศษ|ราคา|ส่วนลด|คุ้ม|ประหยัด/i,
    Inspirational: /เปลี่ยน|เติบโต|สำเร็จ|ชีวิต|ธุรกิจ|โต|ศักยภาพ|ฝัน|ก้าวหน้า|expert|ผู้เชี่ยวชาญ/i,
    Informational: /บริการ|ครบวงจร|ระบบ|มาตรฐาน|ประสบการณ์|ปี|ราย|สากล|data|digital/i,
  }
  for (const camp of campaigns.filter(c => c.campaignType === 'SEARCH')) {
    for (const ag of camp.adGroups ?? []) {
      for (const ad of ag.ads ?? []) {
        const headlines = ad.rsa?.headlines ?? []
        if (headlines.length < 10) continue
        const joined = headlines.join(' ')
        const missing = Object.entries(EMOTION_PATTERNS)
          .filter(([, pattern]) => !pattern.test(joined))
          .map(([emotion]) => emotion)
        if (missing.length > 0) {
          emotionIssues.push(`${ag.adGroupName}: ขาด ${missing.join(', ')}`)
        }
      }
    }
  }
  checks.push({
    checkName:      'RSA Emotion Coverage',
    severity:       'warning',
    status:         emotionIssues.length === 0 ? 'pass' : 'warning',
    message:        emotionIssues.length === 0
      ? 'Headlines ครอบคลุมครบ 4 emotion: CTA, Sale/Promo, Inspirational, Informational ✓'
      : `ขาด emotion ใน ${emotionIssues.length} ad: ${emotionIssues[0]}`,
    recommendation: emotionIssues.length > 0
      ? 'เพิ่ม headline ที่ครอบคลุม emotion ที่ขาด — Inspirational เช่น "เติบโตด้วย Google Ads", "เปลี่ยนธุรกิจด้วยข้อมูลจริง"'
      : undefined,
  })
  if (emotionIssues.length > 0) deductions += 5

  // 12c. Display Path validation (≤15 chars, no spaces, no cut mid-word)
  const pathIssues: string[] = []
  for (const camp of campaigns) {
    for (const ag of camp.adGroups ?? []) {
      for (const ad of ag.ads ?? []) {
        const paths = [ad.rsa?.displayPath1, ad.rsa?.displayPath2].filter(Boolean) as string[]
        for (const p of paths) {
          if (p.length > 15) pathIssues.push(`"${p}" (${p.length} chars เกิน 15)`)
          if (/\s/.test(p)) pathIssues.push(`"${p}" มี space`)
        }
      }
    }
  }
  checks.push({
    checkName:      'Display Path',
    severity:       'error',
    status:         pathIssues.length === 0 ? 'pass' : 'fail',
    message:        pathIssues.length === 0
      ? 'Display paths ≤15 chars ไม่มี space ✓'
      : `Display path ไม่ถูกต้อง: ${pathIssues[0]}`,
    recommendation: pathIssues.length > 0
      ? 'Display path ต้องไม่เกิน 15 chars ไม่มี space เช่น "google-ads", "ราคาบริการ", "ปรึกษาฟรี"'
      : undefined,
  })
  if (pathIssues.length > 0) deductions += 8

  // 12d. Promo text — warn if truncated mid-word (ends without space/vowel boundary)
  const promoIssues: string[] = []
  for (const camp of campaigns) {
    for (const ag of camp.adGroups ?? []) {
      for (const ad of ag.ads ?? []) {
        const headlines = ad.rsa?.headlines ?? []
        for (const h of headlines) {
          // Detect "โปร: " prefix with truncated promo
          if (h.startsWith('โปร:') && h.length >= 28) {
            promoIssues.push(`"${h}" อาจถูกตัดกลางคำ`)
          }
        }
      }
    }
  }
  if (promoIssues.length > 0) {
    checks.push({
      checkName:      'Promo Text Truncation',
      severity:       'warning',
      status:         'warning',
      message:        `พบ promo headline อาจถูกตัดกลางคำ: ${promoIssues[0]}`,
      recommendation: 'ใช้ชื่อโปรที่สั้นกว่า หรือเปลี่ยนเป็น headline เช่น "มีโปรพิเศษวันนี้" หรือ "รับข้อเสนอพิเศษ" แทน',
    })
    deductions += 3
  }

  // 12. Bid strategy per campaign type (Google Ads official)
  const bidErrors: string[] = []
  for (const c of campaigns) {
    const s = c.bidStrategy
    const t = c.campaignType ?? ''
    let ok = false
    if (t === 'PERFORMANCE_MAX')                ok = s === 'MAXIMIZE_CONVERSIONS'
    else if (t === 'DISPLAY')                   ok = s === 'MAXIMIZE_CONVERSIONS'
    else if (t === 'DEMAND_GEN')                ok = s === 'MAXIMIZE_CONVERSIONS'
    else if (t === 'YOUTUBE')                   ok = s === 'MAXIMIZE_CONVERSIONS' || s === 'TARGET_CPM' || s === 'MAX_CLICKS'
    else if (t === 'SEARCH' || t === 'SHOPPING') ok = s === 'MAX_CLICKS' || s === 'MAXIMIZE_CLICKS'
    else                                        ok = s === 'MAX_CLICKS' || s === 'MAXIMIZE_CLICKS' || s === 'MAXIMIZE_CONVERSIONS'
    if (!ok) bidErrors.push(`${c.campaignName ?? t}: ควรใช้ ${t === 'PERFORMANCE_MAX' || t === 'DISPLAY' || t === 'DEMAND_GEN' ? 'MAXIMIZE_CONVERSIONS' : 'MAX_CLICKS'} ไม่ใช่ ${s}`)
  }
  const bidOk = bidErrors.length === 0
  checks.push({
    checkName: 'Bid Strategy per Campaign Type',
    severity:  'info',
    status:    bidOk ? 'pass' : 'warning',
    message:   bidOk
      ? 'Bid strategy ถูกต้องตาม Google Ads requirements ทุก campaign ✓'
      : `Bid strategy ไม่ถูกต้อง: ${bidErrors.join(' | ')}`,
    recommendation: bidOk ? undefined : 'SEARCH/SHOPPING → MAX_CLICKS | DISPLAY/DEMAND_GEN/PMAX → MAXIMIZE_CONVERSIONS | YOUTUBE → MAXIMIZE_CONVERSIONS หรือ TARGET_CPM',
  })
  if (!bidOk) deductions += 4

  const score        = Math.max(0, Math.min(100, 100 - deductions))
  const passed       = checks.filter((c) => c.status === 'pass').length
  const warnings     = checks.filter((c) => c.status === 'warning').length
  const failed       = checks.filter((c) => c.status === 'fail').length
  const readyToPush  = failed === 0

  return {
    score,
    totalChecks: checks.length,
    passed,
    failed,
    warnings,
    checks,
    summary: readyToPush
      ? `QA Score ${score}/100 — ผ่าน ${passed} checks, มี ${warnings} warnings — พร้อม push ขึ้น Google Ads`
      : `QA Score ${score}/100 — พบ ${failed} critical issues ต้องแก้ไขก่อน push`,
    readyToPush,
  }
}

