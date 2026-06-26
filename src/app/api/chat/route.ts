import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getProvider, logAiCost } from '@/lib/ai/provider'
import { EXECUTIVE_GROWTH_SKILL, ACCOUNT_TYPE_REPORTING_SKILL } from '@/lib/ai/prompts'
import { pullCampaignPerformance, loadRecentSnapshots } from '@/lib/google-ads/performance-reader'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

interface AttachedFile {
  name:     string
  mimeType: string
  size:     number
  content:  string  // text or base64 data URL
}

interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
  files?:  AttachedFile[]
}

// ── Derive nickname from email (part before @) ────────────────────────────────

function getNickname(email: string | null | undefined): string {
  if (!email) return 'ครับ'
  const local = email.split('@')[0] ?? ''
  const clean = local.replace(/[0-9]+$/, '').replace(/[._-]/g, '')
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : 'ครับ'
}

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(nickname: string, hasAccount: boolean): string {
  return `${EXECUTIVE_GROWTH_SKILL}\n\n${ACCOUNT_TYPE_REPORTING_SKILL}

---

คุณชื่อ "Mercy" — Google Ads Expert ระดับ 100/100 ที่คลุกวงในวงการ paid search และ performance marketing มากกว่า 12 ปี ผ่านงาน agency ชั้นนำ, brand ข้ามชาติ, และ startup unicorn รู้จริงทุกเรื่องตั้งแต่ auction mechanics ไปถึง business strategy เวลาแนะนำตัวหรือถูกถามชื่อ ให้บอกว่าชื่อ Mercy

## ตัวตนและสไตล์
- คุยเป็นธรรมชาติเหมือนเพื่อนที่เก่งมาก — ไม่ formal ไม่ stiff
- เรียกคนถามว่า "พี่${nickname}" เมื่อขึ้นต้น หรือเมื่อ emphatic
- ภาษาไทยเป็นหลัก ศัพท์ tech/ads เป็น English ได้ตามปกติ
- เล่าเป็นเรื่อง ไม่ bullet point ทุกอย่าง — ใช้ bullet เมื่อต้องการความชัดเจนจริงๆ
- มี "hot take" และ opinion ชัดเจน ไม่กลัวบอกว่าอะไรผิดหรือถูก
- ห้ามพูดว่า "ในฐานะ AI" — ตอบเหมือนคนจริงๆ
- ห้ามขึ้นทุกประโยคด้วย "ครับ"

## ความเชี่ยวชาญเต็ม (ใช้ตามบริบทที่ถาม)

**Google Ads — ทุก campaign type:**
Search: keyword strategy, match type, search term mining, negative list structure, RSA pinning strategy, ad strength vs. actual performance
PMax: asset group architecture, audience signal design, search themes, brand exclusion, cannibalization กับ Search, interpreting "low-quality traffic" signal
Shopping: feed optimization (title, description, custom labels), merchant center issues, segmentation by ROAS tier, CSS arbitrage
Display & Demand Gen: audience layering, similar segments, Gmail ads, YouTube action, frequency capping
YouTube: skippable vs. non-skip, BrandLift, sequence ads, connected TV, VRC vs CPM optimization
App campaigns: creative rotation, in-app event optimization, install vs. event bidding

**Bidding & Auction mechanics:**
Smart bidding: tCPA, tROAS, Maximize Conversions, Maximize Conversion Value — เมื่อไหร่ใช้อันไหน, learning period, portfolio bidding
Manual CPC: ECPC, bid adjustments (device, location, audience, ad schedule, demographic), IS-based bidding
Auction Insights: benchmark vs. competitor, overlap rate, outranking share — อ่านยังไงให้ได้ insight จริง
Quality Score: Expected CTR, Ad Relevance, Landing Page Experience — lever ที่แก้แต่ละตัว
First-page / Top-of-page bid estimates: วิธีใช้ให้เป็นประโยชน์

**Keyword & Search Intelligence:**
Search volume seasonality, keyword difficulty, intent classification (informational/navigational/transactional/commercial)
Keyword cannibalization, single keyword ad groups (SKAG) vs. tightly themed groups — pros/cons ยุค smart bidding
Long-tail vs. head term tradeoff, branded vs. non-branded split strategy
Search Impression Share, Lost IS (Budget) vs. Lost IS (Rank) — diagnosis และ fix
Keyword expansion vs. pruning timing

**Audience & Targeting:**
Customer Match: upload strategy, match rate optimization, suppression list
RLSA: bid-only vs. target-only, cart abandoners, high-LTV visitors
In-market & Affinity: stacking กับ keyword, observation vs. targeting mode
Similar audiences (deprecated) → Optimized targeting อธิบายความต่าง
Demographic targeting: income tier, household, parental status — use cases จริง
Life events, detailed demographics ใน YouTube/Display

**Conversion & Measurement:**
Conversion action setup: primary vs. secondary, counting (one/all), attribution window
Attribution models: data-driven vs. last-click — impact ต่อ smart bidding
Enhanced Conversions: setup ผ่าน GTM, email hashing, match rate
Consent Mode v2: basic vs. advanced, ผลต่อ modeled conversions
GA4 integration: import goals, cross-channel attribution, Explorations
Offline conversion import: GCLID matching, CRM integration, lead scoring
View-through conversions: เมื่อไหร่ควรนับ เมื่อไหร่ ignore
Call tracking: call extensions vs. call-only, dynamic number insertion

**Budget & Performance Management:**
Budget pacing: daily cap vs. shared budget, acceleration vs. standard delivery (legacy)
Portfolio target: account-level tCPA/tROAS, IS target
Seasonality adjustment: เมื่อไหร่ควรใช้ manual override
Campaign prioritization: budget allocation framework ตาม funnel stage + margin contribution
Budget forecasting: scenario planning, what-if analysis

**Creative & Ad Copy:**
RSA best practices: headline diversity score, meaningful vs. random pinning, ad strength misconceptions
Asset performance labels: "Best" ≠ best — วิธีอ่านให้ถูก
A/B testing ใน Google Ads: experiment setup, confidence level, when to call winner
PMax asset group: creative refresh cadence, image spec ที่สำคัญ
Landing page alignment: message match, CRO basics, page speed impact on QS

**Tracking & Tech:**
GTM: trigger types, variable setup, dataLayer, debugging ใน Preview mode
GA4: events vs. parameters, custom dimensions, audience building, BigQuery export
Consent Mode: gconsent, gcs parameter, modeling methodology
Server-side tagging: use cases, limitations, cost
API: Google Ads API, Reporting API, batch operations — เมื่อไหร่ควร automate

**Cross-channel & Media Mix:**
Google + Meta: ซ้อน audience ยังไง, attribution overlap, budget allocation framework
LINE Ads: objective types, LAP vs. LINE OA, TargetingLine — เมื่อใช้ได้ผลดีในไทย
TikTok Ads: VSA, catalog, รูปแบบ creative ที่ work
Programmatic: DSP vs. Google Display, PMPs, deal ID
Media mix modeling (MMM): concept และ when to use

**Analytics & Reporting:**
Looker Studio (Data Studio): connector setup, calculated fields, blended data source
Custom reports: dimension + metric combinations ที่ give insight จริง
Anomaly detection: เมื่อไหร่ตัวเลขผิดปกติ diagnostic checklist
Cohort analysis, LTV modeling — basic approach ทำได้ใน GA4

**Thai Market Context:**
CPC benchmarks ตลาดไทย: Real Estate ฿15-80/click, Education ฿8-35, Finance ฿20-150, Healthcare ฿5-25, E-commerce ฿2-15, B2B ฿10-60
Seasonality: เดือนไหน competition สูง (ต้นปี/ปลายปี 11.11/12.12), เดือนไหน CPC ลง
Thai consumer behavior: mobile-first (>80% search จาก mobile), LINE as CRM, short-form video consumption
Local SEO + Google Ads synergy: local campaigns, store visit conversions
Thai-specific negative keywords: "ฟรี, pantip, รีวิว, ดีไหม, สมัครงาน, ราคาถูก" use cases
Regulations: ธุรกิจที่มีข้อจำกัดโฆษณา (สุขภาพ, การเงิน, อสังหา, การศึกษา)

## กฎการตอบ
1. ${hasAccount ? 'มีข้อมูล account — อ้างอิงตัวเลขจริงเสมอ ไม่ตอบ generic' : 'ไม่มี account — ใช้ principle + framework + ตัวอย่างตลาดไทย'}
2. Strategy questions → บอก why ก่อน what บอก tradeoff และ risk ที่ต้องรู้
3. Technical questions → ลงรายละเอียดได้เลย อย่า oversimplify ถ้าคำถามเป็น technical
4. Benchmark questions → ให้ตัวเลขตลาดไทยจริง พร้อม context ว่า factor อะไรทำให้ต่างกัน
5. "ควรทำอะไร" → ให้ prioritized action บอก impact และ effort
6. ไม่แน่ใจ → บอกตรงๆ ว่าต้องการข้อมูลอะไรเพิ่มก่อนตัดสิน
7. เห็นว่าลูกค้า/ทีมกำลังทำผิด → บอกตรงๆ พร้อมอธิบายว่าทำไม ไม่ต้องกลัว`
}

// ── Mock response ─────────────────────────────────────────────────────────────

function generateMockResponse(userMessage: string, context: string, nickname: string): string {
  const msg = userMessage.toLowerCase()

  if (msg.includes('keyword') || msg.includes('คีย์เวิร์ด')) {
    return `พี่${nickname} keyword ที่ดีไม่ได้วัดที่ volume อย่างเดียวนะครับ วัดที่ intent

สิ่งที่แนะนำเสมอคือเริ่มจาก "ลูกค้าที่พร้อมซื้อที่สุด" ก่อน — คนที่พิมพ์ "ราคา", "ซื้อ", "ที่ไหน" นั่นคือ bottom-of-funnel ที่จะ convert ก่อน แล้วค่อย scale ออกไปจับ awareness

**3 กลุ่มที่ต้องมีเสมอ:**

1. **High-intent transactional** — [ชื่อบริการ] + ราคา, ที่ไหน, ใกล้ฉัน, ดีที่สุด
ใช้ phrase หรือ exact เน้น quality ไม่ใช่ volume เพราะ convert เร็ว

2. **Brand protection** — ชื่อบริษัทและทุก variation
CPC ถูก ROAS สูง ถ้าไม่ run คู่แข่งมาขัดแทนได้เลย

3. **Negative ด่านแรก** ก่อน launch จริงๆ
\`ฟรี, งาน, สมัคร, ทำเอง, pantip, รีวิว, diy\` — ถ้าไม่ใส่ budget หายกับ traffic ที่ไม่มีทาง convert${context ? `\n\nจาก account ที่เห็น มีประเด็นอยากพูดถึงเพิ่ม:\n${context}` : ''}

อยากให้วิเคราะห์ search terms report หรือ suggest negative เพิ่มมั้ยครับ?`
  }

  if (msg.includes('strategy') || msg.includes('กลยุทธ์') || msg.includes('แผน')) {
    return `พี่${nickname} ก่อนวางแผน ขอถามก่อนว่า objective หลักคืออะไร — leads, sales, หรือ brand awareness?

เพราะ strategy ต่างกันมากนะครับ:

ถ้าเป็น **leads** → Search คือ backbone, PMax เป็น scale engine ทีหลังเมื่อมี conversion data พอ เน้น intent keyword + negative ให้แน่น Call extension สำคัญมาก

ถ้าเป็น **e-commerce** → Shopping/PMax คือหัวใจหลัก Search เป็น support ต้องจัดการ feed ให้ดีก่อน เพราะ algo ต้องการ data สะอาด

ถ้าเป็น **brand awareness** → YouTube + Display เป็นหลัก Search เป็น retargeting layer ตามต่อ${context ? `\n\nจาก context ของ account:\n${context}\n\nผมวางแผนให้ตามข้อมูลนี้ได้เลยครับ` : '\n\nบอกประเภทธุรกิจและ objective มา ผมวางให้ได้เลยครับ'}`
  }

  if (msg.includes('cpa') || msg.includes('roas') || msg.includes('conversion') || msg.includes('cost')) {
    return `พี่${nickname} เรื่อง CPA ต้องเริ่มจาก LTV ของลูกค้าก่อนเสมอ ไม่ใช่เริ่มจาก CPA ที่รู้สึกว่าถูกหรือแพง

สูตรที่ใช้: **Max CPA = LTV × margin × payback period**

ตัวอย่าง: LTV = ฿20,000, margin 30%, ต้องการคืนทุนใน 3 เดือน
→ Max CPA ที่รับได้ = 20,000 × 0.3 ÷ 3 = ฿2,000${context ? `\n\nจาก account ที่มีอยู่:\n${context}` : ''}

เรื่อง tCPA bidding — Google ต้องการ 30-50 conversions ใน 30 วันก่อนถึงทำงานได้ดี ถ้า conversion ยังน้อยให้ใช้ Maximize Conversions ไปก่อน แล้วค่อย switch เมื่อ data พอ

อยากให้คำนวณ target CPA สำหรับธุรกิจนี้โดยเฉพาะมั้ยครับ?`
  }

  return `สวัสดีครับพี่${nickname}! 👋

${context ? `ผมเห็นข้อมูล account อยู่แล้วนะครับ พร้อมวิเคราะห์ได้เลย\n` : 'ยังไม่ได้เลือก account นะครับ ถ้าอยากให้วิเคราะห์ตามข้อมูลจริง เลือก account มุมขวาบนก่อนได้เลย\n'}
ถามอะไรมาได้เลย — strategy, keyword, budget, ad copy, tracking หรืออยากให้วิเคราะห์ campaign ไหนก็ได้ครับ`
}

// ── Build Anthropic messages with file support ─────────────────────────────

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

function buildAnthropicMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string | AnthropicContent[] }> {
  return messages.map((m) => {
    if (!m.files?.length) return { role: m.role, content: m.content }

    const parts: AnthropicContent[] = []

    // Inject text files as readable context
    const textFiles = m.files.filter(f => !f.mimeType.startsWith('image/'))
    if (textFiles.length > 0) {
      const fileBlocks = textFiles.map(f => {
        const MAX_CHARS = 30_000
        const body = f.content.length > MAX_CHARS
          ? f.content.slice(0, MAX_CHARS) + '\n... [ถูกตัดให้สั้นลง]'
          : f.content
        return `\n## ไฟล์: ${f.name}\n\`\`\`\n${body}\n\`\`\``
      }).join('\n')
      parts.push({ type: 'text', text: `${m.content}\n\n---\nไฟล์ที่แนบมา:${fileBlocks}` })
    } else if (m.content) {
      parts.push({ type: 'text', text: m.content })
    }

    // Images — convert data URL to base64
    for (const f of m.files.filter(f => f.mimeType.startsWith('image/'))) {
      const base64 = f.content.includes(',') ? f.content.split(',')[1] : f.content
      if (base64) {
        parts.push({
          type: 'image',
          source: { type: 'base64', media_type: f.mimeType, data: base64 },
        })
      }
    }

    // If only images and no text from above, add message text
    if (!parts.some(p => p.type === 'text') && m.content) {
      parts.unshift({ type: 'text', text: m.content })
    }
    if (!parts.some(p => p.type === 'text')) {
      parts.push({ type: 'text', text: 'วิเคราะห์ไฟล์ที่แนบมาให้หน่อยครับ' })
    }

    return { role: m.role, content: parts }
  })
}

// ── Build account performance context ────────────────────────────────────────

async function buildAccountContext(customerId?: string, accountName?: string, userId = 'demo-user-1'): Promise<string> {
  if (!customerId) return ''

  const parts: string[] = []
  if (accountName) parts.push(`Account: ${accountName} (${customerId})`)

  // Use MCC token — same as /api/performance/account, session token cannot query sub-accounts
  let adsToken: string | undefined
  try { adsToken = await getGoogleAdsAccessToken() } catch { /* fallback to env token inside lib */ }

  try {
    const [liveSnaps, storedSnaps] = await Promise.all([
      pullCampaignPerformance(customerId, 'LAST_30_DAYS', adsToken).catch(() => []),
      loadRecentSnapshots(userId, 30).catch(() => []),
    ])

    const snaps = liveSnaps.length > 0 ? liveSnaps : storedSnaps

    if (snaps.length > 0) {
      const byName: Record<string, typeof snaps[0]> = {}
      for (const s of snaps) {
        if (!byName[s.campaignName]) {
          byName[s.campaignName] = { ...s }
        } else {
          const e = byName[s.campaignName]
          e.cost        += s.cost
          e.impressions += s.impressions
          e.clicks      += s.clicks
          e.conversions += s.conversions
        }
      }

      const campaigns = Object.values(byName).map((s) => ({
        name:        s.campaignName,
        cost:        s.cost,
        impressions: s.impressions,
        clicks:      s.clicks,
        conversions: s.conversions,
        ctr:         s.impressions > 0 ? (s.clicks / s.impressions * 100).toFixed(2) : '0',
        cpc:         s.clicks > 0 ? (s.cost / s.clicks).toFixed(2) : '0',
        cpa:         s.conversions > 0 ? (s.cost / s.conversions).toFixed(2) : 'N/A',
      }))

      const totalCost   = campaigns.reduce((a, c) => a + c.cost, 0)
      const totalConv   = campaigns.reduce((a, c) => a + c.conversions, 0)
      const totalClicks = campaigns.reduce((a, c) => a + c.clicks, 0)
      const blendedCPA  = totalConv > 0 ? (totalCost / totalConv).toFixed(0) : 'N/A'

      parts.push(`\n## Performance (30 วันล่าสุด)`)
      parts.push(`รวม: ฿${totalCost.toLocaleString()} | conv ${totalConv.toFixed(2)} | ${totalClicks.toLocaleString()} clicks | CPA ฿${blendedCPA}`)
      parts.push(`\n## Campaign breakdown`)
      for (const c of campaigns.slice(0, 10)) {
        parts.push(`- ${c.name}: ฿${c.cost.toLocaleString()} | conv ${c.conversions.toFixed(2)} | CPA ฿${c.cpa} | CTR ${c.ctr}% | CPC ฿${c.cpc}`)
      }
    }
  } catch {
    // ignore
  }

  try {
    const recentBriefs = await prisma.brief.findMany({
      where:   { clientId: customerId },
      include: {
        mediaPlans: {
          take:    1,
          orderBy: { createdAt: 'desc' },
          include: { blueprints: { take: 1, orderBy: { createdAt: 'desc' } } },
        },
      },
      take:    3,
      orderBy: { createdAt: 'desc' },
    })

    if (recentBriefs.length > 0) {
      parts.push(`\n## Media Plans ล่าสุด`)
      for (const brief of recentBriefs) {
        const plan = brief.mediaPlans[0]
        const bp   = plan?.blueprints?.[0]
        parts.push(`- ${brief.businessName}: ฿${plan?.monthlyBudget?.toLocaleString() ?? '?'}/month | QA: ${bp?.qaScore ?? 'N/A'} | Status: ${bp?.status ?? 'draft'}`)
      }
    }
  } catch {
    // ignore
  }

  return parts.join('\n')
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session  = await auth()
    const userId   = getUserId(session)
    const email    = session?.user?.email ?? null
    const nickname = getNickname(email)

    const body = await req.json()
    const messages: ChatMessage[]  = body.messages ?? []
    const customerId: string       = body.customerId
    const accountName: string      = body.accountName
    const contextPlanId: string    = body.mediaPlanId
    const reportContext: string    = body.reportContext ?? ''  // pre-built report context from reports page

    const accountContext = reportContext
      ? `## Report Context (ข้อมูลจาก AI Performance Report)\n${reportContext}`
      : await buildAccountContext(customerId, accountName, userId)

    let legacyContext = ''
    if (contextPlanId) {
      try {
        const mediaPlan = await prisma.mediaPlan.findFirst({
          where:   { id: contextPlanId },
          include: {
            brief:      true,
            blueprints: { include: { qaChecks: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        })
        if (mediaPlan) {
          const brief = mediaPlan.brief
          const bp    = mediaPlan.blueprints[0]
          const plan  = mediaPlan.planJson ? JSON.parse(mediaPlan.planJson as string) : null
          legacyContext = [
            `Business: ${brief?.businessName}`,
            `Objective: ${brief?.objective}`,
            `Budget: ฿${mediaPlan.monthlyBudget?.toLocaleString()}/month`,
            `Campaigns: ${plan?.campaignMix?.length ?? 0}`,
            `QA Score: ${bp?.qaScore ?? 'N/A'}`,
            `QA Fails: ${bp?.qaChecks?.filter((q: { status: string; checkName: string }) => q.status === 'fail').map((q: { status: string; checkName: string }) => q.checkName).join(', ') || 'none'}`,
          ].join(' | ')
        }
      } catch { /* ignore */ }
    }

    const fullContext = [accountContext, legacyContext].filter(Boolean).join('\n\n')
    const hasAccount  = Boolean(customerId && accountContext)
    const userMessage = messages[messages.length - 1]?.content ?? ''
    const provider    = getProvider()

    if (provider !== 'mock') {
      const systemPrompt  = buildSystemPrompt(nickname, hasAccount)
      const systemWithCtx = fullContext
        ? `${systemPrompt}\n\n---\n## Account Context\n${fullContext}`
        : systemPrompt

      const hasFiles = messages.some(m => m.files && m.files.length > 0)

      if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai')
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
        const model = genAI.getGenerativeModel({
          model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash',
          systemInstruction: systemWithCtx,
          // Google Search grounding — Mercy can look up real-time market data, competitor info, industry news
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: [{ googleSearch: {} } as any],
        })

        // Build Gemini contents — inject file text inline, images as inlineData
        const geminiContents = messages.map((m) => {
          if (!m.files?.length) return { role: m.role as 'user' | 'model', parts: [{ text: m.content }] }
          const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []
          const textFiles = m.files.filter(f => !f.mimeType.startsWith('image/'))
          const imgFiles  = m.files.filter(f => f.mimeType.startsWith('image/'))
          let textContent = m.content
          if (textFiles.length > 0) {
            textContent += '\n\n' + textFiles.map(f => `## ไฟล์: ${f.name}\n${f.content.slice(0, 20000)}`).join('\n\n')
          }
          parts.push({ text: textContent })
          for (const f of imgFiles) {
            const base64 = f.content.replace(/^data:[^;]+;base64,/, '')
            parts.push({ inlineData: { mimeType: f.mimeType, data: base64 } })
          }
          return { role: m.role === 'assistant' ? 'model' : 'user', parts }
        })

        // eslint-disable-next-line
        const result = await model.generateContent({ contents: geminiContents as any, generationConfig: { temperature: 0.75, maxOutputTokens: 65536 } })
        const chatUsage = result.response.usageMetadata
        if (chatUsage) {
          const inp = chatUsage.promptTokenCount ?? 0
          const out = chatUsage.candidatesTokenCount ?? 0
          void logAiCost({ route: '/api/chat', model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash', inputTokens: inp, outputTokens: out, estimatedUSD: (inp / 1e6) * 0.075 + (out / 1e6) * 0.30 })
        }
        const text = result.response.text()
        return NextResponse.json({ content: text, model: process.env.AI_MODEL_QUALITY ?? 'gemini-3.5-flash' })
      }

      if (provider === 'anthropic') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        const anthropicMessages = buildAnthropicMessages(messages)

        const response = await client.messages.create({
          model:       process.env.AI_MODEL_QUALITY ?? 'claude-sonnet-4-6',
          max_tokens:  2400,
          system:      systemWithCtx,
          // eslint-disable-next-line
          messages:    anthropicMessages as any,
          temperature: 0.75,
        })

        void logAiCost({ route: '/api/chat', model: process.env.AI_MODEL_QUALITY ?? 'claude-sonnet-4-6', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, estimatedUSD: (response.usage.input_tokens / 1e6) * 3.0 + (response.usage.output_tokens / 1e6) * 15.0 })
        const block = response.content[0]
        const text  = block.type === 'text' ? block.text : 'ขอโทษนะครับ ตอบไม่ได้ในขณะนี้'
        return NextResponse.json({ content: text, model: process.env.AI_MODEL_QUALITY ?? 'claude-sonnet-4-6' })
      }

      if (provider === 'openai') {
        const { default: OpenAI } = await import('openai')
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        // For OpenAI: inject text file content inline, images as image_url
        const oaiMessages = messages.map((m) => {
          if (!m.files?.length) return { role: m.role as 'user' | 'assistant', content: m.content }
          const textFiles = m.files.filter(f => !f.mimeType.startsWith('image/'))
          const imgFiles  = m.files.filter(f => f.mimeType.startsWith('image/'))
          const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
          let textContent = m.content
          if (textFiles.length > 0) {
            textContent += '\n\n' + textFiles.map(f => `## ไฟล์: ${f.name}\n${f.content.slice(0, 20000)}`).join('\n\n')
          }
          parts.push({ type: 'text', text: textContent })
          for (const f of imgFiles) {
            parts.push({ type: 'image_url', image_url: { url: f.content } })
          }
          return { role: m.role as 'user' | 'assistant', content: parts }
        })

        const response = await client.chat.completions.create({
          model:       'gpt-4o',
          // eslint-disable-next-line
          messages:    [{ role: 'system', content: systemWithCtx }, ...oaiMessages as any],
          temperature: 0.75,
          max_tokens:  2400,
        })

        void logAiCost({ route: '/api/chat', model: 'gpt-4o', inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0, estimatedUSD: ((response.usage?.prompt_tokens ?? 0) / 1e6) * 5.0 + ((response.usage?.completion_tokens ?? 0) / 1e6) * 15.0 })
        return NextResponse.json({
          content: response.choices[0]?.message?.content ?? 'ขอโทษนะครับ ตอบไม่ได้ในขณะนี้',
          model:   'gpt-4o',
        })
      }
    }

    await new Promise((r) => setTimeout(r, 800))
    return NextResponse.json({
      content: generateMockResponse(userMessage, fullContext, nickname),
      model:   'mock',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
