// Converts RichScanResult into a structured ScanReport with health score, warnings, element detection, and event recommendations

import type { RichScanResult } from "@/lib/url-scanner";
import type { DetectedTag, DetectedElement, ScanWarning, TrackingHealthScore, RecommendedEventMapping, ScanReport, LeadFunnelAnalysis, LeadFunnelStep } from "@/lib/tracking-types";
import { EVENT_LIBRARY, type WebsiteType } from "@/lib/tracking-event-library";

export function buildScanReport(scan: RichScanResult, websiteTypes: WebsiteType[]): ScanReport {
  const detectedTags = buildDetectedTags(scan);
  const detectedElements = buildDetectedElements(scan);
  const warnings = buildWarnings(scan, detectedElements);
  const recommendedEvents = buildRecommendedEvents(scan, websiteTypes);
  const healthScore = buildHealthScore(scan, detectedTags, recommendedEvents);
  const isLeadSite = websiteTypes.length === 0 || websiteTypes.some(t => ["lead", "all", "local", "highticket", "realestate", "education", "healthcare", "b2b", "booking", "saas"].includes(t));
  const leadFunnelAnalysis = (isLeadSite && scan.forms.length > 0) ? buildLeadFunnelAnalysis(scan) : undefined;

  return {
    url: scan.url,
    scanDate: new Date().toISOString(),
    websiteTypes: websiteTypes as string[],
    healthScore,
    detectedTags,
    detectedElements,
    warnings,
    recommendedEvents,
    leadFunnelAnalysis,
  };
}

// ── Detected Tags ────────────────────────────────────────────────────────────

function buildDetectedTags(scan: RichScanResult): DetectedTag[] {
  const tags: DetectedTag[] = [];

  // GTM
  tags.push({
    platform: "GTM",
    status: scan.hasGtm ? "found" : "missing",
    evidence: scan.hasGtm ? `GTM ID: ${scan.gtmId}` : "No GTM container script found in page source",
    recommendation: scan.hasGtm
      ? "GTM is installed. Verify container ID matches your production container."
      : "Install GTM container snippet in <head> and <body> of every page.",
    priority: "high",
    detectedId: scan.gtmId,
  });

  // GA4
  tags.push({
    platform: "GA4",
    status: scan.hasGa4 ? "found" : "missing",
    evidence: scan.hasGa4 ? `GA4 ID: ${scan.ga4MeasurementId}` : "No G- measurement ID found",
    recommendation: scan.hasGa4
      ? "GA4 is installed. Confirm measurement ID matches your GA4 property."
      : "Add GA4 Configuration tag in GTM with your G-XXXXXXXXXX measurement ID.",
    priority: "high",
    detectedId: scan.ga4MeasurementId,
  });

  // Google Ads
  const hasGoogleAds = scan.inlineScripts?.some(s => s.includes("AW-") || s.includes("googleadservices")) ?? false;
  const googleAdsMatch = scan.inlineScripts?.join(" ").match(/AW-\d+/)?.[0];
  tags.push({
    platform: "Google Ads",
    status: hasGoogleAds ? "found" : "missing",
    evidence: hasGoogleAds ? `Google Ads tag found: ${googleAdsMatch ?? "AW-..."}` : "No Google Ads (AW-) conversion tag found",
    recommendation: hasGoogleAds
      ? "Google Ads tag detected. Ensure it fires through GTM, not hardcoded separately."
      : "Add Google Ads Conversion Linker tag and conversion event tags via GTM.",
    priority: "high",
    detectedId: googleAdsMatch,
  });

  // Meta Pixel
  tags.push({
    platform: "Meta Pixel",
    status: scan.hasFacebook ? "found" : "missing",
    evidence: scan.hasFacebook ? `Meta Pixel ID: ${scan.fbPixelId ?? "detected (no ID extracted)"}` : "No fbq() or Meta Pixel base code found",
    recommendation: scan.hasFacebook
      ? "Meta Pixel found. Move to GTM Custom HTML tag if currently hardcoded."
      : "Add Meta Pixel base code via GTM Custom HTML tag on All Pages.",
    priority: "high",
    detectedId: scan.fbPixelId,
  });

  // TikTok Pixel
  tags.push({
    platform: "TikTok Pixel",
    status: scan.hasTiktok ? "found" : "missing",
    evidence: scan.hasTiktok ? `TikTok Pixel ID: ${scan.ttPixelId ?? "detected (no ID extracted)"}` : "No ttq.load() or TikTok Pixel found",
    recommendation: scan.hasTiktok
      ? "TikTok Pixel found. Move to GTM Custom HTML tag if currently hardcoded."
      : "Add TikTok Pixel base code via GTM Custom HTML tag on All Pages.",
    priority: "high",
    detectedId: scan.ttPixelId,
  });

  // Consent Mode
  const hasConsent = scan.inlineScripts?.some(s => s.includes("consent") || s.includes("cookie") || s.includes("gdpr") || s.includes("cookiebot") || s.includes("onetrust")) ?? false;
  tags.push({
    platform: "Consent Mode",
    status: hasConsent ? "found" : "warning",
    evidence: hasConsent ? "Consent/cookie signals detected in page scripts" : "No consent mode or cookie consent platform detected",
    recommendation: hasConsent
      ? "Consent signals found. Verify GTM Consent Mode v2 is configured with granted/denied states."
      : "Implement GTM Consent Mode v2 and add a cookie consent banner (Cookiebot, OneTrust, or custom).",
    priority: "medium",
  });

  // Ecommerce DataLayer
  const hasEcDL = scan.hasEcommerceDataLayer || (scan.ecommerceLayer && scan.ecommerceLayer.length > 0);
  tags.push({
    platform: "Ecommerce DL",
    status: hasEcDL ? "found" : scan.hasShopify || scan.hasWooCommerce ? "partial" : "missing",
    evidence: hasEcDL ? "Ecommerce dataLayer pushes detected in page scripts" :
      scan.hasShopify ? "Shopify detected — dataLayer may require plugin setup" :
      scan.hasWooCommerce ? "WooCommerce detected — install WooCommerce GTM plugin" :
      "No ecommerce dataLayer found",
    recommendation: hasEcDL
      ? "Ecommerce dataLayer found. Verify purchase event includes transaction_id."
      : scan.hasShopify
      ? "Install Elevar, Analyzify, or manual dataLayer script for Shopify ecommerce tracking."
      : scan.hasWooCommerce
      ? "Install WooCommerce Google Tag Manager plugin or Duracelltomi GTM plugin."
      : "Implement ecommerce dataLayer on product, cart, checkout, and confirmation pages.",
    priority: scan.hasShopify || scan.hasWooCommerce || hasEcDL ? "high" : "low",
  });

  // Duplicate risk
  const hasDupe = scan.duplicateTracking && scan.duplicateTracking.length > 1;
  if (hasDupe) {
    tags.push({
      platform: "Duplicate Risk",
      status: "warning",
      evidence: `Multiple GTM containers found: ${(scan.duplicateTracking ?? []).join(", ")}`,
      recommendation: "Remove duplicate GTM containers. Keep only one active container per page.",
      priority: "high",
    });
  }

  // Hardcoded tags warning (when both GTM and direct pixel)
  if (scan.hasGtm && (scan.hasFacebook || scan.hasTiktok) && scan.inlineScripts && scan.inlineScripts.length > 0) {
    const hasHardcodedPixel = scan.inlineScripts.some(s => s.includes("fbq('init'") || s.includes("ttq.load("));
    if (hasHardcodedPixel) {
      tags.push({
        platform: "Hardcoded Tags",
        status: "warning",
        evidence: "Pixel base code appears to be hardcoded in page AND GTM is present — may fire twice",
        recommendation: "Move pixel base codes into GTM Custom HTML tags. Remove hardcoded pixel base code from HTML.",
        priority: "high",
      });
    }
  }

  return tags;
}

// ── Detected Elements ────────────────────────────────────────────────────────

function buildDetectedElements(scan: RichScanResult): DetectedElement[] {
  const elements: DetectedElement[] = [];

  // LINE buttons
  (scan.lineUrls ?? []).forEach((url, i) => {
    elements.push({
      elementType: "button",
      label: `LINE Button ${i > 0 ? i + 1 : ""}`.trim(),
      selector: "a[href*='line.me'], a[href*='lin.ee']",
      href: url,
      recommendedEvent: "line_click",
      confidence: 95,
      notes: "High intent contact — configure as primary conversion",
      priority: "high",
    });
  });

  // Phone links
  (scan.telUrls ?? []).forEach((tel, i) => {
    elements.push({
      elementType: "link",
      label: `Phone ${tel}${i > 0 ? ` (${i + 1})` : ""}`,
      selector: "a[href^='tel:']",
      href: `tel:${tel}`,
      recommendedEvent: "tel_click",
      confidence: 98,
      notes: "Very high intent — phone call lead. Configure as primary.",
      priority: "high",
    });
  });

  // Email links
  (scan.emailUrls ?? []).forEach((email, i) => {
    elements.push({
      elementType: "link",
      label: `Email ${email}${i > 0 ? ` (${i + 1})` : ""}`,
      selector: "a[href^='mailto:']",
      href: `mailto:${email}`,
      recommendedEvent: "email_click",
      confidence: 98,
      notes: "Email contact intent — secondary event",
      priority: "medium",
    });
  });

  // Forms
  scan.forms.forEach((form, i) => {
    const isBooking = ["date", "time", "appointment", "schedule", "calendar"].some(k =>
      form.fields.some(f => f.toLowerCase().includes(k))
    );
    const isQuote = ["budget", "company", "service", "project"].some(k =>
      form.fields.some(f => f.toLowerCase().includes(k))
    );
    const recEvent = isBooking ? "schedule" : isQuote ? "request_quote" : "generate_lead";
    elements.push({
      elementType: "form",
      label: `Form ${i + 1}${form.fields.length > 0 ? ` (${form.fields.slice(0, 3).join(", ")})` : ""}`,
      selector: form.selector,
      recommendedEvent: recEvent,
      confidence: 85,
      notes: `Fields: ${form.fields.join(", ") || "N/A"}. Track form_start → ${recEvent} flow.`,
      priority: "high",
    });
  });

  // Social links
  (scan.socialLinks ?? []).forEach(s => {
    elements.push({
      elementType: "social",
      label: `${s.platform} Profile`,
      selector: `a[href*='${new URL(s.url.startsWith("http") ? s.url : `https://${s.url}`).hostname}']`,
      href: s.url,
      recommendedEvent: "social_click",
      confidence: 90,
      notes: `Social brand link — secondary engagement. Set event_label = "${s.platform}".`,
      priority: "low",
    });
  });

  // Video elements
  (scan.videoElements ?? []).slice(0, 5).forEach((vid, i) => {
    const isYt = vid.includes("youtube") || vid.includes("youtu.be");
    const isVimeo = vid.includes("vimeo");
    elements.push({
      elementType: "media",
      label: `${isYt ? "YouTube" : isVimeo ? "Vimeo" : "Video"} ${i + 1}`,
      selector: isYt ? "iframe[src*='youtube.com']" : isVimeo ? "iframe[src*='vimeo.com']" : "video",
      href: vid,
      recommendedEvent: "video_start",
      confidence: 90,
      notes: "Enable GTM YouTube Video trigger for automatic video_start, video_progress, video_complete",
      priority: "medium",
    });
  });

  // Chat widgets
  (scan.chatWidgets ?? []).forEach(widget => {
    elements.push({
      elementType: "chat",
      label: `${widget} Chat Widget`,
      selector: `.${widget.toLowerCase()}-widget, #${widget.toLowerCase()}-widget`,
      recommendedEvent: "chat_click",
      confidence: 80,
      notes: `${widget} detected. Implement dataLayer push on widget open callback. Requires developer integration.`,
      priority: "medium",
    });
  });

  // Ecommerce (Shopify/WooCommerce)
  if (scan.hasShopify || scan.hasWooCommerce || scan.hasEcommerceDataLayer) {
    const platform = scan.hasShopify ? "Shopify" : scan.hasWooCommerce ? "WooCommerce" : "Custom";
    elements.push({
      elementType: "ecommerce",
      label: `${platform} Ecommerce`,
      selector: scan.hasShopify ? "[data-product-id], .product-form" : ".add_to_cart_button, .woocommerce-cart",
      recommendedEvent: "purchase",
      confidence: scan.hasEcommerceDataLayer ? 90 : 70,
      notes: `${platform} detected. Implement full ecommerce funnel: view_item → add_to_cart → begin_checkout → purchase.`,
      priority: "high",
    });
  }

  // Click elements — scan for high-value patterns
  const keywordMatches = [
    { keywords: ["ขอเส้นทาง", "แผนที่", "maps.google", "Get Direction", "นำทาง"], event: "map_click", priority: "high" as const },
    { keywords: ["WhatsApp", "wa.me", "whatsapp"], event: "whatsapp_click", priority: "high" as const },
    { keywords: ["m.me", "messenger", "Messenger"], event: "messenger_click", priority: "medium" as const },
    { keywords: [".pdf", ".doc", ".xlsx", "download", "ดาวน์โหลด", "โบรชัวร์"], event: "file_download", priority: "medium" as const },
  ];

  (scan.clickElements ?? []).forEach(el => {
    const hrefLower = (el.href ?? "").toLowerCase();
    const textLower = (el.text ?? "").toLowerCase();
    const combined = hrefLower + " " + textLower;

    for (const { keywords, event, priority } of keywordMatches) {
      if (keywords.some(kw => combined.includes(kw.toLowerCase()))) {
        const alreadyExists = elements.some(e => e.recommendedEvent === event && e.selector === el.selector);
        if (!alreadyExists) {
          elements.push({
            elementType: "button",
            label: el.text?.slice(0, 60) || el.href?.slice(0, 60) || event,
            selector: el.selector,
            href: el.href,
            recommendedEvent: event,
            confidence: 75,
            notes: `Detected by keyword match on "${keywords[0]}"`,
            priority,
          });
        }
        break;
      }
    }
  });

  return elements;
}

// ── Warnings ─────────────────────────────────────────────────────────────────

function buildWarnings(scan: RichScanResult, elements: DetectedElement[]): ScanWarning[] {
  const warnings: ScanWarning[] = [];

  if (!scan.hasGtm) {
    warnings.push({ code: "W001", message: "GTM not installed", severity: "critical", fix: "Install GTM snippet in <head> and <body> of every page before deploying any tracking." });
  }
  if (!scan.hasGa4) {
    warnings.push({ code: "W002", message: "GA4 not installed", severity: "critical", fix: "Add GA4 Configuration tag in GTM triggering on All Pages." });
  }
  if (scan.hasFacebook && scan.hasGtm) {
    const hardcoded = scan.inlineScripts?.some(s => s.includes("fbq('init'")) ?? false;
    if (hardcoded) {
      warnings.push({ code: "W003", message: "Meta Pixel appears hardcoded AND GTM is present — possible duplicate fire", severity: "warning", fix: "Remove hardcoded pixel from HTML template and manage via GTM Custom HTML tag." });
    }
  }
  if ((scan.duplicateTracking?.length ?? 0) > 1) {
    warnings.push({ code: "W004", message: "Multiple GTM containers detected — duplicate tracking risk", severity: "critical", fix: `Remove extra GTM containers: ${(scan.duplicateTracking ?? []).join(", ")}. Keep only one.` });
  }
  if (scan.thankYouPages.length > 0) {
    warnings.push({ code: "W005", message: "Thank-you page detected — add duplicate conversion prevention", severity: "warning", fix: "Use GTM session cookie or server-set variable to prevent conversion re-fire on page refresh." });
  }
  if (scan.hasEcommerceDataLayer || scan.hasShopify || scan.hasWooCommerce) {
    if (!scan.hasPurchaseEvent) {
      warnings.push({ code: "W006", message: "Ecommerce site detected but no purchase event found in dataLayer", severity: "warning", fix: "Implement purchase event dataLayer push on order confirmation page with transaction_id." });
    }
    warnings.push({ code: "W007", message: "Ensure purchase event uses unique transaction_id", severity: "info", fix: "Set transaction_id = order ID from backend. Add session check to prevent duplicate fire on page refresh." });
  }
  const hasForms = scan.forms.length > 0;
  if (hasForms) {
    warnings.push({ code: "W008", message: "Form detected — ensure generate_lead fires only on SUCCESS, not button click", severity: "warning", fix: "Wait for AJAX success callback or thank-you page redirect before pushing generate_lead to dataLayer." });
  }
  const lineOrPhone = (scan.lineUrls?.length ?? 0) > 0 || scan.phoneLinks > 0;
  if (lineOrPhone) {
    warnings.push({ code: "W009", message: "LINE/phone contacts found — if set as primary conversion, validate CRM quality", severity: "info", fix: "LINE/phone clicks can be low quality if optimized directly. Use CRM offline conversion import for better signal." });
  }
  const hasNoConsent = !scan.inlineScripts?.some(s => s.includes("consent") || s.includes("cookiebot") || s.includes("onetrust"));
  if (hasNoConsent) {
    warnings.push({ code: "W010", message: "No consent mode or cookie banner detected", severity: "warning", fix: "Implement Consent Mode v2 in GTM and add a cookie consent banner. Required for EU users and improves data quality." });
  }
  const formElements = elements.filter(e => e.elementType === "form");
  if (formElements.length > 0 && scan.thankYouPages.length === 0) {
    warnings.push({ code: "W011", message: "Forms found but no thank-you page detected — AJAX or inline success", severity: "info", fix: "If form uses AJAX success message: detect DOM change for success state. If redirects: add thank-you page URL trigger." });
  }
  if (!scan.hasGtm && (scan.hasFacebook || scan.hasTiktok)) {
    warnings.push({ code: "W012", message: "Pixels found without GTM — tracking may be hardcoded only", severity: "warning", fix: "Move all pixel management to GTM for centralized control, consent support, and easier maintenance." });
  }

  return warnings;
}

// ── Recommended Events ────────────────────────────────────────────────────────

function buildRecommendedEvents(scan: RichScanResult, websiteTypes: WebsiteType[]): RecommendedEventMapping[] {
  const effectiveTypes: WebsiteType[] = websiteTypes.length > 0 ? websiteTypes : ["lead"];
  const recommended: RecommendedEventMapping[] = [];
  const added = new Set<string>();

  function addEvent(eventKey: string, extraWarnings: string[] = []) {
    if (added.has(eventKey)) return;
    const def = EVENT_LIBRARY.find(e => e.eventKey === eventKey);
    if (!def) return;
    added.add(eventKey);
    recommended.push({
      eventKey: def.eventKey,
      displayName: def.displayName,
      ga4EventName: def.ga4EventName,
      googleAdsCategory: def.googleAdsCategory,
      metaEventName: def.metaEventName,
      tiktokEventName: def.tiktokEventName,
      priority: def.priority,
      conversionRole: def.conversionRole,
      funnelStage: def.funnelStage,
      requiredParameters: def.requiredParameters,
      dataLayerExample: def.dataLayerExample,
      triggerLogic: def.triggerLogic,
      gtmTasks: buildGtmTasks(def),
      qaChecklist: def.qaChecklist,
      warnings: [...(def.duplicateRisk === "high" ? [`⚠️ Duplicate risk: ${def.implementationNotes}`] : []), ...extraWarnings],
      duplicateRisk: def.duplicateRisk,
    });
  }

  // Always
  addEvent("page_view");
  addEvent("scroll");
  addEvent("outbound_click");

  // Contact channels found
  if ((scan.lineUrls?.length ?? 0) > 0) addEvent("line_click");
  if (scan.phoneLinks > 0) addEvent("tel_click");
  if (scan.emailLinks > 0) addEvent("email_click");
  if (scan.clickElements?.some(e => (e.href ?? "").includes("wa.me"))) addEvent("whatsapp_click");
  if (scan.clickElements?.some(e => (e.href ?? "").includes("m.me"))) addEvent("messenger_click");
  if ((scan.chatWidgets?.length ?? 0) > 0) addEvent("chat_click", ["Requires developer dataLayer push on widget open callback"]);
  if ((scan.socialLinks?.length ?? 0) > 0) addEvent("social_click");
  if (scan.clickElements?.some(e => (e.href ?? "").toLowerCase().includes("maps.google") || (e.text ?? "").includes("ขอเส้นทาง"))) addEvent("map_click");

  // Forms
  if (scan.forms.length > 0) {
    addEvent("lead_form_view");
    addEvent("form_start");
    const isBookingForm = scan.forms.some(f => f.fields.some(field => ["date", "time", "appointment"].includes(field.toLowerCase())));
    const isQuoteForm = scan.forms.some(f => f.fields.some(field => ["budget", "company", "project"].includes(field.toLowerCase())));
    if (isBookingForm) { addEvent("schedule"); } else if (isQuoteForm) { addEvent("request_quote"); } else { addEvent("generate_lead"); }
    if (scan.thankYouPages.length > 0) addEvent("thank_you_page_view");
  }

  // Videos
  if ((scan.videoElements?.length ?? 0) > 0) {
    addEvent("video_start");
    addEvent("video_complete");
  }

  // File downloads
  if (scan.clickElements?.some(e => /\.(pdf|doc|xlsx|zip)/i.test(e.href ?? ""))) addEvent("file_download");

  // Ecommerce
  const isEcommerce = scan.hasShopify || scan.hasWooCommerce || scan.hasEcommerceDataLayer || effectiveTypes.includes("ecommerce");
  if (isEcommerce) {
    addEvent("view_item");
    addEvent("add_to_cart");
    addEvent("begin_checkout");
    addEvent("purchase", ["⚠️ MOST CRITICAL: Must use unique transaction_id. Prevent re-fire on page refresh."]);
    if (scan.hasShopify || scan.hasWooCommerce) {
      addEvent("view_item_list");
      addEvent("view_cart");
      addEvent("add_shipping_info");
      addEvent("add_payment_info");
    }
  }

  // Website type specific
  for (const wt of effectiveTypes) {
    switch (wt) {
      case "local":
      case "restaurant":
        addEvent("view_location");
        addEvent("branch_select");
        addEvent("menu_view");
        addEvent("order_click");
        addEvent("reserve_start");
        addEvent("reserve_submit");
        addEvent("delivery_app_click");
        break;
      case "saas":
        addEvent("view_content");
        addEvent("select_plan");
        addEvent("sign_up");
        addEvent("start_trial");
        addEvent("subscribe");
        addEvent("complete_registration");
        break;
      case "content":
      case "affiliate":
        addEvent("view_content");
        addEvent("affiliate_click");
        addEvent("file_download");
        addEvent("newsletter_sign_up");
        break;
      case "highticket":
      case "realestate":
        addEvent("view_content");
        addEvent("view_item");
        addEvent("calculator_use");
        addEvent("filter_use");
        addEvent("qualify_lead");
        addEvent("close_convert_lead");
        break;
      case "booking":
      case "healthcare":
        addEvent("schedule");
        addEvent("book_appointment");
        break;
      case "b2b":
        addEvent("view_content");
        addEvent("request_quote");
        addEvent("qualify_lead");
        addEvent("close_convert_lead");
        break;
      case "education":
        addEvent("view_content");
        addEvent("schedule");
        addEvent("sign_up");
        addEvent("complete_registration");
        break;
    }
  }

  // Sort: primary first, then high priority
  recommended.sort((a, b) => {
    const roleOrder = { primary: 0, secondary: 1, remarketing: 2, diagnostic: 3 };
    const priOrder = { high: 0, medium: 1, low: 2 };
    const roleDiff = roleOrder[a.conversionRole] - roleOrder[b.conversionRole];
    if (roleDiff !== 0) return roleDiff;
    return priOrder[a.priority] - priOrder[b.priority];
  });

  return recommended;
}

// ── Lead Funnel Analysis ──────────────────────────────────────────────────────

function buildLeadFunnelAnalysis(scan: RichScanResult): LeadFunnelAnalysis {
  const hasThankyou = scan.thankYouPages.length > 0;
  const hasAjaxClues = scan.forms.some(f =>
    f.action === "" || f.action === "#" || f.action === undefined
  );
  const pattern = hasThankyou ? "thank_you_page" : hasAjaxClues ? "ajax_inline" : "unknown";
  const formCount = scan.forms.length;

  const steps: LeadFunnelStep[] = [];

  // Step 1: page_view (always GTM)
  steps.push({
    step: "1. เข้าหน้า Landing Page",
    event: "page_view",
    pattern: "gtm_auto",
    description: "User เข้าหน้าเว็บ — GTM fires pageview อัตโนมัติ",
    gtmMethod: "Trigger: All Pages Pageview → GA4 Configuration Tag",
  });

  // Step 2: scroll_depth
  steps.push({
    step: "2. Scroll ดูเนื้อหา",
    event: "scroll",
    pattern: "gtm_auto",
    description: "User scroll ลงมา 50%, 75%, 90% — วัด engagement",
    gtmMethod: "Trigger: Scroll Depth (50%, 75%, 90%) → GA4 Event scroll",
  });

  // Step 3: form_start
  steps.push({
    step: "3. เริ่มกรอกฟอร์ม",
    event: "form_start",
    pattern: "gtm_auto",
    description: "User คลิก field แรกในฟอร์ม — วัด form engagement rate",
    gtmMethod: "Trigger: Click — CSS selector ของ input field แรกในฟอร์ม → GA4 Event form_start",
  });

  // Step 4: form submit (pattern-dependent)
  if (pattern === "thank_you_page") {
    steps.push({
      step: "4. กด Submit → Thank You Page",
      event: "generate_lead",
      pattern: "gtm_auto",
      description: "Form submit แล้ว redirect ไปหน้า Thank You — GTM จับ pageview URL ได้เลย ✅",
      gtmMethod: `Trigger: Page View — URL contains "${scan.thankYouPages[0] ?? "/thank-you"}" → GA4 Event generate_lead`,
      warning: "เพิ่ม session cookie check ป้องกัน re-fire เมื่อ user refresh หน้า thank you",
    });
    steps.push({
      step: "5. Thank You Page View",
      event: "thank_you_page_view",
      pattern: "gtm_auto",
      description: `พบ thank-you page: ${scan.thankYouPages.join(", ")} — track เพิ่มเติมได้`,
      gtmMethod: `Trigger: Page View — URL matches ${scan.thankYouPages.map(u => `"${u}"`).join(" หรือ ")}`,
    });
  } else if (pattern === "ajax_inline") {
    steps.push({
      step: "4. กด Submit → AJAX / Inline Success",
      event: "generate_lead",
      pattern: "developer_required",
      description: "Form submit ด้วย AJAX — GTM ไม่รู้ว่า success หรือ error ❌ ต้องให้ developer push dataLayer",
      developerCode: `// วาง code นี้ใน success callback ของ AJAX
fetch('/api/submit-lead', { method: 'POST', body: formData })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      window.dataLayer = window.dataLayer || [];
      dataLayer.push({
        event: 'generate_lead',
        form_type: 'contact',
        lead_source: 'website_form'
      });
    }
  });`,
      gtmMethod: "Trigger: Custom Event — event name = 'generate_lead' → GA4 Event generate_lead",
      warning: "GTM ทำเองไม่ได้ ต้องให้ developer เพิ่ม dataLayer.push() ใน AJAX success callback",
    });
  } else {
    steps.push({
      step: "4. กด Submit (pattern ไม่แน่ใจ)",
      event: "generate_lead",
      pattern: "developer_required",
      description: "ไม่พบ thank-you page และ form action ไม่ชัดเจน — ต้องตรวจสอบเพิ่มเติม",
      developerCode: `// Option A: ถ้า redirect ไป /thank-you
//   → GTM Pageview trigger บน URL นั้นได้เลย

// Option B: ถ้าเป็น AJAX
dataLayer.push({ event: 'generate_lead', form_type: 'contact' });`,
      warning: "ต้องทดสอบฟอร์มจริงเพื่อดูว่า redirect หรือ AJAX",
    });
  }

  // Contact channels as alternative conversions
  if ((scan.lineUrls?.length ?? 0) > 0) {
    steps.push({
      step: "— Alternative: LINE Click",
      event: "line_click",
      pattern: "gtm_auto",
      description: "User คลิก LINE แทนกรอกฟอร์ม — high-intent conversion",
      gtmMethod: "Trigger: Click — URL contains 'line.me' หรือ 'lin.ee' → GA4 Event line_click",
    });
  }
  if (scan.phoneLinks > 0) {
    steps.push({
      step: "— Alternative: Phone Call",
      event: "tel_click",
      pattern: "gtm_auto",
      description: "User คลิก tel: link — very high intent",
      gtmMethod: "Trigger: Click — Just Links, URL starts with 'tel:' → GA4 Event tel_click",
    });
  }

  const canGtmDoItAlone = pattern === "thank_you_page";

  const developerTasks: string[] = [];
  if (!canGtmDoItAlone) {
    developerTasks.push("เพิ่ม dataLayer.push({ event: 'generate_lead' }) ใน form success callback");
    developerTasks.push("ต้องใส่ใน if(data.success) ห้ามใส่ใน submit button click โดยตรง");
    developerTasks.push("Test โดย submit form จริงแล้วดูใน GTM Preview mode ว่า generate_lead fire");
  } else {
    developerTasks.push("เพิ่ม session cookie หลัง lead success ป้องกัน re-fire เมื่อ refresh");
    developerTasks.push(`ตรวจสอบ URL ของ thank-you page: ${scan.thankYouPages.join(", ")}`);
  }

  const gtmOnlyTasks = [
    "สร้าง Trigger: All Pages → GA4 Configuration",
    "สร้าง Trigger: Scroll Depth 50/75/90% → GA4 Event scroll",
    "สร้าง Trigger: Click — CSS .form input:first-child → GA4 Event form_start",
    ...(pattern === "thank_you_page"
      ? [`สร้าง Trigger: Page View URL contains thank-you → GA4 Event generate_lead`]
      : ["สร้าง Trigger: Custom Event 'generate_lead' → GA4 Event generate_lead (รอ developer push ก่อน)"]),
    ...((scan.lineUrls?.length ?? 0) > 0 ? ["สร้าง Trigger: Click URL contains 'line.me' → GA4 Event line_click"] : []),
    ...(scan.phoneLinks > 0 ? ["สร้าง Trigger: Click URL starts with 'tel:' → GA4 Event tel_click"] : []),
  ];

  return {
    pattern,
    patternLabel: pattern === "thank_you_page" ? "✅ Thank You Page Redirect" : pattern === "ajax_inline" ? "⚠️ AJAX / Inline Success" : "❓ ไม่ระบุ — ต้องตรวจสอบ",
    patternDescription: pattern === "thank_you_page"
      ? `ฟอร์มส่งแล้ว redirect ไปหน้า Thank You — GTM ติดได้เองทั้งหมด ไม่ต้องให้ developer ช่วย`
      : pattern === "ajax_inline"
      ? `ฟอร์มส่งด้วย AJAX แล้วขึ้น success message บนหน้าเดิม — GTM ต้องรอ dataLayer.push() จาก developer`
      : `ไม่สามารถระบุ pattern ได้จาก scan — ต้องทดสอบฟอร์มจริง`,
    canGtmDoItAlone,
    thankYouUrls: scan.thankYouPages,
    formCount,
    steps,
    developerTasks,
    gtmOnlyTasks,
  };
}

function buildGtmTasks(def: { triggerType: string; ga4EventName: string; displayName: string; requiredParameters: string[] }): string[] {
  const tasks: string[] = [];
  if (def.triggerType === "page_view") {
    tasks.push(`สร้าง Trigger: Page View — "${def.displayName}" (URL condition ถ้าจำเป็น)`);
  } else if (def.triggerType === "click") {
    tasks.push(`สร้าง Trigger: Click — All Links หรือ CSS Selector เฉพาะ`);
    tasks.push(`ตั้ง Trigger Condition: URL/Text ตรงกับ element ที่ต้องการ`);
  } else if (def.triggerType === "form_submit") {
    tasks.push(`สร้าง Trigger: Form Submission`);
    tasks.push(`ตั้ง Wait for Tags และ Check Validation = true`);
  } else if (def.triggerType === "custom_event") {
    tasks.push(`สร้าง Trigger: Custom Event — event name = "${def.ga4EventName}"`);
    tasks.push(`Developer ต้องสร้าง dataLayer.push({ event: "${def.ga4EventName}", ... })`);
  }
  tasks.push(`สร้าง Tag: GA4 Event — "${def.ga4EventName}" → ส่งไปยัง GA4 Configuration`);
  if (def.requiredParameters.length > 0) {
    tasks.push(`เพิ่ม Parameters: ${def.requiredParameters.join(", ")}`);
  }
  return tasks;
}

// ── Health Score ──────────────────────────────────────────────────────────────

function buildHealthScore(
  scan: RichScanResult,
  tags: DetectedTag[],
  events: RecommendedEventMapping[]
): TrackingHealthScore {
  const breakdown: Record<string, number> = {};
  let total = 0;

  const score = (key: string, pts: number, earned: boolean) => {
    breakdown[key] = earned ? pts : 0;
    if (earned) total += pts;
  };

  score("GTM installed", 10, scan.hasGtm);
  score("GA4 installed", 10, scan.hasGa4);
  score("Google Ads planned", 10, tags.some(t => t.platform === "Google Ads" && t.status === "found"));
  score("Meta Pixel planned", 10, scan.hasFacebook);
  score("TikTok Pixel planned", 10, scan.hasTiktok);
  score("Consent Mode", 10, tags.some(t => t.platform === "Consent Mode" && t.status === "found"));
  score("Primary conversions", 15, events.some(e => e.conversionRole === "primary"));
  score("Funnel events complete", 15, events.filter(e => e.conversionRole !== "diagnostic").length >= 5);
  score("Deduplication plan", 5, scan.hasPurchaseEvent || scan.thankYouPages.length > 0);
  score("QA ready", 5, scan.hasGtm && scan.hasGa4);

  const status: TrackingHealthScore["status"] =
    total >= 90 ? "excellent" :
    total >= 75 ? "good" :
    total >= 50 ? "partial" :
    total >= 25 ? "weak" : "missing";

  const criticalIssues: string[] = [];
  if (!scan.hasGtm) criticalIssues.push("GTM not installed");
  if (!scan.hasGa4) criticalIssues.push("GA4 not installed");
  if ((scan.duplicateTracking?.length ?? 0) > 1) criticalIssues.push("Duplicate GTM containers");
  if (scan.hasShopify && !scan.hasPurchaseEvent) criticalIssues.push("Shopify site missing purchase event");

  const quickWins: string[] = [];
  if (scan.hasGtm && !scan.hasGa4) quickWins.push("Add GA4 Configuration tag in GTM — takes 10 mins");
  if ((scan.lineUrls?.length ?? 0) > 0 && scan.hasGtm) quickWins.push("Add LINE click trigger in GTM — high value conversion");
  if (scan.phoneLinks > 0 && scan.hasGtm) quickWins.push("Add tel: click trigger in GTM — Phone call lead tracking");
  if (!scan.hasFacebook && scan.hasGtm) quickWins.push("Add Meta Pixel base code via GTM Custom HTML");
  if (!scan.hasTiktok && scan.hasGtm) quickWins.push("Add TikTok Pixel base code via GTM Custom HTML");

  return { total, breakdown, status, criticalIssues, quickWins };
}
