import { CampaignBlueprintJson, MediaPlanJson } from '@/types'
import { getServiceAccountToken } from '@/lib/google/service-account-auth'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

function isMockMode(): boolean {
  return (
    !process.env.GOOGLE_SHEETS_CLIENT_EMAIL ||
    !process.env.GOOGLE_SHEETS_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_ENABLED !== 'true'
  )
}

async function getSheetsAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? ''
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? ''
  return getServiceAccountToken(email, key, SHEETS_SCOPE)
}

type SheetCell = string | number | null

async function createSpreadsheet(title: string, token: string): Promise<string> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { title } }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create spreadsheet: ${res.status} ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as { spreadsheetId: string }
  return data.spreadsheetId
}

async function batchUpdateValues(
  spreadsheetId: string,
  token: string,
  valueRanges: Array<{ range: string; values: SheetCell[][] }>
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueRanges,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Sheets batchUpdate failed: ${res.status} ${err.slice(0, 300)}`)
  }
}

// ─── Media Plan Export ─────────────────────────────────────────────────────────

export async function exportMediaPlanToSheet(mediaPlan: MediaPlanJson, title: string) {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 500))
    return {
      success: true,
      spreadsheetId: 'mock-spreadsheet-id-123',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/mock-spreadsheet-id-123',
      title,
    }
  }

  const token = await getSheetsAccessToken()
  const spreadsheetId = await createSpreadsheet(title, token)

  // Summary sheet
  const summaryRows: SheetCell[][] = [
    ['Media Plan', title],
    [],
    ['Forecast'],
    ['Total Monthly Budget', mediaPlan.forecast.totalMonthlyBudget],
    ['Expected Clicks', mediaPlan.forecast.totalExpectedClicks],
    ['Expected Impressions', mediaPlan.forecast.totalExpectedImpressions],
    ['Expected Conversions', mediaPlan.forecast.totalExpectedConversions],
    ['Blended CPA', mediaPlan.forecast.blendedCPA],
    ['Blended CPC', mediaPlan.forecast.blendedCPC],
    ['Blended CTR', mediaPlan.forecast.blendedCTR],
    ['ROAS', mediaPlan.forecast.roas],
    [],
    ['Strategic Rationale'],
    [mediaPlan.strategicRationale],
    [],
    ['Recommendations'],
    ...mediaPlan.recommendations.map((r) => [r]),
  ]

  // Campaign mix sheet rows
  const campaignHeaders: SheetCell[] = [
    'Campaign Name', 'Type', 'Monthly Budget', 'Budget %',
    'Target CPA', 'Expected Clicks', 'Expected Impressions', 'Expected Conversions',
    'Bid Strategy', 'Networks',
  ]
  const campaignRows: SheetCell[][] = [
    campaignHeaders,
    ...mediaPlan.campaignMix.map((c) => [
      c.campaignName,
      c.type,
      c.monthlyBudget,
      c.budgetPercent,
      c.targetCPA,
      c.expectedClicks,
      c.expectedImpressions,
      c.expectedConversions,
      c.bidStrategy,
      c.networks.join(', '),
    ]),
  ]

  await batchUpdateValues(spreadsheetId, token, [
    { range: 'Sheet1!A1', values: summaryRows },
    { range: 'Sheet1!A30', values: campaignRows },
  ])

  return {
    success: true,
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    title,
  }
}

// ─── Campaign Blueprint Export ─────────────────────────────────────────────────

export async function exportCampaignBlueprintToSheet(
  blueprint: CampaignBlueprintJson,
  title: string
) {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 500))
    return {
      success: true,
      spreadsheetId: 'mock-blueprint-sheet-456',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/mock-blueprint-sheet-456',
      title,
    }
  }

  const token = await getSheetsAccessToken()
  const spreadsheetId = await createSpreadsheet(title, token)

  // Headers
  const headers: SheetCell[] = [
    'Campaign Name', 'Type', 'Status', 'Budget', 'Bid Strategy',
    'Ad Group', 'Keywords', 'Headline 1', 'Headline 2', 'Headline 3',
    'Description 1', 'Description 2', 'Final URL',
  ]

  const rows: SheetCell[][] = [headers]

  for (const campaign of blueprint.campaigns) {
    for (const adGroup of campaign.adGroups) {
      for (const ad of adGroup.ads) {
        rows.push([
          campaign.campaignName,
          campaign.campaignType,
          campaign.status,
          campaign.budget,
          campaign.bidStrategy,
          adGroup.adGroupName,
          adGroup.keywords.join(', '),
          ad.headline1,
          ad.headline2,
          ad.headline3,
          ad.description1,
          ad.description2,
          ad.finalUrl,
        ])
      }
    }
  }

  await batchUpdateValues(spreadsheetId, token, [{ range: 'Sheet1!A1', values: rows }])

  return {
    success: true,
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    title,
  }
}
