import type { UrlScanResult } from './url-scanner'

export type TrackingEventType =
  | 'form_submit'
  | 'line_click'
  | 'phone_click'
  | 'thank_you_page'
  | 'purchase'
  | 'scroll_depth'
  | 'button_click'

export type EventDestination = 'GA4' | 'GOOGLE_ADS' | 'BOTH'
export type ConversionPriority = 'PRIMARY' | 'SECONDARY'

export interface TrackingEvent {
  id: string
  eventName: TrackingEventType
  triggerType: 'click' | 'form_submit' | 'page_view' | 'scroll'
  triggerRule: string
  selector: string
  destination: EventDestination
  priority: ConversionPriority
  ga4Parameters: Record<string, string>
  isKeyConversion: boolean
  notes: string
}

export interface GtmTag {
  name: string
  type: 'GA4_CONFIG' | 'GA4_EVENT' | 'AW_CONVERSION' | 'AW_LINKER' | 'CUSTOM_HTML'
  parameters: Record<string, unknown>
  triggers: string[]
}

export interface GtmTrigger {
  name: string
  type: 'PAGEVIEW' | 'CLICK' | 'FORM' | 'CUSTOM_EVENT'
  conditions: Array<{ variable: string; operator: string; value: string }>
}

export interface GtmVariable {
  name: string
  type: 'DL' | 'JS' | 'CONST' | 'URL' | 'ELEMENT'
  parameters: Record<string, unknown>
}

export interface TrackingBlueprint {
  websiteUrl: string
  scan: UrlScanResult
  issues: TrackingIssue[]
  events: TrackingEvent[]
  gtmWorkspaceName: string
  gtmTags: GtmTag[]
  gtmTriggers: GtmTrigger[]
  gtmVariables: GtmVariable[]
  conversionActions: ConversionAction[]
  qaChecks: TrackingQaCheck[]
  score: number
  readyForAds: boolean
  recommendations: string[]
}

export interface ConversionAction {
  name: string
  category: string
  countingType: 'ONE_PER_CLICK' | 'MANY_PER_CLICK'
  defaultValue?: number
  notes: string
}

export interface TrackingIssue {
  severity: 'blocker' | 'warning' | 'info'
  message: string
  fix: string
}

export interface TrackingQaCheck {
  checkName: string
  status: 'pass' | 'fail' | 'warning'
  message: string
}

// ── Main generator ─────────────────────────────────────────────────────────────

export function generateTrackingBlueprint(
  brief: Record<string, unknown>,
  scan: UrlScanResult
): TrackingBlueprint {
  const bizName = (brief.businessName as string) || 'Business'
  const convGoal = (brief.conversionGoal as string) || 'form_submit'
  const url = (brief.websiteUrl as string) || scan.url
  const datePart = new Date().toISOString().slice(0, 10)

  // ── Detect conversion events from scan ──────────────────────────────────────
  const events: TrackingEvent[] = []

  if (scan.forms.length > 0 || convGoal.toLowerCase().includes('form')) {
    const form = scan.forms[0]
    events.push({
      id: `evt_form_${Date.now()}`,
      eventName: 'form_submit',
      triggerType: 'form_submit',
      triggerRule: form?.selector ? `Form ID/Class matches "${form.selector}"` : 'All Forms',
      selector: form?.selector ?? 'form',
      destination: 'BOTH',
      priority: 'PRIMARY',
      ga4Parameters: {
        form_id: '{{Form ID}}',
        form_name: '{{Form Name}}',
        page_location: '{{Page URL}}',
      },
      isKeyConversion: true,
      notes: `selector: ${form?.selector ?? 'form'} | fields: ${form?.fields.slice(0, 3).join(', ') || 'ไม่ทราบ'} | test: กรอกฟอร์มและ submit แล้วเช็คใน GA4 Realtime`,
    })
  }

  if (scan.lineButtons > 0 || convGoal.toLowerCase().includes('line')) {
    events.push({
      id: `evt_line_${Date.now()}`,
      eventName: 'line_click',
      triggerType: 'click',
      triggerRule: 'Click URL contains line.me OR lin.ee',
      selector: "a[href*='line.me'], a[href*='lin.ee']",
      destination: 'BOTH',
      priority: 'PRIMARY',
      ga4Parameters: {
        link_url: '{{Click URL}}',
        link_text: '{{Click Text}}',
      },
      isKeyConversion: true,
      notes: `LINE URLs พบ: ${scan.lineUrls.slice(0, 2).join(', ') || 'ไม่พบ แต่ conversionGoal ระบุ LINE'} | test: คลิกปุ่ม LINE แล้วดู GA4`,
    })
  }

  if (scan.phoneLinks > 0 || convGoal.toLowerCase().includes('phone') || convGoal.toLowerCase().includes('call')) {
    events.push({
      id: `evt_tel_${Date.now()}`,
      eventName: 'phone_click',
      triggerType: 'click',
      triggerRule: "Click URL starts with 'tel:'",
      selector: "a[href^='tel:']",
      destination: 'BOTH',
      priority: 'PRIMARY',
      ga4Parameters: {
        link_url: '{{Click URL}}',
        phone_number: scan.telUrls[0] ?? '{{Click URL}}',
      },
      isKeyConversion: true,
      notes: `Tel links: ${scan.telUrls.slice(0, 2).join(', ') || 'ไม่พบ'} | test: คลิก tel: link บน mobile`,
    })
  }

  if (scan.thankYouPages.length > 0) {
    events.push({
      id: `evt_ty_${Date.now()}`,
      eventName: 'thank_you_page',
      triggerType: 'page_view',
      triggerRule: `Page URL contains: ${scan.thankYouPages[0]}`,
      selector: 'window',
      destination: 'BOTH',
      priority: 'PRIMARY',
      ga4Parameters: {
        page_location: '{{Page URL}}',
        conversion_type: 'thank_you_page',
      },
      isKeyConversion: true,
      notes: `Thank-you pages: ${scan.thankYouPages.slice(0, 2).join(', ')} | ใช้ URL-based trigger | test: เข้าหน้า thank-you แล้วดู GA4`,
    })
  }

  if (scan.hasPurchaseEvent) {
    events.push({
      id: `evt_purchase_${Date.now()}`,
      eventName: 'purchase',
      triggerType: 'custom_event' as TrackingEvent['triggerType'],
      triggerRule: 'Custom Event equals "purchase"',
      selector: 'dataLayer',
      destination: 'BOTH',
      priority: 'PRIMARY',
      ga4Parameters: {
        transaction_id: '{{DL - transaction_id}}',
        value: '{{DL - value}}',
        currency: '{{DL - currency}}',
      },
      isKeyConversion: true,
      notes: 'พบ purchase event ใน dataLayer | ต้องมี ecommerce.purchase push | test: ทำ test order แล้วดู GA4',
    })
  }

  // Scroll depth as secondary
  events.push({
    id: `evt_scroll_${Date.now()}`,
    eventName: 'scroll_depth',
    triggerType: 'scroll',
    triggerRule: 'Scroll Depth Threshold: 75%',
    selector: 'window',
    destination: 'GA4',
    priority: 'SECONDARY',
    ga4Parameters: {
      percent_scrolled: '75',
      page_location: '{{Page URL}}',
    },
    isKeyConversion: false,
    notes: 'Engagement signal | secondary metric เท่านั้น | ไม่นับใน Google Ads',
  })

  // ── GTM Tags ──────────────────────────────────────────────────────────────────
  const gtmTriggers: GtmTrigger[] = [
    { name: 'Trigger - All Pages', type: 'PAGEVIEW', conditions: [] },
    { name: 'Trigger - Form Submit', type: 'FORM', conditions: [] },
  ]

  if (events.some((e) => e.eventName === 'line_click')) {
    gtmTriggers.push({
      name: 'Trigger - LINE Click',
      type: 'CLICK',
      conditions: [{ variable: 'Click URL', operator: 'contains', value: 'line.me' }],
    })
  }
  if (events.some((e) => e.eventName === 'phone_click')) {
    gtmTriggers.push({
      name: 'Trigger - Phone Click',
      type: 'CLICK',
      conditions: [{ variable: 'Click URL', operator: 'starts with', value: 'tel:' }],
    })
  }
  if (scan.thankYouPages.length > 0) {
    gtmTriggers.push({
      name: 'Trigger - Thank You Page',
      type: 'PAGEVIEW',
      conditions: [{ variable: 'Page URL', operator: 'contains', value: scan.thankYouPages[0] }],
    })
  }
  gtmTriggers.push({
    name: 'Trigger - Scroll 75%',
    type: 'CUSTOM_EVENT',
    conditions: [{ variable: 'Scroll Depth Threshold', operator: 'equals', value: '75' }],
  })

  const gtmTags: GtmTag[] = [
    {
      name: 'GA4 - Configuration',
      type: 'GA4_CONFIG',
      parameters: {
        measurement_id: scan.ga4MeasurementId ?? '{{GA4 Measurement ID}}',
        send_page_view: true,
      },
      triggers: ['Trigger - All Pages'],
    },
    {
      name: 'AW - Conversion Linker',
      type: 'AW_LINKER',
      parameters: {},
      triggers: ['Trigger - All Pages'],
    },
  ]

  // Add GA4 event tag + AW conversion tag per key conversion event
  for (const evt of events.filter((e) => e.isKeyConversion)) {
    const triggerName = {
      form_submit: 'Trigger - Form Submit',
      line_click: 'Trigger - LINE Click',
      phone_click: 'Trigger - Phone Click',
      thank_you_page: 'Trigger - Thank You Page',
      purchase: 'Trigger - Form Submit',
      scroll_depth: 'Trigger - Scroll 75%',
      button_click: 'Trigger - Form Submit',
    }[evt.eventName] ?? 'Trigger - Form Submit'

    gtmTags.push({
      name: `GA4 - Event: ${evt.eventName}`,
      type: 'GA4_EVENT',
      parameters: { event_name: evt.eventName, ...evt.ga4Parameters },
      triggers: [triggerName],
    })

    if (evt.destination === 'BOTH' || evt.destination === 'GOOGLE_ADS') {
      gtmTags.push({
        name: `AW - Conversion: ${evt.eventName}`,
        type: 'AW_CONVERSION',
        parameters: {
          conversion_id: scan.googleAdsConversionId ?? '{{AW Conversion ID}}',
          conversion_label: '{{AW Conversion Label}}',
        },
        triggers: [triggerName],
      })
    }
  }

  gtmTags.push({
    name: 'GA4 - Scroll Depth 75%',
    type: 'GA4_EVENT',
    parameters: { event_name: 'scroll', percent_scrolled: '75' },
    triggers: ['Trigger - Scroll 75%'],
  })

  // ── GTM Variables ────────────────────────────────────────────────────────────
  const gtmVariables: GtmVariable[] = [
    { name: 'DL - Form ID', type: 'DL', parameters: { name: 'formId' } },
    { name: 'DL - Form Name', type: 'DL', parameters: { name: 'formName' } },
    { name: 'JS - Click URL', type: 'JS', parameters: { code: "return {{Click URL}};" } },
    { name: 'CONST - GA4 Measurement ID', type: 'CONST', parameters: { value: scan.ga4MeasurementId ?? '' } },
    { name: 'CONST - AW Conversion ID', type: 'CONST', parameters: { value: scan.googleAdsConversionId ?? '' } },
  ]

  if (scan.hasPurchaseEvent) {
    gtmVariables.push(
      { name: 'DL - transaction_id', type: 'DL', parameters: { name: 'ecommerce.transaction_id' } },
      { name: 'DL - value', type: 'DL', parameters: { name: 'ecommerce.value' } },
      { name: 'DL - currency', type: 'DL', parameters: { name: 'ecommerce.currency' } }
    )
  }

  // ── Google Ads Conversion Actions ─────────────────────────────────────────────
  const conversionActions: ConversionAction[] = events
    .filter((e) => e.isKeyConversion && (e.destination === 'BOTH' || e.destination === 'GOOGLE_ADS'))
    .map((e) => ({
      name: {
        form_submit: `${bizName} - Form Submit`,
        line_click: `${bizName} - LINE Click`,
        phone_click: `${bizName} - Phone Call Click`,
        thank_you_page: `${bizName} - Thank You Page`,
        purchase: `${bizName} - Purchase`,
        scroll_depth: `${bizName} - Scroll 75%`,
        button_click: `${bizName} - Button Click`,
      }[e.eventName] ?? `${bizName} - ${e.eventName}`,
      category: {
        form_submit: 'SUBMIT_LEAD_FORM',
        line_click: 'PAGE_VIEW',
        phone_click: 'PHONE_CALL_LEAD',
        thank_you_page: 'PURCHASE',
        purchase: 'PURCHASE',
        scroll_depth: 'PAGE_VIEW',
        button_click: 'PAGE_VIEW',
      }[e.eventName] ?? 'PAGE_VIEW',
      countingType: e.eventName === 'purchase' ? 'MANY_PER_CLICK' : 'ONE_PER_CLICK',
      notes: e.notes,
    }))

  // ── Issues ────────────────────────────────────────────────────────────────────
  const issues: TrackingIssue[] = []

  if (!scan.hasGtm) {
    issues.push({
      severity: 'blocker',
      message: 'ไม่พบ GTM Container บนเว็บไซต์',
      fix: 'ติดตั้ง GTM snippet ใน <head> และ <body> ของทุกหน้า',
    })
  }
  if (!scan.hasGa4) {
    issues.push({
      severity: 'blocker',
      message: 'ไม่พบ GA4 Measurement ID บนเว็บไซต์',
      fix: 'เพิ่ม GA4 Config Tag ใน GTM หรือติดตั้ง gtag.js โดยตรง',
    })
  }
  if (!scan.hasGoogleAdsTag) {
    issues.push({
      severity: 'warning',
      message: 'ไม่พบ Google Ads Conversion Tag (AW-XXXXXXXXX)',
      fix: 'เพิ่ม AW Conversion Linker Tag ใน GTM',
    })
  }
  if (scan.duplicateTracking.length > 1) {
    issues.push({
      severity: 'warning',
      message: `พบ GTM IDs ซ้ำ: ${scan.duplicateTracking.join(', ')}`,
      fix: 'ลบ GTM tag ที่ซ้ำออก เหลือแค่ 1 container',
    })
  }
  if (!url.startsWith('https://')) {
    issues.push({
      severity: 'blocker',
      message: 'URL ไม่ใช้ HTTPS',
      fix: 'เปลี่ยนเป็น HTTPS ก่อน — Google Ads ไม่รองรับ http:// final URL',
    })
  }
  if (scan.forms.length === 0 && scan.lineButtons === 0 && scan.phoneLinks === 0) {
    issues.push({
      severity: 'warning',
      message: 'ไม่พบ conversion elements (form / LINE / phone) บนหน้าแรก',
      fix: 'ตรวจสอบว่า URL ที่ scan ถูกต้อง หรือ add conversion elements',
    })
  }

  // ── QA Checks ─────────────────────────────────────────────────────────────────
  const qaChecks: TrackingQaCheck[] = [
    {
      checkName: 'GTM Container ติดตั้งแล้ว',
      status: scan.hasGtm ? 'pass' : 'fail',
      message: scan.hasGtm ? `GTM: ${scan.gtmId} ✓` : 'ไม่พบ GTM Container',
    },
    {
      checkName: 'GA4 Config ติดตั้งแล้ว',
      status: scan.hasGa4 ? 'pass' : 'fail',
      message: scan.hasGa4 ? `GA4: ${scan.ga4MeasurementId} ✓` : 'ไม่พบ GA4 tag',
    },
    {
      checkName: 'Google Ads Tag ติดตั้งแล้ว',
      status: scan.hasGoogleAdsTag ? 'pass' : 'warning',
      message: scan.hasGoogleAdsTag ? `AW: ${scan.googleAdsConversionId} ✓` : 'ไม่พบ AW tag — จะ track Google Ads conversion ไม่ได้',
    },
    {
      checkName: 'Conversion events ครบ',
      status: events.filter((e) => e.isKeyConversion).length > 0 ? 'pass' : 'fail',
      message: `Key conversions: ${events.filter((e) => e.isKeyConversion).map((e) => e.eventName).join(', ') || 'ไม่มี'}`,
    },
    {
      checkName: 'ไม่มี Duplicate GTM',
      status: scan.duplicateTracking.length <= 1 ? 'pass' : 'warning',
      message: scan.duplicateTracking.length <= 1 ? 'ไม่พบ duplicate GTM ✓' : `พบซ้ำ: ${scan.duplicateTracking.join(', ')}`,
    },
    {
      checkName: 'HTTPS Final URL',
      status: url.startsWith('https://') ? 'pass' : 'fail',
      message: url.startsWith('https://') ? 'HTTPS ✓' : 'URL ไม่ใช่ HTTPS',
    },
    {
      checkName: 'Thank You page สำหรับ conversion tracking',
      status: scan.thankYouPages.length > 0 ? 'pass' : 'warning',
      message: scan.thankYouPages.length > 0
        ? `พบ: ${scan.thankYouPages[0]} ✓`
        : 'ไม่พบ thank-you page — แนะนำสร้าง /thank-you หรือใช้ GTM form trigger',
    },
  ]

  const failCount = qaChecks.filter((q) => q.status === 'fail').length
  const warnCount = qaChecks.filter((q) => q.status === 'warning').length
  const score = Math.max(0, 100 - failCount * 20 - warnCount * 5)
  const blockers = issues.filter((i) => i.severity === 'blocker').length
  const readyForAds = blockers === 0

  const recommendations: string[] = [
    `ติดตั้ง GTM workspace: "${bizName} - AI Tracking - ${datePart}"`,
    'ตั้ง Consent Mode v2 ก่อน publish (GDPR/PDPA compliance)',
    'ทดสอบทุก event ใน GTM Preview mode ก่อน publish',
    'เปิด GA4 Realtime report ระหว่าง test เพื่อยืนยัน event ส่งถึง',
    `Import conversion actions ${conversionActions.map((c) => `"${c.name}"`).join(', ')} เข้า Google Ads`,
    'ตั้ง ${businessName} - Form Submit เป็น Primary conversion สำหรับ Smart Bidding',
  ]

  return {
    websiteUrl: url,
    scan,
    issues,
    events,
    gtmWorkspaceName: `${bizName} - AI Tracking Setup - ${datePart}`,
    gtmTags,
    gtmTriggers,
    gtmVariables,
    conversionActions,
    qaChecks,
    score,
    readyForAds,
    recommendations,
  }
}
