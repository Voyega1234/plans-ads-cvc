export const maxDuration = 300

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateCampaignBlueprint } from '@/lib/ai/campaign-blueprint'
import { runCampaignQA } from '@/lib/ai/qa'
import { loadDuplicateCheckContext, checkForDuplicatesFromContext } from '@/lib/checks/duplicate-checker'
import { generateKeywordAudiencePlan } from '@/lib/ai/keyword-audience'
import { MediaPlanJson, CampaignBlueprintJson, KeywordAudiencePlan } from '@/types'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'

const schema = z.object({
  planId: z.string().min(1),
  customerId: z.string().optional(),
  campaignIndices: z.array(z.number().int().min(0)).optional(),
})

function event(controller: ReadableStreamDefaultController, data: object) {
  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
  controller.enqueue(encoded)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = getUserId(session)
  const body = await req.json()

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.errors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const input = parsed.data

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Fetch the media plan + brief from DB
        const plan = await prisma.mediaPlan.findFirst({
          where: { id: input.planId, userId },
          include: { brief: true },
        })

        if (!plan || !plan.brief) {
          event(controller, {
            done: true,
            success: false,
            error: 'Media plan or brief not found',
          })
          controller.close()
          return
        }

        const planJson: MediaPlanJson = JSON.parse(plan.planJson as string)
        const brief = plan.brief

        const briefData: Record<string, unknown> = {
          businessName:   brief.businessName,
          websiteUrl:     brief.websiteUrl,
          productService: brief.productService,
          objective:      brief.objective,
          monthlyBudget:  brief.monthlyBudget,
          currency:       brief.currency,
          targetLocation: brief.targetLocation,
          language:       brief.language,
          targetAudience: brief.targetAudience,
          conversionGoal: brief.conversionGoal,
          brandTone:      brief.brandTone ?? '',
          promotion:      brief.promotion ?? '',
        }

        // Determine which campaign indices to build
        const allIndices = planJson.campaignMix.map((_, i) => i)
        const selectedIndices = input.campaignIndices ?? allIndices

        // Validate indices
        const validIndices = selectedIndices.filter(
          (i) => i >= 0 && i < planJson.campaignMix.length
        )

        if (validIndices.length === 0) {
          event(controller, {
            done: true,
            success: false,
            error: 'No valid campaign indices provided',
          })
          controller.close()
          return
        }

        // Generate a keyword/audience plan for all campaigns (needed for blueprint generation)
        const kwPlan: KeywordAudiencePlan = await generateKeywordAudiencePlan(
          planJson,
          briefData,
          ''
        )

        // Load duplicate check data ONCE — scope to this account if known (new accounts skip entirely)
        const isNewAccount = !brief.googleAdsCustomerId
        const dupCtx = isNewAccount
          ? { blueprints: [], keywordRows: [] }
          : await loadDuplicateCheckContext(userId, brief.googleAdsCustomerId ?? undefined)

        // Process each campaign
        const results: {
          campaignIdx: number
          blueprintId: string | null
          qaScore: number | null
          campaignName: string
          success: boolean
          error?: string
        }[] = []

        for (const idx of validIndices) {
          const campaignItem = planJson.campaignMix[idx]
          const campaignName = campaignItem.campaignName

          // ── Step A: Duplicate Check ──────────────────────────────────────
          event(controller, {
            campaignIdx: idx,
            step: 'duplicate_check',
            status: 'running',
            campaignName,
          })

          try {
            const dupCheck = checkForDuplicatesFromContext(
              brief.businessName,
              brief.websiteUrl,
              [campaignName],
              [],
              dupCtx
            )

            event(controller, {
              campaignIdx: idx,
              step: 'duplicate_check',
              status: 'done',
              campaignName,
              hasConflicts:  dupCheck.hasConflicts,
              blockingCount: dupCheck.blockingCount,
              warningCount:  dupCheck.warningCount,
              canProceed:    dupCheck.canProceed,
              detail:        dupCheck.summary,
            })
          } catch (err) {
            event(controller, {
              campaignIdx: idx,
              step: 'duplicate_check',
              status: 'done',
              campaignName,
              hasConflicts: false,
              detail: 'Duplicate check skipped (error)',
            })
          }

          // ── Step B: Generate Blueprint ───────────────────────────────────
          event(controller, {
            campaignIdx: idx,
            step: 'blueprint',
            status: 'running',
            campaignName,
          })

          let blueprintId: string | null = null
          let blueprintJson: CampaignBlueprintJson | null = null

          try {
            // Build a single-campaign media plan for this specific campaign
            const singleCampaignPlan: MediaPlanJson = {
              ...planJson,
              campaignMix: [campaignItem],
            }

            // Filter keyword plan to only this campaign
            const singleKwPlan: KeywordAudiencePlan = {
              ...kwPlan,
              keywordGroups: kwPlan.keywordGroups.filter(
                (g) => g.campaignName === campaignName
              ),
              audienceSegments: kwPlan.audienceSegments.filter(
                (s) => s.campaignName === campaignName
              ),
            }

            const campaignBriefData = {
              ...briefData,
              monthlyBudget: campaignItem.monthlyBudget,
            }

            blueprintJson = await generateCampaignBlueprint(
              singleCampaignPlan,
              singleKwPlan,
              campaignBriefData,
              ''
            )

            // Save blueprint to DB
            const blueprint = await prisma.campaignBlueprint.create({
              data: {
                mediaPlanId:   plan.id,
                userId,
                blueprintJson: JSON.stringify(blueprintJson),
                status:        'draft',
              },
            })
            blueprintId = blueprint.id

            event(controller, {
              campaignIdx: idx,
              step: 'blueprint',
              status: 'done',
              campaignName,
              blueprintId,
              adGroups: blueprintJson.campaigns?.reduce(
                (s, c) => s + (c.adGroups?.length ?? 0),
                0
              ) ?? 0,
            })
          } catch (err) {
            event(controller, {
              campaignIdx: idx,
              step: 'blueprint',
              status: 'error',
              campaignName,
              detail: err instanceof Error ? err.message : 'Blueprint generation failed',
            })
            results.push({
              campaignIdx: idx,
              blueprintId: null,
              qaScore: null,
              campaignName,
              success: false,
              error: err instanceof Error ? err.message : 'Blueprint generation failed',
            })
            continue
          }

          // ── Step C: QA Check ─────────────────────────────────────────────
          event(controller, {
            campaignIdx: idx,
            step: 'qa',
            status: 'running',
            campaignName,
          })

          try {
            const qaResult = await runCampaignQA(blueprintJson!, briefData, '')

            // Save QA checks
            await prisma.qACheck.deleteMany({ where: { campaignBlueprintId: blueprintId! } })
            for (const check of qaResult.checks ?? []) {
              await prisma.qACheck.create({
                data: {
                  campaignBlueprintId: blueprintId!,
                  checkName:           check.checkName,
                  severity:            check.severity,
                  status:              check.status,
                  message:             check.message,
                  recommendation:      check.recommendation,
                },
              })
            }

            await prisma.campaignBlueprint.update({
              where: { id: blueprintId! },
              data: {
                qaScore: qaResult.score,
                status:  qaResult.readyToPush ? 'approved' : 'review',
              },
            })

            event(controller, {
              campaignIdx: idx,
              step: 'qa',
              status: 'done',
              campaignName,
              qaScore: qaResult.score,
              readyToPush: qaResult.readyToPush,
              passed:   (qaResult.checks ?? []).filter((c) => c.status === 'pass').length,
              warnings: (qaResult.checks ?? []).filter((c) => c.status === 'warning').length,
              failed:   (qaResult.checks ?? []).filter((c) => c.status === 'fail').length,
            })

            results.push({
              campaignIdx: idx,
              blueprintId,
              qaScore: qaResult.score,
              campaignName,
              success: true,
            })
          } catch (err) {
            event(controller, {
              campaignIdx: idx,
              step: 'qa',
              status: 'error',
              campaignName,
              detail: err instanceof Error ? err.message : 'QA check failed',
            })
            results.push({
              campaignIdx: idx,
              blueprintId,
              qaScore: null,
              campaignName,
              success: false,
              error: err instanceof Error ? err.message : 'QA check failed',
            })
          }
        }

        // ── All done ──────────────────────────────────────────────────────
        event(controller, {
          allDone: true,
          results,
        })
      } catch (err) {
        event(controller, {
          done: true,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
