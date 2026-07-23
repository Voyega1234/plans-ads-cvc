// Enrich demo-proj-a with realistic data so funnel / Leads CRM / dashboard look like Linli
// (incl. conversion events → CONVERSION=SENT + Last event, plus block-OA conversions).
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const PID = 'demo-proj-a'

const CH = ['Paid Search', 'Organic Search', 'Direct', 'Paid Social', 'Referral']
const STATUS = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON', 'PAID', 'LOST']
const NAMES = ['พลอย', 'โอ๊ต', 'มายด์', 'แบงค์', 'ฟ้า', 'ต้น', 'เมย์', 'กัน', 'ปอ', 'นุ่น', 'บีม', 'แพร', 'โจ', 'อิ๋ว', 'ตี๋', 'หนิง', 'เจน', 'บอส']
// GA4 event per status (matches src/lib/line-tracking/platforms.ts)
const GA4_EVENT = { NEW: 'generate_lead', CONTACTED: 'contact', QUALIFIED: 'qualified_lead', QUOTED: 'quote_sent', WON: 'deal_won', PAID: 'purchase' }
const rnd = (a) => a[Math.floor(Math.random() * a.length)]

;(async () => {
  // wipe existing demo-proj-a activity (keep project + client logins)
  await prisma.conversionEvent.deleteMany({ where: { projectId: PID } })
  await prisma.lead.deleteMany({ where: { projectId: PID } })
  await prisma.lineUser.deleteMany({ where: { projectId: PID } })
  await prisma.adClick.deleteMany({ where: { projectId: PID } })

  // conversion rules (GA4 enabled per status) — like Linli's defaults
  for (const st of STATUS) {
    const ev = GA4_EVENT[st]
    await prisma.conversionRule.upsert({
      where: { projectId_leadStatus: { projectId: PID, leadStatus: st } },
      update: {},
      create: {
        projectId: PID, leadStatus: st, enabled: st !== 'LOST',
        platformsJson: ev ? JSON.stringify({ ga4: { enabled: true, eventName: ev } }) : '{}',
      },
    })
  }

  for (let i = 0; i < 40; i++) {
    const ch = rnd(CH)
    const paid = ch.startsWith('Paid') || ch === 'Referral'
    const clickId = `clk_${PID}_${i}`
    await prisma.adClick.create({
      data: {
        projectId: PID, clickId, channelGroup: ch, channel: ch.toLowerCase(),
        source: paid ? 'google' : 'organic', medium: paid ? 'cpc' : 'organic',
        gclid: ch === 'Paid Search' ? `gclid_${i}` : null,
        fbclid: ch === 'Paid Social' ? `fbclid_${i}` : null,
        campaign: paid ? '23848032705' : null,
        lineClickedAt: i % 3 === 0 ? new Date() : null,
      },
    })
    if (i % 3 !== 2) {
      const blocked = i % 11 === 0
      const lu = await prisma.lineUser.create({
        data: {
          projectId: PID, lineUserId: `U_${PID}_${i}`, displayName: rnd(NAMES), latestClickId: clickId,
          friendStatus: blocked ? 'BLOCKED' : 'FRIEND',
          lastMessageAt: i % 2 === 0 ? new Date() : null,
          blockedAt: blocked ? new Date() : null,
        },
      })
      const status = rnd(STATUS)
      const won = status === 'WON' || status === 'PAID'
      const nm = rnd(NAMES)
      const convState = status === 'LOST' ? 'SKIPPED' : 'SENT'
      const lead = await prisma.lead.create({
        data: {
          projectId: PID, lineUserId: lu.id, clickId, displayName: lu.displayName,
          fullName: (won || status === 'QUOTED') ? `${nm} ${rnd(NAMES)}` : null,
          phone: won ? `08${Math.floor(10000000 + Math.random() * 89999999)}` : null,
          channelGroup: ch, source: paid ? 'google' : 'organic',
          gclid: ch === 'Paid Search' ? `gclid_${i}` : null,
          fbclid: ch === 'Paid Social' ? `fbclid_${i}` : null,
          status, value: won ? rnd([1500, 3000, 8000, 12000]) : 0,
          slipAmount: status === 'PAID' ? rnd([1500, 8000]) : null,
          slipCheckedAt: status === 'PAID' ? new Date() : null,
          currency: 'THB', purchasedAt: won ? new Date() : null,
          conversionState: convState,
        },
      })
      // GA4 conversion event per status (SENT) → CONVERSION=SENT + Last event in CRM
      const ev = GA4_EVENT[status]
      if (ev) {
        await prisma.conversionEvent.create({
          data: { projectId: PID, leadId: lead.id, platform: 'ga4', eventName: ev, eventValue: lead.value, currency: 'THB', status: 'SENT', sentAt: new Date() },
        })
      }
      // block-OA conversion (to GA4 + Meta) so blocks are measurable per channel
      if (blocked) {
        for (const p of ['ga4', 'meta']) {
          await prisma.conversionEvent.create({
            data: { projectId: PID, leadId: lead.id, platform: p, eventName: 'line_block', eventValue: 0, currency: 'THB', status: 'SENT', sentAt: new Date() },
          })
        }
      }
    }
  }
  const c = {
    leads: await prisma.lead.count({ where: { projectId: PID } }),
    sent: await prisma.conversionEvent.count({ where: { projectId: PID, status: 'SENT' } }),
    blocks: await prisma.conversionEvent.count({ where: { projectId: PID, eventName: 'line_block' } }),
    rules: await prisma.conversionRule.count({ where: { projectId: PID } }),
  }
  console.log('enriched demo-proj-a:', c)
  await prisma.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
