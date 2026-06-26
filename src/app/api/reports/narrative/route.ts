import { NextRequest, NextResponse } from 'next/server'
import { callAI, isRealAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, ACCOUNT_TYPE_REPORTING_SKILL } from '@/lib/ai/prompts'

export interface NarrativeReport {
  headline:          string
  performance:       string
  winners:           string
  concerns:          string
  actions:           string[]
  outlook:           string
  // Extended fields for client-facing report
  keyInsights?:      string[]   // 4-5 bullet facts with exact numbers
  deviceAnalysis?:   string     // device breakdown insight
  locationInsights?: string     // location performance insight
  wastedBudget?:     string     // wasted spend analysis
  clientSummary?:    string     // executive summary for client meeting
  // Strategic planner narrative — for team to explain to clients
  strategicContext?:   string   // why the numbers look this way — market/strategy context
  strategicNextStep?:  string   // what to prioritize next month and why
  clientTalkingPoints?: string[] // bullet list: what to say when client asks "how is it going?"
  // Closing summary paragraph — detailed narrative wrap-up
  executiveSummary?:   string   // 5-6 sentences full summary combining all findings
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    dateRange:   string
    targetCPA:   number
    summary:     {
      totalCost: number; totalConversions: number; totalClicks: number; totalImpressions: number
      blendedCPA: number; blendedCTR: number; cpaVsTarget: number | null
      changes?: { totalCost: number | null; totalConversions: number | null; blendedCPA: number | null; blendedCTR: number | null }
    }
    campaigns:   Array<{ campaignName: string; cost: number; conversions: number; cpa: number; ctr: number; clicks: number; changes?: { cpa?: number | null } }>
    keywords?:   Array<{ keyword: string; cost: number; conversions: number; cpa: number; qualityScore: number | null }>
    devices?:    Array<{ device: string; cost: number; conversions: number; cpa: number; ctr: number }>
    locations?:  Array<{ location: string; cost: number; conversions: number; cpa: number }>
    searchTerms?: Array<{ searchTerm: string; cost: number; conversions: number; ctr: number }>
    recommendations?: Array<{ priority: string; title: string; action: string }>
    // Ecommerce fields
    totalConversionValue?: number
    roas?: number
    accountType?: 'ecommerce' | 'lead_gen' | 'traffic' | 'general'
  }

  const { dateRange, targetCPA, summary, campaigns, keywords, devices, locations, searchTerms, recommendations, totalConversionValue, roas, accountType } = body

  const isEcommerce = accountType === 'ecommerce' || (totalConversionValue !== undefined && totalConversionValue > 0)

  // Normalize all numeric fields at entry point — Google Ads API sends conversions as float
  const s = {
    ...summary,
    totalCost:        Math.round(summary.totalCost),
    totalConversions: Math.round(summary.totalConversions),
    blendedCPA:       Math.round(summary.blendedCPA),
    blendedCTR:       parseFloat(summary.blendedCTR.toFixed(2)),
    cpaVsTarget:      summary.cpaVsTarget !== null ? Math.round(summary.cpaVsTarget) : null,
  }
  const normCampaigns = campaigns.map(c => ({
    ...c,
    cost:        Math.round(c.cost),
    conversions: Math.round(c.conversions),
    cpa:         Math.round(c.cpa),
    ctr:         parseFloat(c.ctr.toFixed(2)),
  }))

  const cpaStatus = s.cpaVsTarget !== null
    ? (s.cpaVsTarget > 0
        ? `เกินเป้า ${s.cpaVsTarget}%`
        : `ต่ำกว่าเป้า ${Math.abs(s.cpaVsTarget)}%`)
    : 'ยังไม่มีข้อมูล'

  const bestCampaign  = normCampaigns.filter((c) => c.conversions > 0).sort((a, b) => a.cpa - b.cpa)[0]
  const worstCampaign = normCampaigns.filter((c) => c.cost > 0 && c.cpa > 0).sort((a, b) => b.cpa - a.cpa)[0]
  const criticalCount = recommendations?.filter((r) => r.priority === 'critical').length ?? 0
  const wastedTerms   = (searchTerms ?? []).filter((st) => st.conversions === 0 && st.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 3)
  const wastedTotal   = Math.round(wastedTerms.reduce((acc, t) => acc + t.cost, 0))

  const fallback: NarrativeReport = {
    headline:      `${dateRange}: งบ ฿${s.totalCost.toLocaleString()} — ${s.totalConversions} conv — CPA ฿${s.blendedCPA.toLocaleString()} (${cpaStatus})`,
    performance:   `ใช้งบรวม ฿${s.totalCost.toLocaleString()} ได้ ${s.totalConversions} conversions CPA ฿${s.blendedCPA.toLocaleString()} ${cpaStatus} CTR ${s.blendedCTR.toFixed(2)}%`,
    winners:       bestCampaign ? `${bestCampaign.campaignName} CPA ฿${bestCampaign.cpa.toLocaleString()} ดีที่สุดใน account จาก ${bestCampaign.conversions} conv` : 'ยังไม่มี campaign ที่มี conversion',
    concerns:      worstCampaign && worstCampaign.cpa > targetCPA * 1.5 ? `${worstCampaign.campaignName} CPA ฿${worstCampaign.cpa.toLocaleString()} เกินเป้า ${Math.round(((worstCampaign.cpa / targetCPA) - 1) * 100)}%` : `พบ ${criticalCount} critical issues`,
    actions:       [`ตรวจ campaign CPA เกิน ฿${Math.round(targetCPA * 1.2).toLocaleString()} ปรับ bid ลง 15-20%`, `Scale campaign CPA ต่ำกว่าเป้า หาก IS room > 20%`, `Review Search Term Report เพิ่ม negative keywords`, `ตั้ง Target CPA bid สำหรับ campaign ที่ conv > 30/month`, `Monitor CTR — ถ้าต่ำกว่า 3% ทดสอบ headline ใหม่`],
    outlook:       `ติดตาม CPA trend — ถ้า blended CPA เกิน ฿${Math.round(targetCPA * 1.1).toLocaleString()} pause campaign spend สูงแต่ไม่ convert`,
    keyInsights:   [`ใช้งบ ฿${s.totalCost.toLocaleString()} ได้ ${s.totalConversions} conversions`, `Blended CPA ฿${s.blendedCPA.toLocaleString()} ${cpaStatus}`, `CTR รวม ${s.blendedCTR.toFixed(2)}% จาก ${s.totalImpressions.toLocaleString()} impressions`],
    wastedBudget:  wastedTotal > 0 ? `พบ search terms ไม่ convert ใช้งบรวม ฿${wastedTotal.toLocaleString()}: ${wastedTerms.map((t) => `"${t.searchTerm}" ฿${Math.round(t.cost).toLocaleString()}`).join(', ')}` : 'ไม่พบ wasted spend ที่ชัดเจน',
    clientSummary: `ช่วง ${dateRange} account ใช้งบ ฿${s.totalCost.toLocaleString()} ได้ ${s.totalConversions} conversions CPA ฿${s.blendedCPA.toLocaleString()} ${cpaStatus}`,
    strategicContext:   `CPA ปัจจุบัน ฿${s.blendedCPA.toLocaleString()} ${cpaStatus} — ${s.totalConversions > 0 ? 'account กำลัง generate conversion แต่ยังต้องปรับ efficiency' : 'ยังอยู่ในช่วง learning — ต้องสะสม conversion data ก่อน optimize'}`,
    strategicNextStep:  `เดือนหน้าควรโฟกัส ${bestCampaign ? `scale ${bestCampaign.campaignName} ที่ CPA ดี` : 'สร้าง conversion base'} และ ${wastedTotal > 0 ? `ลด wasted spend ฿${wastedTotal.toLocaleString()} จาก negative keywords` : 'test ad copy ใหม่เพื่อเพิ่ม CTR'}`,
    clientTalkingPoints: [
      `งบ ฿${s.totalCost.toLocaleString()} สร้าง ${s.totalConversions} leads/conversions ในช่วง ${dateRange}`,
      `CPA เฉลี่ย ฿${s.blendedCPA.toLocaleString()} ${cpaStatus} เป้าที่ตั้งไว้ ฿${targetCPA.toLocaleString()}`,
      bestCampaign ? `Campaign ที่ดีที่สุดคือ ${bestCampaign.campaignName} — CPA ฿${bestCampaign.cpa.toLocaleString()} ต่ำกว่าเป้า` : 'อยู่ระหว่างการสะสม conversion data',
      `มี ${criticalCount} จุดที่ต้องปรับปรุงเร่งด่วน — ทีมกำลังดำเนินการ`,
    ],
    executiveSummary: `ในช่วง ${dateRange} account ใช้งบทั้งสิ้น ฿${s.totalCost.toLocaleString()} และสร้าง ${s.totalConversions} conversions ที่ CPA เฉลี่ย ฿${s.blendedCPA.toLocaleString()} ซึ่ง${cpaStatus}จากเป้าหมาย ฿${targetCPA.toLocaleString()}` +
      (bestCampaign ? ` Campaign ที่ทำผลดีที่สุดคือ ${bestCampaign.campaignName} ด้วย CPA ฿${bestCampaign.cpa.toLocaleString()} จาก ${bestCampaign.conversions} conversions` : '') +
      (wastedTotal > 0 ? ` พบ wasted spend ฿${wastedTotal.toLocaleString()} จาก search terms ที่ไม่ convert ซึ่งเป็นโอกาสในการปรับปรุง efficiency` : '') +
      ` CTR รวมอยู่ที่ ${s.blendedCTR.toFixed(2)}% จาก ${s.totalImpressions.toLocaleString()} impressions` +
      ` ขั้นตอนถัดไปควรโฟกัสที่ ${bestCampaign ? `scale ${bestCampaign.campaignName}` : 'การสร้าง conversion base'} และปรับ efficiency เพื่อให้ CPA อยู่ในเกณฑ์เป้าอย่างต่อเนื่อง`,
  }

  if (!isRealAI()) return NextResponse.json(fallback)

  const topKeywords   = (keywords ?? []).sort((a, b) => b.cost - a.cost).slice(0, 10)
  const topSearchTermsWasted = (searchTerms ?? []).filter((st) => st.conversions === 0 && st.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 6)
  const topLocations  = (locations ?? []).sort((a, b) => b.cost - a.cost).slice(0, 6)

  const accountTypeLabel = isEcommerce ? 'E-commerce (เน้น Revenue, ROAS, Conversion Value)' : accountType === 'lead_gen' ? 'Lead Generation (เน้น CPL, Lead Quality)' : accountType === 'traffic' ? 'Traffic / Awareness (เน้น Clicks, CTR, CPC)' : 'General (เน้น CPA, Conversions)'

  const prompt = `คุณคือ McKinsey-level Strategic Advisor + Senior Performance Media Buyer ที่มีประสบการณ์ Google Ads 10+ ปี
สไตล์การเขียน: เหมือน McKinsey Engagement Manager เขียน client report — กระชับ มีน้ำหนัก ทุกประโยคมีความหมาย ไม่ฟุ้มเฟื่อย
ใช้ภาษาไทยที่ชัดเจน เป็นทางการแต่ไม่แข็ง — เหมาะพรีเซนต์ boardroom
ทุกจุดต้องมีตัวเลขจริง มี "so what" ชัดเจน — ไม่แค่บอกว่าอะไรเกิดขึ้น แต่ต้องบอกว่าหมายความว่าอะไรและควรทำอะไรต่อ

## ACCOUNT TYPE: ${accountTypeLabel}
${isEcommerce ? `⚡ นี่คือ Ecommerce Account — ให้วิเคราะห์ผ่านมุมมอง Revenue, ROAS และ Conversion Value เป็นหลัก ไม่ใช่ CPA
KPI หลัก: Conversion Value (ยอดขาย), ROAS, จำนวน Purchase, Cost per Purchase, AOV
อย่าพูดถึง "Conversions" เฉยๆ — ต้องพูดว่า "ยอดขาย" "รายได้" "ROAS" "Purchase"` : ''}

## ACCOUNT SUMMARY (${dateRange})
- Total Spend: ฿${s.totalCost.toLocaleString()}${s.changes?.totalCost != null ? ` (${s.changes.totalCost > 0 ? '+' : ''}${s.changes.totalCost}% vs period ก่อน)` : ''}
- Conversions: ${s.totalConversions.toLocaleString()}${s.changes?.totalConversions != null ? ` (${s.changes.totalConversions > 0 ? '+' : ''}${s.changes.totalConversions}% vs period ก่อน)` : ''}${isEcommerce && totalConversionValue ? `\n- Conversion Value (ยอดขาย): ฿${Math.round(totalConversionValue).toLocaleString()}\n- ROAS: ${roas?.toFixed(2) ?? 'N/A'}x (ทุก ฿1 ที่ลงโฆษณาสร้างยอดขาย ฿${roas?.toFixed(2) ?? '—'})` : ''}
- Blended CPA: ฿${s.blendedCPA.toLocaleString()} vs Target ฿${targetCPA} → ${cpaStatus}
- CTR: ${s.blendedCTR.toFixed(2)}%${s.changes?.blendedCTR != null ? ` (${s.changes.blendedCTR > 0 ? '+' : ''}${s.changes.blendedCTR}%)` : ''}
- Clicks: ${s.totalClicks.toLocaleString()} | Impressions: ${s.totalImpressions.toLocaleString()}

## CAMPAIGNS (เรียงตาม Spend)
${normCampaigns.sort((a, b) => b.cost - a.cost).map((c) =>
  `- ${c.campaignName}: ฿${c.cost.toLocaleString()} | ${c.conversions} conv | CPA ฿${c.cpa.toLocaleString()} | CTR ${c.ctr.toFixed(2)}%${c.changes?.cpa != null ? ` | CPA trend ${c.changes.cpa > 0 ? '+' : ''}${c.changes.cpa}%` : ''}`
).join('\n')}

## TOP KEYWORDS BY SPEND (top 10)
${topKeywords.length > 0 ? topKeywords.map((k) =>
  `- "${k.keyword}": ฿${Math.round(k.cost).toLocaleString()} | ${Math.round(k.conversions)} conv | QS ${k.qualityScore ?? '—'} | CPA ฿${k.cpa > 0 ? Math.round(k.cpa).toLocaleString() : 'ไม่มี conv'}`
).join('\n') : '- ไม่มีข้อมูล keyword'}

## DEVICES
${devices && devices.length > 0 ? devices.map((d) =>
  `- ${d.device}: ฿${Math.round(d.cost).toLocaleString()} | ${Math.round(d.conversions)} conv | CPA ฿${d.cpa > 0 ? Math.round(d.cpa).toLocaleString() : '—'} | CTR ${d.ctr.toFixed(2)}%`
).join('\n') : '- ไม่มีข้อมูล device'}

## TOP LOCATIONS
${topLocations.length > 0 ? topLocations.map((l) =>
  `- ${l.location}: ฿${Math.round(l.cost).toLocaleString()} | ${Math.round(l.conversions)} conv | CPA ฿${l.cpa > 0 ? Math.round(l.cpa).toLocaleString() : '—'}`
).join('\n') : '- ไม่มีข้อมูล location'}

## WASTED SPEND — Search Terms 0 conversion (top 6)
${topSearchTermsWasted.length > 0 ? topSearchTermsWasted.map((st) =>
  `- "${st.searchTerm}": ฿${Math.round(st.cost).toLocaleString()} / 0 conv`
).join('\n') : '- ไม่พบ wasted spend'}

## CRITICAL ISSUES: ${criticalCount} รายการ
${recommendations?.filter((r) => r.priority === 'critical').map((r) => `- ${r.title}: ${r.action}`).join('\n') || '- ไม่มี'}

---
ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น ใช้ schema นี้ (สไตล์ McKinsey — ทุก field ต้องมี "so what" ชัดเจน):
{
  "headline": "${isEcommerce ? '1 ประโยค verdict แบบ McKinsey — ระบุ ROAS, ยอดขาย (Conv. Value) รวม, และ verdict เช่น "งบ ฿X สร้างยอดขาย ฿Y — ROAS Zx ดีกว่า/ต่ำกว่าเป้า — พร้อม scale Q3"' : '1 ประโยค verdict แบบ McKinsey slide title — กระชับ มีน้ำหนัก ระบุตัวเลข ROI/CPA และ verdict เช่น "Account สร้าง ฿X/conv ต่ำกว่าเป้า Z% — พร้อม scale Q3"'}",
  "clientSummary": "3-4 ประโยค ภาษา C-suite — เหมาะพูดใน boardroom${isEcommerce ? ' เน้น Revenue, ROAS, ยอดขายที่ได้จากงบโฆษณา และ business impact ระดับ revenue growth ไม่ใช่แค่ Conversion count' : ' เน้น ROI, business impact และ trajectory'} ไม่ใช้ jargon Google Ads มาก สรุปว่าเงินที่ลงไปทำงานได้ผลระดับไหน",
  "performance": "4-5 ประโยค วิเคราะห์เชิงลึก${isEcommerce ? ' เน้น ROAS trend, Conversion Value, Cost per Purchase เปรียบเทียบ period ก่อน' : ' เปรียบเทียบ period ก่อน'} — บอก trend direction พร้อม % change และ so-what ของแต่ละ metric",
  "winners": "3-4 ประโยค ระบุ campaign และ keyword ที่ outperform พร้อมตัวเลขครบ${isEcommerce ? ' รวม ROAS ของ campaign นั้นๆ ถ้ามีข้อมูล Conv. Value' : ''} — วิเคราะห์ว่า success driver คืออะไร และ scale opportunity มีขนาดไหน",
  "concerns": "3-4 ประโยค ระบุ risk พร้อมตัวเลข${isEcommerce ? ' เช่น ROAS ต่ำกว่าเป้า, Campaign ที่ Spend สูงแต่ยอดขายต่ำ, Product หรือ asset ที่ไม่ perform' : ''} — ไม่แค่บอกปัญหา แต่ quantify impact และบอก urgency ว่าถ้าไม่แก้จะเสียงบเท่าไรต่อเดือน",
  "keyInsights": [
    "${isEcommerce ? 'Insight 1 — ROAS และ Revenue: เช่น \"ใช้งบ ฿X สร้างยอดขาย ฿Y — ROAS Zx → คุ้มค่า/ต้องปรับ\"' : 'Insight 1 — data-backed finding พร้อม implication เช่น \"Mobile CPA ฿X ต่ำกว่า Desktop ฿Y ถึง Z% → ควรเพิ่ม mobile bid +25%\"'}",
    "${isEcommerce ? 'Insight 2 — Campaign ที่ ROAS สูงสุดและเหตุผล' : 'Insight 2 — keyword/audience pattern ที่น่าสนใจ'}",
    "${isEcommerce ? 'Insight 3 — Cost per Purchase เทียบกับ AOV (ถ้าประเมินได้)' : 'Insight 3 — efficiency ratio หรือ benchmark เปรียบเทียบ'}",
    "Insight 4 — wasted spend หรือ opportunity cost",
    "Insight 5 — forward-looking signal"
  ],
  "deviceAnalysis": "2-3 ประโยค McKinsey-style device breakdown — % spend แต่ละ device, CPA เปรียบเทียบ, และ bid adjustment recommendation พร้อม rationale",
  "locationInsights": "2-3 ประโยค geographic performance — top/bottom locations พร้อมตัวเลข CPA และ spend%, recommendation ว่าควร concentrate หรือ expand ที่ไหน",
  "wastedBudget": "2-3 ประโยค quantify wasted spend — total ฿ ที่เสีย, search terms ที่แย่สุด, และ projected savings ถ้า negative keywords ถูกเพิ่ม",
  "strategicContext": "3-4 ประโยค McKinsey situation analysis — อธิบาย 'WHY' ตัวเลขเป็นแบบนี้ บอก market context, account maturity stage (learning/scaling/optimizing) และ structural factors ที่ทีมควรเข้าใจก่อนคุยกับลูกค้า",
  "strategicNextStep": "3-4 ประโยค strategic recommendation สำหรับ 30 วันข้างหน้า — ระบุ priority #1 พร้อม rationale, expected impact (฿ หรือ % improvement), และ resource requirement ที่ชัดเจน",
  "clientTalkingPoints": [
    "Talking point 1 — ประโยคที่พูดกับลูกค้าได้เลย เน้น business value เช่น 'เดือนนี้ทุก ฿1 ที่ลงโฆษณาสร้าง revenue ฿X'",
    "Talking point 2 — progress update เทียบ baseline หรือ goal",
    "Talking point 3 — จุดที่กำลัง optimize + timeline คาดการณ์",
    "Talking point 4 — next milestone ที่ลูกค้าควรรู้"
  ],
  "actions": [
    "${isEcommerce ? 'Action 1 — ระบุชื่อ campaign ที่ ROAS ต่ำ แนะนำวิธีปรับ เช่น ตรวจ Product Feed, แยก Campaign ตาม Margin หรือ Bestseller, ปรับ tROAS' : 'Action 1 — ชี้จุดตรวจสอบเฉพาะเจาะจง ระบุชื่อ campaign/keyword จริง'}",
    "${isEcommerce ? 'Action 2 — แนะนำ Product หรือ Category ที่ควรเพิ่ม/ลด Budget — ระบุชัดเจน' : 'Action 2 — แนะนำปรับ ad copy'}",
    "Action 3 — แนะนำ optimization ที่ไม่กระทบงบ เช่น bid modifier, audience layering, ad schedule",
    "Action 4",
    "Action 5 — ถ้า ${isEcommerce ? 'ROAS ต่ำ: ตรวจ Landing Page, Product Price, Checkout, Conversion Tracking' : 'CTR ต่ำ: ชี้ว่าควรดู search terms / negative / text ads'}",
    "Action 6 — ถ้า ${isEcommerce ? 'ROAS สูง: แนะนำ scale และขยาย Campaign' : 'conv ดี: แนะนำ scale keyword หรือ duplicate ad group'}"
  ],
  "outlook": "2-3 ประโยค forward-looking signal analysis — บอก leading indicators ที่ต้อง watch${isEcommerce ? ' เน้น ROAS trend, Conversion Value growth, Product seasonality' : ''}, threshold ที่จะ trigger escalation และ best-case/risk scenario สั้นๆ",
  "executiveSummary": "5-6 ประโยค สรุปภาพรวมสมบูรณ์แบบ McKinsey closing paragraph — เริ่มด้วย verdict ของช่วงนี้ ครอบคลุม: (1) ผลรวม spend + ${isEcommerce ? 'ยอดขาย (Conv. Value) + ROAS' : 'conversion + CPA vs target'}, (2) campaign/keyword ที่ outperform และ why, (3) จุดเสี่ยงที่ต้องแก้ พร้อม cost impact, (4) strategic implication 30 วันข้างหน้า, (5) confidence level ของทีมในทิศทางที่จะไป — เขียนเป็น paragraph ต่อเนื่อง ไม่ใช่ bullet points ใช้ภาษาที่พรีเซนต์ boardroom ได้เลย"
}

กฎเหล็กสไตล์ McKinsey:
- ทุก field ต้องมี "so what" — ไม่แค่บอกข้อเท็จจริง แต่ต้องบอก implication
- ทุกตัวเลขต้องมาจากข้อมูลจริงที่ให้มา ห้ามแต่ง
- actions ต้องระบุชื่อ campaign/keyword จริง + expected outcome เป็น ฿ หรือ %
- clientTalkingPoints ต้องเป็นภาษาที่ CEO/ผู้บริหารลูกค้าพูดได้ทันที — ไม่ใช่ภาษา ad tech
- strategicContext ต้องอธิบาย "ทำไม" ให้ทีมเข้าใจ context ก่อนเข้าประชุมลูกค้า
- ถ้า device/location ไม่มีข้อมูลให้บอกตรงๆ และ recommend วิธีเก็บข้อมูล`

  try {
    const raw    = await callAI(prompt, { temperature: 0.3, maxTokens: 65536, tier: 'quality', useGrounding: true, systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${ACCOUNT_TYPE_REPORTING_SKILL}` })
    const start  = raw.indexOf('{')
    const end    = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return NextResponse.json(fallback)
    const parsed = JSON.parse(raw.slice(start, end + 1)) as NarrativeReport

    // Validate required fields — without these the report renders blank
    if (!parsed.headline || !parsed.performance || !parsed.actions || !Array.isArray(parsed.actions)) {
      return NextResponse.json(fallback)
    }
    // Ensure array fields are actually arrays
    if (!Array.isArray(parsed.keyInsights)) parsed.keyInsights = fallback.keyInsights
    if (!Array.isArray(parsed.clientTalkingPoints)) parsed.clientTalkingPoints = fallback.clientTalkingPoints
    // Cap string fields to prevent UI overflow
    if (parsed.headline) parsed.headline = parsed.headline.slice(0, 200)
    if (parsed.executiveSummary) parsed.executiveSummary = parsed.executiveSummary.slice(0, 2000)

    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json(fallback)
  }
}
