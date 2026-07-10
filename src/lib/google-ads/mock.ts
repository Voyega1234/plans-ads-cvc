import { PushResult } from '@/types'

export const MOCK_ACCOUNTS = [
  {
    id: '000-000-0001',
    resourceName: 'customers/000000001',
    descriptiveName: 'Test Account A',
    currencyCode: 'THB',
    timeZone: 'Asia/Bangkok',
    testAccount: true,
  },
  {
    id: '000-000-0002',
    resourceName: 'customers/000000002',
    descriptiveName: 'Test Account B',
    currencyCode: 'THB',
    timeZone: 'Asia/Bangkok',
    testAccount: true,
  },
]

export async function mockGetAccessibleCustomers() {
  await new Promise((r) => setTimeout(r, 300))
  return MOCK_ACCOUNTS
}

export async function mockGetCustomerDetails(customerId: string) {
  await new Promise((r) => setTimeout(r, 200))
  return MOCK_ACCOUNTS.find((a) => a.id === customerId) ?? MOCK_ACCOUNTS[0]
}

export async function mockGenerateKeywordIdeas(keywords: string[], _customerId: string) {
  await new Promise((r) => setTimeout(r, 500))
  return keywords.map((kw) => ({
    keyword: kw,
    avgMonthlySearches: Math.floor(Math.random() * 10000) + 500,
    competition: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
    lowTopOfPageBid: Math.floor(Math.random() * 20) + 5,
    highTopOfPageBid: Math.floor(Math.random() * 50) + 20,
  }))
}

export async function mockPushCampaignBlueprint(
  blueprintJson: string,
  customerId: string,
  mode: string
): Promise<PushResult> {
  await new Promise((r) => setTimeout(r, 1500))

  const blueprint = JSON.parse(blueprintJson)
  const campaigns = blueprint.campaigns || []

  return {
    jobId: `mock-job-${Date.now()}`,
    status: 'completed',
    provider: 'google_ads',
    mode,
    campaigns: campaigns.map((c: { campaignName: string }) => ({
      campaignName: c.campaignName,
      status: 'success',
      resourceName: `customers/${customerId}/campaigns/${Math.floor(Math.random() * 999999999)}`,
      googleAdsCampaignId: String(Math.floor(Math.random() * 999999999)),
      adGroupsCreated: 2,
      adsCreated: 2,
    })),
    totalCreated: campaigns.length,
    totalErrors: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  }
}

export async function mockTestConnection(customerId: string) {
  await new Promise((r) => setTimeout(r, 400))
  return {
    success: true,
    customerId,
    accountName: 'Test Account (Mock)',
    currency: 'THB',
    timeZone: 'Asia/Bangkok',
  }
}

export async function mockGetCampaignPerformance(customerId: string, _dateRange: string) {
  await new Promise((r) => setTimeout(r, 600))
  return [
    { campaignName: 'Search - Non Brand', cost: 18500, impressions: 22000, clicks: 2200, conversions: 22, ctr: 10, cpc: 8.4, cpa: 841 },
    { campaignName: 'Search - Brand', cost: 4800, impressions: 4500, clicks: 950, conversions: 14, ctr: 21.1, cpc: 5.05, cpa: 343 },
    { campaignName: 'Performance Max', cost: 14200, impressions: 75000, clicks: 1400, conversions: 16, ctr: 1.87, cpc: 10.14, cpa: 888 },
    { campaignName: 'Display - Remarketing', cost: 9500, impressions: 185000, clicks: 720, conversions: 7, ctr: 0.39, cpc: 13.19, cpa: 1357 },
  ]
}

// Campaign Monitor mock — multi-account campaign list with full fields
const MOCK_MONITOR_DATA: Record<string, Array<{
  campaignId: string; campaignName: string; status: string
  dailyBudget: number; biddingStrategy: string; targetCpa?: number; targetRoas?: number
  cost: number; impressions: number; clicks: number; conversions: number
  conversionValue: number; ctr: number; cpa: number; roas: number
  costChange: number; convChange: number; cpaChange: number; roasChange: number
}>> = {
  '000-000-0001': [
    { campaignId: 'c1', campaignName: 'Shopping Campaign', status: 'ENABLED', dailyBudget: 3500, biddingStrategy: 'MAXIMIZE_CONVERSION_VALUE', targetRoas: 4, cost: 3598, impressions: 178102, clicks: 3596, conversions: 101, conversionValue: 15753, ctr: 2.0, cpa: 35.6, roas: 4.35, costChange: 14.5, convChange: 6.3, cpaChange: -7.7, roasChange: 8.7 },
    { campaignId: 'c2', campaignName: 'Performance Max', status: 'ENABLED', dailyBudget: 2500, biddingStrategy: 'MAXIMIZE_CONVERSION_VALUE', targetRoas: 4, cost: 2398, impressions: 213837, clicks: 1867, conversions: 81, conversionValue: 14118, ctr: 0.9, cpa: 29.6, roas: 5.89, costChange: 0.6, convChange: 11.0, cpaChange: -9.3, roasChange: 10.4 },
  ],
  '000-000-0002': [
    { campaignId: 'c3', campaignName: 'UAC - App Install - TH', status: 'ENABLED', dailyBudget: 2500, biddingStrategy: 'TARGET_CPA', targetCpa: 80, cost: 2560, impressions: 1188240, clicks: 9027, conversions: 402, conversionValue: 0, ctr: 0.8, cpa: 6.4, roas: 0, costChange: 1.6, convChange: 5.5, cpaChange: -3.7, roasChange: 0 },
    { campaignId: 'c4', campaignName: 'Treatment Keywords Ca...', status: 'ENABLED', dailyBudget: 2500, biddingStrategy: 'TARGET_CPA', targetCpa: 70, cost: 2443, impressions: 37475, clicks: 530, conversions: 29, conversionValue: 0, ctr: 1.4, cpa: 84.2, roas: 3.62, costChange: 1.9, convChange: -3.3, cpaChange: 5.4, roasChange: -3.2 },
    { campaignId: 'c5', campaignName: 'Brand Search', status: 'ENABLED', dailyBudget: 1500, biddingStrategy: 'TARGET_ROAS', targetRoas: 8, cost: 1493, impressions: 7239, clicks: 510, conversions: 40, conversionValue: 14990, ctr: 7.0, cpa: 37.3, roas: 10.02, costChange: 13.1, convChange: -7.0, cpaChange: 21.6, roasChange: 25.3 },
    { campaignId: 'c6', campaignName: 'UAC - KYC Completion ...', status: 'ENABLED', dailyBudget: 1500, biddingStrategy: 'TARGET_CPA', targetCpa: 120, cost: 1404, impressions: 690131, clicks: 4924, conversions: 84, conversionValue: 0, ctr: 0.7, cpa: 16.7, roas: 0, costChange: 4.9, convChange: -7.7, cpaChange: 13.6, roasChange: 0 },
    { campaignId: 'c7', campaignName: 'B2B Lead Gen Campaign', status: 'ENABLED', dailyBudget: 1000, biddingStrategy: 'TARGET_CPA', targetCpa: 150, cost: 987, impressions: 18717, clicks: 268, conversions: 4, conversionValue: 0, ctr: 1.4, cpa: 246.8, roas: 0.32, costChange: 3.8, convChange: 0.0, cpaChange: 3.8, roasChange: -68 },
    { campaignId: 'c8', campaignName: 'YouTube - App Awarene...', status: 'ENABLED', dailyBudget: 800, biddingStrategy: 'CPM', cost: 746, impressions: 2220880, clicks: 3453, conversions: 33, conversionValue: 0, ctr: 0.2, cpa: 22.6, roas: 0, costChange: 5.4, convChange: 0.0, cpaChange: 5.4, roasChange: 0 },
  ],
}

export async function mockGetCampaignMonitor(accountIds: string[]) {
  await new Promise((r) => setTimeout(r, 700))
  const all = []
  for (const id of accountIds) {
    const rows = MOCK_MONITOR_DATA[id] ?? []
    for (const r of rows) all.push({ ...r, customerId: id })
  }
  return all
}
