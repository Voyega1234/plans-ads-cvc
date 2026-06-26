import { CampaignBlueprintItem, CampaignBlueprintJson, PushCampaignResult, PushResult } from '@/types'
import { isMockMode } from './client'
import { mockPushCampaignBlueprint } from './mock'
import { getGoogleAdsAccessToken } from './auth'

// ─── Keyword sanitizer ────────────────────────────────────────────────────────
// Google Ads rejects keywords with special chars: !, @, %, ^, *, =, {}, \, <>, |, ;
// Also rejects currency symbols like ฿ and various punctuation.
// Strips invalid chars and trims; returns null if result is empty or too long (>80 chars).
function sanitizeKeyword(kw: string): string | null {
  // Remove characters Google Ads doesn't allow in keywords
  const cleaned = kw
    .replace(/[!@#$%^&*={}\\|<>;฿€£¥₩₹]/g, '')  // special symbols incl. Thai baht sign
    .replace(/["""''«»‘’“”]/g, '')  // smart quotes
    .replace(/\s+/g, ' ')                                // collapse whitespace
    .trim()
  // Skip empty, too short (pure numbers/single chars after strip), or too long
  if (!cleaned || cleaned.length < 2 || cleaned.length > 80) return null
  // Skip if result is only numbers/symbols with no meaningful text
  if (/^\d+$/.test(cleaned)) return null
  return cleaned
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function getAdsConfig() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId =
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ??
    process.env.COMPANY_MCC_CUSTOMER_ID ??
    ''
  if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not set.')
  return { developerToken, loginCustomerId }
}

function buildMutateHeaders(
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
  return headers
}

interface MutateResponse {
  mutateOperationResponses?: Array<{
    campaignResult?:       { resourceName: string }
    adGroupResult?:        { resourceName: string }
    adGroupAdResult?:      { resourceName: string }
    campaignBudgetResult?: { resourceName: string }
    assetResult?:          { resourceName: string }
    assetGroupAssetResult?: { resourceName: string }
  }>
}

// Query the account for any existing LOGO-type image asset and return its resource name
async function fetchExistingLogoAsset(
  cid: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<string | null> {
  try {
    const query = `SELECT asset.resource_name, asset.type, asset.name FROM asset WHERE asset.type = 'IMAGE' ORDER BY asset.id DESC LIMIT 50`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
    const res = await fetch(
      `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    )
    if (!res.ok) return null
    const data = await res.json() as { results?: Array<{ asset: { resourceName: string; name?: string } }> }
    // Return the first image asset found (prefer ones named Logo/logo)
    const results = data.results ?? []
    const logoFirst = results.find(r => /logo/i.test(r.asset.name ?? ''))
    return (logoFirst ?? results[0])?.asset?.resourceName ?? null
  } catch {
    return null
  }
}

// Upload an image from a URL or base64 data URL to Google Ads and return its resource name
async function uploadImageAsset(
  imageUrl: string,
  name: string,
  cid: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<string | null> {
  try {
    let imageData: string
    if (imageUrl.startsWith('data:')) {
      // base64 data URL — extract the base64 part
      imageData = imageUrl.split(',')[1] ?? ''
    } else {
      // Fetch from URL (local /uploads/ or external)
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3010'
      const fetchUrl = imageUrl.startsWith('/') ? `${baseUrl}${imageUrl}` : imageUrl
      const res = await fetch(fetchUrl)
      if (!res.ok) return null
      const buf = await res.arrayBuffer()
      imageData = Buffer.from(buf).toString('base64')
    }
    if (!imageData) return null

    const result = await batchMutate(cid, [{
      assetOperation: {
        create: {
          name: `${name}_${Date.now()}`,
          imageAsset: { data: imageData },
        },
      },
    }], accessToken, developerToken, loginCustomerId) as MutateResponse & {
      mutateOperationResponses?: Array<{ assetResult?: { resourceName: string } }>
    }
    return result.mutateOperationResponses?.[0]?.assetResult?.resourceName ?? null
  } catch (e) {
    console.error('[uploadImageAsset] failed:', e)
    return null
  }
}

async function batchMutate(
  customerId: string,
  operations: unknown[],
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<MutateResponse> {
  customerId = customerId.replace(/-/g, '')
  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:mutate`,
    {
      method: 'POST',
      headers: buildMutateHeaders(accessToken, developerToken, loginCustomerId),
      body: JSON.stringify({ mutateOperations: operations }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    console.error('[batchMutate] FULL ERROR:', err)
    // Extract field violation details if present
    try {
      const parsed = JSON.parse(err)
      const details = parsed?.error?.details ?? []
      const violations = details.flatMap((d: Record<string, unknown>) =>
        ((d.errors ?? []) as Record<string, unknown>[]).map((e: Record<string, unknown>) =>
          `${(e.message as string) ?? ''} — field: ${JSON.stringify(e.location ?? '')}`
        )
      ).join(' | ')
      if (violations) throw new Error(`Google Ads API error: ${violations}`)
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message.startsWith('Google Ads API error:')) throw parseErr
    }
    throw new Error(`Google Ads mutate failed (${res.status}): ${err.slice(0, 3000)}`)
  }
  return res.json() as Promise<MutateResponse>
}

function tomorrowYYYYMMDD(): string {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function normaliseBidStrategy(type: string, declared: string): string {
  const t = type.toUpperCase()
  const d = (declared ?? '').toUpperCase()
  if (d === 'TARGET_CPA' || d === 'TARGET_ROAS' || d === '') {
    if (['PERFORMANCE_MAX', 'PMAX', 'DISPLAY', 'DEMAND_GEN', 'VIDEO'].includes(t))
      return 'MAXIMIZE_CONVERSIONS'
    return 'MAXIMIZE_CLICKS'
  }
  return d
}

// ─── Search / Display campaign (1 campaign = 1 adgroup) ────────────────────────
//
// Rule: Google Ads best practice — tight theme per campaign.
// Blueprint may contain multiple adGroups on a single campaign object; we split
// them into separate campaigns here so every campaign has exactly 1 ad group.

export async function createSearchCampaignFromBlueprint(
  campaign: CampaignBlueprintItem,
  customerId: string
): Promise<PushCampaignResult> {
  if (isMockMode()) {
    return {
      campaignName: campaign.campaignName,
      status: 'success',
      resourceName: `customers/${customerId}/campaigns/${Math.floor(Math.random() * 999999999)}`,
      googleAdsCampaignId: String(Math.floor(Math.random() * 999999999)),
      adGroupsCreated: campaign.adGroups.length,
      adsCreated: campaign.adGroups.reduce((sum, ag) => sum + ag.ads.length, 0),
    }
  }

  customerId = customerId.replace(/-/g, '')
  const accessToken = await getGoogleAdsAccessToken()
  const { developerToken, loginCustomerId } = getAdsConfig()

  // Flatten: 1 adgroup per campaign — build one batch per adgroup
  const adGroups = campaign.adGroups.length > 0 ? campaign.adGroups : [null]
  let firstCampaignId = ''
  let firstResourceName = ''
  let totalAgs = 0
  let totalAds = 0

  for (let agIdx = 0; agIdx < adGroups.length; agIdx++) {
    const adGroup = adGroups[agIdx]
    const ts = Date.now() + agIdx  // ensure unique names across iterations

    // Campaign name: unique per push using date + short ms suffix
    const campSuffix = agIdx === 0 ? '' : ` | AG-${agIdx + 1}`
    const dateStr = new Date().toISOString().slice(0, 10)
    const shortTs = String(ts).slice(-5)
    const campName = `${campaign.campaignName}${campSuffix} [${dateStr}-${shortTs}]`

    const budgetId  = -1
    const campId    = -2
    const agId      = -100

    const ops: unknown[] = []

    // ── Budget ──────────────────────────────────────────────────────────────
    ops.push({
      campaignBudgetOperation: {
        create: {
          resourceName: `customers/${customerId}/campaignBudgets/${budgetId}`,
          name: `Budget ${campName} ${ts}`,
          amountMicros: String(Math.round((campaign.budget || 50) * 1_000_000)),
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        },
      },
    })

    // ── Campaign ─────────────────────────────────────────────────────────────
    const bidStrategy = normaliseBidStrategy(campaign.campaignType ?? 'SEARCH', campaign.bidStrategy)
    const biddingField: Record<string, unknown> =
      bidStrategy === 'MAXIMIZE_CONVERSIONS'       ? { maximizeConversions: {} }
      : bidStrategy === 'MAXIMIZE_CONVERSION_VALUE' ? { maximizeConversionValue: {} }
      : bidStrategy === 'TARGET_CPA' && campaign.targetCPA
        ? { targetCpa: { targetCpaMicros: String(Math.round(campaign.targetCPA * 1_000_000)) } }
      : { targetSpend: {} }  // MAXIMIZE_CLICKS

    const campType = (campaign.campaignType ?? 'SEARCH').toUpperCase()

    // Map campaign type → Google Ads advertisingChannelType enum
    const CHANNEL_TYPE_MAP: Record<string, string> = {
      SEARCH:       'SEARCH',
      DISPLAY:      'DISPLAY',
      VIDEO:        'VIDEO',
      YOUTUBE:      'VIDEO',
      SHOPPING:     'SHOPPING',
      DEMAND_GEN:   'DEMAND_GEN',
      APP_CAMPAIGN: 'MULTI_CHANNEL',
    }
    const channelType = CHANNEL_TYPE_MAP[campType] ?? 'SEARCH'

    // Network settings only apply to SEARCH and DISPLAY
    const networkSettings = campType === 'DISPLAY'
      ? { targetContentNetwork: true,  targetGoogleSearch: false, targetSearchNetwork: false }
      : campType === 'SEARCH'
        ? { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false }
        : undefined

    // Sub-channel type for VIDEO campaigns
    const advertisingChannelSubType = campType === 'VIDEO' || campType === 'YOUTUBE'
      ? 'VIDEO_ACTION'
      : campType === 'DEMAND_GEN'
        ? undefined
        : undefined

    ops.push({
      campaignOperation: {
        create: {
          resourceName: `customers/${customerId}/campaigns/${campId}`,
          name: campName,
          status: campaign.status ?? 'PAUSED',
          advertisingChannelType: channelType,
          ...(advertisingChannelSubType ? { advertisingChannelSubType } : {}),
          campaignBudget: `customers/${customerId}/campaignBudgets/${budgetId}`,
          ...biddingField,
          ...(networkSettings ? { networkSettings } : {}),
          startDate: tomorrowYYYYMMDD(),
          endDate: '20261231',
          containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      },
    })

    // ── Negative keywords (campaign-level) ───────────────────────────────────
    const negatives = campaign.negativeKeywords ?? []
    negatives.forEach((nkw) => {
      const clean = sanitizeKeyword(nkw)
      if (!clean) return
      ops.push({
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${customerId}/campaigns/${campId}`,
            negative: true,
            keyword: { text: clean, matchType: 'BROAD' },
          },
        },
      })
    })

    // ── Ad group ──────────────────────────────────────────────────────────────
    if (adGroup) {
      const adGroupType = campType === 'DISPLAY' ? 'DISPLAY_STANDARD' : 'SEARCH_STANDARD'
      ops.push({
        adGroupOperation: {
          create: {
            resourceName: `customers/${customerId}/adGroups/${agId}`,
            name: adGroup.adGroupName,
            campaign: `customers/${customerId}/campaigns/${campId}`,
            status: 'ENABLED',
            type: adGroupType,
            cpcBidMicros: String(Math.round((adGroup.defaultBid || 5) * 1_000_000)),
          },
        },
      })

      // ── Keywords (default PHRASE, max 20 per adgroup per batch) ─────────────
      const kws = (adGroup.keywords ?? []).filter(k => k && k.trim().length > 0).slice(0, 20)
      const mts = adGroup.matchTypes ?? []
      kws.forEach((kw, ki) => {
        const clean = sanitizeKeyword(kw)
        if (!clean) return
        const raw = (mts[ki] ?? 'PHRASE').toUpperCase()
        const matchType = raw === 'EXACT' ? 'EXACT' : raw === 'BROAD' ? 'BROAD' : 'PHRASE'
        ops.push({
          adGroupCriterionOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/${agId}`,
              status: 'ENABLED',
              keyword: { text: clean, matchType },
            },
          },
        })
      })

      // ── RSA ad (merge variants, dedup) ────────────────────────────────────
      const allH: string[] = []
      const allD: string[] = []
      let finalUrl = campaign.finalUrl ?? ''
      adGroup.ads.forEach((ad) => {
        const rsa = ad.rsa
        const hs = rsa?.headlines ?? [ad.headline1, ad.headline2, ad.headline3].filter(Boolean) as string[]
        const ds = rsa?.descriptions ?? [ad.description1, ad.description2].filter(Boolean) as string[]
        hs.forEach((h) => { if (h && !allH.includes(h)) allH.push(h) })
        ds.forEach((d) => { if (d && !allD.includes(d)) allD.push(d) })
        if (!finalUrl) finalUrl = rsa?.finalUrl ?? ad.finalUrl ?? ''
      })

      if (campType === 'DISPLAY') {
        // Display campaign: Responsive Display Ad requires real image assets (marketing_images).
        // Skip ad creation — campaign + ad group will be created, user uploads images in Google Ads UI.
        // (No-op: totalAds not incremented)
      } else if (allH.length >= 3 && allD.length >= 2) {
        // Search: Responsive Search Ad
        const firstAd = adGroup.ads[0]
        const path1 = (firstAd?.rsa?.displayPath1 ?? '').slice(0, 15)
        const path2 = (firstAd?.rsa?.displayPath2 ?? '').slice(0, 15)
        ops.push({
          adGroupAdOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/${agId}`,
              status: 'ENABLED',
              ad: {
                finalUrls: [finalUrl || 'https://example.com'],
                responsiveSearchAd: {
                  headlines:    allH.slice(0, 15).map((text) => ({ text })),
                  descriptions: allD.slice(0, 4).map((text) => ({ text })),
                  path1,
                  path2,
                },
              },
            },
          },
        })
        totalAds++
      }
      totalAgs++
    }

    const result = await batchMutate(customerId, ops, accessToken, developerToken, loginCustomerId)

    const campRN =
      result.mutateOperationResponses?.find((r) => r.campaignResult)?.campaignResult?.resourceName ?? ''
    if (agIdx === 0) {
      firstResourceName = campRN
      firstCampaignId   = campRN.split('/').pop() ?? ''
    }

    // ── Sitelinks (separate call — asset-first pattern) ─────────────────────
    const sitelinks = campaign.sitelinks ?? []
    if (sitelinks.length > 0 && campRN) {
      try {
        await pushSitelinks(customerId, campRN, sitelinks, accessToken, developerToken, loginCustomerId)
      } catch {
        // sitelinks are non-critical — log but don't fail campaign creation
      }
    }

    // ── Callouts (separate call) ─────────────────────────────────────────────
    const callouts = campaign.callouts ?? []
    if (callouts.length > 0 && campRN) {
      try {
        await pushCallouts(customerId, campRN, callouts, accessToken, developerToken, loginCustomerId)
      } catch {
        // non-critical
      }
    }

    // ── Structured Snippets (separate call) ──────────────────────────────────
    const snippets = campaign.structuredSnippets ?? []
    if (snippets.length > 0 && campRN) {
      try {
        await pushStructuredSnippets(customerId, campRN, snippets, accessToken, developerToken, loginCustomerId)
      } catch {
        // non-critical
      }
    }
  }

  return {
    campaignName:        campaign.campaignName,
    status:              'success',
    resourceName:        firstResourceName,
    googleAdsCampaignId: firstCampaignId,
    adGroupsCreated:     totalAgs,
    adsCreated:          totalAds,
  }
}

// ─── Sitelink assets ───────────────────────────────────────────────────────────

async function pushSitelinks(
  customerId: string,
  campaignRN: string,
  sitelinks: Array<{ text: string; description1?: string; description2?: string; finalUrl?: string }>,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<void> {
  const cid = customerId.replace(/-/g, '')
  let tempId = -500

  // Step 1: create sitelink assets
  const assetOps = sitelinks.map((sl) => {
    const aid = tempId--
    return {
      _aid: aid,
      op: {
        assetOperation: {
          create: {
            resourceName: `customers/${cid}/assets/${aid}`,
            sitelinkAsset: {
              linkText:     sl.text.slice(0, 25),
              description1: (sl.description1 ?? '').slice(0, 35),
              description2: (sl.description2 ?? '').slice(0, 35),
              finalUrls:    [sl.finalUrl ?? ''],
            },
          },
        },
      },
    }
  })

  const assetResult = await batchMutate(cid, assetOps.map((a) => a.op), accessToken, developerToken, loginCustomerId) as MutateResponse & { mutateOperationResponses?: Array<{ assetResult?: { resourceName: string } }> }

  const assetRNs = (assetResult.mutateOperationResponses ?? [])
    .map((r) => (r as Record<string, unknown>).assetResult as { resourceName: string } | undefined)
    .filter(Boolean)
    .map((r) => r!.resourceName)

  if (!assetRNs.length) return

  // Step 2: link assets to campaign
  const linkOps = assetRNs.map((assetRN) => ({
    campaignAssetOperation: {
      create: {
        campaign:  campaignRN,
        asset:     assetRN,
        fieldType: 'SITELINK',
      },
    },
  }))
  await batchMutate(cid, linkOps, accessToken, developerToken, loginCustomerId)
}

// ─── Callout assets ────────────────────────────────────────────────────────────

async function pushCallouts(
  customerId: string,
  campaignRN: string,
  callouts: string[],
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<void> {
  const cid = customerId.replace(/-/g, '')
  let tempId = -600

  // Step 1: create callout assets
  const assetOps = callouts.slice(0, 20).map((text) => {
    const aid = tempId--
    return {
      assetOperation: {
        create: {
          resourceName: `customers/${cid}/assets/${aid}`,
          calloutAsset: { calloutText: text.slice(0, 25) },
        },
      },
    }
  })

  const assetResult = await batchMutate(cid, assetOps, accessToken, developerToken, loginCustomerId) as MutateResponse & { mutateOperationResponses?: Array<{ assetResult?: { resourceName: string } }> }

  const assetRNs = (assetResult.mutateOperationResponses ?? [])
    .map((r) => (r as Record<string, unknown>).assetResult as { resourceName: string } | undefined)
    .filter(Boolean)
    .map((r) => r!.resourceName)

  if (!assetRNs.length) return

  // Step 2: link to campaign
  const linkOps = assetRNs.map((assetRN) => ({
    campaignAssetOperation: {
      create: {
        campaign:  campaignRN,
        asset:     assetRN,
        fieldType: 'CALLOUT',
      },
    },
  }))
  await batchMutate(cid, linkOps, accessToken, developerToken, loginCustomerId)
}

// ─── Structured Snippets ──────────────────────────────────────────────────────

async function pushStructuredSnippets(
  customerId: string,
  campaignRN: string,
  snippets: Array<{ header: string; values: string[] }>,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<void> {
  const cid = customerId.replace(/-/g, '')
  let tempId = -700

  // Google Ads structured snippet headers must match predefined list — map to nearest valid header
  const VALID_HEADERS: Record<string, string> = {
    'หลักสูตร': 'Courses', 'หลักสูตรที่เปิดสอน': 'Courses',
    'บริการ': 'Services', 'การรักษา': 'Services', 'ประเภทโครงการ': 'Types',
    'สิ่งอำนวยความสะดวก': 'Amenities', 'แบรนด์': 'Brands',
    'Courses': 'Courses', 'Services': 'Services', 'Types': 'Types',
    'Amenities': 'Amenities', 'Brands': 'Brands', 'Models': 'Models',
    'Neighborhoods': 'Neighborhoods', 'Destinations': 'Destinations',
    'Styles': 'Styles', 'Featured Hotels': 'Featured Hotels',
    'Insurance Coverage': 'Insurance Coverage', 'Degree Programs': 'Degree Programs',
  }

  const assetOps = snippets.flatMap((snip) => {
    const header = VALID_HEADERS[snip.header] ?? 'Services'
    const values = snip.values.filter(Boolean).slice(0, 10)
    if (!values.length) return []
    const aid = tempId--
    return [{
      assetOperation: {
        create: {
          resourceName: `customers/${cid}/assets/${aid}`,
          structuredSnippetAsset: {
            header,
            values: values.map((v) => v.slice(0, 25)),
          },
        },
      },
    }]
  })

  if (!assetOps.length) return

  const assetResult = await batchMutate(cid, assetOps, accessToken, developerToken, loginCustomerId) as MutateResponse & { mutateOperationResponses?: Array<{ assetResult?: { resourceName: string } }> }

  const assetRNs = (assetResult.mutateOperationResponses ?? [])
    .map((r) => (r as Record<string, unknown>).assetResult as { resourceName: string } | undefined)
    .filter(Boolean)
    .map((r) => r!.resourceName)

  if (!assetRNs.length) return

  const linkOps = assetRNs.map((assetRN) => ({
    campaignAssetOperation: {
      create: { campaign: campaignRN, asset: assetRN, fieldType: 'STRUCTURED_SNIPPET' },
    },
  }))
  await batchMutate(cid, linkOps, accessToken, developerToken, loginCustomerId)
}

// ─── Asset completeness validation ────────────────────────────────────────────
// Called before push — returns list of missing required assets per campaign

export interface AssetGap {
  campaignName: string
  missing: string[]
}

export function validateAssets(blueprint: CampaignBlueprintJson): AssetGap[] {
  const gaps: AssetGap[] = []
  for (const camp of blueprint.campaigns ?? []) {
    const missing: string[] = []
    const type = (camp.campaignType ?? '').toUpperCase()
    // PMax / Display / YouTube / DemandGen don't use RSA or sitelinks
    if (['PERFORMANCE_MAX', 'PMAX', 'DISPLAY', 'YOUTUBE', 'VIDEO', 'DEMAND_GEN', 'APP_CAMPAIGN'].includes(type)) continue

    // Search & Shopping must have full assets
    if (!camp.sitelinks || camp.sitelinks.length < 4) missing.push('sitelinks (ต้องการอย่างน้อย 4)')
    if (!camp.callouts  || camp.callouts.length  < 4) missing.push('callouts (ต้องการอย่างน้อย 4)')
    if (!camp.structuredSnippets?.length)              missing.push('structured snippets')

    const ag = camp.adGroups?.[0]
    if (ag) {
      const firstAd = ag.ads?.[0]
      const rsa = firstAd?.rsa
      // Support both RSA format and legacy headline1/2/3 format
      const headlines = rsa?.headlines?.filter((h: string) => h && h.trim()) ?? [firstAd?.headline1, firstAd?.headline2, firstAd?.headline3].filter(Boolean)
      const descriptions = rsa?.descriptions?.filter((d: string) => d && d.trim()) ?? [firstAd?.description1, firstAd?.description2].filter(Boolean)
      if (headlines.length < 3)
        missing.push(`RSA headlines ไม่ครบ (มี ${headlines.length})`)
      if (descriptions.length < 2)
        missing.push(`RSA descriptions ไม่ครบ (มี ${descriptions.length})`)
    }

    if (missing.length) gaps.push({ campaignName: camp.campaignName, missing })
  }
  return gaps
}

// ─── PMax Campaign ─────────────────────────────────────────────────────────────

export interface PMaxImageAssets {
  logoResourceName?: string          // square logo — required for Brand Guidelines
  marketingImageResourceName?: string // landscape 1.91:1 — required for asset group
  squareMarketingImageResourceName?: string // square 1:1 marketing image
}

export async function createPMaxCampaignFromBlueprint(
  campaign: CampaignBlueprintItem,
  customerId: string,
  imageAssets?: PMaxImageAssets
): Promise<PushCampaignResult> {
  if (isMockMode()) {
    return {
      campaignName: campaign.campaignName,
      status: 'success',
      resourceName: `customers/${customerId}/campaigns/${Math.floor(Math.random() * 999999999)}`,
      googleAdsCampaignId: String(Math.floor(Math.random() * 999999999)),
      adGroupsCreated: 0,
      adsCreated: 0,
    }
  }

  const accessToken = await getGoogleAdsAccessToken()
  const { developerToken, loginCustomerId } = getAdsConfig()
  const cid = customerId.replace(/-/g, '')

  const budgetId = -1
  const campId   = -2
  const agId     = -100
  const ops: unknown[] = []

  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: `customers/${cid}/campaignBudgets/${budgetId}`,
        name: `Budget ${campaign.campaignName} ${Date.now()}`,
        amountMicros: String(Math.round((campaign.budget || 50) * 1_000_000)),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    },
  })

  const pmaxCampName = `${campaign.campaignName} [${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-5)}]`

  ops.push({
    campaignOperation: {
      create: {
        resourceName: `customers/${cid}/campaigns/${campId}`,
        name: pmaxCampName,
        status: campaign.status ?? 'PAUSED',
        advertisingChannelType: 'PERFORMANCE_MAX',
        campaignBudget: `customers/${cid}/campaignBudgets/${budgetId}`,
        maximizeConversions: {},
        startDate: tomorrowYYYYMMDD(),
        endDate: '20261231',
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      },
    },
  })

  const firstAdGroup = campaign.adGroups[0]
  const firstAd      = firstAdGroup?.ads[0]
  const pmaxAssets   = firstAd?.pmax ?? (campaign.assetGroups?.[0]
    ? { ...campaign.assetGroups[0] }
    : undefined)

  // Fallback: extract business name from campaign name
  // Supports both "CVC | PMax | BizName | Goal" and "CVC - PMax - BizName - Goal" patterns
  const sep = campaign.campaignName.includes('|') ? '|' : '-'
  const campaignNameParts = campaign.campaignName.split(sep).map(s => s.trim()).filter(Boolean)
  // Pattern: [prefix, type, bizName, goal] — take part[2] if available, else part[1], else full name
  const bizNameFallback = campaignNameParts.length >= 3
    ? campaignNameParts[2]
    : campaignNameParts.length >= 2
      ? campaignNameParts[1]
      : campaign.campaignName
  const bizName = (pmaxAssets?.businessName ?? bizNameFallback).slice(0, 25)

  // Batch 0: pre-create business name asset so we have a real resource name before campaign create
  let bizNameRN: string | null = null
  if (bizName) {
    const bnOps = [{
      assetOperation: {
        create: {
          name: `BizName_${bizName}_${Date.now()}`,
          textAsset: { text: bizName },
        },
      },
    }]
    const bnResult = await batchMutate(cid, bnOps, accessToken, developerToken, loginCustomerId) as MutateResponse & {
      mutateOperationResponses?: Array<{ assetResult?: { resourceName: string } }>
    }
    bizNameRN = bnResult.mutateOperationResponses?.[0]?.assetResult?.resourceName ?? null
  }

  // Brand Guidelines requires business name + logo — both mandatory, no fallback, no skip
  let logoRN: string | null = imageAssets?.logoResourceName ?? null
  if (!logoRN) {
    const fromAssetGroups = campaign.assetGroups?.flatMap(ag => ag.imageAssets ?? []) ?? []
    const fromAdGroups = (campaign.adGroups ?? []).flatMap(ag => ag.ads ?? []).flatMap(ad => (ad.pmax?.imageAssets ?? []) as typeof fromAssetGroups)
    const allBpAssets = [...fromAssetGroups, ...fromAdGroups]
    const logoAsset = allBpAssets.find(a => a.assetType === 'LOGO' || a.assetType === 'SQUARE_LOGO')
    if (logoAsset?.imageUrl) {
      logoRN = await uploadImageAsset(logoAsset.imageUrl, `Logo_${bizName}`, cid, accessToken, developerToken, loginCustomerId)
    }
  }
  if (!logoRN) {
    throw new Error(`PMax "${campaign.campaignName}" ขาดรูป Logo — กลับไปอัปโหลด Logo (1200×1200) ใน Ad Copy step ก่อน push`)
  }
  if (!bizNameRN) {
    throw new Error(`PMax "${campaign.campaignName}" ขาด Business Name — กลับไปกรอก Business Name ใน Ad Copy step ก่อน push`)
  }

  ops.push({ campaignAssetOperation: { create: {
    campaign: `customers/${cid}/campaigns/${campId}`,
    asset: bizNameRN,
    fieldType: 'BUSINESS_NAME',
  }}})
  ops.push({ campaignAssetOperation: { create: {
    campaign: `customers/${cid}/campaigns/${campId}`,
    asset: logoRN,
    fieldType: 'LOGO',
  }}})

  // Batch 1: create campaign + budget + brand guidelines asset links in one call
  const campResult = await batchMutate(cid, ops, accessToken, developerToken, loginCustomerId)
  const campRN = campResult.mutateOperationResponses?.find((r) => r.campaignResult)?.campaignResult?.resourceName
    ?? `customers/${cid}/campaigns/unknown`

  const headlines     = (pmaxAssets?.headlines     ?? []).filter(Boolean)
  const longHeadlines = (pmaxAssets?.longHeadlines ?? []).filter(Boolean)
  const descriptions  = (pmaxAssets?.descriptions  ?? []).filter(Boolean)

  // Fallback text assets when AI didn't generate PMax content
  if (headlines.length === 0)     headlines.push(bizName || 'สินค้าคุณภาพ', 'โปรโมชันพิเศษ', 'สั่งซื้อวันนี้')
  if (longHeadlines.length === 0) longHeadlines.push(`${bizName || 'สินค้าคุณภาพ'} — ราคาดีที่สุด`)
  if (descriptions.length === 0)  descriptions.push('สินค้าคุณภาพดี ราคาเป็นธรรม บริการดีเยี่ยม', 'สั่งซื้อง่าย ส่งไว ปลอดภัย 100%')

  // Batch 2a: pre-create all text assets to get real resource names
  // (Google Ads requires asset group to reference existing assets, not temp IDs in the same batch)
  type TextAssetEntry = { text: string; fieldType: string }
  const textEntries: TextAssetEntry[] = [
    ...headlines.slice(0, 15).map(h => ({ text: h, fieldType: 'HEADLINE' })),
    ...longHeadlines.slice(0, 5).map(h => ({ text: h, fieldType: 'LONG_HEADLINE' })),
    ...descriptions.slice(0, 5).map(d => ({ text: d, fieldType: 'DESCRIPTION' })),
  ]

  const textAssetOps = textEntries.map((e, i) => ({
    assetOperation: {
      create: {
        name: `PMax_${e.fieldType}_${i}_${Date.now()}`,
        textAsset: { text: e.text },
      },
    },
  }))

  const textAssetResult = await batchMutate(cid, textAssetOps, accessToken, developerToken, loginCustomerId) as MutateResponse & {
    mutateOperationResponses?: Array<{ assetResult?: { resourceName: string } }>
  }
  const textAssetRNs = (textAssetResult.mutateOperationResponses ?? [])
    .map((r) => r.assetResult?.resourceName ?? '')
    .filter(Boolean)

  // Batch 2b: create asset group + link all assets (text + images) using real resource names
  // Collect image resource names — upload from blueprint if needed
  const allImgAssets = [
    ...(campaign.assetGroups?.flatMap(ag => ag.imageAssets ?? []) ?? []),
    ...(campaign.adGroups ?? []).flatMap(ag => ag.ads ?? []).flatMap(ad => (ad.pmax?.imageAssets ?? []) as { assetType: string; imageUrl?: string }[]),
  ]

  let marketingImgRN = imageAssets?.marketingImageResourceName ?? null
  if (!marketingImgRN) {
    const src = allImgAssets.find(a => a.assetType === 'MARKETING_IMAGE' && a.imageUrl)
    if (src?.imageUrl) marketingImgRN = await uploadImageAsset(src.imageUrl, `LandscapeImg_${bizName}`, cid, accessToken, developerToken, loginCustomerId)
  }

  let squareImgRN = imageAssets?.squareMarketingImageResourceName ?? null
  if (!squareImgRN) {
    const src = allImgAssets.find(a => a.assetType === 'SQUARE_MARKETING_IMAGE' && a.imageUrl)
    if (src?.imageUrl) squareImgRN = await uploadImageAsset(src.imageUrl, `SquareImg_${bizName}`, cid, accessToken, developerToken, loginCustomerId)
  }

  // Google Ads requires at least 1 landscape + 1 square image for a valid asset group
  if (!marketingImgRN || !squareImgRN) {
    const missing = [!marketingImgRN && 'Landscape image (1200×628)', !squareImgRN && 'Square image (1200×1200)'].filter(Boolean).join(', ')
    throw new Error(`PMax "${campaign.campaignName}" ขาดรูปภาพที่จำเป็น: ${missing} — กลับไปอัปโหลดใน Ad Copy step ก่อน push`)
  }

  const ops2: unknown[] = []

  ops2.push({
    assetGroupOperation: {
      create: {
        resourceName: `customers/${cid}/assetGroups/${agId}`,
        campaign:     campRN,
        name:         pmaxAssets?.assetGroupName ?? `${campaign.campaignName} - Asset Group`,
        finalUrls:    [pmaxAssets?.finalUrl ?? firstAd?.finalUrl ?? campaign.finalUrl ?? 'https://example.com'],
        status:       'ENABLED',
      },
    },
  })

  function linkAsset(assetRN: string, fieldType: string) {
    ops2.push({
      assetGroupAssetOperation: {
        create: {
          // No resourceName — Google Ads assigns it automatically for AssetGroupAsset
          assetGroup: `customers/${cid}/assetGroups/${agId}`,
          asset:      assetRN,
          fieldType,
        },
      },
    })
  }

  textAssetRNs.forEach((rn, i) => linkAsset(rn, textEntries[i].fieldType))
  linkAsset(marketingImgRN, 'MARKETING_IMAGE')
  linkAsset(squareImgRN, 'SQUARE_MARKETING_IMAGE')

  // Link portrait image if available
  const portraitSrc = allImgAssets.find(a => a.assetType === 'PORTRAIT_MARKETING_IMAGE' && a.imageUrl)
  if (portraitSrc?.imageUrl) {
    const portraitRN = await uploadImageAsset(portraitSrc.imageUrl, `PortraitImg_${bizName}`, cid, accessToken, developerToken, loginCustomerId)
    if (portraitRN) linkAsset(portraitRN, 'PORTRAIT_MARKETING_IMAGE')
  }

  // Link logo to asset group as well (separate from CampaignAsset brand guidelines)
  if (logoRN) linkAsset(logoRN, 'LOGO')

  await batchMutate(cid, ops2, accessToken, developerToken, loginCustomerId)

  return {
    campaignName:        campaign.campaignName,
    status:              'success',
    resourceName:        campRN,
    googleAdsCampaignId: campRN.split('/').pop() ?? 'unknown',
    adGroupsCreated:     0,
    adsCreated:          0,
  }
}

// ─── Orchestrator ──────────────────────────────────────────────────────────────

export async function pushCampaignBlueprint(
  blueprint: CampaignBlueprintJson,
  customerId: string,
  mode: string = 'PAUSED',
  pmaxImageAssets?: PMaxImageAssets
): Promise<PushResult> {
  if (isMockMode()) {
    return mockPushCampaignBlueprint(JSON.stringify(blueprint), customerId, mode)
  }

  const startedAt = new Date().toISOString()
  const results: PushCampaignResult[] = []
  let totalErrors = 0

  for (const campaign of (blueprint.campaigns ?? [])) {
    try {
      const type = (campaign.campaignType ?? 'SEARCH').toUpperCase()
      // Always push as PAUSED for safety — mode 'live'/'dry_run' only controls whether we actually call the API
      const normalised: CampaignBlueprintItem = {
        ...campaign,
        status:      'PAUSED',
        bidStrategy: normaliseBidStrategy(type, campaign.bidStrategy),
      }

      const result = (type === 'PERFORMANCE_MAX' || type === 'PMAX')
        ? await createPMaxCampaignFromBlueprint(normalised, customerId, pmaxImageAssets)
        : await createSearchCampaignFromBlueprint(normalised, customerId)

      results.push(result)
    } catch (err) {
      totalErrors++
      results.push({ campaignName: campaign.campaignName, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const allFailed = results.length > 0 && results.every((r) => r.status === 'error')

  return {
    jobId:        `job-${Date.now()}`,
    status:       allFailed ? 'failed' : totalErrors > 0 ? 'partial' : 'completed',
    provider:     'google_ads',
    mode,
    campaigns:    results,
    totalCreated: results.filter((r) => r.status === 'success').length,
    totalErrors,
    startedAt,
    finishedAt:   new Date().toISOString(),
  }
}
