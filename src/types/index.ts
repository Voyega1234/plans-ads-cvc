// ─── Media Plan Types ──────────────────────────────────────────────────────────

export interface CampaignMixItem {
  campaignName: string
  type: 'SEARCH' | 'DISPLAY' | 'VIDEO' | 'PERFORMANCE_MAX' | 'SHOPPING' | 'YOUTUBE' | 'DEMAND_GEN' | 'APP_CAMPAIGN'
  theme?: 'Generic' | 'Brand' | 'Competitor' | 'Product' | 'Service'
  dailyBudget?: number
  objective: string
  monthlyBudget: number
  budgetPercent: number
  targetCPA: number
  maxCpc?: number
  targetRoas?: number
  targetImpressionShare?: number
  expectedClicks: number
  expectedImpressions: number
  expectedConversions: number
  bidStrategy: string
  networks: string[]
  targeting: {
    locations: string[]
    languages: string[]
    devices: string[]
  }
}

export interface MediaPlanForecast {
  totalMonthlyBudget: number
  totalExpectedConversions: number
  blendedCPA: number
  totalExpectedClicks: number
  totalExpectedImpressions: number
  blendedCTR: number
  blendedCPC: number
  roas: number
}

export interface MediaPlanJson {
  campaignMix: CampaignMixItem[]
  forecast: MediaPlanForecast
  strategicRationale: string
  recommendations: string[]
  pmaxSignals?: PMaxSignal[]
}

// ─── Keyword / Audience Types ──────────────────────────────────────────────────

export interface KeywordGroup {
  campaignName: string
  adGroupName: string
  keywords: KeywordItem[]
}

export interface KeywordItem {
  id?: string
  keyword: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
  intent: 'high' | 'medium' | 'low'
  avgMonthlySearches?: number
  competition?: 'LOW' | 'MEDIUM' | 'HIGH'
  suggestedBid?: number
}

export interface AudienceSegmentItem {
  campaignName: string
  name: string
  type: 'REMARKETING' | 'SIMILAR' | 'IN_MARKET' | 'CUSTOM_INTENT' | 'CUSTOMER_LIST'
  source: string
  description?: string
  keywords?: string[]
  urls?: string[]
}

export interface PMaxSignal {
  campaignName: string
  // Audience signals
  audienceSignals: {
    customIntent: string[]       // search terms ที่ intent สูง
    searchThemes: string[]       // PMax search theme signals (no match type)
    customerList: string[]       // email/phone list source
    remarketing: string[]        // existing remarketing lists
    inMarket: string[]           // Google in-market segments
    demographics: {
      ageRanges?: string[]
      genders?: string[]
      householdIncome?: string[]
    }
  }
  // Asset suggestions
  assetSuggestions: {
    headlines: string[]          // 3-5 headlines ≤30 chars
    descriptions: string[]       // 2-3 descriptions ≤90 chars
    imageThemes: string[]        // ธีมรูปที่ควรใช้
    videoTopics?: string[]       // ถ้าเป็น video campaign
  }
}

export interface KeywordAudiencePlan {
  keywordGroups: KeywordGroup[]
  audienceSegments: AudienceSegmentItem[]
  pmaxSignals?: PMaxSignal[]
  negativeKeywords: string[]
  recommendations: string[]
}

// ─── Campaign Blueprint Types ──────────────────────────────────────────────────

// Full RSA spec — 15 headlines + 4 descriptions (Google Ads RSA requirement)
export interface RsaAdCopy {
  adType: 'RSA'
  headlines: string[]        // 3–15 items, each ≤30 chars
  descriptions: string[]     // 2–4 items, each ≤90 chars
  finalUrl: string
  displayPath1?: string      // ≤15 chars
  displayPath2?: string      // ≤15 chars
  pinnedHeadlines?: Record<number, number>  // position → headline index
}

// PMax asset group spec
export interface PMaxAssetGroup {
  assetGroupName: string
  headlines: string[]        // 3–15 items ≤30 chars
  longHeadlines: string[]    // 1–5 items ≤90 chars
  descriptions: string[]     // 2–4 items ≤90 chars
  businessName: string       // ≤25 chars
  finalUrl: string
  imageAssets: { assetType: 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'PORTRAIT_MARKETING_IMAGE' | 'LOGO' | 'SQUARE_LOGO'; description: string; imageUrl?: string }[]
  videoAssets?: { assetType: 'YOUTUBE_VIDEO'; url: string; description: string }[]
  audienceSignals?: {
    customIntent?: string[]
    remarketing?: string[]
    inMarket?: string[]
  }
}

// Responsive Display Ad spec
export interface DisplayAdCopy {
  adType: 'RESPONSIVE_DISPLAY'
  headlines: string[]        // 1–5 items ≤30 chars
  longHeadlines: string[]    // 1 item ≤90 chars
  descriptions: string[]     // 1–5 items ≤90 chars
  businessName: string       // ≤25 chars
  finalUrl: string
  imageAssets: { assetType: string; description: string }[]
}

// Legacy 3-field ad (kept for backward compat / display in UI)
export interface AdCopy {
  headline1: string
  headline2: string
  headline3: string
  description1: string
  description2: string
  finalUrl: string
  displayPath?: string
  // Full RSA attached when generated
  rsa?: RsaAdCopy
  pmax?: PMaxAssetGroup
  display?: DisplayAdCopy
}

export interface AdGroup {
  adGroupName: string
  defaultBid: number
  keywords: string[]
  matchTypes: string[]
  ads: AdCopy[]
  audiences?: string[]
}

export interface CampaignBlueprintItem {
  campaignName: string
  campaignType: string
  status: 'PAUSED' | 'ENABLED'
  budget: number
  bidStrategy: string
  targetCPA?: number
  targetROAS?: number
  startDate?: string
  endDate?: string
  locationTargets: string[]
  languageTargets: string[]
  adSchedule?: string[]
  adGroups: AdGroup[]
  assetGroups?: PMaxAssetGroup[]   // PMax campaigns use flat assetGroups instead of adGroups
  finalUrl?: string
  negativeKeywords?: string[]
  sitelinks?: { text: string; description1: string; description2: string; finalUrl: string }[]
  callouts?: string[]
  structuredSnippets?: { header: string; values: string[] }[]
  phoneNumbers?: string[]
  trackingTemplate?: string
}

export interface CampaignBlueprintJson {
  campaigns: CampaignBlueprintItem[]
  accountSettings: {
    currency: string
    timeZone: string
    autoTagging: boolean
  }
  conversionActions: {
    name: string
    category: string
    value?: number
    countingType: string
  }[]
}

// ─── QA Types ─────────────────────────────────────────────────────────────────

export interface QACheckResult {
  checkName: string
  severity: 'error' | 'warning' | 'info'
  status: 'pass' | 'fail' | 'warning'
  message: string
  recommendation?: string
}

export interface QAResult {
  score: number
  totalChecks: number
  passed: number
  failed: number
  warnings: number
  checks: QACheckResult[]
  summary: string
  readyToPush: boolean
}

// ─── Push Types ────────────────────────────────────────────────────────────────

export interface PushCampaignResult {
  campaignName: string
  status: 'success' | 'error' | 'skipped'
  resourceName?: string
  googleAdsCampaignId?: string
  error?: string
  adGroupsCreated?: number
  adsCreated?: number
}

export interface PushResult {
  jobId: string
  status: 'completed' | 'partial' | 'failed'
  provider: string
  mode: string
  campaigns: PushCampaignResult[]
  totalCreated: number
  totalErrors: number
  startedAt: string
  finishedAt: string
}

// ─── Brief Types ───────────────────────────────────────────────────────────────

export interface BriefFormData {
  businessName: string
  websiteUrl: string
  productService: string
  objective: string
  monthlyBudget: number
  currency: string
  targetLocation: string
  language: string
  targetAudience: string
  conversionGoal: string
  promotion?: string
  brandTone?: string
  duration?: string
  launchDate?: string
  notes?: string
}

// ─── Dashboard Types ───────────────────────────────────────────────────────────

export interface KPIData {
  label: string
  value: string
  change: number
  changeLabel: string
  icon: string
  color: string
}

export interface IntegrationStatus {
  provider: string
  name: string
  connected: boolean
  icon: string
  description: string
}
