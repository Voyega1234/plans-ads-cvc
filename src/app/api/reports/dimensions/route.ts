import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccessToken } from '@/lib/google-ads/auth'

// ── In-memory cache (5-min TTL per customer+dateRange combo) ─────────────────
interface CacheEntry { data: unknown; expiresAt: number }
const dimCache = new Map<string, CacheEntry>()
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

function cacheGet(key: string): unknown | null {
  const entry = dimCache.get(key)
  if (!entry || Date.now() > entry.expiresAt) { dimCache.delete(key); return null }
  return entry.data
}
function cacheSet(key: string, data: unknown) {
  dimCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL })
}

// ── Shared Google Ads query helper ────────────────────────────────────────────

async function gadsQuery(customerId: string, query: string, token: string): Promise<unknown[]> {
  const devToken        = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? ''
  const cid = customerId.replace(/-/g, '')

  const headers: Record<string, string> = {
    Authorization:     `Bearer ${token}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/-/g, '')

  const res = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query: query.trim() }), signal: AbortSignal.timeout(15000) }
  )
  if (!res.ok) {
    console.error(`[dimensions] ${res.status}`, await res.text().catch(() => ''))
    return []
  }
  const data = await res.json() as { results?: unknown[] }
  return data.results ?? []
}

// ── Real GAQL queries ─────────────────────────────────────────────────────────

async function realAudiences(customerId: string, dateRange: string, token: string) {
  const rows = await gadsQuery(customerId, `
    SELECT
      user_list.name,
      user_list.type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.cost_per_conversion
    FROM user_list
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `, token) as Array<{
    userList: { name: string; type: string }
    metrics: { impressions: string; clicks: string; costMicros: string; conversions: string; ctr: string; averageCpc: string; costPerConversion: string }
  }>

  return rows.map((r) => {
    const cost = (Number(r.metrics.costMicros) || 0) / 1e6
    const conv = Number(r.metrics.conversions) || 0
    return {
      audienceName: r.userList.name,
      type:         r.userList.type ?? 'UNKNOWN',
      impressions:  Number(r.metrics.impressions) || 0,
      clicks:       Number(r.metrics.clicks) || 0,
      cost,
      conversions:  conv,
      ctr:          (Number(r.metrics.ctr) || 0) * 100,
      cpc:          (Number(r.metrics.averageCpc) || 0) / 1e6,
      cpa:          conv > 0 ? cost / conv : 0,
    }
  })
}

async function realKeywords(customerId: string, dateRange: string, token: string) {
  const rows = await gadsQuery(customerId, `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.quality_info.quality_score,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.cost_per_conversion
    FROM keyword_view
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `, token) as Array<{
    adGroupCriterion: { keyword: { text: string; matchType: string }; qualityInfo?: { qualityScore?: number } }
    metrics: { impressions: string; clicks: string; costMicros: string; conversions: string; ctr: string; averageCpc: string; costPerConversion: string }
  }>
  return rows.map((r) => {
    const cost = (Number(r.metrics.costMicros) || 0) / 1e6
    const conv = Number(r.metrics.conversions) || 0
    return {
      keyword:      r.adGroupCriterion.keyword.text,
      matchType:    r.adGroupCriterion.keyword.matchType,
      qualityScore: r.adGroupCriterion.qualityInfo?.qualityScore ?? null,
      impressions:  Number(r.metrics.impressions) || 0,
      clicks:       Number(r.metrics.clicks) || 0,
      cost,
      conversions:  conv,
      ctr:          (Number(r.metrics.ctr) || 0) * 100,
      cpc:          (Number(r.metrics.averageCpc) || 0) / 1e6,
      cpa:          conv > 0 ? cost / conv : 0,
    }
  })
}

// geo_target_constant resource name → human-readable name
// e.g. "geoTargetConstants/1011960" → lookup canonical_name from geo_target_constant resource
async function realLocations(customerId: string, dateRange: string, token: string) {
  // Use campaign_criterion to get geo targets with canonical names
  const rows = await gadsQuery(customerId, `
    SELECT
      geographic_view.country_criterion_id,
      geographic_view.location_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.cost_per_conversion,
      segments.geo_target_region
    FROM geographic_view
    WHERE segments.date DURING ${dateRange}
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `, token) as Array<{
    geographicView: { locationType: string; countryCriterionId?: string }
    metrics: { impressions: string; clicks: string; costMicros: string; conversions: string; ctr: string; averageCpc: string; costPerConversion: string }
    segments: { geoTargetRegion?: string }
  }>

  if (!rows.length) return []

  // Aggregate by region resource name
  const byRegion: Record<string, { name: string; impressions: number; clicks: number; cost: number; conversions: number }> = {}
  for (const r of rows) {
    const regionKey = r.segments.geoTargetRegion ?? r.geographicView.locationType ?? 'Unknown'
    if (!byRegion[regionKey]) byRegion[regionKey] = { name: regionKey, impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    byRegion[regionKey].impressions += Number(r.metrics.impressions) || 0
    byRegion[regionKey].clicks      += Number(r.metrics.clicks) || 0
    byRegion[regionKey].cost        += (Number(r.metrics.costMicros) || 0) / 1e6
    byRegion[regionKey].conversions += Number(r.metrics.conversions) || 0
  }

  // Resolve resource names like "geoTargetConstants/1011960" → canonical name
  // Fire this query only if needed, it runs in parallel with the caller's other queries
  const resourceKeys = Object.keys(byRegion).filter((k) => k.startsWith('geoTargetConstants/'))
  if (resourceKeys.length > 0) {
    const geoRows = await gadsQuery(customerId, `
      SELECT
        geo_target_constant.resource_name,
        geo_target_constant.canonical_name,
        geo_target_constant.name
      FROM geo_target_constant
      WHERE geo_target_constant.resource_name IN (${resourceKeys.map((k) => `'${k}'`).join(', ')})
    `, token) as Array<{
      geoTargetConstant: { resourceName: string; canonicalName?: string; name?: string }
    }>

    for (const geo of geoRows) {
      const rn = geo.geoTargetConstant.resourceName
      if (byRegion[rn]) byRegion[rn].name = geo.geoTargetConstant.canonicalName ?? geo.geoTargetConstant.name ?? rn
    }
    for (const k of resourceKeys) {
      if (byRegion[k]?.name === k) byRegion[k].name = `Location #${k.replace('geoTargetConstants/', '')}`
    }
  }

  return Object.values(byRegion)
    .sort((a, b) => b.cost - a.cost)
    .map((m) => ({
      location:    m.name,
      impressions: m.impressions,
      clicks:      m.clicks,
      cost:        m.cost,
      conversions: m.conversions,
      ctr:         m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
      cpc:         m.clicks > 0 ? m.cost / m.clicks : 0,
      cpa:         m.conversions > 0 ? m.cost / m.conversions : 0,
    }))
}

async function realDevices(customerId: string, dateRange: string, token: string) {
  const rows = await gadsQuery(customerId, `
    SELECT
      segments.device,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `, token) as Array<{
    segments: { device: string }
    metrics: { impressions: string; clicks: string; costMicros: string; conversions: string; ctr: string; averageCpc: string; costPerConversion: string }
  }>
  const byDevice: Record<string, { impressions: number; clicks: number; cost: number; conversions: number }> = {}
  for (const r of rows) {
    const d = r.segments.device
    if (!byDevice[d]) byDevice[d] = { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    byDevice[d].impressions += Number(r.metrics.impressions) || 0
    byDevice[d].clicks      += Number(r.metrics.clicks) || 0
    byDevice[d].cost        += (Number(r.metrics.costMicros) || 0) / 1e6
    byDevice[d].conversions += Number(r.metrics.conversions) || 0
  }
  return Object.entries(byDevice).map(([device, m]) => ({
    device,
    ...m,
    ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
    cpc: m.clicks > 0 ? m.cost / m.clicks : 0,
    cpa: m.conversions > 0 ? m.cost / m.conversions : 0,
  }))
}

async function realSearchTerms(customerId: string, dateRange: string, token: string) {
  const rows = await gadsQuery(customerId, `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      segments.keyword.info.text,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc
    FROM search_term_view
    WHERE segments.date DURING ${dateRange}
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `, token) as Array<{
    searchTermView: { searchTerm: string; status: string }
    segments: { keyword?: { info?: { text?: string } } }
    metrics: { impressions: string; clicks: string; costMicros: string; conversions: string; ctr: string; averageCpc: string }
  }>
  return rows.map((r) => {
    const cost = (Number(r.metrics.costMicros) || 0) / 1e6
    const conv = Number(r.metrics.conversions) || 0
    return {
      searchTerm:     r.searchTermView.searchTerm,
      matchedKeyword: r.segments.keyword?.info?.text ?? '',
      status:         r.searchTermView.status,
      impressions:    Number(r.metrics.impressions) || 0,
      clicks:         Number(r.metrics.clicks) || 0,
      cost,
      conversions:    conv,
      ctr:            (Number(r.metrics.ctr) || 0) * 100,
      cpc:            (Number(r.metrics.averageCpc) || 0) / 1e6,
      cpa:            conv > 0 ? cost / conv : 0,
    }
  })
}

async function realTime(customerId: string, dateRange: string, token: string) {
  const rows = await gadsQuery(customerId, `
    SELECT
      segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date ASC
  `, token) as Array<{
    segments: { date: string }
    metrics: { impressions: string; clicks: string; costMicros: string; conversions: string }
  }>
  const byDate: Record<string, { impressions: number; clicks: number; cost: number; conversions: number }> = {}
  for (const r of rows) {
    const d = r.segments.date
    if (!byDate[d]) byDate[d] = { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    byDate[d].impressions += Number(r.metrics.impressions) || 0
    byDate[d].clicks      += Number(r.metrics.clicks) || 0
    byDate[d].cost        += (Number(r.metrics.costMicros) || 0) / 1e6
    byDate[d].conversions += Number(r.metrics.conversions) || 0
  }
  return Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).map(([date, m]) => ({ date, ...m }))
}

async function realConversions(customerId: string, dateRange: string, token: string) {
  // Query conversion_action segmented from campaign resource (supports date range)
  const rows = await gadsQuery(customerId, `
    SELECT
      segments.conversion_action_name,
      segments.conversion_action_category,
      metrics.conversions,
      metrics.conversions_value,
      metrics.all_conversions,
      metrics.view_through_conversions
    FROM campaign
    WHERE segments.date DURING ${dateRange}
      AND campaign.status != 'REMOVED'
      AND metrics.all_conversions > 0
    ORDER BY metrics.conversions DESC
    LIMIT 200
  `, token) as Array<{
    segments: { conversionActionName: string; conversionActionCategory: string }
    metrics: { conversions: string; conversionsValue: string; allConversions: string; viewThroughConversions: string }
  }>

  // Aggregate by conversion action name (rows are per-campaign so sum across campaigns)
  const byAction: Record<string, { category: string; conversions: number; value: number; allConversions: number; viewThrough: number }> = {}
  for (const r of rows) {
    const name = r.segments.conversionActionName
    if (!byAction[name]) byAction[name] = { category: r.segments.conversionActionCategory, conversions: 0, value: 0, allConversions: 0, viewThrough: 0 }
    byAction[name].conversions    += Number(r.metrics.conversions) || 0
    byAction[name].value          += Number(r.metrics.conversionsValue) || 0
    byAction[name].allConversions += Number(r.metrics.allConversions) || 0
    byAction[name].viewThrough    += Number(r.metrics.viewThroughConversions) || 0
  }

  const actions = Object.entries(byAction).map(([name, m]) => ({
    conversionName:          name,
    category:                m.category,
    conversions:             m.conversions,
    value:                   m.value,
    allConversions:          m.allConversions,
    viewThroughConversions:  m.viewThrough,
  })).sort((a, b) => b.conversions - a.conversions)
  const purchaseAction = actions.find((a) =>
    a.category === 'PURCHASE' || a.conversionName.toLowerCase().includes('purchase')
  )
  const ecommerceFunnel = purchaseAction ? buildFunnel(actions) : null
  return { actions, ecommerceFunnel }
}

function buildFunnel(actions: Array<{ conversionName: string; category: string; conversions: number; value: number }>) {
  const get = (names: string[]) => actions.find((a) =>
    names.some((n) => a.conversionName.toLowerCase().includes(n) || a.category.toLowerCase().includes(n))
  )
  const viewItem      = get(['view_item', 'page_view'])?.conversions ?? 0
  const addToCart     = get(['add_to_cart', 'add_cart'])?.conversions ?? 0
  const beginCheckout = get(['begin_checkout', 'checkout'])?.conversions ?? 0
  const purchase      = get(['purchase'])?.conversions ?? 0
  const revenue       = get(['purchase'])?.value ?? 0
  return {
    view_item:            viewItem,
    add_to_cart:          addToCart,
    begin_checkout:       beginCheckout,
    purchase,
    revenue,
    roas:                 0,
    aov:                  purchase > 0 ? revenue / purchase : 0,
    cartAbandonRate:      addToCart > 0 ? parseFloat(((1 - beginCheckout / addToCart) * 100).toFixed(1)) : 0,
    checkoutAbandonRate:  beginCheckout > 0 ? parseFloat(((1 - purchase / beginCheckout) * 100).toFixed(1)) : 0,
  }
}

// ── Fetch one dimension type with cache ───────────────────────────────────────

async function fetchOne(type: string, customerId: string, dateRange: string, token: string): Promise<unknown> {
  const cacheKey = `${customerId}:${dateRange}:${type}`
  const cached = cacheGet(cacheKey)
  if (cached !== null) return cached

  let data: unknown
  if (type === 'keywords')     data = await realKeywords(customerId, dateRange, token)
  else if (type === 'audiences')    data = await realAudiences(customerId, dateRange, token)
  else if (type === 'locations')    data = await realLocations(customerId, dateRange, token)
  else if (type === 'devices')      data = await realDevices(customerId, dateRange, token)
  else if (type === 'search_terms') data = await realSearchTerms(customerId, dateRange, token)
  else if (type === 'time')         data = await realTime(customerId, dateRange, token)
  else if (type === 'conversions' || type === 'ecommerce') data = await realConversions(customerId, dateRange, token)
  else throw new Error(`Unknown type: ${type}`)

  cacheSet(cacheKey, data)
  return data
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId') ?? ''
  const dateRange  = searchParams.get('dateRange') ?? 'LAST_30_DAYS'
  const type       = searchParams.get('type') ?? 'keywords'

  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  let token = ''
  try { token = await getGoogleAdsAccessToken() } catch { /* no token */ }

  const emptyConv = { actions: [], ecommerceFunnel: null }
  if (!token) {
    if (type === 'all') {
      return NextResponse.json({
        keywords: [], audiences: [], locations: [], devices: [],
        search_terms: [], time: [], conversions: emptyConv, ecommerce: emptyConv,
        dateRange, mock: false, cached: false,
      })
    }
    return NextResponse.json({ data: type === 'conversions' || type === 'ecommerce' ? emptyConv : [], type, dateRange, mock: false })
  }

  try {
    // type=all: fetch all dimensions in parallel server-side — one HTTP round trip instead of 8
    if (type === 'all') {
      const allTypes = ['keywords', 'audiences', 'locations', 'devices', 'search_terms', 'time', 'conversions'] as const
      const results = await Promise.all(allTypes.map((t) => fetchOne(t, customerId, dateRange, token).catch(() => null)))
      const byType = Object.fromEntries(allTypes.map((t, i) => [t, results[i]]))
      return NextResponse.json({
        ...byType,
        ecommerce: byType['conversions'], // same data, different tab
        dateRange, mock: false, cached: false,
      })
    }

    const data = await fetchOne(type, customerId, dateRange, token)
    return NextResponse.json({ data, type, dateRange, mock: false })
  } catch (err) {
    console.error('[dimensions]', err)
    return NextResponse.json({ error: 'Failed to fetch dimension data' }, { status: 500 })
  }
}
