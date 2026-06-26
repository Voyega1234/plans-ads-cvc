/**
 * Google Ads Ad Policy Checker
 * Flags prohibited words/phrases that cause ad disapprovals
 */

export interface PolicyViolation {
  text:     string
  reason:   string
  severity: 'critical' | 'warning'
}

// Phrases banned in Thai Google Ads (lead gen / service ads)
const BANNED_PHRASES: Array<{ pattern: RegExp; reason: string; severity: PolicyViolation['severity'] }> = [
  // Guarantee claims
  { pattern: /รับรองผล|การันตีผ่าน|ผ่านแน่นอน|ได้ผลแน่|รับประกัน\s*100/i, reason: 'ห้ามการันตีผล (Google Policy: Misleading claim)', severity: 'critical' },
  { pattern: /100\s*%\s*(ผ่าน|สำเร็จ|ได้|รับรอง)/i, reason: 'ห้าม claim 100% (Google Policy: Misleading)', severity: 'critical' },
  { pattern: /ไม่พลาด|พลาดไม่ได้|ผ่านทุกราย|ทุกคนผ่าน/i, reason: 'ห้าม absolute claim (Google Policy: Misleading)', severity: 'critical' },
  { pattern: /ขอวีซ่าง่าย\s*(แน่นอน|100|เลย)/i, reason: 'ห้าม guarantee visa approval (Google Policy)', severity: 'critical' },

  // Superlative claims without substantiation
  { pattern: /ดีที่สุด|อันดับ\s*1\s*ของไทย|เบอร์\s*1\s*ในไทย|ที่สุดในไทย|ที่สุดในโลก/i, reason: 'Superlative Claim — ต้องมีแหล่งอ้างอิง หรือเปลี่ยนเป็น "ดีมาก", "คุณภาพสูง", "ผลลัพธ์ชัดเจน" แทน (Google Policy: Superlatives)', severity: 'warning' },
  { pattern: /ถูกที่สุด|ราคาถูกสุด|ราคาต่ำสุด|ราคาดีที่สุด/i, reason: 'Price Superlative — ต้องมีหลักฐานการเปรียบราคา หรือเปลี่ยนเป็น "ราคาคุ้มค่า", "ราคาเหมาะสม" (Google Policy: Price claims)', severity: 'warning' },

  // Urgency / Pressure tactics
  { pattern: /ด่วน\s*!\s*ด่วน|รีบสมัครก่อนหมด|โอกาสสุดท้าย|ก่อนราคาขึ้น/i, reason: 'Pressure tactic ที่อาจถูก flag (Google Policy: Clickbait)', severity: 'warning' },

  // Visa-specific: unauthorized immigration advice
  { pattern: /รับ\s*ทำ\s*วีซ่า\s*(ไม่\s*(ต้อง|ต้องมี)\s*(เอกสาร|หลักฐาน))/i, reason: 'ห้ามสื่อว่าทำวีซ่าโดยไม่ต้องเอกสาร', severity: 'critical' },

  // Financial/clickbait
  { pattern: /ได้เงิน\s*(ง่าย|เร็ว|ทันที|วันนี้)/i, reason: 'ห้าม "ได้เงินง่าย" (Google Policy: Get-rich scheme)', severity: 'critical' },
  { pattern: /กู้เงิน\s*(ง่าย|ด่วน|ไม่เช็ค)/i, reason: 'Financial products ต้องมี disclaimer (Google Policy)', severity: 'critical' },
]

export function checkAdPolicy(text: string): PolicyViolation[] {
  const violations: PolicyViolation[] = []
  for (const { pattern, reason, severity } of BANNED_PHRASES) {
    const match = text.match(pattern)
    if (match) {
      violations.push({ text: match[0], reason, severity })
    }
  }
  return violations
}

export function checkBlueprintPolicy(campaigns: Array<{
  adGroups?: Array<{ ads?: Array<{ headline1?: string; headline2?: string; headline3?: string; description1?: string; description2?: string; rsa?: { headlines?: string[]; descriptions?: string[] } }> }>
  assetGroups?: Array<{ headlines?: string[]; descriptions?: string[] }>
}>): Array<{ campaign: string; field: string; violations: PolicyViolation[] }> {
  const results: Array<{ campaign: string; field: string; violations: PolicyViolation[] }> = []

  for (const campaign of campaigns) {
    const campName = (campaign as { campaignName?: string }).campaignName ?? 'Unknown'

    // Check ad groups
    for (const ag of campaign.adGroups ?? []) {
      for (const ad of ag.ads ?? []) {
        const texts = [
          ad.headline1, ad.headline2, ad.headline3,
          ad.description1, ad.description2,
          ...(ad.rsa?.headlines ?? []),
          ...(ad.rsa?.descriptions ?? []),
        ].filter((t): t is string => !!t)

        for (const t of texts) {
          const v = checkAdPolicy(t)
          if (v.length > 0) results.push({ campaign: campName, field: t, violations: v })
        }
      }
    }

    // Check asset groups (PMax)
    for (const ag of campaign.assetGroups ?? []) {
      const texts = [...(ag.headlines ?? []), ...(ag.descriptions ?? [])]
      for (const t of texts) {
        const v = checkAdPolicy(t)
        if (v.length > 0) results.push({ campaign: campName, field: t, violations: v })
      }
    }
  }

  return results
}
