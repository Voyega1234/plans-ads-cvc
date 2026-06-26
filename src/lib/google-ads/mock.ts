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
