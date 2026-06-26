import { prisma } from '@/lib/prisma'

// ── Load memory as prompt-injectable text block ───────────────────────────────

export async function loadClientMemory(clientId: string): Promise<string> {
  const [mem, feedback] = await Promise.all([
    prisma.clientMemory.findUnique({ where: { clientId } }),
    prisma.adCopyFeedback.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  if (!mem && feedback.length === 0) return ''

  const lines: string[] = []

  if (mem) {
    if (mem.industry)             lines.push(`Industry: ${mem.industry}`)
    if (mem.avgCPC)               lines.push(`Avg CPC: ฿${mem.avgCPC}`)
    if (mem.avgCPA)               lines.push(`Avg CPA: ฿${mem.avgCPA}`)
    if (mem.avgConversionRate)    lines.push(`Avg Conv Rate: ${mem.avgConversionRate}%`)
    if (mem.industryBenchmarkCPC) lines.push(`Industry Benchmark CPC: ฿${mem.industryBenchmarkCPC}`)
    if (mem.lastRunObjective)     lines.push(`Last Objective: ${mem.lastRunObjective}`)
    if (mem.totalCampaignsRun)    lines.push(`Total Campaigns Run: ${mem.totalCampaignsRun}`)
    if (mem.notes)                lines.push(`Agency Notes: ${mem.notes}`)

    if (mem.bestKeywords) {
      try {
        const kws: string[] = JSON.parse(mem.bestKeywords)
        if (kws.length > 0) lines.push(`Top Keywords: ${kws.slice(0, 8).join(', ')}`)
      } catch {}
    }
    if (mem.negativeKeywords) {
      try {
        const neg: string[] = JSON.parse(mem.negativeKeywords)
        if (neg.length > 0) lines.push(`Known Negatives: ${neg.slice(0, 10).join(', ')}`)
      } catch {}
    }
    if (mem.approvedCopyPatterns) {
      try {
        const patterns: string[] = JSON.parse(mem.approvedCopyPatterns)
        if (patterns.length > 0) lines.push(`Approved Copy Patterns: ${patterns.slice(0, 3).join(' | ')}`)
      } catch {}
    }
    if (mem.rejectedCopyPatterns) {
      try {
        const patterns: string[] = JSON.parse(mem.rejectedCopyPatterns)
        if (patterns.length > 0) lines.push(`Rejected Copy Patterns: ${patterns.slice(0, 3).join(' | ')}`)
      } catch {}
    }
  }

  if (feedback.length > 0) {
    const approved = feedback.filter((f) => f.status === 'approved').map((f) => f.copyText)
    const rejected = feedback.filter((f) => f.status === 'rejected').map((f) => f.copyText)
    if (approved.length > 0) lines.push(`Previously Approved Copies: ${approved.slice(0, 3).join(' | ')}`)
    if (rejected.length > 0) lines.push(`Previously Rejected Copies: ${rejected.slice(0, 3).join(' | ')}`)
  }

  return lines.join('\n').slice(0, 600)
}

// ── Save run data back to memory ──────────────────────────────────────────────

interface RunData {
  objective: string
  mediaPlanJson: {
    campaignMix: Array<{ type: string; targetCPA?: number }>
    forecast?: { blendedCPC?: number; blendedCPA?: number }
  }
  keywordAudiencePlan?: {
    keywordGroups?: Array<{
      keywords?: Array<{ keyword: string; intent?: string }>
    }>
    negativeKeywords?: string[]
  }
}

export async function saveRunToMemory(clientId: string, data: RunData): Promise<void> {
  const existing = await prisma.clientMemory.findUnique({ where: { clientId } })

  const blendedCPC = data.mediaPlanJson.forecast?.blendedCPC
  const blendedCPA = data.mediaPlanJson.forecast?.blendedCPA

  // Extract high-intent keywords from this run
  const newKeywords: string[] = []
  if (data.keywordAudiencePlan?.keywordGroups) {
    for (const group of data.keywordAudiencePlan.keywordGroups) {
      for (const kw of group.keywords ?? []) {
        if (kw.intent === 'high') newKeywords.push(kw.keyword)
      }
    }
  }
  const newNegatives = data.keywordAudiencePlan?.negativeKeywords ?? []

  if (existing) {
    // Merge keyword lists — keep unique, cap at 30
    const existingKws: string[] = existing.bestKeywords ? JSON.parse(existing.bestKeywords) : []
    const existingNegs: string[] = existing.negativeKeywords ? JSON.parse(existing.negativeKeywords) : []
    const mergedKws  = Array.from(new Set([...existingKws, ...newKeywords])).slice(0, 30)
    const mergedNegs = Array.from(new Set([...existingNegs, ...newNegatives])).slice(0, 30)

    await prisma.clientMemory.update({
      where: { clientId },
      data: {
        lastRunObjective:  data.objective,
        totalCampaignsRun: { increment: 1 },
        ...(blendedCPC ? { avgCPC: blendedCPC } : {}),
        ...(blendedCPA ? { avgCPA: blendedCPA } : {}),
        bestKeywords:    JSON.stringify(mergedKws),
        negativeKeywords: JSON.stringify(mergedNegs),
      },
    })
  } else {
    await prisma.clientMemory.create({
      data: {
        clientId,
        lastRunObjective:  data.objective,
        totalCampaignsRun: 1,
        avgCPC:            blendedCPC ?? null,
        avgCPA:            blendedCPA ?? null,
        bestKeywords:      JSON.stringify(newKeywords.slice(0, 30)),
        negativeKeywords:  JSON.stringify(newNegatives.slice(0, 30)),
      },
    })
  }
}

// ── Record ad copy feedback ───────────────────────────────────────────────────

interface CopyFeedbackItem {
  copyType: 'headline' | 'description' | 'long_headline'
  copyText: string
  status: 'approved' | 'rejected'
  reason?: string
}

export async function recordAdCopyFeedback(
  clientId: string,
  mediaPlanId: string,
  copies: CopyFeedbackItem[]
): Promise<void> {
  await prisma.adCopyFeedback.createMany({
    data: copies.map((c) => ({
      clientId,
      mediaPlanId,
      copyType: c.copyType,
      copyText: c.copyText.slice(0, 200),
      status:   c.status,
      reason:   c.reason ?? null,
    })),
  })

  // Sync approved/rejected patterns back into ClientMemory
  const memory = await prisma.clientMemory.findUnique({ where: { clientId } })
  const approved = copies.filter((c) => c.status === 'approved').map((c) => c.copyText)
  const rejected = copies.filter((c) => c.status === 'rejected').map((c) => c.copyText)

  if (approved.length === 0 && rejected.length === 0) return

  const existingApproved: string[] = memory?.approvedCopyPatterns ? JSON.parse(memory.approvedCopyPatterns) : []
  const existingRejected: string[] = memory?.rejectedCopyPatterns ? JSON.parse(memory.rejectedCopyPatterns) : []

  const mergedApproved = Array.from(new Set([...existingApproved, ...approved])).slice(0, 20)
  const mergedRejected = Array.from(new Set([...existingRejected, ...rejected])).slice(0, 20)

  if (memory) {
    await prisma.clientMemory.update({
      where: { clientId },
      data: {
        approvedCopyPatterns: JSON.stringify(mergedApproved),
        rejectedCopyPatterns: JSON.stringify(mergedRejected),
      },
    })
  } else {
    await prisma.clientMemory.create({
      data: {
        clientId,
        approvedCopyPatterns: JSON.stringify(mergedApproved),
        rejectedCopyPatterns: JSON.stringify(mergedRejected),
        totalCampaignsRun: 0,
      },
    })
  }
}

// ── Get full memory record for UI ─────────────────────────────────────────────

export async function getClientMemory(clientId: string) {
  const [memory, feedback] = await Promise.all([
    prisma.clientMemory.findUnique({ where: { clientId } }),
    prisma.adCopyFeedback.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])
  return { memory, feedback }
}

// ── Update memory notes/benchmarks manually ───────────────────────────────────

export async function updateClientMemoryNotes(
  clientId: string,
  patch: {
    industry?: string
    notes?: string
    industryBenchmarkCPC?: number
    avgCPC?: number
    avgCPA?: number
    avgConversionRate?: number
  }
): Promise<void> {
  const exists = await prisma.clientMemory.findUnique({ where: { clientId } })
  if (exists) {
    await prisma.clientMemory.update({ where: { clientId }, data: patch })
  } else {
    await prisma.clientMemory.create({ data: { clientId, totalCampaignsRun: 0, ...patch } })
  }
}
