import { prisma } from '@/lib/prisma'
import { CampaignBlueprintJson } from '@/types'

export interface CampaignConflict {
  type: 'campaign_name' | 'keyword' | 'business_name'
  severity: 'block' | 'warn'
  existingId: string
  existingName: string
  existingStatus: string
  conflictValue: string
  detail: string
  mediaPlanId?: string
  blueprintId?: string
}

export interface DuplicateCheckResult {
  hasConflicts: boolean
  blockingCount: number
  warningCount: number
  conflicts: CampaignConflict[]
  canProceed: boolean
  summary: string
}

// Pre-fetched data to avoid repeated DB queries inside a loop
export interface DuplicateCheckContext {
  blueprints: Array<{
    id: string
    status: string
    mediaPlanId: string
    blueprintJson: string | null
    mediaPlan: {
      brief: { businessName: string; websiteUrl: string } | null
    } | null
  }>
  keywordRows: Array<{
    keyword: string
    matchType: string
    campaignName: string
    mediaPlanId: string
    bpStatus: string
  }>
}

const ACTIVE_STATUSES = ['draft', 'approved', 'pushed', 'review']
const INACTIVE_STATUSES = ['stopped', 'archived', 'paused_permanent']

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isSimilarName(a: string, b: string): boolean {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (na === nb) return true
  if (na.length > 6 && nb.includes(na)) return true
  if (nb.length > 6 && na.includes(nb)) return true
  return false
}

// ── Fetch once, reuse for all campaigns in a batch ──────────────────────────

export async function loadDuplicateCheckContext(
  userId: string,
  googleAdsCustomerId?: string  // if set, only check plans for this account
): Promise<DuplicateCheckContext> {
  // Build brief filter — scope to specific account when provided
  const briefFilter = googleAdsCustomerId
    ? { brief: { googleAdsCustomerId } }
    : {}

  const [blueprints, keywordRows] = await Promise.all([
    prisma.campaignBlueprint.findMany({
      where: { userId, mediaPlan: Object.keys(briefFilter).length ? briefFilter : undefined },
      select: {
        id: true,
        status: true,
        mediaPlanId: true,
        blueprintJson: true,
        mediaPlan: {
          select: {
            brief: { select: { businessName: true, websiteUrl: true } },
          },
        },
      },
    }),
    prisma.keywordIdea.findMany({
      where: { mediaPlan: { userId, ...(googleAdsCustomerId ? { brief: { googleAdsCustomerId } } : {}) } },
      select: {
        keyword: true,
        matchType: true,
        campaignName: true,
        mediaPlanId: true,
        mediaPlan: {
          select: {
            blueprints: {
              select: { status: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    }),
  ])

  return {
    blueprints,
    keywordRows: keywordRows.map((k) => ({
      keyword: k.keyword,
      matchType: k.matchType,
      campaignName: k.campaignName,
      mediaPlanId: k.mediaPlanId,
      bpStatus: k.mediaPlan?.blueprints[0]?.status ?? 'draft',
    })),
  }
}

// ── Check using pre-loaded context (no DB calls) ─────────────────────────────

export function checkForDuplicatesFromContext(
  businessName: string,
  websiteUrl: string,
  proposedCampaigns: string[],
  proposedKeywords: string[],
  ctx: DuplicateCheckContext
): DuplicateCheckResult {
  const conflicts: CampaignConflict[] = []

  // 1. Business name / website conflict
  for (const bp of ctx.blueprints) {
    const brief = bp.mediaPlan?.brief
    if (!brief) continue
    const isActive = ACTIVE_STATUSES.includes(bp.status)
    const severity: CampaignConflict['severity'] = isActive ? 'block' : 'warn'

    if (isSimilarName(brief.businessName, businessName)) {
      conflicts.push({
        type: 'business_name', severity,
        existingId: bp.id, existingName: brief.businessName, existingStatus: bp.status,
        conflictValue: businessName,
        detail: `พบ Blueprint ของ "${brief.businessName}" ที่มีอยู่แล้ว (status: ${bp.status})`,
        mediaPlanId: bp.mediaPlanId, blueprintId: bp.id,
      })
      break
    }

    if (brief.websiteUrl && normalizeText(brief.websiteUrl) === normalizeText(websiteUrl)) {
      conflicts.push({
        type: 'business_name', severity,
        existingId: bp.id, existingName: brief.businessName, existingStatus: bp.status,
        conflictValue: websiteUrl,
        detail: `Website "${websiteUrl}" ถูกใช้ใน Blueprint ของ "${brief.businessName}" แล้ว (status: ${bp.status})`,
        mediaPlanId: bp.mediaPlanId, blueprintId: bp.id,
      })
      break
    }
  }

  // 2. Campaign name conflict
  for (const bp of ctx.blueprints) {
    let bpJson: CampaignBlueprintJson | null = null
    try { bpJson = JSON.parse(bp.blueprintJson as string) } catch { continue }

    const existingNames = (bpJson!.campaigns ?? []).map((c) => c.campaignName ?? '')
    const isActive = ACTIVE_STATUSES.includes(bp.status)
    const severity: CampaignConflict['severity'] = isActive ? 'block' : 'warn'

    for (const proposed of proposedCampaigns) {
      for (const existing of existingNames) {
        if (!existing) continue
        if (isSimilarName(proposed, existing)) {
          conflicts.push({
            type: 'campaign_name', severity,
            existingId: bp.id, existingName: existing, existingStatus: bp.status,
            conflictValue: proposed,
            detail: `Campaign "${proposed}" ซ้ำกับ "${existing}" (status: ${bp.status})`,
            mediaPlanId: bp.mediaPlanId, blueprintId: bp.id,
          })
        }
      }
    }
  }

  // 3. Keyword conflict
  if (proposedKeywords.length > 0) {
    const normalizedProposed = proposedKeywords.map((k) => normalizeText(k))
    const duplicateKws: string[] = []

    for (const ekw of ctx.keywordRows) {
      if (INACTIVE_STATUSES.includes(ekw.bpStatus)) continue
      const normalizedExisting = normalizeText(ekw.keyword)
      if (normalizedProposed.includes(normalizedExisting) && !duplicateKws.includes(ekw.keyword)) {
        duplicateKws.push(ekw.keyword)
        conflicts.push({
          type: 'keyword', severity: 'warn',
          existingId: ekw.mediaPlanId, existingName: ekw.campaignName, existingStatus: ekw.bpStatus,
          conflictValue: ekw.keyword,
          detail: `Keyword "${ekw.keyword}" [${ekw.matchType}] มีอยู่แล้วใน "${ekw.campaignName}"`,
          mediaPlanId: ekw.mediaPlanId,
        })
        if (duplicateKws.length >= 10) break
      }
    }
  }

  // 4. Deduplicate
  const seen = new Set<string>()
  const deduped: CampaignConflict[] = []
  for (const c of conflicts) {
    const key = `${c.type}:${c.conflictValue}:${c.existingId}`
    if (!seen.has(key)) { seen.add(key); deduped.push(c) }
  }

  const blockingCount = deduped.filter((c) => c.severity === 'block').length
  const warningCount  = deduped.filter((c) => c.severity === 'warn').length

  let summary = ''
  if (blockingCount > 0) {
    summary = `พบ ${blockingCount} conflicts ที่ต้องแก้ไขก่อนดำเนินการ`
    if (warningCount > 0) summary += ` และ ${warningCount} warnings`
  } else if (warningCount > 0) {
    summary = `พบ ${warningCount} warnings — สามารถดำเนินการต่อได้`
  } else {
    summary = 'ไม่พบ campaigns หรือ keywords ซ้ำ — พร้อมดำเนินการ'
  }

  return { hasConflicts: deduped.length > 0, blockingCount, warningCount, conflicts: deduped, canProceed: blockingCount === 0, summary }
}

// ── Legacy single-call wrapper (kept for backward compat) ────────────────────

export async function checkForDuplicates(
  businessName: string,
  websiteUrl: string,
  proposedCampaigns: string[],
  proposedKeywords: string[],
  userId: string,
  googleAdsCustomerId?: string
): Promise<DuplicateCheckResult> {
  const ctx = await loadDuplicateCheckContext(userId, googleAdsCustomerId)
  return checkForDuplicatesFromContext(businessName, websiteUrl, proposedCampaigns, proposedKeywords, ctx)
}
