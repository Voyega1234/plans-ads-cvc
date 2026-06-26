import type {
  CampaignBlueprintJson, KeywordAudiencePlan, MediaPlanJson,
  RsaAdCopy, PMaxAssetGroup, DisplayAdCopy, AdCopy,
} from '@/types'
import { CAMPAIGN_BLUEPRINT_PROMPT } from './prompts'
import { safeCallAI, isRealAI } from './provider'
import { validateBlueprint } from './schemas'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultBidStrategy(type: string): string {
  switch (type) {
    case 'PERFORMANCE_MAX': return 'MAXIMIZE_CONVERSIONS'
    case 'DEMAND_GEN':      return 'MAXIMIZE_CONVERSIONS'
    case 'DISPLAY':         return 'MAXIMIZE_CONVERSIONS'
    case 'VIDEO':
    case 'YOUTUBE':         return 'MAXIMIZE_CONVERSIONS'
    case 'APP_CAMPAIGN':    return 'MAXIMIZE_CONVERSIONS'
    case 'SHOPPING':        return 'MAXIMIZE_CLICKS'
    case 'SEARCH':
    default:                return 'MAXIMIZE_CLICKS'
  }
}

// Strip banned words/phrases from ad copy
const BANNED_PATTERNS = [
  /การันตี\s*\d*%?/gi, /รับประกันผล/gi, /ผ่านแน่นอน/gi, /อนุมัติแน่/gi,
  /ไม่ต้องใช้เอกสาร/gi, /ดีที่สุดในโลก/gi, /ถูกที่สุด/gi, /อันดับ\s*1\s*ในโลก/gi,
  /ฟรี\s*100%/gi, /ไม่เช็คเครดิต/gi, /100%\s*ฟรี/gi, /คลิกที่นี่!/gi,
]

function sanitizeCopy(text: string): string {
  let result = text
  for (const pattern of BANNED_PATTERNS) {
    result = result.replace(pattern, '')
  }
  // Remove emoji from headlines (Google rejects them in headlines)
  result = result.replace(/[🌀-\uDFFF]|[🐀-\uDE4F]|[🚀-\uDEFF]/g, '')
  // Remove forbidden special characters — | and parentheses (Google SYMBOLS policy)
  result = result.replace(/[—–\-|()\[\]{}]/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return result
}

// Cut text at a word boundary — never mid-word
function wordCut(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > max * 0.5 ? cut.slice(0, lastSpace).trim() : cut.trim()
}

// Build a headline that fits within max chars WITHOUT cutting mid-word/sentence
function h(text: string, max = 30): string {
  const clean = sanitizeCopy(text)
  return wordCut(clean, max)
}

function d(text: string, max = 90): string {
  // Descriptions allow emoji but still must be sanitized
  return sanitizeCopy(text).slice(0, max)
}

// Derive USP list from brand tone string — specific & verifiable, not vague superlatives
function deriveUsps(tone: string): string[] {
  const toneMap: Record<string, string[]> = {
    professional:  ['ประสบการณ์กว่า 10 ปี', 'ทีมผู้เชี่ยวชาญเฉพาะทาง', 'มาตรฐานสากล', 'ให้บริการมาแล้วกว่า 5,000 ราย'],
    trustworthy:   ['ให้บริการมาแล้วกว่า 5,000 ราย', 'รีวิวจากลูกค้าจริง', 'ราคาโปร่งใส ไม่มีค่าใช้จ่ายแอบแฝง', 'มีใบรับรองจากหน่วยงาน'],
    modern:        ['ระบบออนไลน์ 100%', 'สะดวก รวดเร็ว ทุกที่', 'เทคโนโลยีทันสมัย', 'ไม่ต้องเดินทาง ดำเนินการออนไลน์'],
    friendly:      ['ปรึกษาฟรี ไม่มีเงื่อนไข', 'ทีมงานตอบไวภายใน 1 ชม.', 'ดูแลใกล้ชิดทุกขั้นตอน', 'บริการ 7 วัน ไม่มีวันหยุด'],
    aspirational:  ['เปลี่ยนชีวิตด้วยก้าวแรก', 'เริ่มต้นวันนี้ เห็นผลจริง', 'ลูกค้าพึงพอใจ 4.9/5', 'ช่วยลูกค้าสำเร็จแล้วกว่า 3,000 ราย'],
    urgent:        ['จำกัดจำนวน รับด่วน', 'โปรพิเศษเฉพาะเดือนนี้', 'ว่างรับลูกค้าใหม่อีก 5 ราย', 'ราคาพิเศษถึงสิ้นเดือน'],
  }
  const keys = tone.toLowerCase().split(/[,\s]+/)
  const usps: string[] = []
  for (const key of keys) {
    for (const [k, v] of Object.entries(toneMap)) {
      if (key.includes(k)) {
        for (const u of v) {
          if (!usps.includes(u)) usps.push(u)
        }
      }
    }
  }
  // Defaults — specific & believable
  if (!usps.some(u => u.includes('ปี') || u.includes('ราย'))) usps.push('ให้บริการมาแล้วกว่า 5,000 ราย')
  if (!usps.some(u => u.includes('ราคา'))) usps.push('ราคาโปร่งใส ไม่มีค่าใช้จ่ายแอบแฝง')
  if (!usps.some(u => u.includes('ฟรี') || u.includes('ปรึกษา'))) usps.push('ปรึกษาฟรี ไม่มีเงื่อนไข')
  return usps
}

// ── Full RSA Builder (15H + 4D) ───────────────────────────────────────────────

function buildRsa(
  brief: Record<string, unknown>,
  adGroupName: string,
  adGroupIndex: number,
  isRemarketing = false,
  adGroupKeywords: string[] = [],
  isVariantB = false
): RsaAdCopy {
  const bizName  = (brief.businessName as string) || 'Business'
  const product  = (brief.productService as string) || ''
  const promo    = (brief.promotion as string) || ''
  const tone     = (brief.brandTone as string) || 'Professional'
  const goal     = (brief.conversionGoal as string) || 'ติดต่อเรา'
  const url      = (brief.websiteUrl as string) || 'https://example.com'
  const location = ((brief.targetLocation as string) || 'Thailand').split(',')[0].trim()

  const productShort = wordCut(product, 28)
  const usps  = deriveUsps(tone)
  // Normalize goal to Thai CTA — avoid "Phone call" stuck to Thai text
  const rawGoal = goal.split('/')[0].trim()
  const goalThai: Record<string, string> = {
    'phone call': 'โทรหาเรา', 'form submission': 'กรอกฟอร์ม', 'form submit': 'กรอกฟอร์ม',
    'line': 'ทัก LINE', 'line chat': 'ทัก LINE', 'line oa': 'ทัก LINE',
    'appointment': 'จองนัด', 'booking': 'จองนัด', 'contact': 'ติดต่อเรา',
    'call': 'โทรหาเรา',
  }
  const goalShort = goalThai[rawGoal.toLowerCase()] ?? wordCut(rawGoal, 15)
  const bizShort  = wordCut(bizName, 25)

  // Safe displayPath: strip spaces, cut at word boundary, lowercase, max 15 chars
  function safePath(text: string, max = 15): string {
    // Try to use the first meaningful word(s)
    const words = text.replace(/[^฀-๿a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean)
    let result = ''
    for (const w of words) {
      if ((result + w).length <= max) result += w
      else break
    }
    return (result || text.replace(/\s/g, '').slice(0, max)).toLowerCase()
  }

  if (isRemarketing) {
    return {
      adType: 'RSA',
      headlines: [
        h(`ยังสนใจ${wordCut(productShort, 16)}อยู่ไหม`),
        h(`${bizShort} พร้อมช่วยคุณ`),
        h(usps[0]),
        h(usps[1]),
        h(promo ? promo : `${goalShort}วันนี้`),
        h(`กลับมาดูข้อมูลอีกครั้ง`),
        h(`${bizShort} ยังรอคุณอยู่`),
        h(usps[2] ?? 'ติดต่อได้เลย'),
        h(`${location} พร้อมให้บริการ`),
      ],
      descriptions: [
        d(`กลับมาค้นหาข้อมูล ${wordCut(productShort, 28)} ทีมงานพร้อมให้คำปรึกษาฟรีทุกวัน`),
        d(promo ? promo : `${usps[1]} ติดต่อ${goalShort}ได้เลย ไม่มีค่าใช้จ่าย`),
        d(`${bizName} บริการลูกค้ามาแล้วกว่า 10,000 ราย ด้วยมาตรฐานระดับสากล`),
        d(`อย่าพลาดโอกาสนี้ ${wordCut(productShort, 35)} ราคาพิเศษ จำกัดจำนวน`),
        d(`${usps[2] ?? 'ดูแลทุกขั้นตอน'} ${bizName} ยินดีตอบทุกคำถาม ${goalShort}ได้เลยวันนี้`),
      ],
      finalUrl: url,
      displayPath1: safePath(bizName),
    }
  }

  // Use top keywords from ad group as first headlines for relevance
  const kwHeadlines = adGroupKeywords.filter(kw => kw && kw.trim().length > 0).slice(0, 3).map((kw) => h(kw))

  // Variant A — Emotional & trust + Inspirational angle
  // Variant B — Sales, urgency & informational angle (must NOT overlap with Variant A)
  // Rule: Variant B does NOT reuse any headline/description from Variant A
  const headlines: string[] = isVariantB
    ? [
        // Variant B: Sales / Urgency / Informational — no overlap with Variant A
        kwHeadlines[0] ?? h(`${wordCut(productShort, 18)} ราคาพิเศษ`),
        h(promo ? promo : `${goalShort}วันนี้เลย`),
        h(`รับข้อมูล${wordCut(productShort, 13)}ฟรี`),
        h(`สมัครรับข้อมูลฟรีวันนี้`),
        h(promo ? `${bizShort} มีโปรพิเศษ` : `โปรโมชันเฉพาะเดือนนี้`),
        h(`เปรียบเทียบ${wordCut(productShort, 13)}`),
        h(`${location} บริการคุณโดยตรง`),
        h(`${bizShort} ตอบทุกคำถาม`),
        kwHeadlines[1] ?? h(`ดูข้อมูล${wordCut(productShort, 16)}`),
        h(`บริการครบวงจร ราคาโปร่งใส`),
        h(`ว่างรับลูกค้าใหม่อีก 5 ราย`),
        h(`${bizShort} บริการ 7 วัน`),
        kwHeadlines[2] ?? h(`เริ่มต้น${wordCut(productShort, 16)}`),
        h(`ราคาพิเศษถึงสิ้นเดือนนี้`),
        h(`ติดต่อ${wordCut(bizShort, 14)}เลย`),
      ]
    : [
        // Variant A: Emotional / Trust / Inspirational
        kwHeadlines[0] ?? h(productShort),
        h(`${bizShort} ผู้เชี่ยวชาญ`),        // Informational
        h(usps[0]),                              // Trust USP #1
        h(usps[1]),                              // Trust USP #2
        h(`${bizShort} เปลี่ยนธุรกิจคุณ`),     // Inspirational
        h(`เติบโตด้วยข้อมูลจริง`),              // Inspirational
        h(`ปรึกษาฟรี ไม่มีเงื่อนไข`),          // CTA
        h(`${location} บริการใกล้คุณ`),         // Informational
        kwHeadlines[1] ?? h(`${bizShort} พร้อมให้บริการ`),
        h(`ก้าวสู่ความสำเร็จกับ${wordCut(bizShort, 14)}`),  // Inspirational
        h(usps[2] ?? `ดูแลทุกขั้นตอน`),        // Trust USP #3
        h(usps[3] ?? `${goalShort}ได้เลย`),     // CTA
        h(`ลูกค้าไว้วางใจ ${bizShort}`),        // Trust/Social Proof
        kwHeadlines[2] ?? h(`${goalShort}วันนี้`), // CTA
        h(`สร้างความสำเร็จด้วย${wordCut(productShort, 12)}`), // Inspirational
      ]

  const descriptions: string[] = isVariantB
    ? [
        // Variant B descriptions — informational & comparison angle
        d(`ข้อมูลครบถ้วนเกี่ยวกับ${wordCut(productShort, 30)} เปรียบเทียบราคา และรับข้อเสนอพิเศษวันนี้`),
        d(promo
          ? promo
          : `ราคาโปร่งใส ไม่มีค่าซ่อน ${bizName} ดูแลตั้งแต่ต้นจนจบ ${goalShort}ได้เลยวันนี้`),
        d(`${bizName} ให้บริการมาแล้วกว่า 10,000 ราย ติดต่อรับข้อมูลฟรี ไม่มีข้อผูกมัด ตอบใน 1 ชม.`),
        d(`เลือก${wordCut(productShort, 25)}ที่ใช่กับ${bizName} ${usps[3] ?? 'บริการครบวงจร'} ราคาดีที่สุด`),
        d(`${bizName} พร้อมให้คำปรึกษา ไม่มีค่าใช้จ่าย ติดต่อได้ทุกวัน บริการ 7 วัน ไม่มีวันหยุด`),
      ]
    : [
        // Variant A descriptions — emotional & trust angle
        d(`${wordCut(productShort, 35)} โดยทีมงานมืออาชีพ ${usps[0]} บริการครบวงจรตั้งแต่ต้นจนจบ`),
        d(promo
          ? promo
          : `ให้คำปรึกษาฟรี ไม่มีค่าใช้จ่าย ทีมงานดูแลทุกขั้นตอน เพื่อให้คุณเติบโตอย่างยั่งยืน`),
        d(`${bizName} ${usps[1]} ลูกค้าไว้วางใจกว่า 10,000 ราย ${goalShort}วันนี้เพื่อเริ่มต้นก้าวแรก`),
        d(`เลือก${wordCut(productShort, 28)} กับ${bizName} ${usps[2] ?? 'มาตรฐานระดับสากล'} ผลลัพธ์ที่วัดได้จริง`),
        d(`ทีมผู้เชี่ยวชาญ${bizName} พร้อม${goalShort}เพื่อคุณโดยตรง ช่วยสร้างการเติบโตที่ยั่งยืน`),
      ]

  return {
    adType: 'RSA',
    headlines: headlines.slice(0, 15),
    descriptions: descriptions.slice(0, 5),
    finalUrl: url,
    displayPath1: safePath(bizName),
    displayPath2: safePath(productShort),
  }
}

// ── PMax Asset Group Builder ──────────────────────────────────────────────────

function buildPMaxAssetGroup(
  brief: Record<string, unknown>,
  pmaxSignal?: { audienceSignals: { customIntent: string[]; remarketing: string[]; inMarket: string[] } }
): PMaxAssetGroup {
  const bizName  = (brief.businessName as string) || 'Business'
  const product  = (brief.productService as string) || ''
  const promo    = (brief.promotion as string) || ''
  const tone     = (brief.brandTone as string) || 'Professional'
  const goal     = (brief.conversionGoal as string) || 'ติดต่อเรา'
  const url      = (brief.websiteUrl as string) || 'https://example.com'
  const location = ((brief.targetLocation as string) || 'Thailand').split(',')[0].trim()

  const productShort = wordCut(product, 28)
  const usps         = deriveUsps(tone)
  const rawGoalPmax  = goal.split('/')[0].trim()
  const goalThai2: Record<string, string> = {
    'phone call': 'โทรหาเรา', 'form submission': 'กรอกฟอร์ม', 'form submit': 'กรอกฟอร์ม',
    'line': 'ทัก LINE', 'line chat': 'ทัก LINE', 'line oa': 'ทัก LINE',
    'appointment': 'จองนัด', 'booking': 'จองนัด', 'contact': 'ติดต่อเรา', 'call': 'โทรหาเรา',
  }
  const goalShort = goalThai2[rawGoalPmax.toLowerCase()] ?? wordCut(rawGoalPmax, 15)
  const bizShort  = wordCut(bizName, 25)

  function safePathP(text: string, max = 15): string {
    const words = text.replace(/[^฀-๿a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean)
    let result = ''
    for (const w of words) { if ((result + w).length <= max) result += w; else break }
    return (result || text.replace(/\s/g, '').slice(0, max)).toLowerCase()
  }

  const headlines: string[] = [
    h(productShort),
    h(`${bizShort} ${usps[0]}`),
    h(usps[0]),
    h(usps[1]),
    h(promo ? promo : `${goalShort}วันนี้`),
    h(`${bizShort} ${usps[1]}`),
    h(usps[2] ?? 'ปรึกษาฟรี'),
    h(`${location} ${bizShort}`),
    h(usps[3] ?? `${goalShort}ได้เลย`),
    h(`${bizShort} ผู้เชี่ยวชาญ`),
    h(promo ? `${bizShort} มีโปรพิเศษ` : usps[0]),
    h(`เริ่มต้นวันนี้ได้เลย`),
    h(`ติดต่อ${wordCut(bizShort, 16)}ฟรี`),
    h(usps[1]),
    h(`${bizShort} พร้อมให้บริการ`),
  ]

  const longHeadlines: string[] = [
    d(`${bizName} ${wordCut(productShort, 25)} ${usps[0]} บริการครบวงจร`),
    d(`เลือก${wordCut(productShort, 25)} กับ${bizName} ผู้เชี่ยวชาญใน${location}`),
    d(promo ? promo : `${bizName} ${usps[0]} มาตรฐานสูง ดูแลทุกขั้นตอน`),
    d(`${wordCut(productShort, 30)} ${usps[1]} ${bizName} ให้บริการลูกค้ามาแล้วกว่า 10,000 ราย`),
    d(`ติดต่อ${bizName} เพื่อรับคำปรึกษาฟรีเกี่ยวกับ${wordCut(productShort, 30)} วันนี้`),
  ]

  const descriptions: string[] = [
    d(`${wordCut(productShort, 35)} ${usps[1]} โดยทีมงานมืออาชีพ บริการครบวงจรตั้งแต่ต้นจนจบ`),
    d(promo
      ? promo
      : `ให้คำปรึกษาฟรี ไม่มีค่าใช้จ่าย ${goalShort}ได้เลย ทีมงานดูแลทุกขั้นตอน`),
    d(`${bizName} ${usps[0]} มาตรฐานสูง ลูกค้าไว้วางใจกว่า 10,000 ราย ติดต่อ${goalShort}วันนี้`),
    d(`เลือก${wordCut(productShort, 28)} กับ${bizName} ${usps[2] ?? 'บริการมืออาชีพ'} ราคาโปร่งใส ไม่มีค่าซ่อน`),
    d(`${usps[3] ?? 'ดูแลลูกค้าทุกขั้นตอน'} ${bizName} พร้อมให้บริการ ${goalShort} ไม่ต้องรอนาน`),
  ]

  return {
    assetGroupName: `Asset Group - Main`,
    headlines:      headlines.slice(0, 15),
    longHeadlines:  longHeadlines.slice(0, 5),
    descriptions:   descriptions.slice(0, 5),
    businessName:   bizShort,
    finalUrl:       url,
    imageAssets: [
      { assetType: 'MARKETING_IMAGE',          description: `Hero image 1200x628px — ${bizName} product/service visual` },
      { assetType: 'SQUARE_MARKETING_IMAGE',   description: `Square 1200x1200px — logo + product shot` },
      { assetType: 'PORTRAIT_MARKETING_IMAGE', description: `Portrait 960x1200px — lifestyle image หรือ testimonial` },
      { assetType: 'LOGO',                     description: `Logo 1200x1200px — transparent background` },
    ],
    audienceSignals: {
      customIntent: pmaxSignal?.audienceSignals.customIntent ?? [],
      remarketing:  pmaxSignal?.audienceSignals.remarketing ?? [],
      inMarket:     pmaxSignal?.audienceSignals.inMarket ?? [],
    },
  }
}

// ── Responsive Display Ad Builder ─────────────────────────────────────────────

function buildDisplayAd(brief: Record<string, unknown>, isRemarketing = false): DisplayAdCopy {
  const bizName  = (brief.businessName as string) || 'Business'
  const product  = (brief.productService as string) || ''
  const promo    = (brief.promotion as string) || ''
  const tone     = (brief.brandTone as string) || 'Professional'
  const goal     = (brief.conversionGoal as string) || 'ติดต่อเรา'
  const url      = (brief.websiteUrl as string) || 'https://example.com'

  const productShort = wordCut(product, 28)
  const usps         = deriveUsps(tone)
  const rawGoalDisp  = goal.split('/')[0].trim()
  const goalThai3: Record<string, string> = {
    'phone call': 'โทรหาเรา', 'form submission': 'กรอกฟอร์ม', 'form submit': 'กรอกฟอร์ม',
    'line': 'ทัก LINE', 'line chat': 'ทัก LINE', 'line oa': 'ทัก LINE',
    'appointment': 'จองนัด', 'booking': 'จองนัด', 'contact': 'ติดต่อเรา', 'call': 'โทรหาเรา',
  }
  const goalShort = goalThai3[rawGoalDisp.toLowerCase()] ?? wordCut(rawGoalDisp, 15)
  const bizShort  = wordCut(bizName, 25)

  const headlines = isRemarketing
    ? [
        h(`ยังสนใจ${wordCut(productShort, 16)}อยู่ไหม`),
        h(`${bizShort} ยังรอคุณอยู่`),
        h(usps[0]),
        h(promo ? promo : `${goalShort}วันนี้`),
        h(`กลับมาดูข้อมูล`),
      ]
    : [
        h(productShort),
        h(`${bizShort} ${usps[0]}`),
        h(usps[1]),
        h(promo ? promo : `${goalShort}วันนี้`),
        h(usps[2] ?? 'ปรึกษาฟรี'),
      ]

  return {
    adType: 'RESPONSIVE_DISPLAY',
    headlines,
    longHeadlines: [
      d(isRemarketing
        ? `กลับมาค้นหา${wordCut(productShort, 30)} ${bizName} พร้อมให้คำปรึกษาฟรีทุกวัน`
        : `${bizName} ${wordCut(productShort, 25)} ${usps[0]} บริการครบวงจร ดูแลทุกขั้นตอน`),
    ],
    descriptions: [
      d(isRemarketing
        ? `อย่าพลาดโอกาส ${wordCut(productShort, 35)} กับ${bizName} ${usps[1]}`
        : `${wordCut(productShort, 35)} ${usps[1]} โดยทีมงานมืออาชีพ ติดต่อ${goalShort}ได้เลย`),
      d(promo ? promo : `${bizName} ${usps[0]} ลูกค้าไว้วางใจกว่า 10,000 ราย`),
    ],
    businessName: bizShort,
    finalUrl: url,
    imageAssets: [
      { assetType: 'MARKETING_IMAGE',        description: `1200x628px — ${bizName} hero image` },
      { assetType: 'SQUARE_MARKETING_IMAGE', description: `1200x1200px — product/service visual` },
      { assetType: 'LOGO',                   description: `512x128px — horizontal logo` },
    ],
  }
}

// ── Legacy 3-field ad wrapper (for backward compat) ───────────────────────────

function buildAdCompat(
  brief: Record<string, unknown>,
  campaignType: string,
  adGroupName: string,
  isRemarketing = false,
  adGroupIndex = 0,
  adGroupKeywords: string[] = [],
  isVariantB = false
): AdCopy {
  const rsa       = buildRsa(brief, adGroupName, adGroupIndex, isRemarketing, adGroupKeywords, isVariantB)
  const isPMax    = campaignType === 'PERFORMANCE_MAX'
  const isDisplay = campaignType === 'DISPLAY'

  const legacy: AdCopy = {
    headline1:    rsa.headlines[0] ?? '',
    headline2:    rsa.headlines[1] ?? '',
    headline3:    rsa.headlines[4] ?? '',
    description1: rsa.descriptions[0] ?? '',
    description2: rsa.descriptions[1] ?? '',
    finalUrl:     rsa.finalUrl,
    displayPath:  rsa.displayPath1,
    rsa,
  }

  if (isDisplay || isRemarketing) {
    legacy.display = buildDisplayAd(brief, isRemarketing)
  }

  return legacy
}

// ── Sitelinks ─────────────────────────────────────────────────────────────────

function buildSitelinks(brief: Record<string, unknown>) {
  const url     = (brief.websiteUrl as string) || 'https://example.com'
  const bizName = (brief.businessName as string) || 'Business'
  const goal    = (brief.conversionGoal as string) || 'contact'

  return [
    { text: 'เกี่ยวกับเรา',    description1: `ทำความรู้จัก ${bizName}`,    description2: 'ประสบการณ์และความเชี่ยวชาญ', finalUrl: `${url}/about` },
    { text: 'ติดต่อเรา',       description1: goal.split('/')[0].trim(),     description2: 'ให้คำปรึกษาฟรีทุกวัน',        finalUrl: `${url}/contact` },
    { text: 'ราคา / แพ็กเกจ', description1: 'ราคาโปร่งใส ไม่มีค่าซ่อน',  description2: 'เลือกแพ็กเกจที่เหมาะกับคุณ', finalUrl: `${url}/pricing` },
    { text: 'ผลงาน / รีวิว',  description1: 'รีวิวจากลูกค้าจริง',          description2: 'Case studies และผลลัพธ์',     finalUrl: `${url}/reviews` },
  ]
}

function buildStructuredSnippets(brief: Record<string, unknown>): Array<{ header: string; values: string[] }> {
  const product = (brief.productService as string) || ''
  const tone    = (brief.brandTone as string) || 'professional'

  // Pick the most relevant header based on product/service type
  const productLower = product.toLowerCase()
  const isSchool     = productLower.includes('school') || productLower.includes('โรงเรียน') || productLower.includes('academy')
  const isProperty   = productLower.includes('condo') || productLower.includes('บ้าน') || productLower.includes('property')
  const isHealth     = productLower.includes('clinic') || productLower.includes('คลินิก') || productLower.includes('health')
  const isFinance    = productLower.includes('loan') || productLower.includes('สินเชื่อ') || productLower.includes('insurance')

  if (isSchool) {
    return [
      { header: 'หลักสูตร',    values: ['IB Programme', 'Cambridge IGCSE', 'Thai Bilingual', 'STEAM Education', 'Preschool – Grade 12'] },
      { header: 'สิ่งอำนวยความสะดวก', values: ['สระว่ายน้ำ', 'ห้องสมุดดิจิทัล', 'โรงอาหาร', 'สนามกีฬา'] },
    ]
  }
  if (isProperty) {
    return [
      { header: 'ประเภทโครงการ', values: ['คอนโดมิเนียม', 'บ้านเดี่ยว', 'ทาวน์เฮ้าส์', 'อาคารพาณิชย์'] },
      { header: 'บริการ',        values: ['ฟรีโอน', 'ผ่อนต่ำ 0%', 'ประเมินฟรี', 'กฎหมายที่ดิน'] },
    ]
  }
  if (isHealth) {
    return [
      { header: 'การรักษา', values: ['ผิวพรรณ', 'ลดน้ำหนัก', 'ฟื้นฟูร่างกาย', 'ตรวจสุขภาพ'] },
      { header: 'บริการ',   values: ['นัดออนไลน์', 'ปรึกษาฟรี', 'แพทย์เฉพาะทาง', 'ผลตรวจรวดเร็ว'] },
    ]
  }
  if (isFinance) {
    return [
      { header: 'บริการ', values: ['สินเชื่อบุคคล', 'สินเชื่อบ้าน', 'รีไฟแนนซ์', 'ประกันชีวิต', 'ประกันรถ'] },
    ]
  }

  // Generic — derived from USPs
  const usps = deriveUsps(tone)
  return [
    { header: 'บริการ', values: usps.slice(0, 5).map((u) => u.slice(0, 25)) },
  ]
}

// ── Main Export ───────────────────────────────────────────────────────────────

// Build UTM URL without percent-encoding ValueTrack {placeholders}
function buildUtmUrl(
  baseUrl: string,
  source: string,
  medium: string,
  campaign: string,
  content: string
): string {
  const params: string[] = [
    `utm_source=${encodeURIComponent(source)}`,
    `utm_medium=${encodeURIComponent(medium)}`,
    `utm_campaign=${campaign}`,  // ValueTrack {campaignname} must NOT be encoded
  ]
  if (content) params.push(`utm_content=${content}`)
  return `${baseUrl}?${params.join('&')}`
}

// ── RSA Validator & Enforcer ──────────────────────────────────────────────────

const H_MAX  = 30
const D_MAX  = 90
const LP_MAX = 15

// Smart-trim headline — end at natural boundary, guarantee ≤ H_MAX chars
function enforceHeadline(text: string): string {
  const clean = sanitizeCopy(text)
  if (clean.length <= H_MAX) return clean
  const cut = clean.slice(0, H_MAX)
  // Prefer space boundary (English/mixed) or Thai particle boundary
  const boundaries = [
    cut.lastIndexOf(' '),
    cut.lastIndexOf('ๆ'),
    cut.lastIndexOf('ด้วย'),
    cut.lastIndexOf('และ'),
  ].filter(i => i > H_MAX * 0.55)
  const best = Math.max(...boundaries, -1)
  const result = best > 0 ? clean.slice(0, best).trim() : cut.trim()
  return result.slice(0, H_MAX)
}

// Smart-trim description — preserve meaning, end at natural clause boundary, guarantee ≤ D_MAX
function enforceDescription(text: string): string {
  const clean = sanitizeCopy(text)
  if (clean.length <= D_MAX) return clean
  const cut = clean.slice(0, D_MAX)
  // Thai clause boundaries: space, Thai end-particles, punctuation
  const boundaries = [
    cut.lastIndexOf(' '),
    cut.lastIndexOf('—'),
    cut.lastIndexOf('、'),
    cut.lastIndexOf('。'),
    cut.lastIndexOf('ๆ'),
    cut.lastIndexOf('และ'),
    cut.lastIndexOf('หรือ'),
    cut.lastIndexOf('โดย'),
    cut.lastIndexOf('เพื่อ'),
    cut.lastIndexOf('ได้'),
    cut.lastIndexOf('แล้ว'),
  ].filter(i => i > D_MAX * 0.65)
  const best = Math.max(...boundaries, -1)
  const result = best > 0 ? clean.slice(0, best).trim() : cut.trim()
  return result.slice(0, D_MAX)
}

function enforceRsa(rsa: RsaAdCopy, fallback: RsaAdCopy): RsaAdCopy {
  // Ensure exactly 15 headlines
  const rawH = (rsa.headlines ?? []).map(enforceHeadline).filter(Boolean)
  const fallbackH = fallback.headlines.map(enforceHeadline).filter(Boolean)
  // Fill to 15 using fallback, avoiding duplicates
  const headlines: string[] = [...rawH]
  for (const fb of fallbackH) {
    if (headlines.length >= 15) break
    if (!headlines.includes(fb)) headlines.push(fb)
  }
  while (headlines.length < 15) headlines.push(fallbackH[headlines.length % fallbackH.length] ?? '')

  // Ensure exactly 4 descriptions
  const rawD = (rsa.descriptions ?? []).map(enforceDescription).filter(Boolean)
  const fallbackD = fallback.descriptions.map(enforceDescription).filter(Boolean)
  const descriptions: string[] = [...rawD]
  for (const fb of fallbackD) {
    if (descriptions.length >= 4) break
    if (!descriptions.includes(fb)) descriptions.push(fb)
  }
  while (descriptions.length < 4) descriptions.push(fallbackD[descriptions.length % fallbackD.length] ?? '')

  return {
    adType: 'RSA',
    headlines:    headlines.slice(0, 15),
    descriptions: descriptions.slice(0, 4),
    finalUrl:     rsa.finalUrl || fallback.finalUrl,
    displayPath1: (rsa.displayPath1 ?? fallback.displayPath1 ?? '').slice(0, LP_MAX),
    displayPath2: (rsa.displayPath2 ?? fallback.displayPath2 ?? '').slice(0, LP_MAX),
  }
}

// Post-process AI blueprint: fix campaign names + inject UTM finalUrl + fix PMax + enforce RSA
function normaliseBlueprint(
  blueprint: CampaignBlueprintJson,
  mediaPlan: MediaPlanJson,
  brief: Record<string, unknown>
): CampaignBlueprintJson {
  const url       = (brief.websiteUrl   as string) || 'https://example.com'
  const utmSource = (brief.utmSource    as string) || 'google'
  const utmMedium = (brief.utmMedium    as string) || 'cpc'
  const utmCampaignOverride = (brief.utmCampaign as string) || ''
  const utmContent = (brief.utmContent  as string) || ''

  // Build type+theme lookup from mediaPlan for reliable name matching
  const planByType: Record<string, typeof mediaPlan.campaignMix> = {}
  for (const camp of mediaPlan.campaignMix) {
    if (!planByType[camp.type]) planByType[camp.type] = []
    planByType[camp.type].push(camp)
  }
  const consumed: Record<string, number> = {}

  const allNormCampaigns: CampaignBlueprintJson['campaigns'] = []

  for (const c of blueprint.campaigns) {
    const type = c.campaignType ?? ''
    const queue = planByType[type] ?? []
    const idx = consumed[type] ?? 0
    const planCamp = queue[idx]
    consumed[type] = idx + 1

    // 1. Use canonical campaign name from mediaPlan — enforce CVC - prefix
    const rawName = planCamp?.campaignName ?? c.campaignName
    const canonicalName = rawName.startsWith('CVC -') ? rawName : `CVC - ${rawName}`

    // 2. Build UTM finalUrl helper
    const makeUtmUrl = (slug: string) => {
      const utmCampaign = utmCampaignOverride || slug
      return buildUtmUrl(url, utmSource, utmMedium, utmCampaign, utmContent)
    }
    const campaignSlug = canonicalName.replace(/\s*\|\s*/g, '_').replace(/\s+/g, '-').toLowerCase().slice(0, 40)
    const utmUrl = makeUtmUrl(campaignSlug)

    // 3. Fix PMax: ensure assetGroups exist
    let assetGroups = c.assetGroups
    if (type === 'PERFORMANCE_MAX' && (!assetGroups || assetGroups.length === 0)) {
      assetGroups = [buildPMaxAssetGroup(brief, undefined)]
    }

    const isSearch  = type === 'SEARCH'
    const isDisplay = type === 'DISPLAY' || type === 'DEMAND_GEN'

    const normaliseAdGroup = (ag: (typeof c.adGroups)[0], agIdx: number, utmUrlForGroup: string) => {
      const kws = ag.keywords ?? []
      const targetAdCount = isSearch ? 2 : 1
      const ads: AdCopy[] = []

      for (let adIdx = 0; adIdx < Math.max(ag.ads?.length ?? 0, targetAdCount); adIdx++) {
        const existingAd = ag.ads?.[adIdx] as AdCopy | undefined
        const isVariantB = adIdx === 1
        const fallbackRsa = buildRsa(brief, ag.adGroupName, agIdx, isDisplay, kws, isVariantB)

        if (existingAd?.rsa && (existingAd.rsa.headlines?.length ?? 0) >= 3) {
          ads.push({ ...existingAd, finalUrl: utmUrlForGroup, rsa: enforceRsa(existingAd.rsa, fallbackRsa) })
        } else if (existingAd) {
          ads.push({ ...existingAd, finalUrl: utmUrlForGroup, rsa: fallbackRsa })
        } else {
          const fallback: AdCopy = {
            headline1:    fallbackRsa.headlines[0] ?? '',
            headline2:    fallbackRsa.headlines[1] ?? '',
            headline3:    fallbackRsa.headlines[4] ?? '',
            description1: fallbackRsa.descriptions[0] ?? '',
            description2: fallbackRsa.descriptions[1] ?? '',
            finalUrl:     utmUrlForGroup,
            displayPath:  fallbackRsa.displayPath1,
            rsa:          fallbackRsa,
          }
          ads.push(fallback)
        }
      }

      const safeMatchTypes = (ag.matchTypes ?? []).map((mt: string) =>
        mt === 'EXACT' ? 'PHRASE' : (mt === 'BROAD' || mt === 'PHRASE') ? mt : 'PHRASE'
      )
      const paddedMatchTypes = (ag.keywords ?? []).map((_: unknown, ki: number) => safeMatchTypes[ki] ?? 'PHRASE')
      return { ...ag, ads, matchTypes: paddedMatchTypes }
    }

    // 4. Search: split each ad group into its own campaign
    if (isSearch && (c.adGroups ?? []).length > 1) {
      const goal    = planCamp?.objective ?? (brief.primaryGoal as string) ?? 'Lead'
      const bid     = planCamp?.bidStrategy ?? 'MAXIMIZE_CLICKS'
      const budget  = planCamp?.dailyBudget ?? Math.round((planCamp?.monthlyBudget ?? 1200) / 30)

      for (const ag of c.adGroups ?? []) {
        // Derive theme from ad group name: take last meaningful word
        const themePart = ag.adGroupName
          .replace(/^.*?-\s*/, '')      // strip "BizName - "
          .replace(/\s*-\s*Variant.*$/i, '') // strip " - Variant B"
          .trim()
        const cvcName = `CVC - SEM | ${themePart} | ${goal}`
        const agSlug  = cvcName.replace(/\s*\|\s*/g, '_').replace(/\s+/g, '-').toLowerCase().slice(0, 40)
        const agUtm   = makeUtmUrl(agSlug)

        allNormCampaigns.push({
          ...c,
          campaignName:    cvcName,
          finalUrl:        agUtm,
          budget,
          bidStrategy:     bid,
          assetGroups:     [],
          adGroups:        [normaliseAdGroup(ag, 0, agUtm)],
        })
      }
      continue
    }

    // 5. Non-search or single-adgroup search: normalise in place
    const adGroups = (c.adGroups ?? []).map((ag, agIdx) => normaliseAdGroup(ag, agIdx, utmUrl))

    allNormCampaigns.push({
      ...c,
      campaignName: canonicalName,
      finalUrl:     utmUrl,
      assetGroups,
      adGroups,
    })
  }

  return { ...blueprint, campaigns: allNormCampaigns }
}

export async function generateCampaignBlueprint(
  mediaPlan: MediaPlanJson,
  keywordAudiencePlan: KeywordAudiencePlan,
  brief: Record<string, unknown>,
  clientMemoryContext?: string
): Promise<CampaignBlueprintJson> {
  if (isRealAI()) {
    const memoryBlock = clientMemoryContext ? `## Client Memory\n${clientMemoryContext}\n` : ''
    const prompt = CAMPAIGN_BLUEPRINT_PROMPT
      .replace('{{MEMORY}}',     memoryBlock)
      .replace('{{BRIEF}}',      JSON.stringify(brief, null, 2))
      .replace('{{MEDIA_PLAN}}', JSON.stringify(mediaPlan, null, 2))
      .replace('{{KEYWORDS}}',   JSON.stringify(keywordAudiencePlan, null, 2))

    const result = await safeCallAI(
      prompt,
      (raw) => validateBlueprint(raw) as CampaignBlueprintJson | null,
      () => mockBlueprint(mediaPlan, keywordAudiencePlan, brief),
      { temperature: 0.2, maxTokens: 16000 }
    )
    return normaliseBlueprint(result, mediaPlan, brief)
  }

  return mockBlueprint(mediaPlan, keywordAudiencePlan, brief)
}

function defaultKeywords(brief: Record<string, unknown>): string[] {
  const biz = (brief.businessName as string) || ''
  const product = (brief.productService as string) || ''
  const kws: string[] = []
  if (biz) kws.push(biz)
  if (product) kws.push(product.slice(0, 40))
  if (biz && product) kws.push(`${biz} ${product.split(' ')[0]}`.slice(0, 40))
  return kws.filter(k => k.trim().length > 0).slice(0, 5)
}

async function mockBlueprint(
  mediaPlan: MediaPlanJson,
  keywordAudiencePlan: KeywordAudiencePlan,
  brief: Record<string, unknown>
): Promise<CampaignBlueprintJson> {
  // ── Dynamic mock ──────────────────────────────────────────────────────────
  const location = ((brief.targetLocation as string) || 'Thailand').split(',')[0].trim()
  const language = (brief.language as string) || 'th'
  const url      = (brief.websiteUrl as string) || 'https://example.com'

  // Group keywords by campaign
  const kwByCampaign: Record<string, typeof keywordAudiencePlan.keywordGroups> = {}
  for (const group of keywordAudiencePlan.keywordGroups ?? []) {
    if (!kwByCampaign[group.campaignName]) kwByCampaign[group.campaignName] = []
    kwByCampaign[group.campaignName].push(group)
  }

  // Index PMax signals by campaign
  type PmaxSig = NonNullable<typeof keywordAudiencePlan.pmaxSignals>[number]
  const pmaxSignalMap: Record<string, PmaxSig> = {}
  for (const sig of keywordAudiencePlan.pmaxSignals ?? []) {
    pmaxSignalMap[sig.campaignName] = sig
  }

  const sitelinks = buildSitelinks(brief)
  const negatives = keywordAudiencePlan.negativeKeywords ?? ['ฟรี', 'free', 'สมัครงาน', 'pantip']

  const campaigns: CampaignBlueprintJson['campaigns'] = mediaPlan.campaignMix.map((camp) => {
    const groups      = kwByCampaign[camp.campaignName] ?? []
    const isDisplay   = camp.type === 'DISPLAY'
    const isPMax      = camp.type === 'PERFORMANCE_MAX'
    const isBrand     = camp.campaignName.toLowerCase().includes('brand')
    const isRemark    = isDisplay
    const pmaxSignal  = pmaxSignalMap[camp.campaignName]

    const campaignSlug = camp.campaignName.replace(/\s*\|\s*/g, '_').replace(/\s+/g, '-').toLowerCase().slice(0, 40)
    const utmSource   = (brief.utmSource   as string) || 'google'
    const utmMedium   = (brief.utmMedium   as string) || 'cpc'
    const utmCampaign = (brief.utmCampaign as string) || campaignSlug
    const utmContent  = (brief.utmContent  as string) || ''
    const utmUrl      = buildUtmUrl(url, utmSource, utmMedium, utmCampaign, utmContent)

    // For PMax: flat assetGroups at campaign level — NO traditional adGroups
    if (isPMax) {
      const assetGroup = buildPMaxAssetGroup(brief, pmaxSignal)

      return {
        campaignName:    camp.campaignName,
        campaignType:    camp.type,
        status:          'PAUSED',
        budget:          camp.dailyBudget ?? camp.monthlyBudget,
        bidStrategy:     camp.bidStrategy ?? 'MAXIMIZE_CONVERSIONS',
        targetCPA:       camp.targetCPA,
        locationTargets: [location],
        languageTargets: [language, 'en'],
        adSchedule:      ['Mon-Sun 00:00-24:00'],
        finalUrl:        utmUrl,
        adGroups:        [],          // PMax has no traditional ad groups
        assetGroups:     [assetGroup],
        negativeKeywords: [],
        sitelinks:        [],
        callouts: [
          (brief.brandTone as string)?.split(',')[0]?.trim() ?? 'บริการมืออาชีพ',
          'ฟรีปรึกษาเบื้องต้น', 'ราคาโปร่งใส', 'ติดต่อได้ทุกวัน',
        ],
        structuredSnippets: buildStructuredSnippets(brief),
        phoneNumbers: [],
      }
    }

    // Standard campaigns (Search / Display / Brand / etc.)
    const isSearch = camp.type === 'SEARCH'

    const adGroups = groups.length > 0
      ? groups.map((group, idx) => {
          const kws = group.keywords.map((k) => k.keyword)
          const ad1 = buildAdCompat(brief, camp.type, group.adGroupName, isRemark, idx, kws)
          // Search: 2 diverse RSA sets — Variant A (emotional/trust) + Variant B (sales/urgency)
          const ads = isSearch
            ? [ad1, buildAdCompat(brief, camp.type, group.adGroupName + ' - Variant B', isRemark, idx, kws, true)]
            : [ad1]
          return {
            adGroupName: group.adGroupName,
            defaultBid:  group.keywords[0]?.suggestedBid ?? 20,
            keywords:    kws,
            matchTypes:  group.keywords.map((k) => k.matchType === 'EXACT' ? 'PHRASE' : k.matchType),
            audiences:   isDisplay ? [`${brief.businessName} - All Website Visitors (30d)`] : [],
            ads,
          }
        })
      : [{
          adGroupName: isDisplay ? 'Remarketing - All Visitors 30d' : `${brief.businessName} - Generic`,
          defaultBid:  20,
          keywords:    isSearch ? defaultKeywords(brief) : [],
          matchTypes:  isSearch ? defaultKeywords(brief).map(() => 'PHRASE') : [],
          audiences:   isDisplay ? [`${brief.businessName} - All Website Visitors (30d)`] : [],
          ads: isSearch
            ? [
                buildAdCompat(brief, camp.type, 'Main', isRemark, 0, defaultKeywords(brief)),
                buildAdCompat(brief, camp.type, 'Main - Variant B', isRemark, 0, defaultKeywords(brief), true),
              ]
            : [buildAdCompat(brief, camp.type, 'Main', isRemark, 0)],
        }]

    return {
      campaignName:    camp.campaignName,
      campaignType:    camp.type,
      status:          'PAUSED',
      budget:          camp.dailyBudget ?? Math.round(camp.monthlyBudget / 30),
      bidStrategy:     camp.bidStrategy ?? getDefaultBidStrategy(camp.type),
      targetCPA:       camp.targetCPA,
      locationTargets: [location],
      languageTargets: [language, 'en'],
      adSchedule:      ['Mon-Sun 08:00-22:00'],
      finalUrl:        utmUrl,
      adGroups,
      negativeKeywords: isBrand ? [] : negatives,
      sitelinks:       isDisplay ? [] : sitelinks,
      callouts: [
        (brief.brandTone as string)?.split(',')[0]?.trim() ?? 'บริการมืออาชีพ',
        'ฟรีปรึกษาเบื้องต้น', 'ราคาโปร่งใส', 'ติดต่อได้ทุกวัน',
      ],
      structuredSnippets: isDisplay ? [] : buildStructuredSnippets(brief),
      phoneNumbers: [],
    }
  })

  return {
    campaigns,
    accountSettings: {
      currency:    (brief.currency as string) || 'THB',
      timeZone:    'Asia/Bangkok',
      autoTagging: true,
    },
    conversionActions: [
      {
        name:         (brief.conversionGoal as string)?.split('/')[0]?.trim() ?? 'Lead Form Submit',
        category:     'SUBMIT_LEAD_FORM',
        value:        mediaPlan.campaignMix[0]?.targetCPA ?? 500,
        countingType: 'ONE_PER_CLICK',
      },
    ],
  }
}

