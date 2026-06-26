export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateMediaPlan } from '@/lib/ai/media-plan'
import { generateKeywordAudiencePlan } from '@/lib/ai/keyword-audience'
import { generateCampaignBlueprint } from '@/lib/ai/campaign-blueprint'
import { runCampaignQA } from '@/lib/ai/qa'
import { pushCampaignBlueprint } from '@/lib/google-ads/campaign-builder'
import { scanUrl } from '@/lib/tracking/url-scanner'
import { generateTrackingBlueprint } from '@/lib/tracking/tracking-plan'
import { loadDuplicateCheckContext, checkForDuplicatesFromContext } from '@/lib/checks/duplicate-checker'
import { auth } from '@/lib/auth'
import { getUserId } from '@/lib/session'
import type { Session } from 'next-auth'
import type { MediaPlanJson, KeywordAudiencePlan, CampaignBlueprintJson } from '@/types'
import { z } from 'zod'

const schema = z.object({
  step: z.number().int().min(0).max(7),
  // brief fields (required for step 0)
  businessName:   z.string().min(2).optional(),
  websiteUrl:     z.string().url().optional(),
  productService: z.string().min(10).optional(),
  objective:      z.enum(['LEADS', 'SALES', 'AWARENESS', 'TRAFFIC', 'APP_INSTALLS']).optional(),
  dailyBudget:    z.number().min(1).optional(),
  monthlyBudget:  z.number().min(1).optional(),
  currency:       z.string().default('THB'),
  targetLocation: z.string().optional(),
  language:       z.string().default('th'),
  targetAudience: z.string().optional(),
  conversionGoal: z.string().optional(),
  promotion:      z.string().optional(),
  brandTone:      z.string().optional(),
  customerId:     z.string().optional(),
  forceOverride:  z.boolean().optional().default(false),
  templateId:     z.string().optional(),
  templateType:   z.string().optional(),
  allowedTypes:   z.array(z.string()).optional(),
  selectedAudiences: z.array(z.object({ name: z.string(), type: z.string() })).optional(),
  // IDs from previous steps
  briefId:        z.string().optional(),
  mediaPlanId:    z.string().optional(),
  blueprintId:    z.string().optional(),
  campaignName:   z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await (auth() as Promise<Session | null>)
  const userId = getUserId(session)

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const input = parsed.data

  try {
    // ── Step 0: Duplicate Check ──────────────────────────────────────────────
    if (input.step === 0) {
      const brief = {
        businessName:   input.businessName!,
        websiteUrl:     input.websiteUrl!,
        productService: input.productService!,
        objective:      input.objective!,
        monthlyBudget:  input.monthlyBudget!,
        currency:       input.currency,
        targetLocation: input.targetLocation!,
        language:       input.language,
        targetAudience: input.targetAudience!,
        conversionGoal: input.conversionGoal!,
        brandTone:      input.brandTone ?? '',
        promotion:      input.promotion ?? '',
      }
      const previewPlan = await generateMediaPlan(brief, '', input.allowedTypes)
      const previewKwPlan = await generateKeywordAudiencePlan(previewPlan, brief, '')
      const proposedCampaigns = previewPlan.campaignMix.map((c) => c.campaignName)
      const proposedKeywords  = (previewKwPlan.keywordGroups ?? []).flatMap((g) => g.keywords ?? []).map((k) => k.keyword)
      const dupCtx = await loadDuplicateCheckContext(userId, input.customerId)
      const dupCheck = checkForDuplicatesFromContext(
        input.businessName!, input.websiteUrl!, proposedCampaigns, proposedKeywords, dupCtx
      )
      const campaignTypes = previewPlan.campaignMix.map((c) => c.type)
      return NextResponse.json({
        step: 0,
        hasConflicts: dupCheck.hasConflicts,
        blockingCount: dupCheck.blockingCount,
        warningCount: dupCheck.warningCount,
        canProceed: dupCheck.canProceed,
        conflicts: dupCheck.conflicts,
        summary: dupCheck.summary,
        proposedCampaigns,
        proposedKeywordsCount: proposedKeywords.length,
        campaignTypes,
        preview: { campaigns: proposedCampaigns },
      })
    }

    // ── Step 1: Create Brief ─────────────────────────────────────────────────
    if (input.step === 1) {
      const dailyBudget   = input.dailyBudget ?? Math.round((input.monthlyBudget ?? 15000) / 30)
      const monthlyBudget = input.monthlyBudget ?? dailyBudget * 30
      const brief = await prisma.brief.create({
        data: {
          userId,
          businessName:   input.businessName!,
          websiteUrl:     input.websiteUrl!,
          productService: input.productService!,
          objective:      input.objective!,
          monthlyBudget:  monthlyBudget,
          currency:       input.currency,
          targetLocation: input.targetLocation!,
          language:       input.language,
          targetAudience: input.targetAudience!,
          conversionGoal: input.conversionGoal!,
          promotion:      input.promotion,
          brandTone:      input.brandTone,
          status:         'completed',
        },
      })
      return NextResponse.json({
        step: 1,
        briefId: brief.id,
        dailyBudget,
        monthlyBudget: brief.monthlyBudget,
        preview: {
          businessName: brief.businessName,
          objective: brief.objective,
          dailyBudget,
          monthlyBudget: brief.monthlyBudget,
          targetLocation: brief.targetLocation,
        },
      })
    }

    // ── Step 2: URL Scan ─────────────────────────────────────────────────────
    if (input.step === 2) {
      const brief = await prisma.brief.findUniqueOrThrow({ where: { id: input.briefId! } })
      const briefData = {
        businessName: brief.businessName, websiteUrl: brief.websiteUrl,
        productService: brief.productService, objective: brief.objective,
        monthlyBudget: brief.monthlyBudget, currency: brief.currency,
        targetLocation: brief.targetLocation, language: brief.language,
        targetAudience: brief.targetAudience, conversionGoal: brief.conversionGoal,
        brandTone: brief.brandTone ?? '', promotion: brief.promotion ?? '',
      }
      const scanResult = await scanUrl(brief.websiteUrl)
      const trackingBlueprint = generateTrackingBlueprint(briefData, scanResult)
      return NextResponse.json({
        step: 2,
        briefId: brief.id,
        hasGtm: scanResult.hasGtm,
        hasGa4: scanResult.hasGa4,
        hasGoogleAdsTag: scanResult.hasGoogleAdsTag,
        forms: scanResult.forms.length,
        lineButtons: scanResult.lineButtons,
        phoneLinks: scanResult.phoneLinks,
        trackingEvents: trackingBlueprint.events.filter((e) => e.isKeyConversion).length,
        trackingScore: trackingBlueprint.score,
        gtmTags: trackingBlueprint.gtmTags.length,
        conversionActions: trackingBlueprint.conversionActions.map((c) => c.name),
        scanError: scanResult.fetchError ?? null,
        preview: {
          tags: trackingBlueprint.gtmTags.slice(0, 5).map((t) => t.name),
          events: trackingBlueprint.events.filter((e) => e.isKeyConversion).map((e) => e.eventName),
          issues: trackingBlueprint.issues.filter((i) => i.severity === 'blocker').map((i) => i.message),
          readyForAds: trackingBlueprint.readyForAds,
        },
        _trackingBlueprint: trackingBlueprint,
      })
    }

    // ── Step 3: Media Plan ───────────────────────────────────────────────────
    if (input.step === 3) {
      const brief = await prisma.brief.findUniqueOrThrow({ where: { id: input.briefId! } })
      const briefData = {
        businessName: brief.businessName, websiteUrl: brief.websiteUrl,
        productService: brief.productService, objective: brief.objective,
        monthlyBudget: brief.monthlyBudget, currency: brief.currency,
        targetLocation: brief.targetLocation, language: brief.language,
        targetAudience: brief.targetAudience, conversionGoal: brief.conversionGoal,
        brandTone: brief.brandTone ?? '', promotion: brief.promotion ?? '',
      }
      const mediaPlanJson: MediaPlanJson = await generateMediaPlan(briefData, '', input.allowedTypes)
      const mediaPlan = await prisma.mediaPlan.create({
        data: {
          briefId:       brief.id,
          userId,
          title:         `Media Plan - ${brief.businessName}`,
          objective:     brief.objective,
          monthlyBudget: brief.monthlyBudget,
          currency:      brief.currency,
          planJson:      JSON.stringify(mediaPlanJson),
          status:        'approved',
        },
      })
      const dailyBudget = input.dailyBudget ?? Math.round(brief.monthlyBudget / 30)
      return NextResponse.json({
        step: 3,
        briefId: brief.id,
        mediaPlanId: mediaPlan.id,
        campaigns: mediaPlanJson.campaignMix?.length ?? 0,
        dailyBudget,
        monthlyBudget: brief.monthlyBudget,
        preview: {
          campaigns: mediaPlanJson.campaignMix?.map((c) => ({
            name: c.campaignName,
            type: c.type,
            dailyBudget: Math.round((c.monthlyBudget ?? brief.monthlyBudget) / 30),
            monthlyBudget: c.monthlyBudget,
            objective: c.objective,
          })) ?? [],
          rationale: mediaPlanJson.strategicRationale,
        },
      })
    }

    // ── Step 4: Keywords & Audiences ─────────────────────────────────────────
    if (input.step === 4) {
      const brief = await prisma.brief.findUniqueOrThrow({ where: { id: input.briefId! } })
      const mediaPlan = await prisma.mediaPlan.findUniqueOrThrow({ where: { id: input.mediaPlanId! } })
      const mediaPlanJson: MediaPlanJson = JSON.parse(mediaPlan.planJson as string)
      const briefData = {
        businessName: brief.businessName, websiteUrl: brief.websiteUrl,
        productService: brief.productService, objective: brief.objective,
        monthlyBudget: brief.monthlyBudget, currency: brief.currency,
        targetLocation: brief.targetLocation, language: brief.language,
        targetAudience: brief.targetAudience, conversionGoal: brief.conversionGoal,
        brandTone: brief.brandTone ?? '', promotion: brief.promotion ?? '',
      }
      const kwPlan: KeywordAudiencePlan = await generateKeywordAudiencePlan(mediaPlanJson, briefData, '')

      await prisma.keywordIdea.deleteMany({ where: { mediaPlanId: mediaPlan.id } })
      for (const group of kwPlan.keywordGroups ?? []) {
        for (const kw of group.keywords ?? []) {
          await prisma.keywordIdea.create({
            data: {
              mediaPlanId: mediaPlan.id,
              campaignName: group.campaignName,
              adGroupName: group.adGroupName,
              keyword: kw.keyword,
              matchType: kw.matchType,
              intent: kw.intent,
              avgMonthlySearches: kw.avgMonthlySearches,
              competition: kw.competition,
              lowTopOfPageBid: kw.suggestedBid,
              highTopOfPageBid: kw.suggestedBid ? kw.suggestedBid * 1.5 : null,
            },
          })
        }
      }

      const totalKeywords = (kwPlan.keywordGroups ?? []).reduce((s, g) => s + (g.keywords?.length ?? 0), 0)

      return NextResponse.json({
        step: 4,
        briefId: brief.id,
        mediaPlanId: mediaPlan.id,
        keywords: totalKeywords,
        audiences: kwPlan.audienceSegments?.length ?? 0,
        preview: {
          keywordGroups: kwPlan.keywordGroups?.map((g) => ({
            campaignName: g.campaignName,
            adGroupName: g.adGroupName,
            keywords: g.keywords?.slice(0, 5).map((k) => ({ keyword: k.keyword, matchType: k.matchType, bid: k.suggestedBid })) ?? [],
            total: g.keywords?.length ?? 0,
          })) ?? [],
          audiences: kwPlan.audienceSegments?.map((a) => ({ name: a.name, type: a.type, source: a.source })) ?? [],
        },
      })
    }

    // ── Step 5: Campaign Blueprint ───────────────────────────────────────────
    if (input.step === 5) {
      const brief = await prisma.brief.findUniqueOrThrow({ where: { id: input.briefId! } })
      const mediaPlan = await prisma.mediaPlan.findUniqueOrThrow({ where: { id: input.mediaPlanId! } })
      const mediaPlanJson: MediaPlanJson = JSON.parse(mediaPlan.planJson as string)
      const kwRows = await prisma.keywordIdea.findMany({ where: { mediaPlanId: mediaPlan.id } })
      const audienceRows = await prisma.audienceSegment.findMany({ where: { mediaPlanId: mediaPlan.id } })

      const kwPlan: KeywordAudiencePlan = {
        negativeKeywords: [],
        recommendations: [],
        keywordGroups: Object.values(
          kwRows.reduce<Record<string, { campaignName: string; adGroupName: string; keywords: typeof kwRows }>>((acc, kw) => {
            const key = `${kw.campaignName}||${kw.adGroupName}`
            if (!acc[key]) acc[key] = { campaignName: kw.campaignName, adGroupName: kw.adGroupName, keywords: [] }
            acc[key].keywords.push(kw)
            return acc
          }, {})
        ).map((g) => ({
          campaignName: g.campaignName,
          adGroupName: g.adGroupName,
          keywords: g.keywords.map((k) => ({ keyword: k.keyword, matchType: k.matchType as 'BROAD' | 'PHRASE' | 'EXACT', intent: (k.intent as 'high' | 'medium' | 'low') ?? 'low', suggestedBid: k.lowTopOfPageBid ?? undefined, avgMonthlySearches: k.avgMonthlySearches ?? undefined, competition: k.competition as 'LOW' | 'MEDIUM' | 'HIGH' | undefined })),
        })),
        audienceSegments: audienceRows.map((a) => ({
          campaignName: a.campaignName, name: a.name,
          type: a.type as 'REMARKETING' | 'SIMILAR' | 'IN_MARKET' | 'CUSTOM_INTENT' | 'CUSTOMER_LIST',
          source: a.source, description: a.description ?? '',
          keywords: a.keywords ? JSON.parse(a.keywords as string) : undefined,
          urls: a.urls ? JSON.parse(a.urls as string) : undefined,
        })),
      }

      const briefData = {
        businessName: brief.businessName, websiteUrl: brief.websiteUrl,
        productService: brief.productService, objective: brief.objective,
        monthlyBudget: brief.monthlyBudget, currency: brief.currency,
        targetLocation: brief.targetLocation, language: brief.language,
        targetAudience: brief.targetAudience, conversionGoal: brief.conversionGoal,
        brandTone: brief.brandTone ?? '', promotion: brief.promotion ?? '',
      }

      const blueprintJson: CampaignBlueprintJson = await generateCampaignBlueprint(mediaPlanJson, kwPlan, briefData, '')

      const blueprint = await prisma.campaignBlueprint.create({
        data: {
          mediaPlanId: mediaPlan.id,
          userId,
          blueprintJson: JSON.stringify(blueprintJson),
          status: 'draft',
        },
      })

      return NextResponse.json({
        step: 5,
        briefId: brief.id,
        mediaPlanId: mediaPlan.id,
        blueprintId: blueprint.id,
        adGroups: blueprintJson.campaigns?.reduce((s, c) => s + (c.adGroups?.length ?? 0), 0) ?? 0,
        preview: {
          campaigns: blueprintJson.campaigns?.map((c) => ({
            name: c.campaignName,
            type: c.campaignType,
            budget: c.budget,
            adGroupCount: c.adGroups?.length ?? 0,
            adGroups: c.adGroups?.slice(0, 3).map((ag) => ({
              name: ag.adGroupName,
              keywords: ag.keywords?.slice(0, 3) ?? [],
              ads: ag.ads?.slice(0, 1).map((ad) => ({
                headlines: [ad.headline1, ad.headline2, ad.headline3].filter(Boolean),
                descriptions: [ad.description1, ad.description2].filter(Boolean),
              })) ?? [],
            })) ?? [],
          })) ?? [],
        },
      })
    }

    // ── Step 6: QA ───────────────────────────────────────────────────────────
    if (input.step === 6) {
      const brief = await prisma.brief.findUniqueOrThrow({ where: { id: input.briefId! } })
      const blueprint = await prisma.campaignBlueprint.findUniqueOrThrow({ where: { id: input.blueprintId! } })
      const blueprintJson: CampaignBlueprintJson = JSON.parse(blueprint.blueprintJson as string)
      const briefData = {
        businessName: brief.businessName, websiteUrl: brief.websiteUrl,
        productService: brief.productService, objective: brief.objective,
        monthlyBudget: brief.monthlyBudget, currency: brief.currency,
        targetLocation: brief.targetLocation, language: brief.language,
        targetAudience: brief.targetAudience, conversionGoal: brief.conversionGoal,
        brandTone: brief.brandTone ?? '', promotion: brief.promotion ?? '',
      }

      const qaResult = await runCampaignQA(blueprintJson, briefData, '')
      await prisma.qACheck.deleteMany({ where: { campaignBlueprintId: blueprint.id } })
      for (const check of qaResult.checks ?? []) {
        await prisma.qACheck.create({
          data: {
            campaignBlueprintId: blueprint.id,
            checkName: check.checkName,
            severity: check.severity,
            status: check.status,
            message: check.message,
            recommendation: check.recommendation,
          },
        })
      }
      await prisma.campaignBlueprint.update({
        where: { id: blueprint.id },
        data: { qaScore: qaResult.score, status: qaResult.readyToPush ? 'approved' : 'review' },
      })

      const passed   = (qaResult.checks ?? []).filter((c) => c.status === 'pass').length
      const warnings = (qaResult.checks ?? []).filter((c) => c.status === 'warning').length
      const failed   = (qaResult.checks ?? []).filter((c) => c.status === 'fail').length

      return NextResponse.json({
        step: 6,
        briefId: brief.id,
        mediaPlanId: input.mediaPlanId,
        blueprintId: blueprint.id,
        score: qaResult.score,
        passed, warnings, failed,
        readyToPush: qaResult.readyToPush,
        preview: {
          score: qaResult.score,
          readyToPush: qaResult.readyToPush,
          checks: qaResult.checks?.map((c) => ({ name: c.checkName, status: c.status, severity: c.severity, message: c.message, recommendation: c.recommendation })) ?? [],
        },
      })
    }

    // ── Step 7: Push ─────────────────────────────────────────────────────────
    if (input.step === 7) {
      const blueprint = await prisma.campaignBlueprint.findUniqueOrThrow({ where: { id: input.blueprintId! } })
      const blueprintJson: CampaignBlueprintJson = JSON.parse(blueprint.blueprintJson as string)
      // Override campaignName from user input — user may have renamed after AI generated the blueprint
      if (input.campaignName && blueprintJson.campaigns?.length === 1) {
        blueprintJson.campaigns[0].campaignName = input.campaignName as string
      }
      const pushResult = await pushCampaignBlueprint(blueprintJson, input.customerId ?? '', 'PAUSED')

      const pushJob = await prisma.pushJob.create({
        data: {
          campaignBlueprintId: blueprint.id,
          userId,
          provider: 'google_ads',
          status: 'completed',
          mode: 'PAUSED',
          resultJson: JSON.stringify(pushResult),
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      })

      await prisma.campaignBlueprint.update({
        where: { id: blueprint.id },
        data: { status: 'pushed' },
      })

      return NextResponse.json({
        step: 7,
        blueprintId: blueprint.id,
        mediaPlanId: input.mediaPlanId,
        pushJobId: pushJob.id,
        campaigns: pushResult.campaigns,
        preview: {
          pushed: Array.isArray(pushResult.campaigns)
            ? pushResult.campaigns.map((c: { campaignName?: string; resourceName?: string; status?: string }) => ({ name: c.campaignName, resource: c.resourceName, status: c.status }))
            : [],
        },
      })
    }

    return NextResponse.json({ error: 'Invalid step' }, { status: 400 })

  } catch (err) {
    console.error('[run-step]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
