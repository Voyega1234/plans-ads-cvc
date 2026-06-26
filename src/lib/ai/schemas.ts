import { z } from 'zod'

// ── Media Plan ─────────────────────────────────────────────────────────────────

export const campaignMixItemSchema = z.object({
  campaignName:        z.string(),
  type:                z.string(),
  objective:           z.string().optional().default(''),
  monthlyBudget:       z.number(),
  dailyBudget:         z.number().optional(),
  budgetPercent:       z.number().optional().default(0),
  targetCPA:           z.number().optional(),
  expectedClicks:      z.number().optional().default(0),
  expectedImpressions: z.number().optional().default(0),
  expectedConversions: z.number().optional().default(0),
  bidStrategy:         z.string().optional().default('MAXIMIZE_CLICKS'),
  networks:            z.array(z.string()).optional().default([]),
  targeting: z.object({
    locations: z.array(z.string()).optional().default([]),
    languages: z.array(z.string()).optional().default(['th']),
    devices:   z.array(z.string()).optional().default(['MOBILE', 'DESKTOP']),
  }).optional().default({}),
})

export const mediaPlanSchema = z.object({
  campaignMix: z.array(campaignMixItemSchema),
  forecast: z.object({
    totalMonthlyBudget:       z.number(),
    totalExpectedConversions: z.number().optional().default(0),
    blendedCPA:               z.number().optional().default(0),
    totalExpectedClicks:      z.number().optional().default(0),
    totalExpectedImpressions: z.number().optional().default(0),
    blendedCTR:               z.number().optional().default(0),
    blendedCPC:               z.number().optional().default(0),
    roas:                     z.number().optional().default(0),
  }),
  strategicRationale:  z.string().optional().default(''),
  recommendations:     z.array(z.string()).optional().default([]),
})

export type ValidatedMediaPlan = z.infer<typeof mediaPlanSchema>

export function validateMediaPlan(raw: unknown): ValidatedMediaPlan | null {
  const result = mediaPlanSchema.safeParse(raw)
  if (!result.success) {
    console.warn('[Schema] mediaPlan validation errors:', result.error.issues.slice(0, 3))
    return null
  }
  return result.data
}

// ── Keyword Audience Plan ──────────────────────────────────────────────────────

const keywordSchema = z.object({
  keyword:            z.string(),
  matchType:          z.enum(['EXACT', 'PHRASE', 'BROAD']).default('PHRASE'),
  intent:             z.string().optional().default(''),
  avgMonthlySearches: z.number().optional(),
  competition:        z.string().optional(),
  suggestedBid:       z.number().optional(),
})

const keywordGroupSchema = z.object({
  campaignName: z.string(),
  adGroupName:  z.string(),
  keywords:     z.array(keywordSchema).optional().default([]),
})

const audienceSegmentSchema = z.object({
  campaignName: z.string(),
  name:         z.string(),
  type:         z.string(),
  source:       z.string(),
  description:  z.string().optional().default(''),
  keywords:     z.array(z.string()).optional(),
  urls:         z.array(z.string()).optional(),
})

export const keywordAudiencePlanSchema = z.object({
  keywordGroups:     z.array(keywordGroupSchema).optional().default([]),
  audienceSegments:  z.array(audienceSegmentSchema).optional().default([]),
  negativeKeywords:  z.array(z.string()).optional().default([]),
  recommendations:   z.array(z.string()).optional().default([]),
  pmaxSignals:       z.array(z.unknown()).optional(),
})

export type ValidatedKwPlan = z.infer<typeof keywordAudiencePlanSchema>

export function validateKwPlan(raw: unknown): ValidatedKwPlan | null {
  const result = keywordAudiencePlanSchema.safeParse(raw)
  if (!result.success) {
    console.warn('[Schema] kwPlan validation errors:', result.error.issues.slice(0, 3))
    return null
  }
  return result.data
}

// ── Campaign Blueprint ─────────────────────────────────────────────────────────

const adCopySchema = z.object({
  headline1:    z.string().default(''),
  headline2:    z.string().default(''),
  headline3:    z.string().default(''),
  description1: z.string().default(''),
  description2: z.string().default(''),
  finalUrl:     z.string().default(''),
  displayPath:  z.string().optional(),
  rsa:          z.unknown().optional(),
  pmax:         z.unknown().optional(),
  display:      z.unknown().optional(),
})

const adGroupSchema = z.object({
  adGroupName: z.string(),
  defaultBid:  z.number().optional().default(30),
  keywords:    z.array(z.string()).optional().default([]),
  matchTypes:  z.array(z.string()).optional().default([]),
  ads:         z.array(adCopySchema).optional().default([]),
  audiences:   z.array(z.string()).optional(),
})

const sitelinkSchema = z.object({
  text:         z.string(),
  description1: z.string().optional().default(''),
  description2: z.string().optional().default(''),
  finalUrl:     z.string().optional().default(''),
})

const structuredSnippetSchema = z.object({
  header: z.string(),
  values: z.array(z.string()).optional().default([]),
})

const campaignItemSchema = z.object({
  campaignName:       z.string(),
  campaignType:       z.string(),
  status:             z.string().optional().default('PAUSED'),
  budget:             z.number().optional().default(0),
  bidStrategy:        z.string().optional().default('MAXIMIZE_CLICKS'),
  targetCPA:          z.number().optional(),
  targetROAS:         z.number().optional(),
  startDate:          z.string().optional(),
  endDate:            z.string().optional(),
  locationTargets:    z.array(z.string()).optional().default([]),
  languageTargets:    z.array(z.string()).optional().default([]),
  adSchedule:         z.array(z.string()).optional(),
  adGroups:           z.array(adGroupSchema).optional().default([]),
  assetGroups:        z.array(z.unknown()).optional(),
  finalUrl:           z.string().optional(),
  negativeKeywords:   z.array(z.string()).optional().default([]),
  sitelinks:          z.array(sitelinkSchema).optional(),
  callouts:           z.array(z.string()).optional(),
  structuredSnippets: z.array(structuredSnippetSchema).optional(),
  phoneNumbers:       z.array(z.string()).optional(),
  trackingTemplate:   z.string().optional(),
})

export const blueprintSchema = z.object({
  campaigns:          z.array(campaignItemSchema),
  conversionActions:  z.array(z.unknown()).optional().default([]),
  sharedNegatives:    z.array(z.string()).optional().default([]),
  recommendations:    z.array(z.string()).optional().default([]),
})

export type ValidatedBlueprint = z.infer<typeof blueprintSchema>

export function validateBlueprint(raw: unknown): ValidatedBlueprint | null {
  const result = blueprintSchema.safeParse(raw)
  if (!result.success) {
    console.warn('[Schema] blueprint validation errors:', result.error.issues.slice(0, 3))
    return null
  }
  return result.data
}

// ── QA Result ─────────────────────────────────────────────────────────────────

const qaCheckSchema = z.object({
  checkName:      z.string(),
  severity:       z.enum(['critical', 'warning', 'info']).default('info'),
  status:         z.enum(['pass', 'fail', 'warning']).default('pass'),
  message:        z.string().default(''),
  recommendation: z.string().optional(),
})

export const qaResultSchema = z.object({
  score:       z.number().min(0).max(100),
  readyToPush: z.boolean(),
  checks:      z.array(qaCheckSchema).optional().default([]),
  summary:     z.string().optional().default(''),
})

export type ValidatedQAResult = z.infer<typeof qaResultSchema>

export function validateQAResult(raw: unknown): ValidatedQAResult | null {
  const result = qaResultSchema.safeParse(raw)
  if (!result.success) {
    console.warn('[Schema] QA validation errors:', result.error.issues.slice(0, 3))
    return null
  }
  return result.data
}
