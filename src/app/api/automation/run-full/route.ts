export const maxDuration = 300

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateMediaPlan } from '@/lib/ai/media-plan'
import { generateKeywordAudiencePlan } from '@/lib/ai/keyword-audience'
import { generateCampaignBlueprint } from '@/lib/ai/campaign-blueprint'
import { runCampaignQA } from '@/lib/ai/qa'
import { pushCampaignBlueprint } from '@/lib/google-ads/campaign-builder'
import { scanUrl } from '@/lib/tracking/url-scanner'
import { generateTrackingBlueprint } from '@/lib/tracking/tracking-plan'
import { loadDuplicateCheckContext, checkForDuplicatesFromContext } from '@/lib/checks/duplicate-checker'
import { loadClientMemory, saveRunToMemory } from '@/lib/memory/client-memory'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'
import { MediaPlanJson, KeywordAudiencePlan, CampaignBlueprintJson } from '@/types'
import { z } from 'zod'

const schema = z.object({
  businessName:   z.string().min(2),
  websiteUrl:     z.string().url(),
  productService: z.string().min(10),
  objective:      z.enum(['LEADS', 'SALES', 'AWARENESS', 'TRAFFIC', 'APP_INSTALLS']),
  monthlyBudget:  z.number().min(1),
  currency:       z.string().default('THB'),
  targetLocation: z.string().min(2),
  language:       z.string().default('th'),
  targetAudience: z.string().min(10),
  conversionGoal: z.string().min(5),
  promotion:      z.string().optional(),
  brandTone:      z.string().optional(),
  duration:       z.string().optional(),
  launchDate:     z.string().optional(),
  notes:          z.string().optional(),
  customerId:     z.string().optional(),
  forceOverride:        z.boolean().optional().default(false),
  clientId:             z.string().optional(),
  googleAdsCustomerId:  z.string().optional(),
  isNewAccount:         z.boolean().optional().default(false),
})

function event(controller: ReadableStreamDefaultController, data: object) {
  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
  controller.enqueue(encoded)
}

export async function POST(req: NextRequest) {
  const session = await (auth() as Promise<Session | null>)
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

  // Load client memory if clientId provided
  const clientMemoryContext = input.clientId
    ? await loadClientMemory(input.clientId)
    : ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Step 0: Duplicate Check ──────────────────────────────────────────
        event(controller, { step: 0, label: 'ตรวจสอบ Campaign/Keyword ซ้ำ', status: 'running' })

        // Generate a lightweight plan to know the proposed campaign names
        const briefPreview = {
          businessName:   input.businessName,
          websiteUrl:     input.websiteUrl,
          productService: input.productService,
          objective:      input.objective,
          monthlyBudget:  input.monthlyBudget,
          currency:       input.currency,
          targetLocation: input.targetLocation,
          language:       input.language,
          targetAudience: input.targetAudience,
          conversionGoal: input.conversionGoal,
          brandTone:      input.brandTone ?? '',
          promotion:      input.promotion ?? '',
        }

        const previewPlan = await generateMediaPlan(briefPreview, clientMemoryContext)
        const previewKwPlan = await generateKeywordAudiencePlan(previewPlan, briefPreview, clientMemoryContext)

        const proposedCampaigns = previewPlan.campaignMix.map((c) => c.campaignName)
        const proposedKeywords  = (previewKwPlan.keywordGroups ?? [])
          .flatMap((g) => g.keywords ?? [])
          .map((k) => k.keyword)

        // New accounts skip duplicate check entirely — nothing to conflict with
        const dupCtx = input.isNewAccount
          ? { blueprints: [], keywordRows: [] }
          : await loadDuplicateCheckContext(userId, input.googleAdsCustomerId)
        const dupCheck = checkForDuplicatesFromContext(
          input.businessName,
          input.websiteUrl,
          proposedCampaigns,
          proposedKeywords,
          dupCtx
        )

        event(controller, {
          step: 0, label: 'ตรวจสอบ Campaign/Keyword ซ้ำ', status: 'done',
          hasConflicts:      dupCheck.hasConflicts,
          blockingCount:     dupCheck.blockingCount,
          warningCount:      dupCheck.warningCount,
          canProceed:        dupCheck.canProceed,
          conflicts:         dupCheck.conflicts,
          summary:           dupCheck.summary,
          proposedCampaigns,
          proposedKeywordsCount: proposedKeywords.length,
        })

        // If there are blocking conflicts AND user has NOT force-overridden, stop here
        if (dupCheck.blockingCount > 0 && !input.forceOverride) {
          event(controller, {
            done:    false,
            blocked: true,
            reason:  'duplicate_conflict',
            message: dupCheck.summary,
            conflicts: dupCheck.conflicts,
            blockingCount: dupCheck.blockingCount,
            warningCount:  dupCheck.warningCount,
          })
          controller.close()
          return
        }

        // ── Step 1: Create Brief ─────────────────────────────────────────────
        event(controller, { step: 1, label: 'บันทึก Brief', status: 'running' })

        const brief = await prisma.brief.create({
          data: {
            userId,
            businessName:   input.businessName,
            websiteUrl:     input.websiteUrl,
            productService: input.productService,
            objective:      input.objective,
            monthlyBudget:  input.monthlyBudget,
            currency:       input.currency,
            targetLocation: input.targetLocation,
            language:       input.language,
            targetAudience: input.targetAudience,
            conversionGoal: input.conversionGoal,
            promotion:      input.promotion,
            brandTone:      input.brandTone,
            duration:       input.duration,
            launchDate:     input.launchDate,
            notes:          input.notes,
            status:         'completed',
          },
        })

        event(controller, { step: 1, label: 'บันทึก Brief', status: 'done', briefId: brief.id })

        // ── Step 2: URL Scan + Tracking Blueprint ────────────────────────────
        event(controller, { step: 2, label: 'Scan เว็บไซต์ & วาง Tracking Plan', status: 'running' })

        const briefData = {
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

        const scanResult = await scanUrl(input.websiteUrl)
        const trackingBlueprint = generateTrackingBlueprint(briefData, scanResult)

        event(controller, {
          step: 2, label: 'Scan เว็บไซต์ & วาง Tracking Plan', status: 'done',
          hasGtm:           scanResult.hasGtm,
          hasGa4:           scanResult.hasGa4,
          hasGoogleAdsTag:  scanResult.hasGoogleAdsTag,
          forms:            scanResult.forms.length,
          lineButtons:      scanResult.lineButtons,
          phoneLinks:       scanResult.phoneLinks,
          trackingEvents:   trackingBlueprint.events.filter((e) => e.isKeyConversion).length,
          trackingScore:    trackingBlueprint.score,
          trackingIssues:   trackingBlueprint.issues.filter((i) => i.severity === 'blocker').length,
          gtmTags:          trackingBlueprint.gtmTags.length,
          conversionActions:trackingBlueprint.conversionActions.length,
          scanError:        scanResult.fetchError,
        })

        // ── Step 3: Generate Media Plan ──────────────────────────────────────
        event(controller, { step: 3, label: 'สร้าง Media Plan ด้วย AI', status: 'running' })

        const mediaPlanJson: MediaPlanJson = await generateMediaPlan(briefData, clientMemoryContext)

        const mediaPlan = await prisma.mediaPlan.create({
          data: {
            briefId:       brief.id,
            userId,
            title:         `Media Plan - ${brief.businessName} - ${new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`,
            objective:     brief.objective,
            monthlyBudget: brief.monthlyBudget,
            currency:      brief.currency,
            planJson:      JSON.stringify(mediaPlanJson),
            status:        'approved',
          },
        })

        event(controller, {
          step: 3, label: 'สร้าง Media Plan ด้วย AI', status: 'done',
          mediaPlanId: mediaPlan.id,
          campaigns:   mediaPlanJson.campaignMix?.length ?? 0,
          budget:      mediaPlanJson.forecast?.totalMonthlyBudget,
        })

        // ── Step 4: Keywords & Audiences ────────────────────────────────────
        event(controller, { step: 4, label: 'วางแผน Keywords & Audiences', status: 'running' })

        const kwPlan: KeywordAudiencePlan = await generateKeywordAudiencePlan(mediaPlanJson, briefData, clientMemoryContext)

        for (const group of kwPlan.keywordGroups ?? []) {
          for (const kw of group.keywords ?? []) {
            await prisma.keywordIdea.create({
              data: {
                mediaPlanId:        mediaPlan.id,
                campaignName:       group.campaignName,
                adGroupName:        group.adGroupName,
                keyword:            kw.keyword,
                matchType:          kw.matchType,
                intent:             kw.intent,
                avgMonthlySearches: kw.avgMonthlySearches,
                competition:        kw.competition,
                lowTopOfPageBid:    kw.suggestedBid,
                highTopOfPageBid:   kw.suggestedBid ? kw.suggestedBid * 1.5 : null,
              },
            })
          }
        }

        for (const seg of kwPlan.audienceSegments ?? []) {
          await prisma.audienceSegment.create({
            data: {
              mediaPlanId:  mediaPlan.id,
              campaignName: seg.campaignName,
              name:         seg.name,
              type:         seg.type,
              source:       seg.source,
              description:  seg.description,
              keywords:     seg.keywords ? JSON.stringify(seg.keywords) : null,
              urls:         seg.urls ? JSON.stringify(seg.urls) : null,
            },
          })
        }

        const totalKeywords = (kwPlan.keywordGroups ?? []).reduce((s, g) => s + (g.keywords?.length ?? 0), 0)

        event(controller, {
          step: 4, label: 'วางแผน Keywords & Audiences', status: 'done',
          keywords:  totalKeywords,
          audiences: kwPlan.audienceSegments?.length ?? 0,
        })

        // ── Step 5: Build Campaign Blueprint ────────────────────────────────
        event(controller, { step: 5, label: 'สร้าง Campaign Blueprint', status: 'running' })

        // Pass tracking blueprint's conversion actions into brief for ad copy alignment
        const briefWithTracking = {
          ...briefData,
          trackingConversionActions: trackingBlueprint.conversionActions.map((c) => c.name),
          gtmWorkspace: trackingBlueprint.gtmWorkspaceName,
        }

        const blueprintJson: CampaignBlueprintJson = await generateCampaignBlueprint(
          mediaPlanJson,
          kwPlan,
          briefWithTracking,
          clientMemoryContext
        )

        // Inject conversion actions from tracking blueprint into blueprint
        if (trackingBlueprint.conversionActions.length > 0) {
          blueprintJson.conversionActions = trackingBlueprint.conversionActions.map((ca) => ({
            name:         ca.name,
            category:     ca.category,
            value:        mediaPlanJson.campaignMix[0]?.targetCPA,
            countingType: ca.countingType,
          }))
        }

        const blueprint = await prisma.campaignBlueprint.create({
          data: {
            mediaPlanId:   mediaPlan.id,
            userId,
            blueprintJson: JSON.stringify(blueprintJson),
            status:        'draft',
          },
        })

        event(controller, {
          step: 5, label: 'สร้าง Campaign Blueprint', status: 'done',
          blueprintId: blueprint.id,
          adGroups:    blueprintJson.campaigns?.reduce((s, c) => s + (c.adGroups?.length ?? 0), 0) ?? 0,
          conversionActionsCount: blueprintJson.conversionActions?.length ?? 0,
        })

        // ── Step 6: QA Check ─────────────────────────────────────────────────
        event(controller, { step: 6, label: 'ตรวจสอบ QA', status: 'running' })

        const qaResult = await runCampaignQA(blueprintJson, briefData, clientMemoryContext)

        await prisma.qACheck.deleteMany({ where: { campaignBlueprintId: blueprint.id } })
        for (const check of qaResult.checks ?? []) {
          await prisma.qACheck.create({
            data: {
              campaignBlueprintId: blueprint.id,
              checkName:           check.checkName,
              severity:            check.severity,
              status:              check.status,
              message:             check.message,
              recommendation:      check.recommendation,
            },
          })
        }

        await prisma.campaignBlueprint.update({
          where: { id: blueprint.id },
          data: {
            qaScore: qaResult.score,
            status:  qaResult.readyToPush ? 'approved' : 'review',
          },
        })

        const passed   = (qaResult.checks ?? []).filter((c) => c.status === 'pass').length
        const warnings = (qaResult.checks ?? []).filter((c) => c.status === 'warning').length
        const failed   = (qaResult.checks ?? []).filter((c) => c.status === 'fail').length

        event(controller, {
          step: 6, label: 'ตรวจสอบ QA', status: 'done',
          score: qaResult.score, passed, warnings, failed,
          readyToPush: qaResult.readyToPush,
        })

        if (!qaResult.readyToPush) {
          event(controller, {
            step: 7, label: 'Push เข้า Google Ads', status: 'skipped',
            reason: `QA score ${qaResult.score}/100 — มี ${failed} critical issues ต้องแก้ก่อน Push`,
            blueprintId: blueprint.id, mediaPlanId: mediaPlan.id,
          })
          event(controller, {
            done: true, success: false,
            mediaPlanId: mediaPlan.id, blueprintId: blueprint.id,
            message: 'QA ไม่ผ่าน — กรุณาแก้ไขก่อน Push',
          })
          controller.close()
          return
        }

        // ── Step 7: Push as PAUSED ───────────────────────────────────────────
        event(controller, { step: 7, label: 'Push เข้า Google Ads (PAUSED)', status: 'running' })

        const pushResult = await pushCampaignBlueprint(blueprintJson, input.customerId ?? '', 'PAUSED')

        const pushJob = await prisma.pushJob.create({
          data: {
            campaignBlueprintId: blueprint.id,
            userId,
            provider:            'google_ads',
            status:              'completed',
            mode:                'PAUSED',
            resultJson:          JSON.stringify(pushResult),
            startedAt:           new Date(),
            finishedAt:          new Date(),
          },
        })

        await prisma.campaignBlueprint.update({
          where: { id: blueprint.id },
          data:  { status: 'pushed' },
        })

        event(controller, {
          step: 7, label: 'Push เข้า Google Ads (PAUSED)', status: 'done',
          jobId:     pushJob.id,
          campaigns: pushResult.campaigns,
        })

        // ── Save to Client Memory ─────────────────────────────────────────────
        if (input.clientId) {
          await saveRunToMemory(input.clientId, {
            objective: input.objective,
            mediaPlanJson,
            keywordAudiencePlan: kwPlan,
          }).catch(() => {})
        }

        // ── Done ──────────────────────────────────────────────────────────────
        event(controller, {
          done:    true,
          success: true,
          briefId:              brief.id,
          mediaPlanId:          mediaPlan.id,
          blueprintId:          blueprint.id,
          pushJobId:            pushJob.id,
          qaScore:              qaResult.score,
          totalCampaigns:       pushResult.campaigns?.length ?? 0,
          trackingScore:        trackingBlueprint.score,
          trackingReadyForAds:  trackingBlueprint.readyForAds,
          trackingGtmTags:      trackingBlueprint.gtmTags.length,
          conversionActions:    trackingBlueprint.conversionActions.map((c) => c.name),
          message: `สร้างสำเร็จ! ${pushResult.campaigns?.length ?? 0} campaigns พร้อม tracking ${trackingBlueprint.conversionActions.length} conversion actions`,
        })

      } catch (err) {
        event(controller, {
          done: true, success: false,
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
