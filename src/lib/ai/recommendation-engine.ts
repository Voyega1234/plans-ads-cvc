import { callAI, isRealAI } from './provider'
import { EXECUTIVE_GROWTH_SKILL, ACCOUNT_TYPE_REPORTING_SKILL } from './prompts'

export interface Recommendation {
  campaignName: string
  type: 'budget' | 'bid' | 'keyword' | 'audience' | 'ad_copy' | 'structure'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  detail: string
  action: string
  estimatedImpact?: string
}

export interface PerformanceSnapshot {
  campaignName:   string
  cost:           number
  conversions:    number
  cpa:            number
  ctr:            number
  cpc:            number
  conversionRate: number
  impressions:    number
  clicks:         number
}

// Generate AI-powered recommendations based on performance data
export async function generateRecommendations(
  snapshots: PerformanceSnapshot[],
  targetCPA: number,
  blueprintJson?: string
): Promise<Recommendation[]> {
  if (isRealAI() && snapshots.length > 0) {
    const prompt = buildRecommendationPrompt(snapshots, targetCPA, blueprintJson)
    try {
      const raw = await callAI(prompt, {
        temperature: 0.3,
        maxTokens: 65536,
        tier: 'quality',
        systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${ACCOUNT_TYPE_REPORTING_SKILL}`,
      })
      const text = raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
      const start = text.indexOf('{')
      const end   = text.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('no JSON')
      const parsed = JSON.parse(text.slice(start, end + 1)) as { recommendations?: unknown[] }

      if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        const VALID_TYPES = ['budget', 'bid', 'keyword', 'audience', 'ad_copy', 'structure']
        const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low']
        const validated = parsed.recommendations
          .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
          .filter(r => typeof r.title === 'string' && r.title.trim() && typeof r.action === 'string' && r.action.trim())
          .map(r => ({
            campaignName:    typeof r.campaignName === 'string' ? r.campaignName : 'ทุก Campaign',
            type:            VALID_TYPES.includes(r.type as string) ? (r.type as Recommendation['type']) : 'structure',
            priority:        VALID_PRIORITIES.includes(r.priority as string) ? (r.priority as Recommendation['priority']) : 'medium',
            title:           String(r.title).slice(0, 150),
            detail:          String(r.detail ?? '').slice(0, 500),
            action:          String(r.action).slice(0, 500),
            estimatedImpact: typeof r.estimatedImpact === 'string' ? r.estimatedImpact.slice(0, 200) : undefined,
          })) as Recommendation[]
        if (validated.length > 0) return validated.slice(0, 8)
      }
    } catch {
      // fall through to rule-based
    }
  }

  return ruleBasedRecommendations(snapshots, targetCPA)
}

function buildRecommendationPrompt(
  snapshots: PerformanceSnapshot[],
  targetCPA: number,
  blueprintJson?: string
): string {
  return `คุณเป็น Senior Google Ads Strategist ที่มีประสบการณ์ 10+ ปี
วิเคราะห์ performance data แล้วให้คำแนะนำที่ชัดเจน ใส่ความคิดสร้างสรรค์ บอก why+how เสมอ ไม่แนะนำแบบผิวเผิน

## เป้าหมาย CPA: ฿${targetCPA}

## ผลงาน 30 วันที่ผ่านมา
${JSON.stringify(snapshots, null, 2)}

${blueprintJson ? `## Blueprint ปัจจุบัน\n${blueprintJson.slice(0, 1000)}` : ''}

Return JSON:
{
  "recommendations": [
    {
      "campaignName": "string (ชื่อ campaign หรือ 'ทุก Campaign')",
      "type": "budget|bid|keyword|audience|ad_copy|structure",
      "priority": "critical|high|medium|low",
      "title": "string (หัวข้อสั้นๆ ภาษาไทย)",
      "detail": "string (ภาษาไทย — อธิบาย WHY จากตัวเลขที่เห็น ใส่ insight ที่คนอื่นมักมองข้าม)",
      "action": "string (ภาษาไทย — บอก HOW ที่ทำได้เลยวันนี้ ระบุขั้นตอนชัดเจน)",
      "estimatedImpact": "string (ภาษาไทย — คาดการณ์ผลที่จะเห็น พร้อมระยะเวลา)"
    }
  ]
}

กฎ:
- Critical: CPA > 150% เป้า, CTR < 0.5%, ใช้งบไปเยอะแต่ไม่มี conversion
- High: CPA 120-150% เป้า, งบไม่ถูกใช้, keyword quality issues
- Medium: โอกาสขยาย audience, A/B test ที่น่าสนใจ
- Low: ไอเดีย creative, seasonal ที่น่าลอง, quick wins
- สูงสุด 8 คำแนะนำ เรียงจากสำคัญที่สุด
- ห้ามแนะนำแบบหักดิบ เช่น "เพิ่มงบ" เฉยๆ — ต้องบอกว่าเพิ่มเท่าไหร่ ทำไม คาดผลอะไร
- ใส่ความคิดสร้างสรรค์ เช่น angle ใหม่, timing ที่ดี, audience ที่คนอื่นยังไม่ใช้
`
}

// Rule-based fallback when AI unavailable
function ruleBasedRecommendations(
  snapshots: PerformanceSnapshot[],
  targetCPA: number
): Recommendation[] {
  const recs: Recommendation[] = []

  for (const snap of snapshots) {
    // CPA too high
    if (snap.conversions > 0 && snap.cpa > targetCPA * 1.5) {
      recs.push({
        campaignName:    snap.campaignName,
        type:            'bid',
        priority:        'critical',
        title:           `CPA เกินเป้า ${Math.round((snap.cpa / targetCPA - 1) * 100)}% — ถึงเวลาปรับ bid แล้ว`,
        detail:          `ตอนนี้ CPA อยู่ที่ ฿${snap.cpa.toFixed(0)} ในขณะที่เป้าอยู่ที่ ฿${targetCPA} — ห่างกันถึง ฿${Math.round(snap.cpa - targetCPA)} บาท algorithm กำลังเรียนรู้ผิดทิศ`,
        action:          `ลองค่อยๆ ดึง target CPA bid ลงมาที่ ฿${Math.round(targetCPA * 0.9)} ก่อน อย่าดึงทีเดียว เพื่อให้ smart bidding ปรับตัวได้ รอดู 7-10 วัน`,
        estimatedImpact: `ถ้า algorithm จับทิศได้ คาดว่า CPA จะเริ่มลดลง 10-20% ภายใน 2 สัปดาห์`,
      })
    }

    if (snap.conversions === 0 && snap.cost > 3000) {
      recs.push({
        campaignName:    snap.campaignName,
        type:            'structure',
        priority:        'critical',
        title:           `ใช้งบไป ฿${snap.cost.toFixed(0)} แต่ยังไม่มี Conversion เลย`,
        detail:          `นี่เป็น signal สำคัญมาก — ไม่ใช่แค่ campaign ไม่ดี แต่อาจมีปัญหาที่ tracking หรือ landing page ที่ทำให้ conversion หาย`,
        action:          `เช็ก 3 จุดนี้ก่อน: 1) conversion tag ยิงถูกไหม ทดสอบผ่าน Tag Assistant 2) เปิด Search Terms Report ดูว่า traffic ที่มาตรงกับสินค้าจริงไหม 3) ทดสอบ landing page บนมือถือ ดูว่า form กด submit ได้ปกติไหม`,
        estimatedImpact: `ถ้าแก้ได้ทั้ง 3 จุด คาดว่าจะเริ่มเห็น conversion ภายใน 7 วัน`,
      })
    }

    if (snap.impressions > 5000 && snap.ctr < 1.5) {
      recs.push({
        campaignName:    snap.campaignName,
        type:            'ad_copy',
        priority:        'high',
        title:           `CTR ${snap.ctr.toFixed(2)}% — คนเห็น ad แล้วแต่ไม่กด`,
        detail:          `มาตรฐาน Search ไทยอยู่ที่ 4.5% แต่ตอนนี้ได้แค่ ${snap.ctr.toFixed(2)}% — แสดงว่า ad ที่แสดงอยู่ยังไม่ตรง intent หรือไม่โดดเด่นพอ`,
        action:          `เพิ่ม headline ที่ใช้คำเดียวกับที่ลูกค้า search เช่น ถ้าเขาพิมพ์ "รักษาสิว ราคา" headline ก็ต้องมีคำนั้น และเพิ่ม callout ที่เป็นตัวเลขจริง เช่น "ราคาเริ่ม ฿X" หรือ "ประสบการณ์ 10 ปี"`,
        estimatedImpact: `CTR ขึ้น 1-2% จะช่วยลด CPC และ Quality Score จะดีขึ้นด้วย ซึ่งยิ่งทำให้งบไปได้ไกลขึ้น`,
      })
    }

    if (snap.clicks > 100 && snap.conversionRate < 1.0) {
      recs.push({
        campaignName:    snap.campaignName,
        type:            'keyword',
        priority:        'high',
        title:           `${snap.clicks} clicks แต่ Conv Rate แค่ ${snap.conversionRate.toFixed(2)}% — keywords อาจดึงคนผิดกลุ่ม`,
        detail:          `มีคนคลิกเข้ามาเยอะ แต่ไม่ convert — ส่วนใหญ่เกิดจาก broad match ที่ดึง traffic ที่ intent ยังไม่ถึง หรือ landing page ไม่ตรงกับ keyword`,
        action:          `เปิด Search Terms Report กรอง 30 วัน แล้วเพิ่ม negative keywords สำหรับคำที่ไม่เกี่ยว จากนั้นค่อยๆ เปลี่ยน broad match เป็น phrase match ทีละ group`,
        estimatedImpact: `Conv rate เพิ่ม 0.5-1% จะทำให้ CPA ลดได้ถึง 30-50% โดยไม่ต้องเพิ่มงบเลย`,
      })
    }
  }

  const totalCost  = snapshots.reduce((s, r) => s + r.cost, 0)
  const totalConv  = snapshots.reduce((s, r) => s + r.conversions, 0)
  const blendedCPA = totalConv > 0 ? totalCost / totalConv : 0

  if (blendedCPA > targetCPA * 1.2 && totalConv > 5) {
    const bestCampaign = snapshots
      .filter((s) => s.conversions > 0)
      .sort((a, b) => a.cpa - b.cpa)[0]

    if (bestCampaign) {
      recs.push({
        campaignName:    'ทุก Campaign',
        type:            'budget',
        priority:        'high',
        title:           `ย้ายงบไปเสริม ${bestCampaign.campaignName} — ตัวนี้ดีที่สุดในทีม`,
        detail:          `${bestCampaign.campaignName} ทำ CPA ได้ ฿${bestCampaign.cpa.toFixed(0)} ซึ่งดีกว่าเป้า ฿${targetCPA} — ในขณะที่ campaign อื่นยังสูงกว่าเป้า เป็นโอกาสดีที่จะ scale campaign ที่ work แล้ว`,
        action:          `เพิ่มงบ ${bestCampaign.campaignName} ขึ้น 20% แล้วดึงงบจาก campaign ที่ CPA สูงที่สุดมาก่อน รอดู 2 สัปดาห์`,
        estimatedImpact: `ถ้า campaign ที่ดีได้งบเพิ่ม คาดว่า blended CPA จะลดลง 10-15% โดยรวม`,
      })
    }
  }

  // Sort: critical → high → medium → low
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return recs.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 8)
}
