/**
 * Automation Rule Engine
 * Queries real Google Ads metrics, evaluates conditions, executes actions.
 * All mutate actions are guarded by AUTOMATION_MUTATE=true env flag.
 */

import { getGoogleAdsAccessToken } from './auth'
import { isMockMode } from './client'

// ── Types ──────────────────────────────────────────────────────────────────

export interface RuleCondition {
  metric:   string
  operator: '>' | '<' | '>=' | '<='
  value:    number
  window:   string  // '1d' | '3d' | '7d' | '14d' | '30d'
}

export interface RuleAction {
  action: string
}

export interface RuleEvalResult {
  result:    'triggered' | 'no_match' | 'error'
  message:   string
  metricVal?: number
  campaigns?: string[]
}

// ── Date range mapping ─────────────────────────────────────────────────────

function windowToGadsRange(window: string): string {
  const map: Record<string, string> = {
    '1d':  'LAST_7_DAYS',   // Google Ads minimum window is 7 days for most metrics
    '3d':  'LAST_7_DAYS',
    '7d':  'LAST_7_DAYS',
    '14d': 'LAST_14_DAYS',
    '30d': 'LAST_30_DAYS',
  }
  return map[window] ?? 'LAST_7_DAYS'
}

// ── Google Ads GAQL helpers ────────────────────────────────────────────────

type GadsHeaders = Record<string, string>

async function gaqlSearch(customerId: string, query: string, token: string): Promise<unknown[]> {
  const devToken    = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCid    = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
  const cid         = customerId.replace(/-/g, '')

  const attempts = loginCid ? [loginCid, ''] : ['']
  for (const attempt of attempts) {
    const headers: GadsHeaders = {
      Authorization:     `Bearer ${token}`,
      'developer-token': devToken,
      'Content-Type':    'application/json',
    }
    if (attempt) headers['login-customer-id'] = attempt

    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    )
    const body = await res.text().catch(() => '{}')
    if (res.ok) {
      const data = JSON.parse(body) as { results?: unknown[] }
      return data.results ?? []
    }
    console.error(`[automation.gaql] ${res.status} attempt lcid=${attempt || 'none'}`, body.slice(0, 200))
  }
  throw new Error(`GAQL query failed for customer ${cid}`)
}

// ── Metric fetcher ─────────────────────────────────────────────────────────

export interface CampaignMetrics {
  campaignId:   string
  campaignName: string
  cost:         number
  impressions:  number
  clicks:       number
  conversions:  number
  ctr:          number
  cpc:          number
  cpa:          number
  convRate:     number
  roas:         number
  impressionShare:      number
  lostIsBudget:         number
  lostIsRank:           number
  qualityScoreAvg:      number
}

export async function fetchCampaignMetrics(
  customerId: string,
  dateRange: string,
  token: string
): Promise<CampaignMetrics[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion,
      metrics.conversions_from_interactions_rate,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.all_conversions_value
    FROM campaign
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
  `.trim()

  type Row = {
    campaign: { id: string; name: string }
    metrics: {
      costMicros: string
      impressions: string
      clicks: string
      conversions: string
      ctr: string
      averageCpc: string
      costPerConversion: string
      conversionsFromInteractionsRate: string
      searchImpressionShare: string
      searchBudgetLostImpressionShare: string
      searchRankLostImpressionShare: string
      allConversionsValue: string
    }
  }

  const rows = (await gaqlSearch(customerId, query, token)) as Row[]
  return rows.map((r) => {
    const cost = Number(r.metrics.costMicros ?? 0) / 1_000_000
    const conv = Number(r.metrics.conversions ?? 0)
    const convValue = Number(r.metrics.allConversionsValue ?? 0)
    return {
      campaignId:          r.campaign.id,
      campaignName:        r.campaign.name,
      cost,
      impressions:         Number(r.metrics.impressions ?? 0),
      clicks:              Number(r.metrics.clicks ?? 0),
      conversions:         conv,
      ctr:                 Number(r.metrics.ctr ?? 0) * 100,
      cpc:                 Number(r.metrics.averageCpc ?? 0) / 1_000_000,
      cpa:                 conv > 0 ? cost / conv : 0,
      convRate:            Number(r.metrics.conversionsFromInteractionsRate ?? 0) * 100,
      roas:                cost > 0 ? convValue / cost : 0,
      impressionShare:     Number(r.metrics.searchImpressionShare ?? 0) * 100,
      lostIsBudget:        Number(r.metrics.searchBudgetLostImpressionShare ?? 0) * 100,
      lostIsRank:          Number(r.metrics.searchRankLostImpressionShare ?? 0) * 100,
      qualityScoreAvg:     0, // fetched separately if needed
    }
  })
}

export async function fetchKeywordMetrics(
  customerId: string,
  dateRange: string,
  token: string
): Promise<Array<{ keywordId: string; campaignId: string; adGroupId: string; text: string; ctr: number; cpc: number; conversions: number; qualityScore: number; cost: number }>> {
  const query = `
    SELECT
      ad_group_criterion.criterion_id,
      campaign.id,
      ad_group.id,
      ad_group_criterion.keyword.text,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_micros,
      ad_group_criterion.quality_info.quality_score
    FROM keyword_view
    WHERE segments.date DURING ${dateRange}
      AND ad_group_criterion.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
  `.trim()

  type KRow = {
    adGroupCriterion: { criterionId: string; keyword: { text: string }; qualityInfo: { qualityScore: number } }
    campaign: { id: string }
    adGroup: { id: string }
    metrics: { ctr: string; averageCpc: string; conversions: string; costMicros: string }
  }

  const rows = (await gaqlSearch(customerId, query, token)) as KRow[]
  return rows.map((r) => ({
    keywordId:    r.adGroupCriterion.criterionId,
    campaignId:   r.campaign.id,
    adGroupId:    r.adGroup.id,
    text:         r.adGroupCriterion.keyword?.text ?? '',
    ctr:          Number(r.metrics.ctr ?? 0) * 100,
    cpc:          Number(r.metrics.averageCpc ?? 0) / 1_000_000,
    conversions:  Number(r.metrics.conversions ?? 0),
    cost:         Number(r.metrics.costMicros ?? 0) / 1_000_000,
    qualityScore: r.adGroupCriterion.qualityInfo?.qualityScore ?? 0,
  }))
}

// ── Condition evaluator ────────────────────────────────────────────────────

function evaluate(val: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>':  return val > threshold
    case '<':  return val < threshold
    case '>=': return val >= threshold
    case '<=': return val <= threshold
    default:   return false
  }
}

function getMetricValue(m: CampaignMetrics, metric: string): number {
  const map: Record<string, number> = {
    ctr:              m.ctr,
    cpc:              m.cpc,
    cpa:              m.cpa,
    roas:             m.roas,
    impressions:      m.impressions,
    clicks:           m.clicks,
    conversions:      m.conversions,
    cost:             m.cost,
    conv_rate:        m.convRate,
    impression_share: m.impressionShare,
    search_lost_is_budget: m.lostIsBudget,
    search_lost_is_rank:   m.lostIsRank,
  }
  return map[metric] ?? 0
}

// ── Action executor ────────────────────────────────────────────────────────

const MUTATE_ENABLED = process.env.AUTOMATION_MUTATE === 'true'

async function mutateBudget(
  customerId: string,
  campaignId: string,
  multiplier: number,
  token: string
): Promise<void> {
  if (!MUTATE_ENABLED) {
    console.log(`[automation.mutate] SIMULATION: budget x${multiplier} for campaign ${campaignId}`)
    return
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
  const cid      = customerId.replace(/-/g, '')

  // First get campaign budget resource name
  const budgetQuery = `
    SELECT campaign.campaign_budget, campaign_budget.amount_micros
    FROM campaign WHERE campaign.id = ${campaignId}
  `.trim()

  type BudgetRow = { campaign: { campaignBudget: string }; campaignBudget: { amountMicros: string } }
  const rows = (await gaqlSearch(customerId, budgetQuery, token)) as BudgetRow[]
  if (!rows.length) throw new Error('Campaign budget not found')

  const budgetResource = rows[0].campaign.campaignBudget
  const currentMicros  = Number(rows[0].campaignBudget.amountMicros)
  const newMicros      = Math.round(currentMicros * multiplier)

  const headers: GadsHeaders = {
    Authorization:     `Bearer ${token}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  }
  if (loginCid) headers['login-customer-id'] = loginCid

  const body = {
    operations: [{
      update: {
        resourceName: budgetResource,
        amountMicros: newMicros,
      },
      updateMask: 'amountMicros',
    }],
  }

  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/campaignBudgets:mutate`,
    { method: 'POST', headers, body: JSON.stringify(body) }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Budget mutate failed: ${res.status} ${err.slice(0, 200)}`)
  }
}

async function mutateCampaignStatus(
  customerId: string,
  campaignId: string,
  status: 'PAUSED' | 'ENABLED',
  token: string
): Promise<void> {
  if (!MUTATE_ENABLED) {
    console.log(`[automation.mutate] SIMULATION: set campaign ${campaignId} → ${status}`)
    return
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
  const cid      = customerId.replace(/-/g, '')

  const headers: GadsHeaders = {
    Authorization:     `Bearer ${token}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  }
  if (loginCid) headers['login-customer-id'] = loginCid

  const body = {
    operations: [{
      update: {
        resourceName: `customers/${cid}/campaigns/${campaignId}`,
        status,
      },
      updateMask: 'status',
    }],
  }

  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/campaigns:mutate`,
    { method: 'POST', headers, body: JSON.stringify(body) }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Campaign mutate failed: ${res.status} ${err.slice(0, 200)}`)
  }
}

async function mutateKeywordBid(
  customerId: string,
  adGroupId: string,
  keywordId: string,
  multiplier: number | 'pause' | 'enable',
  token: string
): Promise<void> {
  if (!MUTATE_ENABLED) {
    console.log(`[automation.mutate] SIMULATION: keyword ${keywordId} → ${multiplier}`)
    return
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')
  const cid      = customerId.replace(/-/g, '')

  const headers: GadsHeaders = {
    Authorization:     `Bearer ${token}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  }
  if (loginCid) headers['login-customer-id'] = loginCid

  const resourceName = `customers/${cid}/adGroupCriteria/${adGroupId}~${keywordId}`

  const updateObj: Record<string, unknown> = { resourceName }
  let updateMask: string

  if (multiplier === 'pause') {
    updateObj.status = 'PAUSED'
    updateMask       = 'status'
  } else if (multiplier === 'enable') {
    updateObj.status = 'ENABLED'
    updateMask       = 'status'
  } else {
    // Get current CPC bid first
    const bidQuery = `
      SELECT ad_group_criterion.cpc_bid_micros
      FROM ad_group_criterion
      WHERE ad_group_criterion.criterion_id = ${keywordId}
        AND ad_group.id = ${adGroupId}
    `.trim()
    type BidRow = { adGroupCriterion: { cpcBidMicros: string } }
    const rows = (await gaqlSearch(customerId, bidQuery, token)) as BidRow[]
    const currentBid = rows.length ? Number(rows[0].adGroupCriterion.cpcBidMicros ?? 0) : 1_000_000
    updateObj.cpcBidMicros = Math.round(currentBid * multiplier)
    updateMask             = 'cpcBidMicros'
  }

  const body = {
    operations: [{ update: updateObj, updateMask }],
  }

  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/adGroupCriteria:mutate`,
    { method: 'POST', headers, body: JSON.stringify(body) }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Keyword mutate failed: ${res.status} ${err.slice(0, 200)}`)
  }
}

// ── Action dispatch ────────────────────────────────────────────────────────

const BUDGET_MULTIPLIERS: Record<string, number> = {
  increase_budget_10pct: 1.10,
  increase_budget_20pct: 1.20,
  increase_budget_30pct: 1.30,
  decrease_budget_10pct: 0.90,
  decrease_budget_20pct: 0.80,
  decrease_budget_30pct: 0.70,
}

const KEYWORD_BID_MULTIPLIERS: Record<string, number | 'pause' | 'enable'> = {
  pause_keyword:    'pause',
  enable_keyword:   'enable',
  reduce_bid_10pct: 0.90,
  reduce_bid_20pct: 0.80,
  reduce_bid_50pct: 0.50,
  increase_bid_10pct: 1.10,
  increase_bid_20pct: 1.20,
}

async function executeAction(
  action: string,
  customerId: string,
  triggeredCampaigns: CampaignMetrics[],
  token: string,
  mutateEnabled: boolean
): Promise<string> {
  const campaignNames = triggeredCampaigns.map((c) => c.campaignName).join(', ')

  if (action === 'send_alert' || action === 'send_email_alert') {
    return `Alert logged for: ${campaignNames}`
  }

  if (action === 'pause_campaign' || action === 'enable_campaign') {
    const status = action === 'pause_campaign' ? 'PAUSED' : 'ENABLED'
    if (mutateEnabled) {
      await Promise.all(triggeredCampaigns.map((c) =>
        mutateCampaignStatus(customerId, c.campaignId, status, token)
      ))
      return `${status} ${triggeredCampaigns.length} campaign(s): ${campaignNames}`
    }
    return `[SIMULATION] Would ${status} campaigns: ${campaignNames}`
  }

  if (action in BUDGET_MULTIPLIERS) {
    const mult = BUDGET_MULTIPLIERS[action]
    if (mutateEnabled) {
      await Promise.all(triggeredCampaigns.map((c) =>
        mutateBudget(customerId, c.campaignId, mult, token)
      ))
      return `Budget x${mult.toFixed(2)} applied to ${triggeredCampaigns.length} campaign(s): ${campaignNames}`
    }
    return `[SIMULATION] Would apply budget x${mult.toFixed(2)} to: ${campaignNames}`
  }

  if (action in KEYWORD_BID_MULTIPLIERS) {
    // Keyword-level actions need keyword data — log simulation for now
    const op = KEYWORD_BID_MULTIPLIERS[action]
    if (mutateEnabled) {
      return `Keyword action "${action}" staged for ${triggeredCampaigns.length} campaign(s) — keyword IDs needed per ad group`
    }
    return `[SIMULATION] Would apply "${action}" (${op}) to keywords in: ${campaignNames}`
  }

  if (action.startsWith('add_label_') || action.startsWith('reduce_target') || action.startsWith('increase_target')) {
    return `[SIMULATION] Action "${action}" for campaigns: ${campaignNames}`
  }

  return `Unknown action: ${action}`
}

// ── Mock fallback ──────────────────────────────────────────────────────────

function mockCampaignMetrics(): CampaignMetrics[] {
  return [
    { campaignId: '1', campaignName: 'Brand Search', cost: 8000, impressions: 15000, clicks: 300, conversions: 12, ctr: 2.0, cpc: 26.6, cpa: 666, convRate: 4.0, roas: 2.8, impressionShare: 72, lostIsBudget: 15, lostIsRank: 10, qualityScoreAvg: 7 },
    { campaignId: '2', campaignName: 'Generic Search', cost: 22000, impressions: 80000, clicks: 640, conversions: 8, ctr: 0.8, cpc: 34.4, cpa: 2750, convRate: 1.25, roas: 0.9, impressionShare: 35, lostIsBudget: 40, lostIsRank: 25, qualityScoreAvg: 5 },
    { campaignId: '3', campaignName: 'Competitor KW', cost: 12000, impressions: 20000, clicks: 160, conversions: 6, ctr: 0.8, cpc: 75.0, cpa: 2000, convRate: 3.75, roas: 2.1, impressionShare: 55, lostIsBudget: 20, lostIsRank: 22, qualityScoreAvg: 4 },
  ]
}

// ── Main rule evaluator ────────────────────────────────────────────────────

export async function evaluateRule(
  rule: { id: string; type: string; conditionJson: string; actionJson: string },
  customerId: string
): Promise<RuleEvalResult> {
  const condition = JSON.parse(rule.conditionJson) as RuleCondition
  const { action } = JSON.parse(rule.actionJson) as RuleAction

  let campaigns: CampaignMetrics[]

  if (isMockMode()) {
    campaigns = mockCampaignMetrics()
  } else {
    try {
      const token    = await getGoogleAdsAccessToken()
      const dateRange = windowToGadsRange(condition.window)
      campaigns       = await fetchCampaignMetrics(customerId, dateRange, token)
    } catch (err) {
      return {
        result:  'error',
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // Aggregate metric across campaigns (sum for counts, avg for rates)
  const aggMetric = (metric: string): number => {
    if (!campaigns.length) return 0
    const sumMetrics = ['impressions', 'clicks', 'conversions', 'cost']
    if (sumMetrics.includes(metric)) {
      return campaigns.reduce((s, c) => s + getMetricValue(c, metric), 0)
    }
    // Average for rate metrics
    return campaigns.reduce((s, c) => s + getMetricValue(c, metric), 0) / campaigns.length
  }

  // Find campaigns that individually trigger the condition
  const triggered = campaigns.filter((c) =>
    evaluate(getMetricValue(c, condition.metric), condition.operator, condition.value)
  )
  const aggregated = aggMetric(condition.metric)

  if (!triggered.length) {
    return {
      result:   'no_match',
      message:  `${condition.metric} = ${aggregated.toFixed(2)} — condition not met (${condition.operator} ${condition.value})`,
      metricVal: aggregated,
      campaigns: [],
    }
  }

  // Execute the action
  let actionMsg: string
  if (isMockMode()) {
    actionMsg = `[MOCK] Would execute "${action}" on: ${triggered.map((c) => c.campaignName).join(', ')}`
  } else {
    try {
      const token    = await getGoogleAdsAccessToken()
      actionMsg      = await executeAction(action, customerId, triggered, token, MUTATE_ENABLED)
    } catch (err) {
      return {
        result:   'error',
        message:  err instanceof Error ? err.message : String(err),
        campaigns: triggered.map((c) => c.campaignName),
      }
    }
  }

  return {
    result:    'triggered',
    message:   actionMsg,
    metricVal: aggregated,
    campaigns:  triggered.map((c) => c.campaignName),
  }
}
