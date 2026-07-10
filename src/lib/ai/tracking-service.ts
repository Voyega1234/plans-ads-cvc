// AI service for auto-tracking — real senior-level tracking setup
import { safeCallAI } from "@/lib/ai/provider";
import { EXECUTIVE_GROWTH_SKILL, TRACKING_CONTEXT } from "@/lib/ai/prompts";
import type { TrackingPlan, TrackingEvent, GtmWorkspace, QaCheckResult, UrlScanResult } from "@/lib/tracking-types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Generate Tracking Plan ─────────────────────────────────────
export async function generateTrackingPlan(input: {
  clientName: string;
  url: string;
  trackingType: string;
  goal: string;
  urlScanResult: UrlScanResult;
}): Promise<TrackingPlan> {
  const clientId = `adhoc-${Date.now()}`;

  // Build rich scan summary for Claude — every element found
  const scan = input.urlScanResult;
  const richScan = scan as UrlScanResult & {
    lineUrls?: string[];
    telUrls?: string[];
    emailUrls?: string[];
    clickElements?: Array<{ selector: string; text?: string; href?: string }>;
    formElements?: Array<{ selector: string; fields: string[]; action?: string }>;
    hasWordPress?: boolean;
    hasFacebook?: boolean;
    hasTiktok?: boolean;
    chatWidgets?: string[];
    socialLinks?: { platform: string; url: string }[];
    videoElements?: string[];
    externalLinks?: string[];
    hasShopify?: boolean;
    hasWooCommerce?: boolean;
    hasLeadForm?: boolean;
    ecommerceLayer?: string[];
    fbPixelId?: string;
    ttPixelId?: string;
  };

  const lineList   = (richScan.lineUrls ?? []).slice(0, 5).map(u => `  - ${u}`).join("\n") || "  - ไม่พบ";
  const telList    = (richScan.telUrls ?? []).slice(0, 5).map(u => `  - ${u}`).join("\n") || "  - ไม่พบ";
  const emailList  = (richScan.emailUrls ?? []).slice(0, 5).map(u => `  - ${u}`).join("\n") || "  - ไม่พบ";
  const formList   = (richScan.formElements ?? scan.forms ?? []).slice(0, 5)
    .map(f => `  - selector: ${f.selector}, fields: ${f.fields?.slice(0,4).join(", ")}`)
    .join("\n") || "  - ไม่พบ";
  const clickList  = (richScan.clickElements ?? []).slice(0, 20)
    .filter(e => e.href || e.text)
    .map(e => `  - ${e.selector} | text: "${e.text?.slice(0,40) ?? ""}" | href: "${e.href?.slice(0,60) ?? ""}"`)
    .join("\n") || "  - ไม่พบ";
  const chatList   = (richScan.chatWidgets ?? []).join(", ") || "ไม่พบ";
  const socialList = (richScan.socialLinks ?? []).slice(0, 5).map(s => `  - ${s.platform}: ${s.url.slice(0,60)}`).join("\n") || "  - ไม่พบ";
  const videoList  = (richScan.videoElements ?? []).slice(0, 5).map(v => `  - ${v.slice(0,80)}`).join("\n") || "  - ไม่พบ";
  const ecLayerSnippet = (richScan.ecommerceLayer ?? []).length > 0
    ? `พบ ecommerce dataLayer: ${(richScan.ecommerceLayer ?? []).join(", ").slice(0, 200)}`
    : "ไม่พบ";

  const scanSummary = `
URL: ${scan.url}
GTM: ${scan.hasGtm ? scan.gtmId : "ไม่มี GTM"}
GA4: ${scan.hasGa4 ? scan.ga4MeasurementId : "ไม่มี GA4"}
WordPress: ${richScan.hasWordPress ? "ใช่" : "ไม่ใช่"}
Meta Pixel: ${richScan.hasFacebook ? `พบ (ID: ${richScan.fbPixelId ?? "?"})` : "ไม่พบ"}
TikTok Pixel: ${richScan.hasTiktok ? `พบ (ID: ${richScan.ttPixelId ?? "?"})` : "ไม่พบ"}
Shopify: ${richScan.hasShopify ? "ใช่" : "ไม่ใช่"}
WooCommerce: ${richScan.hasWooCommerce ? "ใช่" : "ไม่ใช่"}
Lead Form Extension: ${richScan.hasLeadForm ? "ใช่" : "ไม่ใช่"}

Forms (${scan.forms.length}):
${formList}

LINE URLs (${scan.lineButtons}):
${lineList}

Phone links (${scan.phoneLinks}):
${telList}

Email links:
${emailList}

Chat Widgets: ${chatList}

Social Links:
${socialList}

Video Elements:
${videoList}

Thank-you pages: ${scan.thankYouPages.join(", ") || "ไม่พบ"}

Clickable elements:
${clickList}

Ecommerce DataLayer: ${scan.hasEcommerceDataLayer ? "ใช่" : "ไม่ใช่"}
Purchase event: ${scan.hasPurchaseEvent ? "ใช่" : "ไม่ใช่"}
Ecommerce snippets: ${ecLayerSnippet}
`.trim();

  const prompt = `คุณเป็น Senior GTM/GA4 Tracking Engineer ระดับ Expert
จงสร้าง Tracking Plan ที่สมบูรณ์ที่สุดสำหรับเว็บนี้ เหมือน senior tracking engineer ติดตั้งเอง

Client: "${input.clientName}" (${input.trackingType})
เป้าหมาย: ${input.goal}

ข้อมูลจาก URL Scanner:
${scanSummary}

กฎสำคัญ:
1. ติดทุก interaction บนเว็บ — form submit, LINE click, phone click, email click, video play, scroll depth, chat widget open, social link click, external link click
2. ถ้ามี thank-you page → ติด thank_you_page event (conversion หลัก)
3. ถ้ามี LINE URL → ติด line_click event ทุก URL (KEY EVENT)
4. ถ้ามี tel: link → ติด phone_click event (KEY EVENT)
5. ถ้ามี email link → ติด email_click event (SECONDARY)
6. ถ้ามี form → ติด form_submit (KEY) + form_start + form_error
7. ถ้ามี Shopify หรือ WooCommerce หรือ ecommerce dataLayer → ติดครบ: view_item, add_to_cart, begin_checkout, purchase (KEY EVENT สำหรับ purchase)
   - purchase ต้องส่ง ecommerce object: { currency, value, items: [{ item_id, item_name, price, quantity }] }
8. ถ้ามี chat widget (Tidio/Intercom/Crisp/Zendesk/Tawk/Freshchat/LiveChat/Drift) → ติด chat_widget_open event
9. ถ้ามี social links → ติด social_click event (event_label = platform name)
10. ถ้ามี video elements (YouTube/Vimeo) → ติด video_play + video_complete events
11. เพิ่ม remarketing audiences:
    - All Visitors (30d) → page_view
    - Engaged Users → scroll 50%
    - Lead Intent → form_start หรือ LINE/phone click
    - Converters → form_submit หรือ thank_you_page หรือ purchase
12. GA4 parameters ต้องถูกต้องตาม Google standard: event_category, event_label, link_url, form_id, currency, value, items, etc.
13. destination: KEY EVENTs ต้อง "BOTH" (GA4 + Google Ads), secondary events ใช้ "GA4"
14. ห้ามสร้าง event ซ้ำ — event ชื่อเดียวกันใช้ได้ครั้งเดียว

ตอบ JSON array เท่านั้น ห้ามมี markdown:
[{
  "eventName": "snake_case_name",
  "triggerType": "form_submit|click|page_view|timer|custom_event",
  "triggerRule": "คำอธิบาย trigger condition",
  "destination": "GA4|GOOGLE_ADS|BOTH",
  "priority": "PRIMARY|SECONDARY",
  "ga4Parameters": {"param1": "value1"},
  "isKeyEvent": true|false,
  "notes": "selector: CSS_SELECTOR | element: ชื่อ element | why: เหตุผล | test: วิธีทดสอบ",
  "remarketingAudience": "ชื่อ audience ที่ควรสร้างจาก event นี้ หรือ null"
}]`;

  function mockFn(): TrackingPlan {
    const now = new Date().toISOString();
    const ts = Date.now();
    const events: TrackingEvent[] = [];
    let idx = 0;
    const push = (ev: Omit<TrackingEvent, "id" | "clientId" | "status" | "riskLevel" | "createdAt">) => {
      events.push({ ...ev, id: `evt_${ts}_${idx++}`, clientId, status: "AI_READY", riskLevel: "LOW", createdAt: now });
    };

    // Always: page_view base
    push({
      eventName: "page_view", triggerType: "page_view", triggerRule: "All pages",
      destination: "GA4", priority: "SECONDARY",
      ga4Parameters: { page_title: "{{Page Title}}", page_location: "{{Page URL}}" },
      isKeyEvent: false, notes: "selector: body | element: All pages | why: remarketing audience base | test: เปิดทุกหน้าแล้วเช็ค GA4",
    });

    // Always: scroll depth
    push({
      eventName: "scroll_depth", triggerType: "timer", triggerRule: "Scroll depth 50% on any page",
      destination: "GA4", priority: "SECONDARY",
      ga4Parameters: { event_category: "engagement", event_label: "scroll_50", value: "50" },
      isKeyEvent: false, notes: "selector: window | element: Page scroll | why: engaged visitor → remarketing | test: scroll ลงครึ่งหน้า",
    });

    // Forms
    if (scan.forms.length > 0) {
      const sel = scan.forms[0]?.selector ?? "form";
      push({
        eventName: "form_start", triggerType: "click", triggerRule: "Click on any form field",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { form_id: "{{Form ID}}", form_name: "{{Form Name}}" },
        isKeyEvent: false, notes: `selector: ${sel} input:first-child | element: Form first field | why: form engagement | test: คลิก field แรก`,
      });
      push({
        eventName: "form_submit", triggerType: "form_submit", triggerRule: "Form submission",
        destination: "BOTH", priority: "PRIMARY",
        ga4Parameters: { form_id: "{{Form ID}}", form_name: "{{Form Name}}", event_category: "lead", event_label: "contact_form" },
        isKeyEvent: true, notes: `selector: ${sel} | element: Contact form | why: form submit = lead | test: กรอกและส่งฟอร์ม แล้วเช็ค GA4 DebugView`,
      });
    }

    // LINE
    if (scan.lineButtons > 0) {
      push({
        eventName: "line_click", triggerType: "click", triggerRule: "Click URL contains line.me OR lin.ee",
        destination: "BOTH", priority: "PRIMARY",
        ga4Parameters: { event_category: "engagement", event_label: "line_oa", link_url: "{{Click URL}}" },
        isKeyEvent: true, notes: "selector: a[href*='line.me'], a[href*='lin.ee'] | element: LINE Add Friend | why: LINE click = high intent lead | test: คลิกปุ่ม LINE",
      });
    }

    // Phone
    if (scan.phoneLinks > 0) {
      push({
        eventName: "phone_click", triggerType: "click", triggerRule: "Click URL starts with tel:",
        destination: "BOTH", priority: "PRIMARY",
        ga4Parameters: { event_category: "engagement", event_label: "phone_call", link_url: "{{Click URL}}" },
        isKeyEvent: true, notes: "selector: a[href^='tel:'] | element: Phone link | why: phone = very high intent | test: คลิก tel: link",
      });
    }

    // Email
    if (scan.emailLinks > 0) {
      push({
        eventName: "email_click", triggerType: "click", triggerRule: "Click URL starts with mailto:",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "engagement", event_label: "email_contact", link_url: "{{Click URL}}" },
        isKeyEvent: false, notes: "selector: a[href^='mailto:'] | element: Email link | why: email contact intent | test: คลิก email link",
      });
    }

    // Thank-you page
    if (scan.thankYouPages.length > 0) {
      push({
        eventName: "thank_you_page", triggerType: "page_view", triggerRule: `Page URL contains ${scan.thankYouPages[0]}`,
        destination: "BOTH", priority: "PRIMARY",
        ga4Parameters: { event_category: "conversion", event_label: "thank_you" },
        isKeyEvent: true, notes: `selector: body | element: Thank you page | why: confirmed conversion | test: ส่งฟอร์มแล้ว verify URL = ${scan.thankYouPages[0]}`,
      });
    }

    // Chat widgets
    if (richScan.chatWidgets && richScan.chatWidgets.length > 0) {
      const widgetName = richScan.chatWidgets[0];
      push({
        eventName: "chat_widget_open", triggerType: "custom_event", triggerRule: `${widgetName} widget opened`,
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "engagement", event_label: widgetName.toLowerCase().replace(/\s/g, "_"), link_url: "{{Page URL}}" },
        isKeyEvent: false, notes: `selector: .${widgetName.toLowerCase()}-widget | element: ${widgetName} Chat Widget | why: chat open = high engagement intent | test: คลิกปุ่ม chat แล้วเช็ค dataLayer`,
      });
    }

    // Social links
    if (richScan.socialLinks && richScan.socialLinks.length > 0) {
      push({
        eventName: "social_click", triggerType: "click", triggerRule: "Click social media links (fb/ig/yt/tiktok/twitter/linkedin)",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "engagement", event_label: "{{social_platform}}", link_url: "{{Click URL}}" },
        isKeyEvent: false, notes: "selector: a[href*='facebook.com'], a[href*='instagram.com'], a[href*='tiktok.com'], a[href*='youtube.com'] | element: Social media links | why: track social brand engagement | test: คลิก social icon",
      });
    }

    // Video
    if (richScan.videoElements && richScan.videoElements.length > 0) {
      push({
        eventName: "video_play", triggerType: "custom_event", triggerRule: "YouTube/Vimeo video started",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "engagement", event_label: "video_start", video_url: "{{video_url}}", video_title: "{{video_title}}", video_percent: "0" },
        isKeyEvent: false, notes: "selector: iframe[src*='youtube.com'], iframe[src*='vimeo.com'] | element: Embedded video | why: video engagement = content interest | test: กด play บน video ที่ embed",
      });
      push({
        eventName: "video_complete", triggerType: "custom_event", triggerRule: "YouTube/Vimeo video 90% watched",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "engagement", event_label: "video_90pct", video_url: "{{video_url}}", video_percent: "90" },
        isKeyEvent: false, notes: "selector: iframe[src*='youtube.com'] | element: Video 90% | why: high intent viewer | test: ดู video ถึง 90%",
      });
    }

    // Ecommerce (Shopify/WooCommerce or existing dataLayer)
    if (richScan.hasShopify || richScan.hasWooCommerce || (richScan.ecommerceLayer && richScan.ecommerceLayer.length > 0) || scan.hasEcommerceDataLayer) {
      push({
        eventName: "view_item", triggerType: "custom_event", triggerRule: "DataLayer event: view_item",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "ecommerce", currency: "THB", value: "{{ecommerce.value}}", items: "{{ecommerce.items}}" },
        isKeyEvent: false, notes: "selector: custom_event | element: Product page view | why: ecommerce funnel start | test: เปิดหน้า product แล้วเช็ค dataLayer.push",
      });
      push({
        eventName: "add_to_cart", triggerType: "custom_event", triggerRule: "DataLayer event: add_to_cart",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "ecommerce", currency: "THB", value: "{{ecommerce.value}}", items: "{{ecommerce.items}}" },
        isKeyEvent: false, notes: "selector: custom_event | element: Add to cart button | why: purchase intent signal | test: กด Add to Cart แล้วเช็ค dataLayer",
      });
      push({
        eventName: "begin_checkout", triggerType: "custom_event", triggerRule: "DataLayer event: begin_checkout",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { event_category: "ecommerce", currency: "THB", value: "{{ecommerce.value}}", items: "{{ecommerce.items}}" },
        isKeyEvent: false, notes: "selector: custom_event | element: Checkout start | why: high purchase intent | test: กดดำเนินการสั่งซื้อ",
      });
      push({
        eventName: "purchase", triggerType: "custom_event", triggerRule: "DataLayer event: purchase",
        destination: "BOTH", priority: "PRIMARY",
        ga4Parameters: {
          event_category: "ecommerce", transaction_id: "{{ecommerce.transaction_id}}",
          currency: "THB", value: "{{ecommerce.value}}", tax: "{{ecommerce.tax}}",
          shipping: "{{ecommerce.shipping}}", items: "{{ecommerce.items}}"
        },
        isKeyEvent: true, notes: "selector: custom_event | element: Purchase confirmation | why: main conversion = revenue | test: ทำการสั่งซื้อจริง แล้วเช็ค GA4 + Google Ads",
      });
    }

    // Ensure at least page_view if nothing else
    if (events.length === 0) {
      push({
        eventName: "page_view", triggerType: "page_view", triggerRule: "All pages",
        destination: "GA4", priority: "SECONDARY",
        ga4Parameters: { page_title: "{{Page Title}}", page_location: "{{Page URL}}" },
        isKeyEvent: false, notes: "selector: body | element: All pages | why: base tracking | test: เปิดหน้าเว็บ",
      });
    }

    return {
      id: `tp_${Date.now()}`, clientId,
      name: `${input.clientName} - ${input.trackingType} Tracking Plan`,
      trackingType: input.trackingType as TrackingPlan["trackingType"],
      urlScanned: scan.url, scanResults: scan,
      status: "AI_READY", riskLevel: "LOW", events,
      createdAt: now, updatedAt: now,
    };
  }

  const VALID_TRIGGER_TYPES: TrackingEvent["triggerType"][] = ["click", "page_view", "form_submit", "custom_event", "timer"]
  const VALID_DESTINATIONS: TrackingEvent["destination"][] = ["GA4", "GOOGLE_ADS", "BOTH"]
  const VALID_PRIORITIES: TrackingEvent["priority"][] = ["PRIMARY", "SECONDARY"]

  function validator(raw: unknown): TrackingPlan | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const now = new Date().toISOString();
    const seenNames = new Set<string>();
    try {
      type MaybeEvent = TrackingEvent | null;
      const events: TrackingEvent[] = (raw.map((e: Record<string, unknown>, i: number): MaybeEvent => {
        const eventName = String(e.eventName ?? "").trim();
        if (!eventName || !/^[a-z][a-z0-9_]*$/.test(eventName)) return null;
        if (seenNames.has(eventName)) return null;
        seenNames.add(eventName);

        const triggerType = VALID_TRIGGER_TYPES.includes(e.triggerType as TrackingEvent["triggerType"])
          ? (e.triggerType as TrackingEvent["triggerType"])
          : "custom_event";
        const destination = VALID_DESTINATIONS.includes(e.destination as TrackingEvent["destination"])
          ? (e.destination as TrackingEvent["destination"])
          : "GA4";
        const priority = VALID_PRIORITIES.includes(e.priority as TrackingEvent["priority"])
          ? (e.priority as TrackingEvent["priority"])
          : "SECONDARY";

        return {
          id: `evt_${Date.now()}_${i}`,
          clientId,
          eventName,
          triggerType,
          triggerRule: String(e.triggerRule ?? "").trim() || undefined,
          destination,
          priority,
          ga4Parameters: (e.ga4Parameters as Record<string, string>) ?? {},
          isKeyEvent: Boolean(e.isKeyEvent),
          status: "AI_READY" as const,
          riskLevel: "LOW" as const,
          notes: String(e.notes ?? ""),
          createdAt: now,
        };
      }) as MaybeEvent[]).filter((e): e is TrackingEvent => e !== null);

      // Must have at least one event
      if (events.length === 0) return null;

      return {
        id: `tp_${Date.now()}`, clientId,
        name: `${input.clientName} - ${input.trackingType} Tracking Plan`,
        trackingType: input.trackingType as TrackingPlan["trackingType"],
        urlScanned: scan.url, scanResults: scan,
        status: "AI_READY", riskLevel: "LOW", events,
        createdAt: now, updatedAt: now,
      };
    } catch { return null; }
  }

  return safeCallAI(prompt, validator, mockFn, {
    systemPrompt: `${EXECUTIVE_GROWTH_SKILL}\n\n${TRACKING_CONTEXT}\n\nตอบเป็น JSON array เท่านั้น ห้ามมี markdown หรือ text อื่น`,
    maxTokens: 65536,
    _route: '/api/tracking/generate-tracking-plan',
    _feature: 'tracking',
    _subfeature: 'generate_tracking_plan',
  });
}

// ── Generate GTM Workspace (dynamic from real events) ─────────
export async function generateGtmWorkspace(input: {
  clientName: string;
  trackingPlan: TrackingPlan;
  existingGtmId?: string;
}): Promise<GtmWorkspace> {
  await delay(500);
  const now = new Date().toISOString();
  const datePart = new Date().toISOString().slice(0, 10);
  const clientId = input.trackingPlan.clientId;
  const events = input.trackingPlan.events;

  // ── Variables ──────────────────────────────────────────────
  const variables = [
    { id: `var_1`, name: "DL - Event", type: "DL" as const, parameters: { name: "event" }, status: "AI_READY" as const },
    { id: `var_2`, name: "DL - Form ID", type: "DL" as const, parameters: { name: "formId" }, status: "AI_READY" as const },
    { id: `var_3`, name: "DL - Form Name", type: "DL" as const, parameters: { name: "formName" }, status: "AI_READY" as const },
    { id: `var_4`, name: "JS - Click URL", type: "JS" as const, parameters: { name: "{{Click URL}}" }, status: "AI_READY" as const },
    { id: `var_5`, name: "JS - Page URL", type: "URL" as const, parameters: { component: "URL" }, status: "AI_READY" as const },
    { id: `var_6`, name: "JS - Page Title", type: "JS" as const, parameters: { name: "document.title" }, status: "AI_READY" as const },
  ];

  // ── Build triggers per event ────────────────────────────────
  const triggers = [];
  const tags = [];

  // Always add All Pages trigger
  triggers.push({ id: `tr_allpages`, name: "Trigger - All Pages", type: "PAGEVIEW" as const, conditions: [], status: "AI_READY" as const });

  // GA4 Config tag (always)
  tags.push({
    id: `tag_ga4_config`, name: "GA4 - Configuration",
    type: "GA4_CONFIG" as const, parameters: { measurementId: "{{GA4 Measurement ID}}" },
    triggers: ["Trigger - All Pages"], status: "AI_READY" as const,
  });

  // AW Conversion Linker (always)
  tags.push({
    id: `tag_aw_linker`, name: "Google Ads - Conversion Linker",
    type: "AW_LINKER" as const, parameters: {},
    triggers: ["Trigger - All Pages"], status: "AI_READY" as const,
  });

  // Per-event tags + triggers
  for (const ev of events) {
    const triggerName = `Trigger - ${ev.eventName}`;

    // Build trigger based on triggerType
    let trigger;
    if (ev.triggerType === "page_view" && ( ev.triggerRule ?? "" ).toLowerCase().includes("all")) {
      // Uses All Pages — no separate trigger needed
    } else if (ev.triggerType === "page_view") {
      // Thank you page or specific page
      const urlCondition = ev.notes?.match(/selector:.*?\|/)?.[0] ?? "";
      const pageMatch = ( ev.triggerRule ?? "" ).match(/contains\s+(.+)/i)?.[1]?.trim() ?? "/thank";
      trigger = {
        id: `tr_${ev.id}`, name: triggerName,
        type: "PAGEVIEW" as const,
        conditions: [{ variable: "Page URL", operator: "contains", value: pageMatch }],
        status: "AI_READY" as const,
      };
    } else if (ev.triggerType === "form_submit") {
      trigger = {
        id: `tr_${ev.id}`, name: triggerName,
        type: "FORM" as const,
        conditions: [],
        status: "AI_READY" as const,
      };
    } else if (ev.triggerType === "click") {
      // Extract selector/URL match from triggerRule
      const isUrlTrigger = ( ev.triggerRule ?? "" ).toLowerCase().includes("url contains") || ( ev.triggerRule ?? "" ).toLowerCase().includes("url starts");
      const urlMatch = ( ev.triggerRule ?? "" ).match(/contains\s+(.+)/i)?.[1]?.trim()
        ?? ( ev.triggerRule ?? "" ).match(/starts? with\s+(.+)/i)?.[1]?.trim()
        ?? "";
      trigger = {
        id: `tr_${ev.id}`, name: triggerName,
        type: "CLICK" as const,
        conditions: isUrlTrigger && urlMatch
          ? [{ variable: "Click URL", operator: ( ev.triggerRule ?? "" ).toLowerCase().includes("starts") ? "startsWith" : "contains", value: urlMatch }]
          : [],
        status: "AI_READY" as const,
      };
    } else if (ev.triggerType === "timer") {
      trigger = {
        id: `tr_${ev.id}`, name: `Trigger - Scroll Depth`,
        type: "CUSTOM_EVENT" as const,
        conditions: [{ variable: "Event", operator: "equals", value: "scrollDepth" }],
        status: "AI_READY" as const,
      };
    } else {
      trigger = {
        id: `tr_${ev.id}`, name: triggerName,
        type: "CUSTOM_EVENT" as const,
        conditions: [{ variable: "Event", operator: "equals", value: ev.eventName }],
        status: "AI_READY" as const,
      };
    }

    if (trigger) triggers.push(trigger);

    const usedTrigger = trigger ? triggerName : "Trigger - All Pages";

    // GA4 Event tag for every event
    tags.push({
      id: `tag_ga4_${ev.id}`, name: `GA4 - ${ev.eventName}`,
      type: "GA4_EVENT" as const,
      parameters: { eventName: ev.eventName, ...ev.ga4Parameters },
      triggers: [usedTrigger], status: "AI_READY" as const,
    });

    // Google Ads Conversion tag for KEY events
    if (ev.isKeyEvent && (ev.destination === "GOOGLE_ADS" || ev.destination === "BOTH")) {
      tags.push({
        id: `tag_aw_${ev.id}`, name: `Google Ads - ${ev.eventName}`,
        type: "AW_CONVERSION" as const,
        parameters: { conversionId: "AW-XXXXXXXXX", conversionLabel: "XXXXX", eventName: ev.eventName },
        triggers: [usedTrigger], status: "AI_READY" as const,
      });
    }
  }

  return {
    id: `ws_${Date.now()}`, clientId,
    containerId: input.existingGtmId,
    workspaceName: `AI Tracking - ${input.clientName} - ${datePart}`,
    description: `Auto-generated ${input.trackingPlan.trackingType} tracking for ${input.clientName}`,
    status: "AI_READY",
    tags, triggers, variables,
    createdAt: now, updatedAt: now,
  };
}

// ── Run Tracking QA ────────────────────────────────────────────
export async function runTrackingQa(input: {
  clientName: string;
  trackingPlan: TrackingPlan;
  workspace?: GtmWorkspace;
  scanUrl?: string;
  gtmContainerId?: string;
}): Promise<QaCheckResult[]> {
  await delay(500);

  const results: QaCheckResult[] = [];
  const plan = input.trackingPlan;
  const ws = input.workspace;
  const events = plan.events ?? [];

  // 1. Key events covered
  const keyEvents = events.filter(e => e.isKeyEvent);
  results.push({
    checkType: "key_events",
    checkName: `Key Events (${keyEvents.length} events)`,
    result: keyEvents.length > 0 ? "pass" : "warning",
    severity: keyEvents.length > 0 ? "info" : "warning",
    message: keyEvents.length > 0
      ? keyEvents.map(e => e.eventName).join(", ")
      : "ไม่มี key events — ไม่สามารถ optimize bid ได้",
    recommendedFix: keyEvents.length === 0 ? "เพิ่มอย่างน้อย 1 key event เช่น form_submit หรือ thank_you_page" : undefined,
    approvalReady: keyEvents.length > 0,
  });

  // 2. GA4 destination on key events
  const keyWithDest = keyEvents.filter(e => e.destination === "BOTH" || e.destination === "GA4");
  results.push({
    checkType: "ga4_destination",
    checkName: "GA4 receives key events",
    result: keyWithDest.length === keyEvents.length ? "pass" : "warning",
    severity: "warning",
    message: keyWithDest.length === keyEvents.length
      ? "ทุก key event ส่งไป GA4"
      : `${keyEvents.length - keyWithDest.length} key events ไม่ได้ส่งไป GA4`,
    approvalReady: true,
  });

  // 3. Google Ads conversion on key events
  const keyWithAds = keyEvents.filter(e => e.destination === "BOTH" || e.destination === "GOOGLE_ADS");
  results.push({
    checkType: "gads_conversion",
    checkName: "Google Ads conversion events",
    result: keyWithAds.length > 0 ? "pass" : "warning",
    severity: "warning",
    message: keyWithAds.length > 0
      ? `${keyWithAds.length} events ส่งไป Google Ads Conversion`
      : "ไม่มี event ส่งไป Google Ads — campaign จะไม่สามารถ optimize ได้",
    recommendedFix: keyWithAds.length === 0 ? "เปลี่ยน destination ของ key event เป็น BOTH" : undefined,
    approvalReady: true,
  });

  // 4. Duplicate event names
  const names = events.map(e => e.eventName);
  const dups = names.filter((n, i) => names.indexOf(n) !== i);
  results.push({
    checkType: "no_duplicate",
    checkName: "No duplicate event names",
    result: dups.length === 0 ? "pass" : "fail",
    severity: dups.length === 0 ? "info" : "error",
    message: dups.length === 0 ? "ไม่พบ event ซ้ำ" : `พบ event ซ้ำ: ${Array.from(new Set(dups)).join(", ")}`,
    recommendedFix: dups.length > 0 ? "ลบหรือ rename event ที่ซ้ำ" : undefined,
    approvalReady: dups.length === 0,
  });

  // 5. GTM workspace has matching tags
  if (ws) {
    const tagEventNames = ws.tags.filter(t => t.type === "GA4_EVENT").map(t => String(t.parameters?.eventName ?? ""));
    const eventsWithTags = events.filter(e => tagEventNames.includes(e.eventName));
    results.push({
      checkType: "gtm_tags_match",
      checkName: "GTM tags match tracking plan",
      result: eventsWithTags.length >= keyEvents.length ? "pass" : "warning",
      severity: "warning",
      message: `${eventsWithTags.length}/${events.length} events มี GTM tag`,
      approvalReady: true,
    });

    const hasLinker = ws.tags.some(t => t.type === "AW_LINKER");
    results.push({
      checkType: "aw_linker",
      checkName: "Google Ads Conversion Linker tag",
      result: hasLinker ? "pass" : "fail",
      severity: hasLinker ? "info" : "error",
      message: hasLinker ? "AW Conversion Linker tag มีอยู่แล้ว" : "ไม่มี AW Conversion Linker — cross-domain conversion จะขาดหาย",
      recommendedFix: hasLinker ? undefined : "เพิ่ม tag ประเภท AW_LINKER ใน GTM workspace",
      approvalReady: hasLinker,
    });
  }

  // 6. GTM ID live check
  if (input.gtmContainerId && plan.scanResults?.hasGtm) {
    const liveId = plan.scanResults.gtmId;
    const match = liveId === input.gtmContainerId;
    results.push({
      checkType: "gtm_live",
      checkName: "GTM live on page",
      result: match ? "pass" : "warning",
      severity: match ? "info" : "warning",
      message: match
        ? `GTM ${liveId} ติดตั้งอยู่บนเว็บแล้ว`
        : `เว็บมี GTM ${liveId} แต่คุณระบุ ${input.gtmContainerId} — อาจเป็น container คนละอัน`,
      approvalReady: true,
    });
  } else if (input.gtmContainerId && !plan.scanResults?.hasGtm) {
    results.push({
      checkType: "gtm_live",
      checkName: "GTM live on page",
      result: "warning",
      severity: "warning",
      message: `ไม่พบ GTM บนเว็บ — ต้องติด snippet ${input.gtmContainerId} ก่อน`,
      recommendedFix: "Copy GTM snippet จาก Step 5 ไปใส่ใน <head> ของเว็บ",
      approvalReady: false,
    });
  }

  // 7. Consent Mode
  results.push({
    checkType: "consent_mode",
    checkName: "Consent Mode v2",
    result: "warning",
    severity: "warning",
    message: "Consent Mode v2 ต้องตั้งค่าแยกต่างหาก — สำคัญมากสำหรับ EU/PDPA compliance",
    recommendedFix: "ติดตั้ง Cookiebot หรือ OneTrust แล้วเชื่อมกับ GTM",
    approvalReady: true,
  });

  // 8. Remarketing audiences
  const hasPageView = events.some(e => e.triggerType === "page_view" && (e.triggerRule ?? "").toLowerCase().includes("all"));
  results.push({
    checkType: "remarketing_base",
    checkName: "Remarketing base audience (All Visitors)",
    result: hasPageView ? "pass" : "warning",
    severity: "warning",
    message: hasPageView
      ? "มี page_view event สำหรับสร้าง All Visitors audience"
      : "ไม่มี All Pages page_view — ไม่สามารถสร้าง remarketing audience ได้",
    recommendedFix: !hasPageView ? "เพิ่ม page_view event ที่ trigger บน All Pages" : undefined,
    approvalReady: true,
  });

  return results;
}
