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
    assetGroupResult?:     { resourceName: string }
    audienceResult?:       { resourceName: string }
  }>
}

// ─── GAQL helper + audience lookups ────────────────────────────────────────────

async function gaqlSearch(
  cid: string, query: string,
  accessToken: string, developerToken: string, loginCustomerId: string
): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/-/g, '')
  const res = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`, {
    method: 'POST', headers, body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`GAQL failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const chunks = await res.json() as Array<{ results?: Record<string, unknown>[] }>
  return chunks.flatMap(c => c.results ?? [])
}

// Map remarketing-list NAMES → user_list info (audiences in blueprints are
// human-readable names picked in the UI; the API needs resource names).
// Closed lists can't be targeted at all — carry eligibility so callers skip them.
interface UserListInfo { rn: string; closed: boolean; eligibleSearch: boolean; eligibleDisplay: boolean }

async function lookupUserLists(
  cid: string, names: string[],
  accessToken: string, developerToken: string, loginCustomerId: string
): Promise<Record<string, UserListInfo>> {
  if (names.length === 0) return {}
  const rows = await gaqlSearch(cid,
    `SELECT user_list.resource_name, user_list.name, user_list.membership_status, user_list.eligible_for_search, user_list.eligible_for_display FROM user_list LIMIT 500`,
    accessToken, developerToken, loginCustomerId) as { userList: { resourceName: string; name: string; membershipStatus?: string; eligibleForSearch?: boolean; eligibleForDisplay?: boolean } }[]
  const map: Record<string, UserListInfo> = {}
  const wanted = new Set(names.map(n => n.toLowerCase()))
  for (const r of rows) {
    if (wanted.has(r.userList.name.toLowerCase())) {
      map[r.userList.name] = {
        rn: r.userList.resourceName,
        closed: r.userList.membershipStatus === 'CLOSED',
        eligibleSearch: r.userList.eligibleForSearch !== false,
        eligibleDisplay: r.userList.eligibleForDisplay !== false,
      }
    }
  }
  return map
}

// Map In-Market/Affinity segment NAMES → user_interest resource names.
// Campaign Generator blueprints prefix names ("In-Market: Real Estate") — strip that
// before matching against the raw taxonomy names.
function normalizeSegmentName(n: string): string {
  return n.toLowerCase().replace(/^\s*(in[\s-]?market|affinity)\s*[:>\-–]\s*/i, '').trim()
}

async function lookupUserInterests(
  cid: string, names: string[],
  accessToken: string, developerToken: string, loginCustomerId: string
): Promise<Record<string, string>> {
  if (names.length === 0) return {}
  const rows = await gaqlSearch(cid,
    `SELECT user_interest.user_interest_id, user_interest.name FROM user_interest WHERE user_interest.taxonomy_type IN ('IN_MARKET','AFFINITY')`,
    accessToken, developerToken, loginCustomerId) as { userInterest: { userInterestId: string; name: string } }[]
  const map: Record<string, string> = {}
  // จับคู่ 2 ชั้น: ชื่อเต็ม แล้วค่อย segment สุดท้ายของ path — media plan เก็บเป็น path
  // ("Travel/Trips to Europe") แต่ taxonomy ใช้แค่ชื่อ ("Trips to Europe")
  const wanted = new Map(names.map(n => [normalizeSegmentName(n), n]))
  const wantedLast = new Map(names.map(n => [normalizeSegmentName(n).split('/').pop()!.trim(), n]))
  for (const r of rows) {
    const key = r.userInterest.name.toLowerCase()
    const original = wanted.get(key) ?? wantedLast.get(key)
    if (original && !map[original]) map[original] = `customers/${cid}/userInterests/${r.userInterest.userInterestId}`
  }
  return map
}

// Google Ads rejects URLs without a protocol ("The protocol is missing") — users
// often type "example.com". Normalize everywhere a URL reaches the API.
function ensureUrl(u?: string): string {
  const v = (u ?? '').trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// batchMutate + one retry on Google's transient "Multiple requests were attempting to
// modify the same resource" (CONCURRENT_MODIFICATION) error
async function batchMutateRetry(
  cid: string, ops: unknown[],
  accessToken: string, developerToken: string, loginCustomerId: string
): Promise<MutateResponse> {
  try {
    return await batchMutate(cid, ops, accessToken, developerToken, loginCustomerId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/Multiple requests|CONCURRENT_MODIFICATION|same resource/i.test(msg)) {
      await wait(4000)
      return await batchMutate(cid, ops, accessToken, developerToken, loginCustomerId)
    }
    throw e
  }
}

// Create a combined Audience resource from list/segment names (used by Demand Gen
// targeting and PMax signals). Returns the resource name, or null if nothing matched.
async function createCombinedAudience(
  cid: string, label: string, listNames: string[], interestNames: string[],
  accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ rn: string | null; warnings: string[] }> {
  const warnings: string[] = []
  const listMap = await lookupUserLists(cid, listNames, accessToken, developerToken, loginCustomerId)
  const interestMap = await lookupUserInterests(cid, interestNames, accessToken, developerToken, loginCustomerId)
  // warn only when a name matched NEITHER map (callers may pass the same name in both roles)
  for (const n of Array.from(new Set([...listNames, ...interestNames]))) {
    if (!listMap[n] && !interestMap[n]) warnings.push(`audience/segment "${n}" ไม่พบในบัญชี/taxonomy — ข้าม`)
    else if (listMap[n]?.closed) warnings.push(`list "${n}" ปิดรับสมาชิกแล้ว (closed) — target ไม่ได้ ข้าม`)
  }
  const segments = [
    ...Object.values(listMap).filter(l => !l.closed).map(l => ({ userList: { userList: l.rn } })),
    ...Object.values(interestMap).map(rn => ({ userInterest: { userInterestCategory: rn } })),
  ]
  if (segments.length === 0) return { rn: null, warnings }
  const res = await batchMutateRetry(cid, [{
    audienceOperation: { create: {
      name: `${label.slice(0, 50)} - ${Date.now()}`,
      description: 'Auto-created by Mercy Launch Today',
      dimensions: [{ audienceSegments: { segments } }],
    } },
  }], accessToken, developerToken, loginCustomerId)
  const rn = res.mutateOperationResponses?.find(r => r.audienceResult)?.audienceResult?.resourceName ?? null
  return { rn, warnings }
}

// Attach audience criteria to an ad group, per campaign type:
// search     → RLSA: user lists only, direct criteria
// display    → user lists + user interests, direct criteria
// demand_gen → ad groups are audience-grouped: needs ONE combined Audience resource
async function attachAdGroupAudiences(
  cid: string, adGroupRN: string, names: string[], mode: 'search' | 'display' | 'demand_gen',
  accessToken: string, developerToken: string, loginCustomerId: string
): Promise<string[]> {
  const warnings: string[] = []
  if (!adGroupRN || names.length === 0) return warnings

  if (mode === 'demand_gen') {
    try {
      const { rn, warnings: w } = await createCombinedAudience(
        cid, `DG Audience`, names, names, accessToken, developerToken, loginCustomerId)
      warnings.push(...w)
      if (rn) {
        await batchMutateRetry(cid, [{ adGroupCriterionOperation: { create: {
          adGroup: adGroupRN, status: 'ENABLED', audience: { audience: rn },
        } } }], accessToken, developerToken, loginCustomerId)
      }
    } catch (e) {
      warnings.push(`attach audience ล้มเหลว: ${e instanceof Error ? e.message.slice(0, 150) : ''}`)
    }
    return warnings
  }

  const listMap = await lookupUserLists(cid, names, accessToken, developerToken, loginCustomerId)
  const interestMap = mode === 'search' ? {} : await lookupUserInterests(cid, names, accessToken, developerToken, loginCustomerId)
  const ops: { op: unknown; name: string }[] = []
  for (const name of names) {
    const list = listMap[name]
    if (list) {
      // Closed / ineligible lists make Google reject the WHOLE batch — skip them upfront
      if (list.closed) { warnings.push(`list "${name}" ปิดรับสมาชิกแล้ว (closed) — target ไม่ได้ ข้าม`); continue }
      if (mode === 'search' && !list.eligibleSearch) { warnings.push(`list "${name}" ใช้กับ Search ไม่ได้ — ข้าม`); continue }
      if (mode !== 'search' && !list.eligibleDisplay) { warnings.push(`list "${name}" ใช้กับ Display ไม่ได้ — ข้าม`); continue }
      ops.push({ name, op: { adGroupCriterionOperation: { create: {
        adGroup: adGroupRN, status: 'ENABLED', userList: { userList: list.rn },
      } } } })
    } else if (interestMap[name]) {
      ops.push({ name, op: { adGroupCriterionOperation: { create: {
        adGroup: adGroupRN, status: 'ENABLED', userInterest: { userInterestCategory: interestMap[name] },
      } } } })
    } else {
      warnings.push(`audience "${name}" ไม่พบในบัญชี/taxonomy — ข้าม`)
    }
  }
  if (ops.length > 0) {
    try {
      await batchMutateRetry(cid, ops.map(o => o.op), accessToken, developerToken, loginCustomerId)
    } catch {
      // batch is atomic — one bad criterion kills all. Retry one-by-one so the rest attach.
      for (const { op, name } of ops) {
        try {
          await batchMutate(cid, [op], accessToken, developerToken, loginCustomerId)
        } catch (e) {
          warnings.push(`audience "${name}" attach ไม่ได้: ${e instanceof Error ? e.message.slice(0, 100) : ''}`)
        }
      }
    }
  }
  return warnings
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
// Google บังคับ aspect ratio ต่อ slot เป๊ะ — spec ต่อ assetType สำหรับ force-crop ฝั่ง server
const IMAGE_SPECS: Record<string, { w: number; h: number; png?: boolean }> = {
  LOGO:                     { w: 1200, h: 1200, png: true },
  SQUARE_LOGO:              { w: 1200, h: 1200, png: true },
  LANDSCAPE_LOGO:           { w: 1200, h: 300,  png: true },
  MARKETING_IMAGE:          { w: 1200, h: 628 },
  SQUARE_MARKETING_IMAGE:   { w: 1200, h: 1200 },
  PORTRAIT_MARKETING_IMAGE: { w: 960,  h: 1200 },
}

// Force-crop ให้ตรง spec เสมอเมื่อ ratio ไม่ตรง (center-cover) — กัน Google reject
// "aspect ratio does not match" ไม่ว่ารูปจะมาจาก upload เก่า/AI/URL ภายนอก
async function forceCropToSpec(buf: Buffer, spec?: { w: number; h: number; png?: boolean }): Promise<Buffer> {
  if (!spec) return buf
  try {
    const sharp = (await import('sharp')).default
    const img = sharp(buf).rotate()   // เคารพ EXIF orientation ก่อนวัดขนาด
    const meta = await img.metadata()
    const w = meta.width ?? 0, h = meta.height ?? 0
    if (!w || !h) return buf
    const ratioOk = Math.abs(w / h - spec.w / spec.h) < 0.015
    const bigEnough = w >= spec.w * 0.42 && h >= spec.h * 0.42   // เกินขั้นต่ำของ Google (เช่น logo 512, landscape 600×314)
    if (ratioOk && bigEnough) return buf
    const out = img.resize(spec.w, spec.h, { fit: 'cover', position: 'centre' })
    return spec.png ? await out.png().toBuffer() : await out.jpeg({ quality: 90 }).toBuffer()
  } catch (e) {
    console.error('[forceCropToSpec] crop failed — using original:', e)
    return buf
  }
}

async function uploadImageAsset(
  imageUrl: string,
  name: string,
  cid: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  spec?: { w: number; h: number; png?: boolean }
): Promise<string | null> {
  try {
    let imageBuf: Buffer | null = null
    if (imageUrl.startsWith('data:')) {
      // base64 data URL — extract the base64 part
      const b64 = imageUrl.split(',')[1] ?? ''
      imageBuf = b64 ? Buffer.from(b64, 'base64') : null
    } else if (imageUrl.startsWith('/uploads/')) {
      // Local upload — read straight from disk. Fetching over HTTP hits the auth
      // middleware (no session cookie server-side) and returns the sign-in page
      // instead of image bytes, which surfaced as "ขาดรูป" on every push.
      const { readFile } = await import('fs/promises')
      const { join, normalize } = await import('path')
      const safePath = normalize(imageUrl).replace(/^(\.\.[/\\])+/, '')
      imageBuf = await readFile(join(process.cwd(), 'public', safePath))
    } else {
      // External URL
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3010'
      const fetchUrl = imageUrl.startsWith('/') ? `${baseUrl}${imageUrl}` : imageUrl
      const res = await fetch(fetchUrl)
      if (!res.ok) return null
      // Never forward non-image bytes (e.g. an HTML error/login page) to Google
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.startsWith('image/')) {
        console.error(`[uploadImageAsset] ${fetchUrl} returned ${ct} — not an image`)
        return null
      }
      imageBuf = Buffer.from(await res.arrayBuffer())
    }
    if (!imageBuf || imageBuf.length === 0) return null
    const imageData = (await forceCropToSpec(imageBuf, spec)).toString('base64')

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
  const warnings: string[] = []

  // DEMAND_GEN blueprints arrive asset-based (adGroups=[], content in assetGroups) —
  // synthesize a real ad group from the first asset group so ads actually get created.
  const topType = (campaign.campaignType ?? 'SEARCH').toUpperCase()
  if (topType === 'DEMAND_GEN' && campaign.adGroups.length === 0 && campaign.assetGroups?.[0]) {
    const ag = campaign.assetGroups[0]
    campaign = { ...campaign, adGroups: [{
      adGroupName: ag.assetGroupName || 'Ad Group 1',
      defaultBid: 0, keywords: [], matchTypes: [],
      ads: [{
        headline1: ag.headlines[0] ?? '', headline2: ag.headlines[1] ?? '', headline3: ag.headlines[2] ?? '',
        description1: ag.descriptions[0] ?? '', description2: ag.descriptions[1] ?? '',
        finalUrl: ag.finalUrl || campaign.finalUrl || '',
        pmax: ag,   // carry the full asset set for the Demand Gen ad builder below
      }],
      audiences: [
        ...(ag.audienceSignals?.remarketing ?? []),
        ...(ag.audienceSignals?.inMarket ?? []),
      ],
    }] }
  }

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
      const isDemandGen = campType === 'DEMAND_GEN'
      const adGroupType = campType === 'DISPLAY' ? 'DISPLAY_STANDARD' : isDemandGen ? undefined : 'SEARCH_STANDARD'
      ops.push({
        adGroupOperation: {
          create: {
            resourceName: `customers/${customerId}/adGroups/${agId}`,
            name: adGroup.adGroupName,
            campaign: `customers/${customerId}/campaigns/${campId}`,
            status: 'ENABLED',
            // Demand Gen ad groups take no explicit type and no CPC bid (campaign-level bidding)
            ...(adGroupType ? { type: adGroupType } : {}),
            ...(isDemandGen ? {} : { cpcBidMicros: String(Math.round((adGroup.defaultBid || 5) * 1_000_000)) }),
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

      // Upload every image of one type and return asset resource names
      const uploadTyped = async (imgs: { assetType: string; imageUrl?: string }[], type: string, cap: number, label: string): Promise<string[]> => {
        const srcs = imgs.filter(a => a.assetType === type && a.imageUrl).slice(0, cap)
        const rns: string[] = []
        for (let i = 0; i < srcs.length; i++) {
          const rn = await uploadImageAsset(srcs[i].imageUrl!, `${label}${i + 1}_${ts}`, customerId, accessToken, developerToken, loginCustomerId, IMAGE_SPECS[type])
          if (rn) rns.push(rn)
        }
        return rns
      }

      if (campType === 'DISPLAY') {
        // Responsive Display Ad — upload the blueprint's images, then create the ad
        // in the same batch as campaign + ad group (asset RNs are already real).
        const disp = adGroup.ads.find(a => a.display)?.display
        const imgs = (disp?.imageAssets ?? []) as { assetType: string; imageUrl?: string }[]
        const marketing = await uploadTyped(imgs, 'MARKETING_IMAGE', 15, 'RdaLandscape')
        const square    = await uploadTyped(imgs, 'SQUARE_MARKETING_IMAGE', 15, 'RdaSquare')
        const logos     = [
          ...await uploadTyped(imgs, 'LOGO', 5, 'RdaLogo'),
          ...await uploadTyped(imgs, 'SQUARE_LOGO', 5, 'RdaSqLogo'),
        ]
        const lh              = (disp?.longHeadlines ?? []).filter(Boolean)[0]
        const rdaHeadlines    = (disp?.headlines ?? []).filter(h => h && h.length <= 30).slice(0, 5)
        const rdaDescriptions = (disp?.descriptions ?? []).filter(d => d && d.length <= 90).slice(0, 5)
        const rdaBizName      = (disp?.businessName ?? '').slice(0, 25)
        const rdaUrl = disp?.finalUrl || campaign.finalUrl || ''
        if (disp && rdaUrl && marketing.length > 0 && square.length > 0 && lh && rdaBizName && rdaHeadlines.length > 0 && rdaDescriptions.length > 0) {
          ops.push({
            adGroupAdOperation: {
              create: {
                adGroup: `customers/${customerId}/adGroups/${agId}`,
                status: 'ENABLED',
                ad: {
                  finalUrls: [ensureUrl(rdaUrl)],
                  responsiveDisplayAd: {
                    headlines:    rdaHeadlines.map((text) => ({ text })),
                    longHeadline: { text: lh.slice(0, 90) },
                    descriptions: rdaDescriptions.map((text) => ({ text })),
                    businessName: rdaBizName,
                    marketingImages:       marketing.map((asset) => ({ asset })),
                    squareMarketingImages: square.map((asset) => ({ asset })),
                    // our logo uploads are 1:1 — RDA's logoImages field expects 4:1,
                    // square logos go in squareLogoImages
                    ...(logos.length > 0 ? { squareLogoImages: logos.map((asset) => ({ asset })) } : {}),
                  },
                },
              },
            },
          })
          totalAds++
        } else {
          warnings.push(`${campName}: สร้าง Responsive Display Ad ไม่ได้ — ขาด ${[
            !rdaUrl && 'Final URL',
            marketing.length === 0 && 'รูป Landscape', square.length === 0 && 'รูป Square',
            !lh && 'Long Headline', !rdaBizName && 'Business Name',
            rdaHeadlines.length === 0 && 'Headlines', rdaDescriptions.length === 0 && 'Descriptions',
          ].filter(Boolean).join(', ')}`)
        }
      } else if (campType === 'DEMAND_GEN') {
        // Demand Gen multi-asset image ad — logo + business name are Google-required.
        // Content arrives as ad.pmax (Launch Today's asset-based shape) OR ad.display
        // (Campaign Generator's displayAd shape) — accept both.
        const dispSrc = adGroup.ads.find(a => a.display)?.display
        const dg = adGroup.ads.find(a => a.pmax)?.pmax ?? (dispSrc ? {
          assetGroupName: adGroup.adGroupName,
          headlines:      dispSrc.headlines ?? [],
          longHeadlines:  dispSrc.longHeadlines ?? [],
          descriptions:   dispSrc.descriptions ?? [],
          businessName:   dispSrc.businessName ?? '',
          finalUrl:       dispSrc.finalUrl ?? '',
          imageAssets:    (dispSrc.imageAssets ?? []) as NonNullable<typeof campaign.assetGroups>[0]['imageAssets'],
        } : undefined)
        const imgs = (dg?.imageAssets ?? []) as { assetType: string; imageUrl?: string }[]
        const marketing = await uploadTyped(imgs, 'MARKETING_IMAGE', 15, 'DgLandscape')
        const square    = await uploadTyped(imgs, 'SQUARE_MARKETING_IMAGE', 15, 'DgSquare')
        const portraits = await uploadTyped(imgs, 'PORTRAIT_MARKETING_IMAGE', 15, 'DgPortrait')
        const logos     = [
          ...await uploadTyped(imgs, 'LOGO', 5, 'DgLogo'),
          ...await uploadTyped(imgs, 'SQUARE_LOGO', 5, 'DgSqLogo'),
        ]
        const dgHeadlines    = (dg?.headlines ?? []).filter(h => h && h.length <= 40).slice(0, 5)
        const dgDescriptions = (dg?.descriptions ?? []).filter(d => d && d.length <= 90).slice(0, 5)
        const dgBizName      = (dg?.businessName ?? '').slice(0, 25)
        const dgUrl = dg?.finalUrl || campaign.finalUrl || ''
        if (dg && dgUrl && (marketing.length > 0 || square.length > 0) && logos.length > 0 && dgBizName && dgHeadlines.length > 0 && dgDescriptions.length > 0) {
          ops.push({
            adGroupAdOperation: {
              create: {
                adGroup: `customers/${customerId}/adGroups/${agId}`,
                status: 'ENABLED',
                ad: {
                  finalUrls: [ensureUrl(dgUrl)],
                  demandGenMultiAssetAd: {
                    ...(marketing.length > 0 ? { marketingImages: marketing.map((asset) => ({ asset })) } : {}),
                    ...(square.length > 0 ? { squareMarketingImages: square.map((asset) => ({ asset })) } : {}),
                    ...(portraits.length > 0 ? { portraitMarketingImages: portraits.map((asset) => ({ asset })) } : {}),
                    logoImages:   logos.map((asset) => ({ asset })),
                    headlines:    dgHeadlines.map((text) => ({ text })),
                    descriptions: dgDescriptions.map((text) => ({ text })),
                    businessName: dgBizName,
                  },
                },
              },
            },
          })
          totalAds++
        } else {
          warnings.push(`${campName}: สร้าง Demand Gen ad ไม่ได้ — ขาด ${[
            !dgUrl && 'Final URL',
            (marketing.length === 0 && square.length === 0) && 'รูป Landscape/Square',
            logos.length === 0 && 'Logo (Google บังคับ)', !dgBizName && 'Business Name',
            dgHeadlines.length === 0 && 'Headlines', dgDescriptions.length === 0 && 'Descriptions',
          ].filter(Boolean).join(', ')}`)
        }
      } else if (allH.length >= 3 && allD.length >= 2) {
        // Search: Responsive Search Ad
        const firstAd = adGroup.ads[0]
        const path1 = (firstAd?.rsa?.displayPath1 ?? '').slice(0, 15)
        const path2 = (firstAd?.rsa?.displayPath2 ?? '').slice(0, 15)
        if (!finalUrl) {
          warnings.push(`${campName}: สร้าง RSA ไม่ได้ — ขาด Final URL (จะไม่สร้าง ad ชี้ example.com ให้เงียบๆ)`)
        } else {
        ops.push({
          adGroupAdOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/${agId}`,
              status: 'ENABLED',
              ad: {
                finalUrls: [ensureUrl(finalUrl)],
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
      }
      totalAgs++
    }

    const result = await batchMutate(customerId, ops, accessToken, developerToken, loginCustomerId)

    const campRN =
      result.mutateOperationResponses?.find((r) => r.campaignResult)?.campaignResult?.resourceName ?? ''
    const adGroupRN =
      result.mutateOperationResponses?.find((r) => r.adGroupResult)?.adGroupResult?.resourceName ?? ''
    if (agIdx === 0) {
      firstResourceName = campRN
      firstCampaignId   = campRN.split('/').pop() ?? ''
    }

    // ── Audiences: attach user lists (+ in-market/affinity for Display) ─────
    // SEARCH = RLSA mode → user lists only. Names are resolved to resource IDs here.
    const audienceNames = Array.from(new Set(adGroup?.audiences ?? []))
    if (audienceNames.length > 0 && adGroupRN) {
      const mode = campType === 'SEARCH' ? 'search' : campType === 'DEMAND_GEN' ? 'demand_gen' : 'display'
      const w = await attachAdGroupAudiences(
        customerId, adGroupRN, audienceNames, mode,
        accessToken, developerToken, loginCustomerId)
      warnings.push(...w.map(x => `${campName}: ${x}`))
    }

    // ── Sitelinks (separate call — asset-first pattern) ─────────────────────
    // Empty finalUrl makes Google reject the whole batch → fall back to the campaign URL
    const sitelinks = (campaign.sitelinks ?? [])
      .map(sl => ({ ...sl, finalUrl: sl.finalUrl || campaign.finalUrl || '' }))
      .filter(sl => sl.text?.trim() && sl.finalUrl)
    if (sitelinks.length > 0 && campRN) {
      try {
        await pushSitelinks(customerId, campRN, sitelinks, accessToken, developerToken, loginCustomerId)
      } catch (e) {
        warnings.push(`${campName}: sitelinks ไม่เข้า — ${e instanceof Error ? e.message.slice(0, 150) : 'unknown'}`)
      }
    }

    // ── Callouts (separate call) ─────────────────────────────────────────────
    const callouts = campaign.callouts ?? []
    if (callouts.length > 0 && campRN) {
      try {
        await pushCallouts(customerId, campRN, callouts, accessToken, developerToken, loginCustomerId)
      } catch (e) {
        warnings.push(`${campName}: callouts ไม่เข้า — ${e instanceof Error ? e.message.slice(0, 150) : 'unknown'}`)
      }
    }

    // ── Structured Snippets (separate call) ──────────────────────────────────
    const snippets = campaign.structuredSnippets ?? []
    if (snippets.length > 0 && campRN) {
      try {
        await pushStructuredSnippets(customerId, campRN, snippets, accessToken, developerToken, loginCustomerId)
      } catch (e) {
        warnings.push(`${campName}: structured snippets ไม่เข้า — ${e instanceof Error ? e.message.slice(0, 150) : 'unknown'}`)
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
    ...(warnings.length > 0 ? { warnings } : {}),
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
            // finalUrls is an Asset-level field — putting it inside sitelinkAsset makes
            // the API reject the whole batch with "Invalid JSON payload"
            finalUrls: [ensureUrl(sl.finalUrl)],
            sitelinkAsset: {
              linkText:     sl.text.slice(0, 25),
              description1: (sl.description1 ?? '').slice(0, 35),
              description2: (sl.description2 ?? '').slice(0, 35),
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
    const fromAdGroups = (campaign.adGroups ?? []).flatMap(ag => ag.ads ?? []).flatMap(ad => ([
      ...((ad.pmax?.imageAssets ?? []) as typeof fromAssetGroups),
      ...((ad.display?.imageAssets ?? []) as typeof fromAssetGroups),
    ]))
    const allBpAssets = [...fromAssetGroups, ...fromAdGroups]
    // ต้องเช็ค imageUrl ใน find ด้วย — editor เก็บ slot ว่าง (assetType แต่ไม่มีรูป) ปนมา
    // ถ้าเจอ slot ว่างก่อนตัวจริงจะวินิจฉัยผิดเป็น "ขาดรูป Logo" ทั้งที่อัปโหลดแล้ว
    const logoAsset = allBpAssets.find(a => (a.assetType === 'LOGO' || a.assetType === 'SQUARE_LOGO') && a.imageUrl)
    if (logoAsset?.imageUrl) {
      logoRN = await uploadImageAsset(logoAsset.imageUrl, `Logo_${bizName}`, cid, accessToken, developerToken, loginCustomerId, IMAGE_SPECS.LOGO)
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
  // ห้ามมีข้อความซ้ำใน batch — Google reject ทั้งชุด "Duplicate assets across mutates"
  const uniq = (arr: string[]) => Array.from(new Set(arr.map(t => t.trim()).filter(Boolean)))
  const textEntries: TextAssetEntry[] = [
    ...uniq(headlines).slice(0, 15).map(h => ({ text: h, fieldType: 'HEADLINE' })),
    ...uniq(longHeadlines).slice(0, 5).map(h => ({ text: h, fieldType: 'LONG_HEADLINE' })),
    ...uniq(descriptions).slice(0, 5).map(d => ({ text: d, fieldType: 'DESCRIPTION' })),
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
    ...(campaign.adGroups ?? []).flatMap(ag => ag.ads ?? []).flatMap(ad => ([
      ...((ad.pmax?.imageAssets ?? []) as { assetType: string; imageUrl?: string }[]),
      ...((ad.display?.imageAssets ?? []) as { assetType: string; imageUrl?: string }[]),
    ])),
  ]

  // Upload EVERY image the blueprint provides — Google allows up to 15 per shape and
  // more images gives the algorithm more combinations to optimize with.
  async function uploadAllOfType(type: string, cap: number, label: string): Promise<string[]> {
    const srcs = allImgAssets.filter(a => a.assetType === type && a.imageUrl).slice(0, cap)
    const rns: string[] = []
    for (let i = 0; i < srcs.length; i++) {
      const rn = await uploadImageAsset(srcs[i].imageUrl!, `${label}${i + 1}_${bizName}`, cid, accessToken, developerToken, loginCustomerId, IMAGE_SPECS[type])
      if (rn) rns.push(rn)
    }
    return rns
  }

  const marketingRNs = imageAssets?.marketingImageResourceName
    ? [imageAssets.marketingImageResourceName]
    : await uploadAllOfType('MARKETING_IMAGE', 15, 'LandscapeImg')
  const squareRNs = imageAssets?.squareMarketingImageResourceName
    ? [imageAssets.squareMarketingImageResourceName]
    : await uploadAllOfType('SQUARE_MARKETING_IMAGE', 15, 'SquareImg')
  const portraitRNs = await uploadAllOfType('PORTRAIT_MARKETING_IMAGE', 15, 'PortraitImg')

  // Google Ads requires at least 1 landscape + 1 square image for a valid asset group
  if (marketingRNs.length === 0 || squareRNs.length === 0) {
    const missing = [marketingRNs.length === 0 && 'Landscape image (1200×628)', squareRNs.length === 0 && 'Square image (1200×1200)'].filter(Boolean).join(', ')
    throw new Error(`PMax "${campaign.campaignName}" ขาดรูปภาพที่จำเป็น: ${missing} — กลับไปอัปโหลดใน Ad Copy step ก่อน push`)
  }

  const pmaxFinalUrl = pmaxAssets?.finalUrl ?? firstAd?.finalUrl ?? campaign.finalUrl ?? ''
  if (!pmaxFinalUrl) {
    throw new Error(`PMax "${campaign.campaignName}" ขาด Final URL — ใส่ landing page ก่อน push`)
  }

  const ops2: unknown[] = []

  ops2.push({
    assetGroupOperation: {
      create: {
        resourceName: `customers/${cid}/assetGroups/${agId}`,
        campaign:     campRN,
        name:         pmaxAssets?.assetGroupName ?? `${campaign.campaignName} - Asset Group`,
        finalUrls:    [ensureUrl(pmaxFinalUrl)],
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
  marketingRNs.forEach(rn => linkAsset(rn, 'MARKETING_IMAGE'))
  squareRNs.forEach(rn => linkAsset(rn, 'SQUARE_MARKETING_IMAGE'))
  portraitRNs.forEach(rn => linkAsset(rn, 'PORTRAIT_MARKETING_IMAGE'))

  // NOTE: do NOT link the logo at asset-group level — Brand Guidelines campaigns
  // (default for new PMax) require business name + logo as CampaignAssets ONLY;
  // an asset-group LOGO link makes the whole batch fail with
  // "Brand Guidelines is enabled... must link business name and logo assets as CampaignAssets"

  const agResult = await batchMutate(cid, ops2, accessToken, developerToken, loginCustomerId)
  const assetGroupRN = agResult.mutateOperationResponses?.find(r => r.assetGroupResult)?.assetGroupResult?.resourceName
    ?? `customers/${cid}/assetGroups/${agId}`

  // ── Audience Signals — one batch: search themes + combined Audience resource ──
  const warnings: string[] = []
  const sig = pmaxAssets?.audienceSignals
  if (sig) {
    // search theme เข้มกว่า keyword: เอาเฉพาะตัวอักษร/ตัวเลข/ช่องว่าง (Google reject
    // "disallowed characters" กับ symbol หลายตัวที่ keyword ยอมรับ)
    const cleanTheme = (t: string) => t.replace(/[^a-zA-Z0-9\u0E00-\u0E7F\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    const themes = Array.from(new Set([
      ...(sig.searchThemes ?? []),
      ...(sig.customIntent ?? []),
    ].map(cleanTheme).filter(t => t.length >= 2))).slice(0, 25)

    // Create the combined Audience FIRST (separate resource, no asset-group contention)
    let audienceRN: string | null = null
    const listNames = sig.remarketing ?? []
    const interestNames = sig.inMarket ?? []
    if (listNames.length > 0 || interestNames.length > 0) {
      try {
        const r = await createCombinedAudience(
          cid, `Signal - ${campaign.campaignName.slice(0, 40)}`, listNames, interestNames,
          accessToken, developerToken, loginCustomerId)
        audienceRN = r.rn
        warnings.push(...r.warnings)
      } catch (e) {
        warnings.push(`สร้าง Audience resource ไม่ได้ — ${e instanceof Error ? e.message.slice(0, 150) : ''}`)
      }
    }

    // Then attach every signal in ONE mutate (retried on concurrent-modification)
    const sigOps: unknown[] = [
      ...themes.map(text => ({ assetGroupSignalOperation: { create: { assetGroup: assetGroupRN, searchTheme: { text } } } })),
      ...(audienceRN ? [{ assetGroupSignalOperation: { create: { assetGroup: assetGroupRN, audience: { audience: audienceRN } } } }] : []),
    ]
    if (sigOps.length > 0) {
      try {
        await wait(2000) // let the asset-group creation settle before mutating it again
        await batchMutateRetry(cid, sigOps, accessToken, developerToken, loginCustomerId)
      } catch (e) {
        warnings.push(`audience signals ไม่เข้า — ${e instanceof Error ? e.message.slice(0, 150) : ''}`)
      }
    }
  }

  // Asset extensions — PMax attaches sitelinks/callouts/snippets at campaign level too
  const pmaxSitelinks = (campaign.sitelinks ?? [])
    .map(sl => ({ ...sl, finalUrl: sl.finalUrl || campaign.finalUrl || '' }))
    .filter(sl => sl.text?.trim() && sl.finalUrl)
  if (pmaxSitelinks.length > 0 && campRN) {
    try { await pushSitelinks(cid, campRN, pmaxSitelinks, accessToken, developerToken, loginCustomerId) }
    catch (e) { warnings.push(`sitelinks ไม่เข้า — ${e instanceof Error ? e.message.slice(0, 120) : ''}`) }
  }
  if ((campaign.callouts ?? []).length > 0 && campRN) {
    try { await pushCallouts(cid, campRN, campaign.callouts!, accessToken, developerToken, loginCustomerId) }
    catch (e) { warnings.push(`callouts ไม่เข้า — ${e instanceof Error ? e.message.slice(0, 120) : ''}`) }
  }
  if ((campaign.structuredSnippets ?? []).length > 0 && campRN) {
    try { await pushStructuredSnippets(cid, campRN, campaign.structuredSnippets!, accessToken, developerToken, loginCustomerId) }
    catch (e) { warnings.push(`snippets ไม่เข้า — ${e instanceof Error ? e.message.slice(0, 120) : ''}`) }
  }

  return {
    campaignName:        campaign.campaignName,
    status:              'success',
    resourceName:        campRN,
    googleAdsCampaignId: campRN.split('/').pop() ?? 'unknown',
    adGroupsCreated:     0,
    adsCreated:          1,   // the asset group IS the PMax ad
    ...(warnings.length > 0 ? { warnings } : {}),
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
