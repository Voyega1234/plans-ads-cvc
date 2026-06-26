import { NextRequest, NextResponse } from 'next/server'
import { callAI, isRealAI } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, ACCOUNT_TYPE_REPORTING_SKILL } from '@/lib/ai/prompts'

interface CampaignInput {
  name: string; status: string; spend: number; conversions: number
  cpa: number; ctr: number; cpc: number; clicks: number; impressions: number
  roas?: number; convRate?: number; biddingStrategy?: string; budget?: number
}

const DATE_LABEL: Record<string, string> = {
  LAST_7_DAYS:  '7 วันที่ผ่านมา',
  LAST_30_DAYS: '30 วันที่ผ่านมา',
  LAST_90_DAYS: '90 วันที่ผ่านมา',
  THIS_MONTH:   'เดือนนี้',
}

// Detect campaign intent from name (layer 1 enrichment)
function detectCampaignIntent(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('brand')) return 'Brand Protection'
  if (n.includes('competitor') || n.includes('คู่แข่ง')) return 'Competitor'
  if (n.includes('generic') || n.includes('search')) return 'Generic Search'
  if (n.includes('pmax') || n.includes('performance max')) return 'Performance Max'
  if (n.includes('display') || n.includes('remarketing')) return 'Display/Remarketing'
  if (n.includes('shopping')) return 'Shopping'
  if (n.includes('youtube') || n.includes('video')) return 'YouTube/Video'
  return 'Search'
}

export async function POST(req: NextRequest) {
  const { campaigns, dateRange, totalCampaigns } = await req.json() as { campaigns: CampaignInput[]; dateRange: string; totalCampaigns?: number }

  if (!campaigns?.length) {
    return NextResponse.json({ analysis: '' })
  }

  if (!isRealAI()) {
    return NextResponse.json({ analysis: 'ไม่มี AI key — กรุณาตั้งค่า ANTHROPIC_API_KEY' })
  }

  const period = DATE_LABEL[dateRange] ?? dateRange

  // ── Layer 1: Enrich campaign data ────────────────────────────────────────────
  const totalSpend   = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalConv    = campaigns.reduce((s, c) => s + c.conversions, 0)
  const totalClicks  = campaigns.reduce((s, c) => s + c.clicks, 0)
  const totalImpr    = campaigns.reduce((s, c) => s + c.impressions, 0)
  const blendedCTR   = totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : '0'
  const blendedCPA   = totalConv > 0 ? (totalSpend / totalConv).toFixed(0) : 'N/A'
  const active       = campaigns.filter((c) => c.status === 'ENABLED')
  const paused       = campaigns.filter((c) => c.status === 'PAUSED')
  const hasSpend     = totalSpend > 0
  const isAllPaused  = active.length === 0

  // Structure analysis — layer 1
  const biddingStrategies = Array.from(new Set(campaigns.map((c) => c.biddingStrategy ?? 'UNKNOWN').filter(Boolean)))
  const campaignTypes     = Array.from(new Set(campaigns.map((c) => detectCampaignIntent(c.name))))
  const brandCampaigns    = campaigns.filter((c) => c.name.toLowerCase().includes('brand'))
  const searchCampaigns   = campaigns.filter((c) => detectCampaignIntent(c.name).includes('Search'))
  const displayCampaigns  = campaigns.filter((c) => detectCampaignIntent(c.name).includes('Display'))
  const pmaxCampaigns     = campaigns.filter((c) => detectCampaignIntent(c.name).includes('PMax') || detectCampaignIntent(c.name).includes('Performance Max'))

  // Top 10 campaigns by budget (or by spend if available)
  const topCampaigns = [...campaigns]
    .sort((a, b) => (b.spend || b.budget || 0) - (a.spend || a.budget || 0))
    .slice(0, 15)

  const table = topCampaigns.map((c) => [
    `Campaign: ${c.name}`,
    `  Intent: ${detectCampaignIntent(c.name)} | Status: ${c.status} | Bidding: ${c.biddingStrategy ?? '—'}`,
    hasSpend
      ? `  Spend: ฿${c.spend.toFixed(0)} | Conv: ${c.conversions.toFixed(2)} | CPA: ฿${c.cpa > 0 ? c.cpa.toFixed(0) : 'N/A'}`
      : `  Daily Budget: ฿${(c.budget ?? 0).toFixed(0)} | No spend yet (${c.status})`,
    hasSpend
      ? `  Clicks: ${c.clicks} | CTR: ${c.ctr.toFixed(2)}% | CPC: ฿${c.cpc.toFixed(2)} | Conv Rate: ${c.convRate != null ? c.convRate.toFixed(2) : '—'}%`
      : '',
  ].filter(Boolean).join('\n')).join('\n\n')

  // ── Layer 2: AI Prompt — handles both zero-spend and active accounts ─────────
  const contextBlock = isAllPaused
    ? `
## สถานะ Account (${period})
- Account นี้มี ${totalCampaigns ?? campaigns.length} campaigns ทั้งหมด PAUSED — ยังไม่มี performance data (แสดง ${campaigns.length} campaigns ตัวอย่างด้านล่าง)
- Active: 0 | Paused: ${totalCampaigns ?? paused.length}
- Campaign types พบ: ${campaignTypes.join(', ')}
- Bidding strategies ที่ใช้: ${biddingStrategies.join(', ')}
- Brand campaigns: ${brandCampaigns.length} | Search: ${searchCampaigns.length} | Display: ${displayCampaigns.length} | PMax: ${pmaxCampaigns.length}
- Total daily budget (sum of shown campaigns): ฿${campaigns.reduce((s, c) => s + (c.budget ?? 0), 0).toLocaleString()}
`
    : `
## Account Performance (${period})
- Total Spend: ฿${totalSpend.toFixed(0)}
- Total Conversions: ${totalConv.toFixed(2)}
- Blended CPA: ฿${blendedCPA}
- Blended CTR: ${blendedCTR}%
- Active: ${active.length} | Paused: ${paused.length}
- Campaign types: ${campaignTypes.join(', ')}
- Bidding strategies: ${biddingStrategies.join(', ')}
`

  const prompt = `คุณเป็น Senior Google Ads Consultant ที่ปรึกษาลูกค้า agency มากกว่า 10 ปี
สไตล์การให้คำปรึกษา: ชี้จุดตรวจสอบ, แนะนำสิ่งที่ควรดู, อธิบายว่า metric นี้หมายความว่าอะไร
**ห้ามแนะนำให้ pause campaign หรือเพิ่มงบจำนวนมาก** เพราะลูกค้ามีงบจำกัดและทีมต้องใช้งบให้ครบ
แนะนำด้วยความคิดสร้างสรรค์และชี้จุดที่ควรไปตรวจเพิ่มเติมแทน

${contextBlock}
## Campaign Data (${topCampaigns.length} campaigns)
${table}

---
${isAllPaused
  ? 'Account ยัง PAUSED ทั้งหมด — วิเคราะห์ account readiness และ pre-launch checklist:'
  : 'วิเคราะห์ account performance และให้คำแนะนำเชิง consultant:'}

ตอบเป็น JSON ภาษาไทยเสมอ:

{
  "verdict": "${isAllPaused
    ? 'ประเมิน account structure ว่าครบ funnel ไหม พร้อม launch หรือยัง'
    : 'สรุป account health ภาพรวม พร้อม metric สำคัญ'}",
  "score": <1-10>,
  "winners": [
    { "name": "<campaign>", "reason": "ทำไมถึงดี พร้อมตัวเลข" }
  ],
  "problems": [
    {
      "name": "<campaign หรือ metric>",
      "issue": "อธิบายปัญหาพร้อมตัวเลข",
      "checkpoints": ["จุดที่ควรไปตรวจ 1 เช่น search terms report", "จุดที่ควรตรวจ 2 เช่น negative keywords", "จุดที่ควรตรวจ 3 เช่น text ads"],
      "fix": "แนะนำสิ่งที่ทำได้โดยไม่ต้องเพิ่มงบหรือ pause — เช่น ปรับ ad copy, เพิ่ม negative, ปรับ bid modifier"
    }
  ],
  "ctr_advice": "${hasSpend
    ? 'ถ้า CTR ต่ำ — แนะนำ 3 จุดที่ควรตรวจ: 1) search terms ว่า query ตรงกับ intent ไหม 2) negative keywords ได้ทำบ้างไหม 3) text ads ได้อัพเดตล่าสุดเมื่อไร'
    : 'N/A'}",
  "conv_advice": "${hasSpend
    ? 'ถ้า conversion ต่ำ — ดู: keyword หรือ search term ไหน conv rate ดี CPA ต่ำ ให้ scale, text ad version ไหน conv ดี ให้เป็น control'
    : 'N/A'}",
  "urgent": [
    "<สิ่งที่ควรตรวจหรือปรับโดยไม่ต้องเพิ่ม/ลดงบ>"
  ],
  "strategy": "${isAllPaused
    ? 'แนะนำ launch sequence ทีละ campaign'
    : 'insight เชิง strategic เช่น audience signal, ad copy angle, funnel gap'}"
}

กฎเหล็ก:
- ห้ามแนะนำให้ pause campaign หรือเพิ่มงบมาก
- problems.checkpoints ต้องมีเสมอ อย่างน้อย 2 จุด
- fix ต้องเป็น creative solution ที่ไม่กระทบงบ
- อ้างอิงตัวเลขจริงจากข้อมูลเสมอ
- winners: 1-3 | problems: 2-4 | urgent: 3-5
- ตอบ JSON เท่านั้น`

  try {
    console.log('[ai-analysis] calling AI, campaigns:', campaigns.length, 'total:', totalCampaigns, 'isAllPaused:', isAllPaused)
    const raw = await callAI(prompt, {
      temperature: 0.3,
      maxTokens: 65536,
      tier: 'quality',
      useGrounding: true,  // Real-time industry context + competitor benchmarks via Google Search
      systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${ACCOUNT_TYPE_REPORTING_SKILL}\n\nYou are a Google Ads expert analyst. Reply with valid JSON only — no markdown fences, no extra text.`,
    })
    console.log('[ai-analysis] AI responded, raw length:', raw.length)
    console.log('[ai-analysis] raw tail:', raw.slice(-200))
    const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
    const start = cleaned.indexOf('{')
    const end   = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON object in response')
    let jsonStr = cleaned.slice(start, end + 1)

    // Remove unescaped newlines/carriage returns that break JSON.parse
    jsonStr = jsonStr.replace(/\n/g, ' ').replace(/\r/g, '')

    let json: Record<string, unknown>
    try {
      json = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error('[ai-analysis] JSON parse failed, trying to extract fields:', parseErr instanceof Error ? parseErr.message : parseErr)
      const extractStr = (key: string): string => {
        const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 's'))
        return m ? m[1] : ''
      }
      const extractNum = (key: string): number => {
        const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`))
        return m ? parseInt(m[1]) : 5
      }
      json = {
        verdict: extractStr('verdict') || `Account มี ${campaigns.length} campaigns (แสดง ${totalCampaigns ?? campaigns.length} ทั้งหมด)`,
        score: extractNum('score'),
        winners: [],
        problems: [],
        urgent: [],
        strategy: extractStr('strategy') || 'ไม่สามารถ parse คำแนะนำได้ กรุณา refresh',
      }
    }

    // Validate required fields and sanitize
    if (!json.verdict || typeof json.verdict !== 'string') {
      json.verdict = `Account มี ${campaigns.length} campaigns`
    }
    const score = Number(json.score)
    json.score = (!isNaN(score) && score >= 1 && score <= 10) ? Math.round(score) : 5
    if (!Array.isArray(json.winners)) json.winners = []
    if (!Array.isArray(json.problems)) json.problems = []
    if (!Array.isArray(json.urgent)) json.urgent = []
    if (typeof json.strategy !== 'string') json.strategy = ''
    // Sanitize problems array — each entry must have name + issue fields
    json.problems = (json.problems as Record<string, unknown>[]).filter(
      (p) => p && typeof p === 'object' && typeof p.issue === 'string' && p.issue.trim()
    )
    // Cap urgent list
    json.urgent = (json.urgent as unknown[]).slice(0, 5)

    return NextResponse.json({ analysis: json, structured: true })
  } catch (e) {
    console.error('[ai-analysis] error:', e instanceof Error ? e.message : e)
    // Return fallback structured analysis instead of empty string
    const fallback = {
      verdict: `Account มี ${campaigns.length} campaigns (${active.length} active, ${paused.length} paused)${isAllPaused ? ' — ทั้งหมดยังถูก pause อยู่' : ''}`,
      score: isAllPaused ? 5 : 4,
      winners: [],
      problems: [{
        name: 'Account Structure',
        issue: isAllPaused
          ? `Campaign ทั้ง ${campaigns.length} ตัวถูก PAUSE อยู่ ยังไม่มี performance data`
          : 'ไม่สามารถวิเคราะห์ campaign แต่ละตัวได้',
        fix: isAllPaused
          ? 'ตรวจสอบ conversion tracking ให้พร้อมก่อน แล้วเปิด Brand campaign ก่อนเป็นอันดับแรก'
          : 'ตรวจสอบ campaign settings และ conversion tracking',
      }],
      urgent: isAllPaused
        ? [`เปิด Brand campaign ก่อน เพราะ CPC ต่ำและ conversion rate สูงที่สุด (${brandCampaigns.length} brand campaigns พบใน account)`]
        : ['ตรวจสอบ conversion tracking ให้ถูกต้อง'],
      strategy: `Account มี campaign structure ครอบคลุม ${campaignTypes.join(', ')} — ${isAllPaused ? 'แนะนำ soft launch ด้วย Brand + Search ก่อน แล้วค่อย scale PMax และ Display' : 'ตรวจสอบ performance แต่ละ campaign'}`,
    }
    return NextResponse.json({ analysis: fallback, structured: true })
  }
}
