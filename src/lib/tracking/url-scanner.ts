import * as cheerio from 'cheerio'

export interface FormElement {
  selector: string
  action?: string
  fields: string[]
  id?: string
  submitSelector?: string
}

export interface OtherPixel {
  name: string
  id?: string
}

export interface UrlScanResult {
  url: string
  scannedAt: string
  hasGtm: boolean
  gtmId?: string
  hasGa4: boolean
  ga4MeasurementId?: string
  hasGoogleAdsTag: boolean
  googleAdsConversionId?: string
  forms: FormElement[]
  lineButtons: number
  lineUrls: string[]
  phoneLinks: number
  telUrls: string[]
  emailLinks: number
  thankYouPages: string[]
  hasEcommerceDataLayer: boolean
  hasPurchaseEvent: boolean
  duplicateTracking: string[]
  otherPixels: OtherPixel[]
  pageTitle: string
  metaDescription?: string
  hasWordPress: boolean
  hasFacebook: boolean
  hasTiktok: boolean
  rawHtmlLength: number
  fetchError?: string
}

export async function scanUrl(url: string): Promise<UrlScanResult> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
  const scannedAt = new Date().toISOString()

  let html = ''
  let fetchError: string | undefined

  try {
    const res = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GGAutomationBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'th,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      fetchError = `HTTP ${res.status} ${res.statusText}`
    } else {
      html = await res.text()
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : 'Fetch failed'
  }

  if (!html) return emptyResult(normalizedUrl, scannedAt, fetchError)

  const $ = cheerio.load(html)

  // GTM
  const gtmMatch = html.match(/GTM-[A-Z0-9]+/)
  const gtmId = gtmMatch?.[0]

  // GA4
  const ga4Match = html.match(/G-[A-Z0-9]{8,12}/)
  const gtagMatch = html.match(/gtag\s*\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/)
  const ga4MeasurementId =
    (gtagMatch?.[1]?.startsWith('G-') ? gtagMatch[1] : null) ?? ga4Match?.[0]

  // Google Ads conversion tag
  const awMatch = html.match(/AW-[0-9]+/)
  const googleAdsConversionId = awMatch?.[0]

  // Other pixels
  const otherPixels: OtherPixel[] = []
  const fbMatch = html.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/)
  if (fbMatch) otherPixels.push({ name: 'Meta Pixel', id: fbMatch[1] })
  const ttMatch = html.match(/ttq\s*\.?\s*load\s*\(\s*['"]([^'"]+)['"]/)
  if (ttMatch) otherPixels.push({ name: 'TikTok Pixel', id: ttMatch[1] })
  if (html.includes('clarity.ms')) otherPixels.push({ name: 'Microsoft Clarity' })
  if (html.includes('hotjar.com')) otherPixels.push({ name: 'Hotjar' })

  // Forms
  const forms: FormElement[] = []
  $('form').each((_, el) => {
    const $form = $(el)
    const fields: string[] = []
    $form.find('input, textarea, select').each((__, inp) => {
      const name =
        $(inp).attr('name') ||
        $(inp).attr('id') ||
        $(inp).attr('placeholder') ||
        $(inp).attr('type') ||
        ''
      if (name && name !== 'submit' && name !== 'button') fields.push(name)
    })
    const id = $form.attr('id')
    const className = $form.attr('class')?.split(' ').filter(Boolean).join('.') ?? ''
    const selector = id ? `#${id}` : className ? `.${className.split(' ')[0]}` : 'form'
    const submitBtn = $form.find('[type=submit], button').first()
    const submitSelector = submitBtn.attr('id')
      ? `#${submitBtn.attr('id')}`
      : submitBtn.attr('class')
      ? `.${submitBtn.attr('class')?.split(' ')[0]}`
      : undefined
    forms.push({ selector, action: $form.attr('action'), fields, id, submitSelector })
  })

  // LINE buttons
  const lineUrls: string[] = []
  $("a[href*='line.me'], a[href*='lin.ee']").each((_, el) => {
    const href = $(el).attr('href')
    if (href) lineUrls.push(href)
  })

  // Phone links
  const telUrls: string[] = []
  $("a[href^='tel:']").each((_, el) => {
    const href = $(el).attr('href')
    if (href) telUrls.push(href.replace('tel:', ''))
  })

  // Thank-you pages
  const thankYouUrls: string[] = []
  $(
    "a[href*='thank'], a[href*='success'], a[href*='complete'], a[href*='confirm'], a[href*='order-received']"
  ).each((_, el) => {
    const href = $(el).attr('href')
    if (href) thankYouUrls.push(href)
  })

  // Duplicate GTM detection
  const allGtmIds = Array.from(new Set(html.match(/GTM-[A-Z0-9]+/g) ?? []))

  return {
    url: normalizedUrl,
    scannedAt,
    hasGtm: !!gtmId,
    gtmId,
    hasGa4: !!ga4MeasurementId,
    ga4MeasurementId: ga4MeasurementId ?? undefined,
    hasGoogleAdsTag: !!googleAdsConversionId,
    googleAdsConversionId,
    forms,
    lineButtons: lineUrls.length,
    lineUrls: Array.from(new Set(lineUrls)),
    phoneLinks: telUrls.length,
    telUrls: Array.from(new Set(telUrls)),
    emailLinks: $("a[href^='mailto:']").length,
    thankYouPages: Array.from(new Set(thankYouUrls)),
    hasEcommerceDataLayer: html.includes('ecommerce') && html.includes('dataLayer'),
    hasPurchaseEvent: html.includes('purchase') && html.includes('dataLayer'),
    duplicateTracking: allGtmIds.length > 1 ? allGtmIds : [],
    otherPixels,
    pageTitle: $('title').text().trim(),
    metaDescription: $('meta[name="description"]').attr('content'),
    hasWordPress: html.includes('wp-content') || html.includes('wp-includes'),
    hasFacebook: otherPixels.some((p) => p.name === 'Meta Pixel'),
    hasTiktok: otherPixels.some((p) => p.name === 'TikTok Pixel'),
    rawHtmlLength: html.length,
    fetchError,
  }
}

function emptyResult(url: string, scannedAt: string, fetchError?: string): UrlScanResult {
  return {
    url,
    scannedAt,
    hasGtm: false,
    hasGa4: false,
    hasGoogleAdsTag: false,
    forms: [],
    lineButtons: 0,
    lineUrls: [],
    phoneLinks: 0,
    telUrls: [],
    emailLinks: 0,
    thankYouPages: [],
    hasEcommerceDataLayer: false,
    hasPurchaseEvent: false,
    duplicateTracking: [],
    otherPixels: [],
    pageTitle: '',
    hasWordPress: false,
    hasFacebook: false,
    hasTiktok: false,
    rawHtmlLength: 0,
    fetchError,
  }
}
